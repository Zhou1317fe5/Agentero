/**
 * Data-driven column layout + cell renderers for the papers library table.
 * Each entry pairs header meta (label / width / min-width) with a per-paper
 * cell renderer; the table body just walks visible columns.
 */
import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	Award,
	FileWarning,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import {
	authorsCopyText,
	type CellCtx,
	type ColumnDef,
	identifierValue,
	type SortDir,
	type SortKey,
} from "@/components/library/library-row-utils";
import { PaperTagChip } from "@/components/library/paper-tag-chip";
import { ReadingTitleHeat } from "@/components/library/reading-heatmap";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { errorMessage, notifyError, notifySuccess } from "@/lib/core/notify";
import { cn } from "@/lib/core/utils";
import {
	buildEasyScholarTags,
	fetchEasyScholarRank,
	isEasyScholarTag,
} from "@/lib/easyscholar";
import type { PaperMetadata } from "@/lib/paper";
import { formatAuthorsShort } from "@/lib/paper";
import { coercePaperTags } from "@/lib/paper/tags";

const COPY_CELL_BASE =
	"cursor-pointer select-text rounded-sm hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Single-click-to-copy cell control shared by library columns. */
function CopyCellButton({
	copyText,
	labelKey,
	ctx,
	className,
	children,
}: {
	copyText: string | null | undefined;
	labelKey: string;
	ctx: Pick<CellCtx, "t" | "onCellCopy">;
	className?: string;
	children: ReactNode;
}) {
	const label = ctx.t(labelKey);
	const copyHint = ctx.t("papersLibrary.copyHint", { label });
	const canCopy = Boolean(copyText?.trim());
	return (
		<button
			type="button"
			className={cn(COPY_CELL_BASE, className)}
			title={canCopy ? copyHint : undefined}
			aria-label={copyHint}
			onClick={(e) => ctx.onCellCopy(e, copyText, label)}
		>
			{children}
		</button>
	);
}

/** `<td>` + copy button for plain columns (year / type / id …). */
function CopyTd({
	tdClassName,
	copyText,
	labelKey,
	ctx,
	buttonClassName,
	children,
}: {
	tdClassName: string;
	copyText: string | null | undefined;
	labelKey: string;
	ctx: Pick<CellCtx, "t" | "onCellCopy">;
	buttonClassName?: string;
	children: ReactNode;
}) {
	return (
		<td className={tdClassName}>
			<CopyCellButton
				copyText={copyText}
				labelKey={labelKey}
				ctx={ctx}
				className={buttonClassName}
			>
				{children}
			</CopyCellButton>
		</td>
	);
}

