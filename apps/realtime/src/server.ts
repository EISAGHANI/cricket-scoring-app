/**
 * Socket.IO fan-out (PHASE_4_PLAN.md §3). The web app publishes committed events to Redis; every
 * instance pattern-subscribes and emits to its own clients' rooms, so instances need no adapter
 * and a client may connect to any of them. Delivery is best-effort: clients detect gaps by `seq`
 * and catch up over HTTP.
 */
import { createServer, type Server as HttpServer } from "node:http";
import { MATCH_CHANNEL } from "@cricket/schemas";
import { Redis } from "ioredis";
import { Server } from "socket.io";
import { verifyScorerToken } from "./token";

export interface RealtimeOptions {
	redisUrl: string;
	port: number;
	secret?: string | undefined;
	corsOrigins?: string[] | undefined;
	now?: () => number;
}

export interface Realtime {
	port: number;
	close: () => Promise<void>;
}

const EVENT_NAMES = { undefined: "event", meta: "meta", lock: "lock" } as const;
const MATCH_ID = /^[0-9a-f-]{36}$/;

export async function startRealtime(options: RealtimeOptions): Promise<Realtime> {
	const now = options.now ?? Date.now;
	const redis = new Redis(options.redisUrl, { maxRetriesPerRequest: null });
	const subscriber = redis.duplicate();
	redis.on("error", (e) => console.error("[realtime] redis:", e.message));
	subscriber.on("error", (e) => console.error("[realtime] redis subscriber:", e.message));

	const http: HttpServer = createServer((req, res) => {
		if (req.url !== "/healthz") return void res.writeHead(404).end();
		redis
			.ping()
			.then(() => {
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify({ status: "ok", service: "realtime", redis: "ok" }));
			})
			.catch(() => {
				res.writeHead(503, { "content-type": "application/json" });
				res.end(JSON.stringify({ status: "degraded", service: "realtime", redis: "down" }));
			});
	});

	const io = new Server(http, {
		cors: { origin: options.corsOrigins ?? false },
		// Clients fall back to polling on their own; keep the payloads small.
		maxHttpBufferSize: 10_000,
	});

	io.on("connection", (socket) => {
		socket.on(
			"subscribe",
			(payload: unknown, ack?: (reply: { ok: boolean; lock: boolean; error?: string }) => void) => {
				const reply = typeof ack === "function" ? ack : () => undefined;
				const { matchId, lockToken } = (payload ?? {}) as {
					matchId?: unknown;
					lockToken?: unknown;
				};
				if (typeof matchId !== "string" || !MATCH_ID.test(matchId)) {
					return reply({ ok: false, lock: false, error: "INVALID" });
				}
				void socket.join([`match:${matchId}`, `match:${matchId}:meta`]);
				const lock =
					options.secret !== undefined &&
					lockToken !== undefined &&
					verifyScorerToken(options.secret, matchId, lockToken, Math.floor(now() / 1000));
				if (lock) void socket.join(`match:${matchId}:lock`);
				reply({ ok: true, lock });
			},
		);
		socket.on("unsubscribe", (payload: unknown) => {
			const { matchId } = (payload ?? {}) as { matchId?: unknown };
			if (typeof matchId !== "string" || !MATCH_ID.test(matchId)) return;
			for (const room of [`match:${matchId}`, `match:${matchId}:meta`, `match:${matchId}:lock`]) {
				void socket.leave(room);
			}
		});
	});

	subscriber.on("pmessage", (_pattern, channel, message) => {
		const parsed = MATCH_CHANNEL.exec(channel);
		if (!parsed) return;
		let data: unknown;
		try {
			data = JSON.parse(message);
		} catch {
			return;
		}
		io.to(channel).emit(EVENT_NAMES[parsed[2] as keyof typeof EVENT_NAMES], data);
	});
	await subscriber.psubscribe("match:*");

	await new Promise<void>((resolve) => http.listen(options.port, resolve));
	const address = http.address();
	const port = typeof address === "object" && address ? address.port : options.port;

	return {
		port,
		async close() {
			await io.close();
			subscriber.disconnect();
			redis.disconnect();
		},
	};
}
