/**
 * Register the offline service worker (public/sw.js). Production only: in dev it would serve
 * stale chunks. Failure just means online-only.
 */
export function registerServiceWorker(): void {
	if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
	navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
}

/** Drop cached scorer pages (on sign-out). */
export async function clearOfflineCache(): Promise<void> {
	try {
		(await navigator.serviceWorker?.getRegistration())?.active?.postMessage("clear");
	} catch {
		// No worker: nothing cached.
	}
}
