/**
 * Lightweight selection toolbar for Plaza text surfaces (RSS detail).
 * Ask / Add-to-chat — no highlight / note / translate (nothing to persist).
 * Selected text is copied to the clipboard automatically.
 */

import { MessageSquare, MessageSquarePlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/core/utils";

export type PlazaSelectionScreen = { x: number; y: number };

type PlazaSelectionMenuProps = {
	screen: PlazaSelectionScreen;
	onAsk: () => void;
	onAddToChat: () => void;
};

const BAR_W = 88;
const BAR_H = 40;

export function PlazaSelectionMenu({
	screen,
	onAsk,
	onAddToChat,
}: PlazaSelectionMenuProps) {
	const { t } = useTranslation("viewer");

	const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
	const vh = typeof window !== "undefined" ? window.innerHeight : 800;
	let left = screen.x - BAR_W / 2;
	left = Math.min(Math.max(12, left), vw - BAR_W - 12);
	let top = screen.y - BAR_H - 10;
	let overContent = false;
	if (top < 12) {
		top = Math.min(vh - BAR_H - 12, screen.y + 18);
		overContent = true;
	}

	return (
		<div
			data-plaza-selection-menu
			className={cn(
				"fixed z-50 flex h-10 items-center gap-0.5 rounded-xl border border-border/80 bg-background px-1 shadow-2xl ring-1 ring-black/5 dark:ring-white/10",
				overContent &&
					"bg-background/80 backdrop-blur-sm transition-[background-color] duration-150 hover:bg-background",
			)}
			style={{ left, top }}
			role="toolbar"
			aria-label={t("selection.menuLabel")}
			onMouseDown={(e) => e.stopPropagation()}
		>
			<TooltipProvider delayDuration={200}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={t("selection.ask")}
							onClick={onAsk}
						>
							<MessageSquare className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="top">{t("selection.ask")}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={t("selection.addToChat")}
							onClick={onAddToChat}
						>
							<MessageSquarePlus className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="top">{t("selection.addToChat")}</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
}
