import { useViewportElement } from "@embedpdf/plugin-viewport/react";
import { type RefObject, useEffect, useRef } from "react";
import { isEditableClipboardTarget } from "@/components/viewer/pdf/host-dom";
import { bindPanDragGesture } from "@/lib/pdf/pan-drag";

/** Cursor feedback classes; the stylesheet overrides EmbedPDF's inline cursor. */
const PAN_READY_CLASS = "agentero-pdf-pan-ready";
const PANNING_CLASS = "agentero-pdf-panning";

/** Space must still activate these rather than arm the hand tool. */
const INTERACTIVE_SELECTOR = "button, [role='button'], a, summary, select";

function isInteractiveTarget(target: EventTarget | null): boolean {
	return (
		target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null
	);
}

type PanDragHandlerProps = {
	/** Only the active viewer may claim the bare Space key. */
	active: boolean;
	/** PDF host; Space is claimed with the same ownership rule as `⌘F`. */
	hostRef: RefObject<HTMLDivElement | null>;
	/** False while `⌘.` region select owns the left button. */
	allowLeftDrag: boolean;
};

/**
 * Momentary hand tool: middle-button drag always pans; holding Space arms
 * left-button drag as well.
 *
 * Space is a bare key with no modifier, so claiming it needs an ownership rule:
 * the key event must target this viewer (or `body` while the pointer is over
 * it), and editable or button-like targets keep their native behavior. The
 * pointer gesture itself is not gated on `active` — a drag starts on whatever
 * viewport the pointer is actually on, which matters in split panes.
 *
 * Must render inside `DockviewViewport` (ViewportElementContext).
 */
export function PanDragHandler({
	active,
	hostRef,
	allowLeftDrag,
}: PanDragHandlerProps) {
	const viewportRef = useViewportElement();
	const armedRef = useRef(false);
	const activeRef = useRef(active);
	activeRef.current = active;
	const allowLeftDragRef = useRef(allowLeftDrag);
	allowLeftDragRef.current = allowLeftDrag;

	useEffect(() => {
		const viewport = viewportRef?.current;
		if (!viewport) return;

		const setArmed = (armed: boolean) => {
			if (armedRef.current === armed) return;
			armedRef.current = armed;
			viewport.classList.toggle(PAN_READY_CLASS, armed);
		};

		const binding = bindPanDragGesture({
			target: viewport,
			isLeftDragArmed: () => armedRef.current,
			// Editors never pan. An armed left-drag additionally spares buttons and
			// links (toolbar, in-page citation hits) so they keep their click; the
			// middle button has no other meaning here, so it pans from anywhere.
			isExcluded: (event) =>
				isEditableClipboardTarget(event.target) ||
				(event.button === 0 && isInteractiveTarget(event.target)),
			onStateChange: (state) => {
				viewport.classList.toggle(PANNING_CLASS, state === "panning");
			},
		});

		const disarm = () => {
			setArmed(false);
			binding.cancel();
		};

		/** Whether this viewer owns a bare Space keydown. */
		const ownsSpaceKey = (target: EventTarget | null): boolean => {
			const host = hostRef.current;
			if (!host) return false;
			if (isEditableClipboardTarget(target)) return false;
			if (isInteractiveTarget(target)) return false;
			if (target instanceof Node && host.contains(target)) return true;
			// Focus is nowhere: only claim Space while the pointer is over this
			// viewer, so a merely-hovered PDF cannot eat Space from another pane.
			return (
				(target === document.body || target === document.documentElement) &&
				host.matches(":hover")
			);
		};

		const isSpaceKey = (event: KeyboardEvent) =>
			event.key === " " || event.code === "Space";

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.repeat || armedRef.current || !isSpaceKey(event)) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (!activeRef.current || !allowLeftDragRef.current) return;
			if (!ownsSpaceKey(event.target)) return;
			// Stop the viewport's native Space page-scroll while panning is armed.
			event.preventDefault();
			setArmed(true);
		};

		const onKeyUp = (event: KeyboardEvent) => {
			if (isSpaceKey(event)) setArmed(false);
		};

		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		window.addEventListener("blur", disarm);
		document.addEventListener("visibilitychange", disarm);

		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("blur", disarm);
			document.removeEventListener("visibilitychange", disarm);
			binding.dispose();
			armedRef.current = false;
			viewport.classList.remove(PAN_READY_CLASS, PANNING_CLASS);
		};
	}, [viewportRef, hostRef]);

	return null;
}
