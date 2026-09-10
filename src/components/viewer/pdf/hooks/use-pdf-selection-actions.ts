/**
 * Selection actions (highlight / note / copy / ask / add-to-chat / translate).
 *
 * Highlight / copy / ask / add-to-chat / translate are wired to the floating
 * selection toolbar; note is triggered from the right-rail selection comment
 * chip (hover expands, leave collapses; click / focus opens the rail editor).
 * Detection and menu state stay in {@link usePdfTextSelection}; each action's
 * real work belongs to its own cluster.
 */

import type {
	FormattedSelection,
	useSelectionCapability,
} from "@embedpdf/plugin-selection/react";
import { type Dispatch, type SetStateAction, useCallback, useRef } from "react";
import type {
	RailEditState,
	SelectionMenuState,
} from "@/components/viewer/pdf/types";
import {
	pinActiveSelection,
	publishSelection,
} from "@/lib/agent/selection-store";
import type { PdfAskAnchor } from "@/lib/pdf/ask/types";
import {
	DEFAULT_HIGHLIGHT_COLOR,
	type HighlightColor,
} from "@/lib/pdf/highlight/palette";
import { openRightTab } from "@/lib/shell/ui-window-actions";

type SelectionCapabilityProvides = ReturnType<
	typeof useSelectionCapability
>["provides"];

export type UsePdfSelectionActionsOptions = {
	/** Placed menu; every action no-ops when null. */
	selectionMenu: SelectionMenuState | null;
	setSelectionMenu: Dispatch<SetStateAction<SelectionMenuState | null>>;
	closeSelectionMenu: () => void;
	/** Highlights cluster writer. */
	createHighlights: (
		pages: FormattedSelection[],
		color: HighlightColor,
		quote: string,
	) => { pageIndex: number; id: string }[];
	/** EmbedPDF capability; owned by `PdfViewerInner` (plugin context). */
	selectionCap: SelectionCapabilityProvides;
	docId: string;
	/** Note editor entry (opens the rail edit for the new note). */
	beginRailEdit: (state: RailEditState) => void;
	/** Ask cluster entry (creates an empty thread from the anchor). */
	startFromAnchor: (anchor: PdfAskAnchor) => void;
	/** Translate cluster entry (creates the record and starts the run). */
	translateSelection: (anchor: PdfAskAnchor) => void;
	paperRelPath: string | null;
	paperAbsPath: string | null;
};

export type PdfSelectionActions = {
	handleHighlight: (color: HighlightColor) => void;
	handleNote: () => void;
	handleCopy: () => void;
	handleMenuAsk: () => void;
	handleMenuAddToChat: () => void;
	handleMenuTranslate: () => void;
};

export function usePdfSelectionActions({
	selectionMenu,
	setSelectionMenu,
	closeSelectionMenu,
	createHighlights,
	selectionCap,
	docId,
	beginRailEdit,
	startFromAnchor,
	translateSelection,
	paperRelPath,
	paperAbsPath,
}: UsePdfSelectionActionsOptions): PdfSelectionActions {
	// The right-rail annotate chip lives inside the page DOM. EmbedPDF often
	// clears the live selection on pointerdown before React re-renders, so
	// action handlers read this snapshot instead of the possibly-null state.
	const selectionMenuRef = useRef(selectionMenu);
	selectionMenuRef.current = selectionMenu;

	const handleHighlight = useCallback(
		(color: HighlightColor) => {
			const menu = selectionMenuRef.current;
			if (!menu) return;
			createHighlights(menu.pages, color, menu.anchor.quote ?? "");
			closeSelectionMenu();
		},
		[createHighlights, closeSelectionMenu],
	);

	const handleNote = useCallback(() => {
		const menu = selectionMenuRef.current;
		if (!menu) return;
		const quote = menu.anchor.quote ?? "";
		const anchorPage = menu.pages[0];
		const created = createHighlights(
			menu.pages,
			DEFAULT_HIGHLIGHT_COLOR,
			quote,
		);
		const first = created[0];
		setSelectionMenu(null);
		selectionCap?.clear(docId);
		if (!first || !anchorPage) return;
		beginRailEdit({
			id: first.id,
			pageIndex: first.pageIndex,
			kind: "highlight",
			comment: "",
			quote,
			color: DEFAULT_HIGHLIGHT_COLOR,
			anchorY: menu.anchor.rects[0]?.y ?? 0,
			rects: menu.anchor.rects,
			isNew: true,
		});
	}, [createHighlights, selectionCap, docId, setSelectionMenu, beginRailEdit]);

	const handleCopy = useCallback(() => {
		selectionCap?.copyToClipboard(docId);
	}, [selectionCap, docId]);

	const handleMenuAsk = useCallback(() => {
		const menu = selectionMenuRef.current;
		if (!menu) return;
		const anchor = menu.anchor;
		setSelectionMenu(null);
		selectionCap?.clear(docId);
		startFromAnchor(anchor);
	}, [startFromAnchor, selectionCap, docId, setSelectionMenu]);

	const handleMenuAddToChat = useCallback(() => {
		const menu = selectionMenuRef.current;
		if (!menu) return;
		const anchor = menu.anchor;
		const quote = anchor.quote?.trim();
		setSelectionMenu(null);
		selectionCap?.clear(docId);
		if (!quote) return;
		// Re-publish after clear: clearing the PDF selection also drops the live chip.
		// Keep page geometry so the next Agent turn can write a conversation card pin.
		publishSelection({
			text: quote,
			sourcePath: paperRelPath ?? paperAbsPath ?? "PDF",
			origin: "pdf",
			page: anchor.page,
			rects: anchor.rects,
			paperAbsPath: paperAbsPath ?? undefined,
		});
		pinActiveSelection();
		openRightTab("agent");
	}, [selectionCap, docId, paperRelPath, paperAbsPath, setSelectionMenu]);

	const handleMenuTranslate = useCallback(() => {
		const menu = selectionMenuRef.current;
		if (!menu) return;
		const anchor = menu.anchor;
		setSelectionMenu(null);
		selectionCap?.clear(docId);
		translateSelection(anchor);
	}, [selectionCap, docId, setSelectionMenu, translateSelection]);

	return {
		handleHighlight,
		handleNote,
		handleCopy,
		handleMenuAsk,
		handleMenuAddToChat,
		handleMenuTranslate,
	};
}
