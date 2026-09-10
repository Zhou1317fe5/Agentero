import { ScanSearch, TextSelect, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ContextPathIcon } from "@/components/agent/context-path-icon";
import type { AgentSkill } from "@/lib/agent";
import type { SelectionContext } from "@/lib/agent/selection-store";
import type { PdfVisualDraft } from "@/lib/agent/visual-context-store";
import { basenameOf } from "@/lib/core/path";
import { cn } from "@/lib/core/utils";

/** Above-input chips: short label; description expands on hover / focus. */
export type ComposerChipDensity = "short" | "full";

function ChipHoverDescription({ text }: { text: string }) {
	const trimmed = text.trim();
	if (!trimmed) return null;
	return (
		<span
			className={cn(
				"grid min-w-0 transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none",
				"grid-cols-[0fr] group-hover:grid-cols-[1fr] group-focus-visible:grid-cols-[1fr]",
			)}
		>
			<span className="min-w-0 overflow-hidden">
				<span
					className="ml-1.5 block max-w-40 truncate whitespace-nowrap text-[11px] text-muted-foreground leading-none"
					title={trimmed}
				>
					{trimmed}
				</span>
			</span>
		</span>
	);
}

function chipShellClass(
	density: ComposerChipDensity,
	compact: boolean,
	extra?: string,
) {
	return cn(
		"group inline-flex items-center border bg-muted/20 text-foreground text-xs transition-colors hover:bg-muted",
		density === "short" || compact
			? "h-7 max-w-full gap-1 rounded-full px-1.5"
			: "h-8 max-w-full gap-1.5 rounded-full px-2",
		extra,
	);
}

function ChipLabel({
	density,
	compact,
	label,
	description,
	trailing,
}: {
	density: ComposerChipDensity;
	compact: boolean;
	label: string;
	description?: string;
	trailing?: ReactNode;
}) {
	// Compact one-line composer: icon-only (match image attachment chips).
	if (compact) return null;
	if (density === "short") {
		return (
			<>
				<span className="max-w-[7rem] truncate" title={label}>
					{label}
				</span>
				{description ? <ChipHoverDescription text={description} /> : null}
				{trailing}
			</>
		);
	}
	return (
		<>
			<span className="max-w-[16rem] truncate" title={label}>
				{label}
			</span>
			{trailing}
		</>
	);
}

