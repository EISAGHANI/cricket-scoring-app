/** Integration tests against the local Redis (`pnpm infra:up`): fan-out across two instances. */
import { Redis } from "ioredis";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startRealtime, type Realtime } from "./server";
import { signScorerToken } from "./token";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const SECRET = "s".repeat(40);
const matchId = "0198a7f2-1111-7222-8333-444455556666";
const NOW = 1_800_000_000_000;

let a: Realtime;
let b: Realtime;
let publisher: Redis;
const sockets: Socket[] = [];

beforeAll(async () => {
	const options = { redisUrl: REDIS_URL, port: 0, secret: SECRET, now: () => NOW };
	a = await startRealtime(options);
	b = await startRealtime(options);
	publisher = new Redis(REDIS_URL);
});
afterAll(async () => {
	for (const s of sockets) s.close();
	publisher.disconnect();
	await a.close();
	await b.close();
});

async function client(instance: Realtime, lockToken?: string) {
	const socket = connect(`http://localhost:${instance.port}`, { transports: ["websocket"] });
	sockets.push(socket);
	const reply = await new Promise<{ ok: boolean; lock: boolean }>((resolve) => {
		socket.on("connect", () => socket.emit("subscribe", { matchId, lockToken }, resolve));
	});
	return { socket, reply };
}

const next = <T>(socket: Socket, name: string) =>
	new Promise<T>((resolve, reject) => {
		socket.once(name, resolve);
		setTimeout(() => reject(new Error(`no ${name}`)), 3000);
	});

describe("realtime fan-out", () => {
	it("delivers an event published to Redis to clients on both instances", async () => {
		const one = await client(a);
		const two = await client(b);
		const got = [next(one.socket, "event"), next(two.socket, "event")];
		await publisher.publish(`match:${matchId}`, JSON.stringify({ seq: 7 }));
		expect(await Promise.all(got)).toEqual([{ seq: 7 }, { seq: 7 }]);
	});

	it("keeps the lock channel for scorers with a valid token", async () => {
		const token = signScorerToken(SECRET, matchId, NOW / 1000 + 60);
		const scorer = await client(a, token);
		const viewer = await client(a);
		const stale = await client(a, signScorerToken(SECRET, matchId, NOW / 1000 - 1));
		expect([scorer.reply.lock, viewer.reply.lock, stale.reply.lock]).toEqual([true, false, false]);

		let leaked = false;
		viewer.socket.on("lock", () => (leaked = true));
		const seen = next(scorer.socket, "lock");
		await publisher.publish(`match:${matchId}:lock`, JSON.stringify({ generation: 2 }));
		expect(await seen).toEqual({ generation: 2 });
		await new Promise((r) => setTimeout(r, 100));
		expect(leaked).toBe(false);
	});

	it("routes meta separately and ignores malformed or other channels", async () => {
		const { socket } = await client(a);
		const seen = next(socket, "meta");
		await publisher.publish(`match:${matchId}`, "not json");
		await publisher.publish("other:channel", "{}");
		await publisher.publish(`match:${matchId}:meta`, JSON.stringify({ status: "LIVE" }));
		expect(await seen).toEqual({ status: "LIVE" });
	});

	it("rejects a bad match id and a token for another match", async () => {
		const socket = connect(`http://localhost:${a.port}`, { transports: ["websocket"] });
		sockets.push(socket);
		const reply = await new Promise<{ ok: boolean }>((resolve) =>
			socket.on("connect", () => socket.emit("subscribe", { matchId: "nope" }, resolve)),
		);
		expect(reply.ok).toBe(false);
		const other = "0198a7f2-1111-7222-8333-999999999999";
		const wrong = await client(a, signScorerToken(SECRET, other, NOW / 1000 + 60));
		expect(wrong.reply.lock).toBe(false);
	});

	it("reports Redis health", async () => {
		const res = await fetch(`http://localhost:${a.port}/healthz`);
		expect(await res.json()).toMatchObject({ status: "ok", redis: "ok" });
	});
});
