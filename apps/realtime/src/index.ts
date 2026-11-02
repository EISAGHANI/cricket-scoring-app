// Socket.IO fan-out service: subscribes to Redis match channels and broadcasts to clients.
// Phase 0 skeleton: validates env and exposes a health check. Real work lands in Phase 4.
import { createServer } from "node:http";
import { loadEnv } from "./env";

const env = loadEnv();

const server = createServer((req, res) => {
	if (req.url === "/healthz") {
		res.writeHead(200, { "content-type": "application/json" });
		res.end(JSON.stringify({ status: "ok", service: "realtime" }));
		return;
	}
	res.writeHead(404).end();
});

server.listen(env.PORT, () => {
	console.log(`[realtime] listening on :${env.PORT}`);
});