function EasyScholarRankButton({
	paper,
	ctx,
}: {
	paper: PaperMetadata;
	ctx: Pick<CellCtx, "t" | "onSetPaperTags">;
}) {
	const [busy, setBusy] = useState(false);
	const setTags = ctx.onSetPaperTags;
	if (!setTags) return null;
	const title = paper.publication?.trim();
	if (!title) return null;

	const fetchRank = async () => {
		if (busy) return;
		setBusy(true);
		try {
			const response = await fetchEasyScholarRank(title);
			const data = response.data?.officialRank?.all;
			if (!data || Object.keys(data).length === 0) {
				notifyError(ctx.t("papersLibrary.easyScholar.noData"));
				return;
			}
			const newTags = buildEasyScholarTags(title, data).map((name) => ({
				name,
			}));
			const allTags = coercePaperTags(paper.tags);
			const base = allTags.filter((tag) => !isEasyScholarTag(tag.name));
			await setTags(paper, [...base, ...newTags]);
			notifySuccess(
				ctx.t("papersLibrary.easyScholar.done", { count: newTags.length }),
			);
		} catch (err) {
			notifyError(ctx.t("papersLibrary.easyScholar.fetchFailed"), {
				description: errorMessage(err),
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<button
			type="button"
			disabled={busy}
			onClick={() => void fetchRank()}
			className={cn(
				"inline-flex size-4 items-center justify-center rounded-full",
				"bg-background ring-1 ring-border/70 transition-colors",
				"hover:ring-foreground/30",
				"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
				"disabled:pointer-events-none disabled:opacity-50",
			)}
			aria-label={ctx.t("papersLibrary.easyScholar.fetchRank")}
			title={ctx.t("papersLibrary.easyScholar.fetchRank")}
		>
			<Award className="size-3 text-amber-500" aria-hidden />
		</button>
	);
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
	if (!active) {
		return <ArrowUpDown className="size-3 shrink-0 opacity-40" aria-hidden />;
	}
	return dir === "asc" ? (
		<ArrowUp className="size-3 shrink-0 text-foreground" aria-hidden />
	) : (
		<ArrowDown className="size-3 shrink-0 text-foreground" aria-hidden />
	);
}

/** Column layout + cell renderers (data-driven; no switch in the component). */
export const COLUMN_META = {
	title: {
		labelKey: "papersLibrary.colTitle",
		widthWeight: 32,
		headerClassName: "min-w-[240px]",
		render: (p, ctx) => (
			<td className="min-w-0 max-w-0 overflow-hidden px-3 py-2.5">
				<CopyCellButton
					copyText={p.title}
					labelKey="papersLibrary.colTitle"
					ctx={ctx}
					className="block w-full text-left font-medium"
				>
					<ReadingTitleHeat heatmap={ctx.heat} className="line-clamp-1">
						<span className="flex min-w-0 items-center gap-1">
							<span className="block truncate" title={p.title}>
								{p.title}
							</span>
							{p.has_pdf === false ? (
								<Tooltip>
									<TooltipTrigger asChild>
										<span
											role="img"
											className="shrink-0 cursor-help text-muted-foreground"
											aria-label={ctx.t("papersLibrary.noLocalPdf")}
										>
											<FileWarning className="size-3" aria-hidden />
										</span>
									</TooltipTrigger>
									<TooltipContent>
										{ctx.t("papersLibrary.noLocalPdf")}
									</TooltipContent>
								</Tooltip>
							) : null}
						</span>
					</ReadingTitleHeat>
				</CopyCellButton>
			</td>
		),
	},
	authors: {
		labelKey: "papersLibrary.colAuthors",
		widthWeight: 18,
		headerClassName: "min-w-[140px]",
		render: (p, ctx) => (
			<td className="min-w-0 max-w-0 overflow-hidden px-3 py-2.5 text-muted-foreground text-xs">
				<Tooltip>
					<TooltipTrigger asChild>
						<CopyCellButton
							copyText={authorsCopyText(p.authors)}
							labelKey="papersLibrary.colAuthors"
							ctx={ctx}
							className="block w-full text-left"
						>
							<span>{formatAuthorsShort(p.authors) || "—"}</span>
						</CopyCellButton>
					</TooltipTrigger>
					{p.authors && p.authors.length > 2 ? (
						<TooltipContent side="top" align="start" className="max-w-xs">
							{p.authors.join(", ")}
						</TooltipContent>
					) : null}
				</Tooltip>
			</td>
		),
	},
	year: {
		labelKey: "papersLibrary.colYear",
		widthWeight: 8,
		headerClassName: "min-w-16",
		render: (p) => (
			<td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted-foreground text-xs">
				{p.year ?? "—"}
			</td>
		),
	},
	publication: {
		labelKey: "papersLibrary.colPublication",
		widthWeight: 14,
		headerClassName: "min-w-[120px]",
		render: (p) => (
			<td className="min-w-0 max-w-0 overflow-hidden px-3 py-2.5 text-muted-foreground text-xs">
				<span className="line-clamp-1" title={p.publication ?? undefined}>
					{p.publication || "—"}
				</span>
			</td>
		),
	},
	tags: {
		labelKey: "papersLibrary.colTags",
		widthWeight: 18,
		headerClassName: "min-w-[120px]",
		render: (p, ctx) => (
			<td className="min-w-0 max-w-0 overflow-hidden px-3 py-2.5">
				<div className="flex flex-wrap items-center gap-1">
					{ctx.tags.length ? (
						ctx.tags.map((tag) => <PaperTagChip key={tag.name} tag={tag} />)
					) : (
						<span className="text-muted-foreground text-xs">—</span>
					)}
					<EasyScholarRankButton paper={p} ctx={ctx} />
				</div>
			</td>
		),
	},
	id: {
		labelKey: "papersLibrary.colId",
		widthWeight: 14,
		headerClassName: "min-w-[160px]",
		render: (p, ctx) => {
			const value = identifierValue(p);
			return (
				<CopyTd
					tdClassName="min-w-0 max-w-0 overflow-hidden px-3 py-2.5 font-mono text-muted-foreground text-xs"
					copyText={value}
					labelKey="papersLibrary.colId"
					ctx={ctx}
					buttonClassName="block w-full text-left"
				>
					<span className="line-clamp-1" title={value ?? undefined}>
						{value ?? "—"}
					</span>
				</CopyTd>
			);
		},
	},
} as const satisfies Record<SortKey, ColumnDef>;

export { SortIcon };
