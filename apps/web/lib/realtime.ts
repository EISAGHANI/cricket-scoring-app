import "server-only";
import { Redis } from "ioredis";
import { env } from "./env";

const globalForRedis = globalThis as unknown as { cricketRedis?: Redis | null };

function client(): Redis | null {
	if (globalForRedis.cricketRedis !== undefined) return globalForRedis.cricketRedis;
	const redis = env.REDIS_URL
		? new Redis(env.REDIS_URL, {
				lazyConnect: true,
				maxRetriesPerRequest: 1,
				enableOfflineQueue: false,
			})
		: null;
	// Without a listener ioredis logs every reconnect error; publishing already reports failures.
	redis?.on("error", () => undefined);
	globalForRedis.cricketRedis = redis;
	return redis;
}

/**
 * Publish JSON to a channel. Best-effort by design: the event is already committed, and clients
 * that miss a message catch up by `seq` (PHASE_4_PLAN.md §3), so a Redis outage must never fail
 * scoring.
 */
export async function publish(channel: string, message: unknown): Promise<void> {
	const redis = client();
	if (!redis) return;
	try {
		if (redis.status === "wait") await redis.connect();
		await redis.publish(channel, JSON.stringify(message));
	} catch (error) {
		console.error(`[realtime] publish to ${channel} failed:`, (error as Error).message);
	}
}
