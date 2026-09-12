/**
 * Bidirectional scroll synchronization for paired PDF viewers, primarily used
 * by the dual-pane translation layout so the source and translated panes stay
 * aligned as the user scrolls either side.
 */

type ScrollSyncPair = { source: string; target: string };

export type ExternalScrollSyncViewport = {
	getMetrics: () => {
		scrollTop: number;
		scrollLeft: number;
		scrollHeight: number;
		scrollWidth: number;
		clientHeight: number;
		clientWidth: number;
	};
	scrollTo: (position: { x: number; y: number }) => void;
	onScrollChange: (listener: () => void) => () => void;
	setZoom: (zoom: number) => void;
};

const pairs = new Map<string, ScrollSyncPair>();
let groupSequence = 1;
const externalViewports = new Map<string, ExternalScrollSyncViewport>();
const externalViewportListeners = new Set<() => void>();

export function registerExternalScrollSyncViewport(
	docId: string,
	viewport: ExternalScrollSyncViewport,
): () => void {
	externalViewports.set(docId, viewport);
	for (const listener of externalViewportListeners) listener();
	return () => {
		if (externalViewports.get(docId) !== viewport) return;
		externalViewports.delete(docId);
		for (const listener of externalViewportListeners) listener();
	};
}

export function getExternalScrollSyncViewport(
	docId: string,
): ExternalScrollSyncViewport | null {
	return externalViewports.get(docId) ?? null;
}

export function subscribeExternalScrollSyncViewports(
	listener: () => void,
): () => void {
	externalViewportListeners.add(listener);
	return () => externalViewportListeners.delete(listener);
}

export function registerScrollSyncPair(
	sourceDocId: string,
	targetDocId: string,
): string {
	// Remove any stale pairing that involves either docId so reopening the
	// translation pane does not accumulate duplicate listeners.
	for (const [id, pair] of pairs) {
		if (pair.source === sourceDocId || pair.target === targetDocId) {
			pairs.delete(id);
		}
	}
	const groupId = `pdf-scroll-sync-${groupSequence++}`;
	pairs.set(groupId, { source: sourceDocId, target: targetDocId });
	return groupId;
}

export function unregisterScrollSyncPair(groupId: string): void {
	pairs.delete(groupId);
}

export function getScrollSyncPartner(docId: string): string | null {
	for (const pair of pairs.values()) {
		if (pair.source === docId) return pair.target;
		if (pair.target === docId) return pair.source;
	}
	return null;
}

/** Track document IDs that are being scrolled programmatically by a partner. */
const syncingDocIds = new Set<string>();

export function isScrollSyncApplying(docId: string): boolean {
	return syncingDocIds.has(docId);
}

export function runSyncedScroll(docId: string, action: () => void): void {
	syncingDocIds.add(docId);
	action();
	requestAnimationFrame(() => syncingDocIds.delete(docId));
}

/** Track document IDs whose zoom is being changed by their partner. */
const syncingZoomDocIds = new Set<string>();

export function isZoomSyncApplying(docId: string): boolean {
	return syncingZoomDocIds.has(docId);
}

export function runSyncedZoom(docId: string, action: () => void): void {
	syncingZoomDocIds.add(docId);
	action();
	requestAnimationFrame(() => syncingZoomDocIds.delete(docId));
}
