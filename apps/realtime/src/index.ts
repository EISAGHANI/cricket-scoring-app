// Socket.IO fan-out service: subscribes to Redis match channels and broadcasts to clients.
import { loadEnv } from "./env";
import { startRealtime } from "./server";

const env = loadEnv();

const realtime = await startRealtime({
	redisUrl: env.REDIS_URL,
	port: env.PORT,
	secret: env.REALTIME_SECRET,
	corsOrigins: env.CORS_ORIGINS,
});
console.log(`[realtime] listening on :${realtime.port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, () => void realtime.close().then(() => process.exit(0)));
}
