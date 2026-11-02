// BullMQ workers: stats projections, notifications, media jobs, exports.
// Phase 0 skeleton: validates env and exposes a health check. Real work lands in Phase 5.
import { createServer } from "node:http";
import { loadEnv } from "./env";

const env = loadEnv();

const server = createServer((req, res) => {
	if (req.url === "/healthz") {
		res.writeHead(200, { "content-type": "application/json" });
		res.end(JSON.stringify({ status: "ok", service: "worker" }));
		return;
	}
	res.writeHead(404).end();
});

server.listen(env.PORT, () => {
	console.log(`[worker] listening on :${env.PORT}`);
});
