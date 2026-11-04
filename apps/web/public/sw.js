/*
 * Service worker (PHASE_4_PLAN.md §5). Its only job is to let a scorer page that was opened
 * once load again with no network: static build assets are cached as they're used, and the
 * scorer page itself is network-first with the last good copy as the fallback.
 * Everything else, and every /api request, goes straight to the network and is never cached.
 */
const CACHE = "crease-v1";
const SCORER = /^\/matches\/[0-9a-f-]{36}\/score\/?$/;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
			await self.clients.claim();
		})(),
	);
});

self.addEventListener("message", (event) => {
	// Sent on sign-out so a shared device keeps nothing of the previous scorer.
	if (event.data === "clear") event.waitUntil(caches.delete(CACHE));
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

	if (url.pathname.startsWith("/_next/static/")) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(CACHE);
				const hit = await cache.match(request);
				if (hit) return hit;
				const res = await fetch(request);
				if (res.ok) await cache.put(request, res.clone());
				return res;
			})(),
		);
		return;
	}

	if (request.mode === "navigate" && SCORER.test(url.pathname)) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(CACHE);
				try {
					const res = await fetch(request);
					if (res.ok) await cache.put(url.pathname, res.clone());
					return res;
				} catch (error) {
					const hit = await cache.match(url.pathname);
					if (hit) return hit;
					throw error;
				}
			})(),
		);
	}
});
