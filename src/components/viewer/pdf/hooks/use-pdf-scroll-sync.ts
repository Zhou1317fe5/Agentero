import { useDocumentManagerCapability } from "@embedpdf/plugin-document-manager/react";
import { useViewportCapability } from "@embedpdf/plugin-viewport/react";
import { useZoomCapability } from "@embedpdf/plugin-zoom/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	getExternalScrollSyncViewport,
	getScrollSyncPartner,
	isScrollSyncApplying,
	isZoomSyncApplying,
	runSyncedScroll,
	runSyncedZoom,
	subscribeExternalScrollSyncViewports,
} from "@/lib/pdf/scroll-sync";

export type PdfScrollPosition = {
	x: number;
	y: number;
};

/**
 * Bidirectionally sync scroll position between this PDF viewer and its paired
 * partner (e.g. the right-hand translation pane). Synchronization uses relative
 * ratios so small differences in panel size do not drift the two views apart.
 */
export function usePdfScrollSync(docId: string): void {
	const viewportCap = useViewportCapability().provides;
	const docCap = useDocumentManagerCapability().provides;
	const zoomCap = useZoomCapability().provides;
	const partnerId = useMemo(() => getScrollSyncPartner(docId), [docId]);
	const initialSyncDoneRef = useRef(false);
	const [, setExternalViewportRevision] = useState(0);

	useEffect(
		() =>
			subscribeExternalScrollSyncViewports(() =>
				setExternalViewportRevision((n) => n + 1),
			),
		[],
	);

	useEffect(() => {
		if (!partnerId || !viewportCap || !docCap || !zoomCap) return;
		if (!docCap.isDocumentOpen(docId)) return;

		const myScope = viewportCap.forDocument(docId);
		const myZoomScope = zoomCap.forDocument(docId);
		if (!myScope || !myZoomScope) return;

		const externalPartner = getExternalScrollSyncViewport(partnerId);
		if (externalPartner) {
			const applyExternalScroll = () => {
				if (isScrollSyncApplying(docId)) return;
				const from = myScope.getMetrics();
				const to = externalPartner.getMetrics();
				const fromMaxY = Math.max(0, from.scrollHeight - from.clientHeight);
				const fromMaxX = Math.max(0, from.scrollWidth - from.clientWidth);
				const toMaxY = Math.max(0, to.scrollHeight - to.clientHeight);
				const toMaxX = Math.max(0, to.scrollWidth - to.clientWidth);
				runSyncedScroll(partnerId, () =>
					externalPartner.scrollTo({
						x: fromMaxX > 0 ? (from.scrollLeft / fromMaxX) * toMaxX : 0,
						y: fromMaxY > 0 ? (from.scrollTop / fromMaxY) * toMaxY : 0,
					}),
				);
			};
			const applySourceScroll = () => {
				if (isScrollSyncApplying(partnerId)) return;
				const from = externalPartner.getMetrics();
				const to = myScope.getMetrics();
				const fromMaxY = Math.max(0, from.scrollHeight - from.clientHeight);
				const fromMaxX = Math.max(0, from.scrollWidth - from.clientWidth);
				const toMaxY = Math.max(0, to.scrollHeight - to.clientHeight);
				const toMaxX = Math.max(0, to.scrollWidth - to.clientWidth);
				runSyncedScroll(docId, () =>
					myScope.scrollTo({
						x: fromMaxX > 0 ? (from.scrollLeft / fromMaxX) * toMaxX : 0,
						y: fromMaxY > 0 ? (from.scrollTop / fromMaxY) * toMaxY : 0,
						behavior: "instant",
					}),
				);
			};
			const unsubscribeSource = myScope.onScrollChange(applyExternalScroll);
			const unsubscribeExternal =
				externalPartner.onScrollChange(applySourceScroll);
			const unsubscribeZoom = myZoomScope.onZoomChange(() => {
				externalPartner.setZoom(myZoomScope.getState().currentZoomLevel);
			});
			applyExternalScroll();
			externalPartner.setZoom(myZoomScope.getState().currentZoomLevel);
			return () => {
				unsubscribeSource();
				unsubscribeExternal();
				unsubscribeZoom();
			};
		}

		if (!docCap.isDocumentOpen(partnerId)) return;
		const partnerScope = viewportCap.forDocument(partnerId);
		const partnerZoomScope = zoomCap.forDocument(partnerId);
		if (!partnerScope || !partnerZoomScope) return;

		const applyScroll = (
			fromScope: typeof myScope,
			toScope: typeof partnerScope,
			targetDocId: string,
		) => {
			if (isScrollSyncApplying(targetDocId)) return;
			const fromMetrics = fromScope.getMetrics();
			if (fromMetrics.scrollHeight <= 0 || fromMetrics.scrollWidth <= 0) return;
			const toMetrics = toScope.getMetrics();
			if (toMetrics.scrollHeight <= 0 || toMetrics.scrollWidth <= 0) return;
			const fromMaxY = Math.max(
				0,
				fromMetrics.scrollHeight - fromMetrics.clientHeight,
			);
			const fromMaxX = Math.max(
				0,
				fromMetrics.scrollWidth - fromMetrics.clientWidth,
			);
			const toMaxY = Math.max(
				0,
				toMetrics.scrollHeight - toMetrics.clientHeight,
			);
			const toMaxX = Math.max(0, toMetrics.scrollWidth - toMetrics.clientWidth);
			const ratioY = fromMaxY > 0 ? fromMetrics.scrollTop / fromMaxY : 0;
			const ratioX = fromMaxX > 0 ? fromMetrics.scrollLeft / fromMaxX : 0;
			runSyncedScroll(targetDocId, () => {
				try {
					toScope.scrollTo({
						x: ratioX * toMaxX,
						y: ratioY * toMaxY,
						behavior: "instant",
					});
				} catch {
					// Ignore transient scroll failures while the target viewport is
					// still initializing.
				}
			});
		};

		const applyZoom = (
			fromScope: typeof myZoomScope,
			toScope: typeof partnerZoomScope,
			targetDocId: string,
		) => {
			if (isZoomSyncApplying(targetDocId)) return;
			const nextZoom = fromScope.getState().currentZoomLevel;
			if (!Number.isFinite(nextZoom) || nextZoom <= 0) return;
			runSyncedZoom(targetDocId, () => {
				try {
					toScope.requestZoom(nextZoom);
				} catch {
					// Ignore transient zoom failures while the target is initializing.
				}
			});
		};

		const unsubscribeMy = myScope.onScrollChange(() => {
			applyScroll(myScope, partnerScope, partnerId);
		});

		const unsubscribePartner = partnerScope.onScrollChange(() => {
			applyScroll(partnerScope, myScope, docId);
		});
		const unsubscribeMyZoom = myZoomScope.onZoomChange(() => {
			applyZoom(myZoomScope, partnerZoomScope, partnerId);
		});
		const unsubscribePartnerZoom = partnerZoomScope.onZoomChange(() => {
			applyZoom(partnerZoomScope, myZoomScope, docId);
		});

		// One-time initial alignment: when the translation pane first loads,
		// snap it to the source pane's current scroll ratio so both panels show
		// the same page instead of the right pane staying at the top.
		if (!initialSyncDoneRef.current) {
			initialSyncDoneRef.current = true;
			applyScroll(myScope, partnerScope, partnerId);
			applyZoom(myZoomScope, partnerZoomScope, partnerId);
		}

		return () => {
			unsubscribeMy();
			unsubscribePartner();
			unsubscribeMyZoom();
			unsubscribePartnerZoom();
		};
	}, [docId, partnerId, viewportCap, docCap, zoomCap]);
}