export function ComposerContextChips({
	density = "full",
	compact = false,
	currentFilePath,
	currentFileLabel,
	mentionChipPaths,
	selectionChips,
	onRemoveSelection,
	visualDrafts,
	onRemoveVisualDraft,
	directoryPathSet,
	paperPathSet,
	labelForPath,
	onRemoveContextPath,
}: {
	density?: ComposerChipDensity;
	compact?: boolean;
	currentFilePath: string | null;
	currentFileLabel: string;
	mentionChipPaths: string[];
	selectionChips: SelectionContext[];
	onRemoveSelection: (id: string) => void;
	visualDrafts: PdfVisualDraft[];
	onRemoveVisualDraft: (id: string) => void;
	directoryPathSet: ReadonlySet<string>;
	paperPathSet: ReadonlySet<string>;
	labelForPath: (path: string) => string;
	onRemoveContextPath: (path: string) => void;
}) {
	const { t } = useTranslation("agent");
	if (
		!currentFilePath &&
		mentionChipPaths.length === 0 &&
		selectionChips.length === 0 &&
		visualDrafts.length === 0
	) {
		return null;
	}

	// Short strip above the input has no X — click still removes. Full chips inside keep X.
	const showRemove = density === "full" && !compact;

	return (
		<>
			{currentFilePath ? (
				<button
					type="button"
					className={chipShellClass(density, compact)}
					onClick={() => onRemoveContextPath(currentFilePath)}
					title={currentFileLabel || currentFilePath}
					aria-label={t("composer.currentFileRemove")}
				>
					<ContextPathIcon
						path={currentFilePath}
						directoryPaths={directoryPathSet}
						paperPaths={paperPathSet}
					/>
					<ChipLabel
						density={density}
						compact={compact}
						label={
							currentFileLabel.trim() ||
							basenameOf(currentFilePath) ||
							currentFilePath
						}
						description={currentFilePath}
						trailing={
							showRemove ? (
								<X className="size-3 shrink-0 text-muted-foreground" />
							) : null
						}
					/>
				</button>
			) : null}
			{mentionChipPaths.map((path) => {
				const label = labelForPath(path);
				const shortLabel = basenameOf(path) || label;
				return (
					<button
						key={path}
						type="button"
						className={chipShellClass(density, compact)}
						onClick={() => onRemoveContextPath(path)}
						title={t("composer.removeContext", { path })}
						aria-label={t("composer.removeContext", { path })}
					>
						<ContextPathIcon
							path={path}
							directoryPaths={directoryPathSet}
							paperPaths={paperPathSet}
						/>
						<ChipLabel
							density={density}
							compact={compact}
							label={density === "short" ? shortLabel : label}
							description={path !== shortLabel ? path : undefined}
							trailing={
								showRemove ? (
									<X className="size-3 shrink-0 text-muted-foreground" />
								) : null
							}
						/>
					</button>
				);
			})}
			{selectionChips.map((sel) => {
				const name = basenameOf(sel.sourcePath) || t("composer.selection");
				const label = sel.page ? `${name} · p.${sel.page}` : name;
				const shortLabel = t("composer.selection");
				return (
					<button
						key={sel.id}
						type="button"
						className={chipShellClass(
							density,
							compact,
							sel.pinned ? undefined : "border-dashed bg-transparent",
						)}
						onClick={() => onRemoveSelection(sel.id)}
						title={t("composer.removeSelection")}
						aria-label={t("composer.removeSelection")}
					>
						<TextSelect className="size-3.5 shrink-0 text-muted-foreground" />
						<ChipLabel
							density={density}
							compact={compact}
							label={density === "short" ? shortLabel : label}
							description={sel.text}
							trailing={
								showRemove ? (
									<X className="size-3 shrink-0 text-muted-foreground" />
								) : null
							}
						/>
					</button>
				);
			})}
			{visualDrafts.map((draft) => {
				const pageLabel = t("composer.visualAnnotationPage", {
					page: draft.page,
				});
				const label =
					draft.comment.trim() ||
					`${t("composer.visualAnnotation")} · ${pageLabel}`;
				const shortLabel = pageLabel;
				const thumb =
					draft.image.data.length > 0
						? `data:${draft.image.mimeType || "image/png"};base64,${draft.image.data}`
						: null;
				return (
					<button
						key={draft.id}
						type="button"
						className={chipShellClass(
							density,
							compact,
							density === "full" && !compact ? "px-1.5 pr-2" : undefined,
						)}
						onClick={() => onRemoveVisualDraft(draft.id)}
						title={t("composer.removeVisualDraft")}
						aria-label={t("composer.removeVisualDraft")}
					>
						{thumb ? (
							<img
								src={thumb}
								alt=""
								className={cn(
									"shrink-0 object-cover",
									density === "short" || compact
										? "size-5 rounded-full"
										: "size-5 rounded",
								)}
							/>
						) : (
							<ScanSearch className="size-3.5 shrink-0 text-muted-foreground" />
						)}
						<ChipLabel
							density={density}
							compact={compact}
							label={density === "short" ? shortLabel : label}
							description={draft.comment.trim() || pageLabel}
							trailing={
								showRemove ? (
									<X className="size-3 shrink-0 text-muted-foreground" />
								) : null
							}
						/>
					</button>
				);
			})}
		</>
	);
}

export function ComposerSkillChips({
	density = "full",
	compact = false,
	selectedSkills,
	onRemoveSkill,
}: {
	density?: ComposerChipDensity;
	compact?: boolean;
	selectedSkills: AgentSkill[];
	onRemoveSkill: (skillId: string) => void;
}) {
	const { t } = useTranslation("agent");
	if (selectedSkills.length === 0) return null;
	const showRemove = density === "full" && !compact;
	return (
		<>
			{selectedSkills.map((skill) => (
				<button
					key={skill.id}
					type="button"
					className={chipShellClass(density, compact)}
					onClick={() => onRemoveSkill(skill.id)}
					title={t("composer.removeSkill", {
						skill: skill.name,
					})}
					aria-label={t("composer.removeSkill", {
						skill: skill.name,
					})}
				>
					<span className="font-mono text-muted-foreground">$</span>
					<ChipLabel
						density={density}
						compact={compact}
						label={skill.name}
						description={skill.description}
						trailing={
							showRemove ? (
								<X className="size-3 shrink-0 text-muted-foreground" />
							) : null
						}
					/>
				</button>
			))}
		</>
	);
}
