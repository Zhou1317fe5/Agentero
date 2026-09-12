import { useScrollCapability } from "@embedpdf/plugin-scroll/react";
import { useViewportCapability } from "@embedpdf/plugin-viewport/react";
import { useZoomCapability } from "@embedpdf/plugin-zoom/react";
import { useEffect, useMemo, useRef, useState } from "react";
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
	subscribeScrollSyncPairs,
	subscribeScrollSyncPeers,
} from "@/lib/pdf/scroll-sync";

const TRANSLATION_DOC_SUFFIX = "::translation";

export type PdfScrollPosition = {
	x: number;
	y: number;
};

/**
 * Bidirectionally sync scroll position and zoom between this PDF viewer and
 * its paired partner (e.g. the right-hand translation pane).
 *
 * Each dual-pane viewer mounts its own EmbedPDF provider, so peers publish
 * themselves into the module-level registry. Only the pair's source wires
 * listeners; the target merely registers so the source can drive it and so
 * target-originated scroll / zoom still reach the source via peer callbacks.
 */
export function usePdfScrollSync(docId: string): void {
	const viewportCap = useViewportCapability().provides;
	const scrollCap = useScrollCapability().provides;
	const zoomCap = useZoomCapability().provides;
	const [pairRevision, setPairRevision] = useState(0);
	const [peerRevision, setPeerRevision] = useState(0);
	const [scopeRetry, setScopeRetry] = useState(0);
	const initialSyncDoneRef = useRef<string | null>(null);

	useEffect(
		() => subscribeScrollSyncPairs(() => setPairRevision((n) => n + 1)),
		[],
	);
	useEffect(
		() => subscribeScrollSyncPeers(() => setPeerRevision((n) => n + 1)),
		[],
	);

	// Restored translation tabs skip openTranslationTab; re-bind the pair from
	// the conventional `::translation` document id so sync survives reload.
	useEffect(() => {
		if (!docId.endsWith(TRANSLATION_DOC_SUFFIX)) return;
		const sourceId = docId.slice(0, -TRANSLATION_DOC_SUFFIX.length);
		if (!sourceId) return;
		registerScrollSyncPair(sourceId, docId);
	}, [docId]);

	// pairRevision is an external-store tick: re-read after registerScrollSyncPair.
	// biome-ignore lint/correctness/useExhaustiveDependencies: pairRevision is a refresh signal
	const partnerId = useMemo(
		() => getScrollSyncPartner(docId),
		[docId, pairRevision],
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: pairRevision is a refresh signal
	const role = useMemo(() => getScrollSyncRole(docId), [docId, pairRevision]);

	// Publish this viewer's viewport / zoom into the cross-instance registry so
	// the paired pane (another EmbedPDF tree) can drive and observe us.
	// biome-ignore lint/correctness/useExhaustiveDependencies: scopeRetry retriggers while document scopes initialize
	useEffect(() => {
		if (!viewportCap || !scrollCap || !zoomCap) return;
		const myScope = viewportCap.forDocument(docId);
		const myScrollScope = scrollCap.forDocument(docId);
		const myZoomScope = zoomCap.forDocument(docId);
		if (!myScope || !myScrollScope || !myZoomScope) {
			// Document scopes can lag capability readiness by a frame; retry so
			// the peer is not permanently missing from the registry.
			const retry = window.setTimeout(() => setScopeRetry((n) => n + 1), 50);
			return () => window.clearTimeout(retry);
		}

		return registerScrollSyncPeer(docId, {
			getMetrics: () => myScope.getMetrics(),
			scrollTo: ({ x, y }) => {
				try {
					myScope.scrollTo({ x, y, behavior: "instant" });
				} catch {
					// Ignore transient scroll failures while the viewport initializes.
				}
			},
			onScrollChange: (listener) => myScrollScope.onScroll(() => listener()),
			getZoom: () => myZoomScope.getState().currentZoomLevel,
			setZoom: (nextZoom) => {
				if (!Number.isFinite(nextZoom) || nextZoom <= 0) return;
				try {
					myZoomScope.requestZoom(nextZoom);
				} catch {
					// Ignore transient zoom failures while the target initializes.
				}
			},
			onZoomChange: (listener) =>
				myZoomScope.onZoomChange((event) => listener(event.newZoom)),
		});
	}, [docId, viewportCap, scrollCap, zoomCap, scopeRetry]);

	// Source owns the bidirectional wiring. Target only registers (above) so
	// user gestures on the translation pane still reach the source through the
	// peer's onScrollChange / onZoomChange callbacks.
	// biome-ignore lint/correctness/useExhaustiveDependencies: peerRevision retriggers when the partner peer registers
	useEffect(() => {
		if (!partnerId || role !== "source") return;
		const me = getScrollSyncPeer(docId);
		const partner = getScrollSyncPeer(partnerId);
		if (!me || !partner) return;

		const applyScroll = (
			from: typeof me,
			to: typeof partner,
			targetDocId: string,
		) => {
			if (isScrollSyncApplying(targetDocId)) return;
			const mapped = mapScrollPosition(from.getMetrics(), to.getMetrics());
			if (!mapped) return;
			runSyncedScroll(targetDocId, () => to.scrollTo(mapped));
		};

		let cancelled = false;
		const applyZoom = (
			from: typeof me,
			to: typeof partner,
			targetDocId: string,
			nextZoom: number,
		) => {
			if (cancelled || isZoomSyncApplying(targetDocId)) return;
			if (!Number.isFinite(nextZoom) || nextZoom <= 0) return;
			if (Math.abs(to.getZoom() - nextZoom) < 0.0001) return;
			runSyncedZoom(targetDocId, () => {
				to.setZoom(nextZoom);
				// Zoom changes content size; realign scroll on the next frame once
				// the target viewport has updated its metrics.
				requestAnimationFrame(() => {
					if (cancelled) return;
					applyScroll(from, to, targetDocId);
				});
			});
		};

		const unsubscribeMyScroll = me.onScrollChange(() => {
			if (cancelled || isScrollSyncApplying(docId)) return;
			applyScroll(me, partner, partnerId);
		});
		const unsubscribePartnerScroll = partner.onScrollChange(() => {
			if (cancelled || isScrollSyncApplying(partnerId)) return;
			applyScroll(partner, me, docId);
		});
		const unsubscribeMyZoom = me.onZoomChange((nextZoom) => {
			if (cancelled || isZoomSyncApplying(docId)) return;
			applyZoom(me, partner, partnerId, nextZoom);
		});
		const unsubscribePartnerZoom = partner.onZoomChange((nextZoom) => {
			if (cancelled || isZoomSyncApplying(partnerId)) return;
			applyZoom(partner, me, docId, nextZoom);
		});

		const pairKey = `${docId}::${partnerId}`;
		let retryTimer: ReturnType<typeof setTimeout> | null = null;
		const tryInitialSync = () => {
			if (cancelled || initialSyncDoneRef.current === pairKey) return;
			const mapped = mapScrollPosition(me.getMetrics(), partner.getMetrics());
			if (!mapped) {
				retryTimer = setTimeout(tryInitialSync, 100);
				return;
			}
			initialSyncDoneRef.current = pairKey;
			const nextZoom = me.getZoom();
			if (Math.abs(partner.getZoom() - nextZoom) >= 0.0001) {
				applyZoom(me, partner, partnerId, nextZoom);
			} else {
				applyScroll(me, partner, partnerId);
			}
		};
		tryInitialSync();

		return () => {
			cancelled = true;
			if (retryTimer) clearTimeout(retryTimer);
			unsubscribeMyScroll();
			unsubscribePartnerScroll();
			unsubscribeMyZoom();
			unsubscribePartnerZoom();
		};
	}, [docId, partnerId, role, peerRevision]);
}
