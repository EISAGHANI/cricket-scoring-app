"use client";

import type { MatchEvent } from "@cricket/scoring-engine";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { appendContiguous, classifyPush } from "@/features/scoring/feed";

/** Poll interval while the socket is down, and the safety net behind it (PHASE_4_PLAN Q1). */
const POLL_MS = 5000;

export type LiveConnection = "socket" | "polling";

/**
 * The match's event log, kept current by sockets when `NEXT_PUBLIC_REALTIME_URL` is set and
 * reachable, by polling otherwise. Pushes carry `seq`; a gap triggers a catch-up over HTTP.
 */
export function useLiveLog(
	matchId: string,
	initial: MatchEvent[],
	active: boolean,
): { log: MatchEvent[]; connection: LiveConnection } {
	const [log, setLog] = useState(initial);
	const [connection, setConnection] = useState<LiveConnection>("polling");
	const head = useRef(initial.at(-1)?.seq ?? 0);
	const syncing = useRef<Promise<void> | null>(null);

	useEffect(() => {
		if (!active) return;
		let stopped = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let socketUp = false;

		const take = (events: MatchEvent[]) => {
			if (stopped) return;
			const next = appendContiguous([], head.current, events);
			if (next.log.length === 0) return;
			head.current = next.head;
			setLog((l) => [...l, ...next.log]);
		};

		const catchUp = () => {
			// One catch-up at a time; a request made while one runs is covered by its next page.
			syncing.current ??= (async () => {
				try {
					for (;;) {
						const res = await fetch(`/api/matches/${matchId}/events?after=${head.current}`, {
							cache: "no-store",
						});
						if (!res.ok) return;
						const page = (await res.json()) as { events: MatchEvent[]; more: boolean };
						const before = head.current;
						take(page.events);
						if (!page.more || head.current === before) return;
					}
				} catch {
					// Offline: the next poll or reconnect tries again.
				} finally {
					syncing.current = null;
				}
			})();
			return syncing.current;
		};

		const poll = () => {
			timer = setTimeout(() => {
				if (!stopped && !socketUp && document.visibilityState === "visible") void catchUp();
				if (!stopped) poll();
			}, POLL_MS);
		};
		poll();

		const url = process.env.NEXT_PUBLIC_REALTIME_URL;
		const socket = url ? io(url, { transports: ["websocket", "polling"] }) : null;
		socket?.on("connect", () => {
			// Subscribe first, then catch up, so nothing falls between the two.
			socket.emit("subscribe", { matchId }, (reply: { ok: boolean }) => {
				if (!reply?.ok) return;
				socketUp = true;
				setConnection("socket");
				void catchUp();
			});
		});
		socket?.on("disconnect", () => {
			socketUp = false;
			setConnection("polling");
		});
		socket?.on("event", (msg: { seq: number; event: MatchEvent }) => {
			const action = classifyPush(head.current, msg.seq);
			if (action === "apply") take([msg.event]);
			else if (action === "resync") void catchUp();
		});

		return () => {
			stopped = true;
			clearTimeout(timer);
			socket?.close();
		};
	}, [matchId, active]);

	return { log, connection };
}
