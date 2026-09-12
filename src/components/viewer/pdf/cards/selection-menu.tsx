import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ScreenPoint } from "@/components/viewer/pdf/types";
import { cn } from "@/lib/core/utils";
import {
	HIGHLIGHT_COLORS,
	type HighlightColor,
	swatchColorClass,
} from "@/lib/pdf/highlight/palette";
import { formatModShortcut } from "@/lib/shell/shortcuts";

type SelectionMenuProps = {
	/** Screen point near the top-center of the selection (toolbar anchor) */
	screen: ScreenPoint;
	/** Create a highlight in the chosen color */
	onHighlight: (color: HighlightColor) => void;
	/** Open an in-page Ask (quick chat) thread for the selection. */
	onAsk: () => void;
	/** Pin the selection as an Agent composer context chip and open the chat. */
	onAddToChat: () => void;
	onTranslate: () => void;
	/** Hide highlight / translate (need marks/); keep Add to chat / Quick chat. */
	readOnly?: boolean;
};

const BAR_H = 32;

/**
 * Floating action bar shown next to a text selection: color swatches
 * (highlight), then Add to chat / Quick chat / Translate as compact text.
 * Annotate lives on the right-rail selection comment chip instead.
 * Selected text is copied to the clipboard automatically.
 * Remote papers are read-only: they keep Add to chat / Quick chat but hide
 * persistent highlight / translate actions.
 */
export function SelectionMenu({
	screen,
	onHighlight,
	onAsk,
	onAddToChat,
	onTranslate,
	readOnly = false,
}: SelectionMenuProps) {
	const { t } = useTranslation("viewer");
	// ⌘K focuses the composer after pinning; ⌘L with a selection also pins and
	// opens the Agent rail. Quick chat (Ask) is click-only on this toolbar.
	const addToChatShortcut = formatModShortcut("k");
	const pinChatShortcut = formatModShortcut("l");

	const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
	const vh = typeof window !== "undefined" ? window.innerHeight : 800;
	// Approximate width for clamping; flex content sizes the real bar.
	const barW = readOnly ? 200 : 320;
	let left = screen.x - barW / 2;
	left = Math.min(Math.max(12, left), vw - barW - 12);
	// Prefer just above the selection; flip below if near the top edge.
	let top = screen.y - BAR_H - 10;
	let overContent = false;
	if (top < 12) {
		top = Math.min(vh - BAR_H - 12, screen.y + 18);
		// Menu sits below the selection and may cover body text.
		overContent = true;
	}
	// Keep the toolbar on-screen when the selection scrolls out of view; dim it
	// so it does not look glued to an off-screen anchor.
	const clampedTop = Math.max(12, Math.min(vh - BAR_H - 12, top));
	const scrolledAway = clampedTop !== top;
	top = clampedTop;
	const dimmed = overContent || scrolledAway;

	const colorLabel = (c: HighlightColor): string => {
		switch (c) {
			case "yellow":
				return t("selection.color.yellow");
			case "green":
				return t("selection.color.green");
			case "blue":
				return t("selection.color.blue");
			case "pink":
				return t("selection.color.pink");
			default:
				return t("selection.color.purple");
		}
	};

	return (
		<div
			className={cn(
				"fixed z-50 flex h-8 items-center gap-0.5 rounded-lg border border-border/80 bg-background px-1 shadow-2xl ring-1 ring-black/5 transition-[background-color,opacity] duration-150 dark:ring-white/10",
				// Dim when covering body text or when the selection scrolled away.
				dimmed &&
					"bg-background/80 opacity-70 backdrop-blur-sm hover:bg-background hover:opacity-100",
			)}
			style={{ left, top }}
			role="toolbar"
			aria-label={t("selection.menuLabel")}
			onMouseDown={(e) => e.stopPropagation()}
		>
			<TooltipProvider delayDuration={200}>
				{!readOnly ? (
					<>
						{HIGHLIGHT_COLORS.map((c) => (
							<Tooltip key={c}>
								<TooltipTrigger asChild>
									{/*
									 * 16px dot, 24px hit area (WCAG 2.5.8): the target is padded
									 * out rather than the dot enlarged.
									 */}
									<button
										type="button"
										aria-label={colorLabel(c)}
										className="group inline-flex size-6 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
										onClick={() => onHighlight(c)}
									>
										<span
											className={cn(
												"size-4 rounded-full ring-1 ring-black/15 transition-transform group-hover:scale-110 dark:ring-white/25",
												swatchColorClass(c),
											)}
											aria-hidden
										/>
									</button>
								</TooltipTrigger>
								<TooltipContent side="top">{colorLabel(c)}</TooltipContent>
							</Tooltip>
						))}
						<div className="mx-0.5 h-4 w-px shrink-0 bg-border" />
					</>
				) : null}
				<button
					type="button"
					className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-caption font-medium text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.97] motion-reduce:active:scale-100"
					aria-label={`${t("selection.addToChat")} ${addToChatShortcut} ${pinChatShortcut}`}
					onClick={onAddToChat}
				>
					<span>{t("selection.addToChat")}</span>
					<kbd className="translate-y-px scale-90 text-caption font-normal text-muted-foreground/80 tabular-nums">
						{addToChatShortcut}
					</kbd>
				</button>
				<button
					type="button"
					className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-caption font-medium text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.97] motion-reduce:active:scale-100"
					aria-label={`${t("selection.quickChat")} ${pinChatShortcut}`}
					onClick={onAsk}
				>
					<span>{t("selection.quickChat")}</span>
					<kbd className="translate-y-px scale-90 text-caption font-normal text-muted-foreground/80 tabular-nums">
						{pinChatShortcut}
					</kbd>
				</button>
				{!readOnly ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className="size-7"
								aria-label={t("selection.translate")}
								onClick={onTranslate}
							>
								<Languages className="size-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top">
							{t("selection.translate")}
						</TooltipContent>
					</Tooltip>
				) : null}
			</TooltipProvider>
		</div>
	);
}
