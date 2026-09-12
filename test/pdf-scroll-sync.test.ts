import { describe, expect, it } from "vitest";
import {
	getScrollSyncPartner,
	getScrollSyncPeer,
	getScrollSyncRole,
	isScrollSyncApplying,
	isZoomSyncApplying,
	mapScrollPosition,
	registerScrollSyncPair,
	registerScrollSyncPeer,
	runSyncedScroll,
	runSyncedZoom,
	type ScrollSyncPeer,
	type SyncScrollMetrics,
	unregisterScrollSyncPair,
} from "@/lib/pdf/scroll-sync";

const g = globalThis as typeof globalThis & {
	requestAnimationFrame?: (cb: FrameRequestCallback) => number;
};
if (typeof g.requestAnimationFrame !== "function") {
	g.requestAnimationFrame = (cb) =>
		setTimeout(() => cb(Date.now()), 0) as unknown as number;
}

function metrics(
	partial: Partial<SyncScrollMetrics> &
		Pick<SyncScrollMetrics, "scrollTop" | "scrollHeight" | "clientHeight">,
): SyncScrollMetrics {
	return {
		scrollLeft: 0,
		scrollWidth: 100,
		clientWidth: 100,
		...partial,
	};
}

function createPeer(initial: {
	scrollTop?: number;
	scrollHeight?: number;
	clientHeight?: number;
	zoom?: number;
}): ScrollSyncPeer & {
	scrollTop: number;
	zoom: number;
	emitScroll: () => void;
	emitZoom: () => void;
} {
	let scrollTop = initial.scrollTop ?? 0;
	const scrollHeight = initial.scrollHeight ?? 1000;
	const clientHeight = initial.clientHeight ?? 200;
	let zoom = initial.zoom ?? 1;
	const scrollListeners = new Set<() => void>();
	const zoomListeners = new Set<(next: number) => void>();
	return {
		get scrollTop() {
			return scrollTop;
		},
		get zoom() {
			return zoom;
		},
		getMetrics: () => metrics({ scrollTop, scrollHeight, clientHeight }),
		scrollTo: ({ y }) => {
			scrollTop = y;
		},
		onScrollChange: (listener) => {
			scrollListeners.add(listener);
			return () => scrollListeners.delete(listener);
		},
		getZoom: () => zoom,
		setZoom: (next) => {
			zoom = next;
		},
		onZoomChange: (listener) => {
			zoomListeners.add(listener);
			return () => zoomListeners.delete(listener);
		},
		emitScroll: () => {
			for (const listener of scrollListeners) listener();
		},
		emitZoom: () => {
			for (const listener of zoomListeners) listener(zoom);
		},
	};
}

describe("mapScrollPosition", () => {
	it("maps relative scroll ratios across differently sized viewports", () => {
		const mapped = mapScrollPosition(
			metrics({
				scrollTop: 400,
				scrollHeight: 1000,
				clientHeight: 200,
			}),
			metrics({
				scrollTop: 0,
				scrollHeight: 2000,
				clientHeight: 400,
			}),
		);
		expect(mapped).toEqual({ x: 0, y: 800 });
	});

	it("returns null while either viewport has no layout yet", () => {
		expect(
			mapScrollPosition(
				metrics({ scrollTop: 0, scrollHeight: 0, clientHeight: 200 }),
				metrics({ scrollTop: 0, scrollHeight: 1000, clientHeight: 200 }),
			),
		).toBeNull();
	});
});

describe("scroll sync registry", () => {
	it("pairs source and target and exposes roles", () => {
		const groupId = registerScrollSyncPair("paper-a", "paper-a::translation");
		expect(getScrollSyncPartner("paper-a")).toBe("paper-a::translation");
		expect(getScrollSyncPartner("paper-a::translation")).toBe("paper-a");
		expect(getScrollSyncRole("paper-a")).toBe("source");
		expect(getScrollSyncRole("paper-a::translation")).toBe("target");
		unregisterScrollSyncPair(groupId);
		expect(getScrollSyncPartner("paper-a")).toBeNull();
	});

	it("replaces a stale pair for the same documents", () => {
		registerScrollSyncPair("paper-a", "paper-a::translation");
		registerScrollSyncPair("paper-a", "paper-a::translation");
		expect(getScrollSyncPartner("paper-a")).toBe("paper-a::translation");
	});

	it("registers peers and clears them on dispose", () => {
		const peer = createPeer({});
		const dispose = registerScrollSyncPeer("paper-a", peer);
		expect(getScrollSyncPeer("paper-a")).toBe(peer);
		dispose();
		expect(getScrollSyncPeer("paper-a")).toBeNull();
	});
});

describe("runSyncedScroll / runSyncedZoom", () => {
	it("marks the target while the synced action runs", () => {
		expect(isScrollSyncApplying("doc")).toBe(false);
		runSyncedScroll("doc", () => {
			expect(isScrollSyncApplying("doc")).toBe(true);
		});
	});

	it("marks zoom sync targets while applying", () => {
		runSyncedZoom("doc", () => {
			expect(isZoomSyncApplying("doc")).toBe(true);
		});
	});
});
