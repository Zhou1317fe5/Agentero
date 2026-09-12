"use client";

import type { TFunction } from "i18next";
import {
	type ClipboardEvent,
	type FormEvent,
	forwardRef,
	type HTMLAttributes,
	type KeyboardEvent,
	type MouseEvent,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { useImeGuard } from "@/hooks/use-ime-guard";
import { AGENT_COMPOSER_INPUT_ATTR } from "@/lib/agent/composer-focus";
import {
	encodeCommandToken,
	encodeMentionToken,
	encodeSelectionToken,
	encodeSkillToken,
	type InlineTokenPart,
	parseInlineTokenParts,
	stripInlineTokens,
} from "@/lib/agent/composer-inline-tokens";
import { basenameOf } from "@/lib/core/path";
import { cn } from "@/lib/core/utils";

const CHIP_ATTR = "data-composer-chip";
const TOKEN_ATTR = "data-composer-token";
/** Invisible padding after every chip so the caret has a landing spot. */
const ZWSP = "\u200B";

const INLINE_CHIP_CLASS =
	"composer-inline-chip mx-0.5 inline-flex max-w-[7rem] shrink-0 items-center gap-0.5 rounded-md border border-border/80 bg-muted/40 px-1 align-middle text-[0.8125em] leading-[1.25] text-foreground hover:bg-muted";

const SELECTION_CHIP_CLASS =
	"composer-inline-chip mx-0.5 inline-flex max-w-[10rem] shrink-0 items-center gap-0.5 rounded-md border border-primary/30 bg-primary/10 px-1 align-middle text-[0.8125em] leading-[1.25] text-foreground hover:bg-primary/20";

const CHIP_ANIMATION_CLASS =
	"motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200 motion-reduce:animate-none";

function serializeEditor(root: HTMLElement): string {
	let out = "";
	const walk = (node: Node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			out += (node.textContent ?? "").replaceAll(ZWSP, "");
			return;
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return;
		const el = node as HTMLElement;
		const token = el.getAttribute(TOKEN_ATTR);
		if (token) {
			out += token;
			return;
		}
		const chip = el.getAttribute(CHIP_ATTR);
		if (chip === "mention") {
			const path = el.dataset.path ?? "";
			if (path) out += encodeMentionToken(path);
			return;
		}
		if (chip === "skill") {
			const skillId = el.dataset.skillId ?? "";
			if (skillId) out += encodeSkillToken(skillId);
			return;
		}
		if (chip === "command") {
			const name = el.dataset.commandName ?? "";
			if (name) out += encodeCommandToken(name);
			return;
		}
		if (chip === "selection") {
			const selectionToken = el.dataset.selectionToken ?? "";
			if (selectionToken) out += selectionToken;
			return;
		}
		if (el.tagName === "BR") {
			out += "\n";
			return;
		}
		if (
			(el.tagName === "DIV" || el.tagName === "P") &&
			out.length > 0 &&
			!out.endsWith("\n")
		) {
			out += "\n";
		}
		for (const child of el.childNodes) walk(child);
	};
	for (const child of root.childNodes) walk(child);
	return out;
}

function appendPrefixLabel(
	chip: HTMLElement,
	prefix: string,
	labelText: string,
	title?: string,
) {
	const prefixEl = document.createElement("span");
	prefixEl.className = "font-mono text-muted-foreground";
	prefixEl.textContent = prefix;
	const label = document.createElement("span");
	label.className = "min-w-0 truncate";
	label.textContent = labelText;
	if (title) label.title = title;
	chip.append(prefixEl, label);
}

/** Strip trigger / "skill :" chrome — chip shows the bare skill name. */
function cleanSkillDisplayName(name: string): string {
	return name
		.trim()
		.replace(/^[/$]+/, "")
		.replace(/^skill\s*:\s*/i, "");
}

function appendLucideIcon(
	chip: HTMLElement,
	paths: string[],
	className: string,
) {
	const ns = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(ns, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("class", className);
	svg.setAttribute("aria-hidden", "true");
	for (const d of paths) {
		const path = document.createElementNS(ns, "path");
		path.setAttribute("d", d);
		svg.appendChild(path);
	}
	chip.appendChild(svg);
}

/** Lucide `sparkles` glyph (skill affordance) for contenteditable chips. */
function appendSkillIcon(chip: HTMLElement) {
	appendLucideIcon(
		chip,
		[
			"M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z",
			"M20 3v4",
			"M22 5h-4",
			"M4 17v2",
			"M5 18H3",
		],
		"size-3 shrink-0 text-muted-foreground",
	);
}

/** Lucide `quote` glyph for selected-text chips. */
function appendSelectionIcon(chip: HTMLElement) {
	appendLucideIcon(
		chip,
		[
			"M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
			"M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
		],
		"size-3.5 shrink-0 text-primary",
	);
}

function appendSkillLabel(chip: HTMLElement, name: string, skillId: string) {
	appendSkillIcon(chip);
	const label = document.createElement("span");
	label.className = "min-w-0 truncate";
	label.textContent = cleanSkillDisplayName(name);
	label.title = skillId;
	chip.appendChild(label);
}

function placeCaretAtEnd(el: HTMLElement) {
	const selection = window.getSelection();
	if (!selection) return;
	const range = document.createRange();
	range.selectNodeContents(el);
	range.collapse(false);
	selection.removeAllRanges();
	selection.addRange(range);
}

function placeCaretAfter(node: Node) {
	const selection = window.getSelection();
	if (!selection) return;
	const range = document.createRange();
	range.setStartAfter(node);
	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
}

function deleteChipElement(chip: HTMLElement) {
	const parent = chip.parentNode;
	if (!parent) return;
	const next = chip.nextSibling;
	const selection = window.getSelection();
	const range = document.createRange();
	range.setStartBefore(chip);
	range.collapse(true);
	chip.remove();
	// Remove the isolated zero-width space pad that follows the chip.
	if (
		next?.nodeType === Node.TEXT_NODE &&
		(next as Text).data.replaceAll(ZWSP, "").length === 0
	) {
		next.remove();
	}
	selection?.removeAllRanges();
	selection?.addRange(range);
}

function chipToken(part: InlineTokenPart): string {
	switch (part.type) {
		case "mention":
			return encodeMentionToken(part.path);
		case "skill":
			return encodeSkillToken(part.skillId);
		case "command":
			return encodeCommandToken(part.name);
		case "selection":
			return encodeSelectionToken(part.selection);
		default:
			return "";
	}
}

function renderChip(
	part: InlineTokenPart,
	{
		labelForPath,
		skillLabel,
		t,
		isNew,
	}: {
		labelForPath: (path: string) => string;
		skillLabel: (skillId: string) => string;
		t: TFunction<"agent", undefined>;
		isNew?: boolean;
	},
): HTMLElement {
	const chip = document.createElement("span");
	chip.contentEditable = "false";
	chip.className = cn(
		part.type === "selection" ? SELECTION_CHIP_CLASS : INLINE_CHIP_CLASS,
		isNew ? CHIP_ANIMATION_CLASS : undefined,
	);

	if (part.type === "mention") {
		chip.setAttribute(CHIP_ATTR, "mention");
		chip.dataset.path = part.path;
		const short = basenameOf(part.path) || labelForPath(part.path) || part.path;
		appendPrefixLabel(chip, "@", short, part.path);
		chip.setAttribute(
			"aria-label",
			t("composer.removeContext", { path: part.path }),
		);
		chip.setAttribute(TOKEN_ATTR, encodeMentionToken(part.path));
	} else if (part.type === "skill") {
		chip.setAttribute(CHIP_ATTR, "skill");
		chip.dataset.skillId = part.skillId;
		const name = skillLabel(part.skillId);
		appendSkillLabel(chip, name, part.skillId);
		chip.setAttribute(
			"aria-label",
			t("composer.removeSkill", {
				skill: cleanSkillDisplayName(name),
			}),
		);
		chip.setAttribute(TOKEN_ATTR, encodeSkillToken(part.skillId));
	} else if (part.type === "command") {
		chip.setAttribute(CHIP_ATTR, "command");
		chip.dataset.commandName = part.name;
		const commandLabel = cleanSkillDisplayName(part.name);
		appendPrefixLabel(chip, "/", commandLabel);
		chip.setAttribute("aria-label", `/${commandLabel}`);
		chip.setAttribute(TOKEN_ATTR, encodeCommandToken(part.name));
	} else if (part.type === "selection") {
		chip.setAttribute(CHIP_ATTR, "selection");
		const { selection } = part;
		const token = encodeSelectionToken(selection);
		chip.dataset.selectionToken = token;
		chip.dataset.selectionId = selection.id;
		chip.setAttribute(TOKEN_ATTR, token);

		appendSelectionIcon(chip);

		const label = document.createElement("span");
		label.className = "min-w-0 truncate";
		const name = basenameOf(selection.sourcePath) || selection.sourcePath;
		label.textContent = selection.page ? `${name} · p.${selection.page}` : name;
		label.title = selection.text.slice(0, 200);
		chip.appendChild(label);

		chip.setAttribute("aria-label", t("composer.removeSelection"));
	}

	return chip;
}

export type ComposerInlineInputHandle = {
	/** Insert an inline token at the current caret position and focus the field. */
	insertAtCursor: (token: string) => void;
	/** Return the underlying contenteditable element. */
	getEditorElement: () => HTMLElement | null;
};

export type ComposerInlineInputProps = {
	value: string;
	onValueChange: (text: string) => void;
	onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
	disabled?: boolean;
	compact?: boolean;
	placeholder?: string;
	autoFocus?: boolean;
	labelForPath: (path: string) => string;
	skillLabel: (skillId: string) => string;
	"aria-expanded"?: boolean | undefined;
	"aria-autocomplete"?: HTMLAttributes<HTMLDivElement>["aria-autocomplete"];
	"aria-controls"?: string | undefined;
	"aria-activedescendant"?: string | undefined;
	className?: string;
};

export const ComposerInlineInput = forwardRef<
	ComposerInlineInputHandle,
	ComposerInlineInputProps
>(
	(
		{
			value,
			onValueChange,
			onKeyDown,
			disabled,
			compact = false,
			placeholder,
			autoFocus,
			labelForPath,
			skillLabel,
			className,
			...aria
		},
		ref,
	) => {
		const { t } = useTranslation("agent");
		const editorRef = useRef<HTMLDivElement>(null);
		/** null until first paint so the initial `value` always hydrates into the DOM. */
		const lastValueRef = useRef<string | null>(null);
		const { isBlockedByIme, compositionProps } = useImeGuard();
		const renderedTokensRef = useRef<Set<string>>(new Set());
		const isFirstRenderRef = useRef(true);

		const emitFromDom = useCallback(() => {
			const root = editorRef.current;
			if (!root) return;
			const next = serializeEditor(root);
			lastValueRef.current = next;
			onValueChange(next);
		}, [onValueChange]);

		const renderValue = useCallback(
			(text: string) => {
				const root = editorRef.current;
				if (!root) return;
				root.replaceChildren();
				const parts = parseInlineTokenParts(text);
				if (parts.length === 0) {
					return;
				}
				const nextTokens = new Set<string>();
				for (const part of parts) {
					if (part.type === "text") {
						if (!part.value) continue;
						const lines = part.value.split("\n");
						lines.forEach((line, index) => {
							if (index > 0) root.appendChild(document.createElement("br"));
							if (line) root.appendChild(document.createTextNode(line));
						});
						continue;
					}
					const token = chipToken(part);
					if (token) nextTokens.add(token);
					const isNew =
						!isFirstRenderRef.current &&
						Boolean(token && !renderedTokensRef.current.has(token));
					const chip = renderChip(part, {
						labelForPath,
						skillLabel,
						t,
						isNew,
					});
					root.appendChild(chip);
					root.appendChild(document.createTextNode(ZWSP));
				}
				renderedTokensRef.current = nextTokens;
				isFirstRenderRef.current = false;
			},
			[labelForPath, skillLabel, t],
		);

		useLayoutEffect(() => {
			if (value === lastValueRef.current) return;
			lastValueRef.current = value;
			renderValue(value);
			const root = editorRef.current;
			if (root && document.activeElement === root) {
				placeCaretAtEnd(root);
			}
		}, [renderValue, value]);

		useEffect(() => {
			if (!autoFocus) return;
			editorRef.current?.focus();
		}, [autoFocus]);

		useImperativeHandle(
			ref,
			() => ({
				getEditorElement: () => editorRef.current,
				insertAtCursor: (token: string) => {
					const root = editorRef.current;
					if (!root) return;
					root.focus();

					const selection = window.getSelection();
					let inserted: Node | null = null;

					// Render the token as a chip immediately so the user sees the
					// final card, not raw `{{sel:...}}` text.
					const parts = parseInlineTokenParts(token);
					if (parts.length === 1 && parts[0]?.type !== "text") {
						const chip = renderChip(parts[0], {
							labelForPath,
							skillLabel,
							t,
							isNew: true,
						});
						inserted = chip;
					} else {
						inserted = document.createTextNode(token);
					}

					const pad = document.createTextNode(ZWSP);
					if (
						selection &&
						selection.rangeCount > 0 &&
						root.contains(selection.getRangeAt(0).commonAncestorContainer)
					) {
						const range = selection.getRangeAt(0);
						range.deleteContents();
						range.insertNode(inserted);
						range.setStartAfter(inserted);
						range.insertNode(pad);
						placeCaretAfter(pad);
					} else {
						root.appendChild(inserted);
						root.appendChild(pad);
						placeCaretAtEnd(root);
					}

					emitFromDom();
				},
			}),
			[emitFromDom, labelForPath, skillLabel, t],
		);

		const handleInput = (_event: FormEvent<HTMLDivElement>) => {
			emitFromDom();
		};

		const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
			if (event.key === "Enter" && isBlockedByIme(event)) {
				return;
			}

			if (
				(event.key === "Backspace" || event.key === "Delete") &&
				!isBlockedByIme(event)
			) {
				const selection = window.getSelection();
				if (!selection || selection.rangeCount === 0) {
					onKeyDown?.(event);
					return;
				}

				// Range selection that touches one or more chips: delete the whole
				// touched chips atomically.
				if (!selection.isCollapsed) {
					const range = selection.getRangeAt(0);
					const root = editorRef.current;
					if (!root) {
						onKeyDown?.(event);
						return;
					}

					const touchedChips: HTMLElement[] = [];
					const walker = document.createTreeWalker(
						root,
						NodeFilter.SHOW_ELEMENT,
						{
							acceptNode: (node) => {
								const el = node as HTMLElement;
								if (!el.getAttribute(CHIP_ATTR)) return NodeFilter.FILTER_SKIP;
								return range.intersectsNode(el)
									? NodeFilter.FILTER_ACCEPT
									: NodeFilter.FILTER_SKIP;
							},
						},
					);
					while (walker.nextNode()) {
						touchedChips.push(walker.currentNode as HTMLElement);
					}

					if (touchedChips.length > 0) {
						event.preventDefault();
						const newRange = document.createRange();
						newRange.setStart(range.startContainer, range.startOffset);
						newRange.setEnd(range.endContainer, range.endOffset);

						// Extend range to fully cover chips at the boundaries.
						for (const chip of touchedChips) {
							if (
								newRange.compareBoundaryPoints(Range.START_TO_START, range) > 0
							) {
								// not reachable; keep logic simple below
							}
							const chipRange = document.createRange();
							chipRange.selectNode(chip);
							if (
								newRange.compareBoundaryPoints(
									Range.START_TO_START,
									chipRange,
								) > 0
							) {
								newRange.setStartBefore(chip);
							}
							if (
								newRange.compareBoundaryPoints(Range.END_TO_END, chipRange) < 0
							) {
								newRange.setEndAfter(chip);
							}
						}

						newRange.deleteContents();
						for (const chip of touchedChips) {
							if (chip.parentNode) chip.remove();
						}

						const caret = document.createRange();
						caret.setStart(newRange.startContainer, newRange.startOffset);
						caret.collapse(true);
						selection.removeAllRanges();
						selection.addRange(caret);
						emitFromDom();
						return;
					}
				}

				// Collapsed caret next to a chip.
				if (selection.isCollapsed) {
					const range = selection.getRangeAt(0);
					const isBackspace = event.key === "Backspace";

					// Case 1: caret is at an element offset inside the editor root.
					if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
						const parent = range.startContainer as HTMLElement;
						const index = range.startOffset;
						const target = isBackspace
							? parent.childNodes[index - 1]
							: parent.childNodes[index];
						if (
							target?.nodeType === Node.ELEMENT_NODE &&
							(target as HTMLElement).getAttribute(CHIP_ATTR)
						) {
							event.preventDefault();
							deleteChipElement(target as HTMLElement);
							emitFromDom();
							return;
						}
					}

					// Case 2: caret is inside a text node adjacent to a chip.
					const node = range.startContainer;
					if (node.nodeType === Node.TEXT_NODE) {
						const text = node as Text;
						const offset = range.startOffset;
						if (isBackspace && offset === 0) {
							const prev = text.previousSibling;
							if (
								prev?.nodeType === Node.ELEMENT_NODE &&
								(prev as HTMLElement).getAttribute(CHIP_ATTR)
							) {
								event.preventDefault();
								deleteChipElement(prev as HTMLElement);
								emitFromDom();
								return;
							}
						}
						if (
							isBackspace &&
							offset === text.data.length &&
							text.data.replaceAll(ZWSP, "").length === 0
						) {
							// The caret is right after a chip, separated only by the
							// invisible ZWSP pad. Delete the chip atomically.
							const prev = text.previousSibling;
							if (
								prev?.nodeType === Node.ELEMENT_NODE &&
								(prev as HTMLElement).getAttribute(CHIP_ATTR)
							) {
								event.preventDefault();
								deleteChipElement(prev as HTMLElement);
								emitFromDom();
								return;
							}
						}
						if (!isBackspace && offset === text.data.length) {
							const next = text.nextSibling;
							if (
								next?.nodeType === Node.ELEMENT_NODE &&
								(next as HTMLElement).getAttribute(CHIP_ATTR)
							) {
								event.preventDefault();
								deleteChipElement(next as HTMLElement);
								emitFromDom();
								return;
							}
						}
					}
				}
			}

			onKeyDown?.(event);
			if (event.defaultPrevented) return;

			if (event.key === "Enter" && !event.shiftKey) {
				event.preventDefault();
				const form = event.currentTarget.closest("form");
				const submitButton = form?.querySelector(
					'button[type="submit"]',
				) as HTMLButtonElement | null;
				if (submitButton?.disabled) return;
				form?.requestSubmit();
			}
		};

		const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
			event.preventDefault();
			const text = event.clipboardData.getData("text/plain");
			if (!text) return;
			document.execCommand("insertText", false, text);
			emitFromDom();
		};

		const handleChipClick = (event: MouseEvent<HTMLDivElement>) => {
			const target = event.target as HTMLElement | null;
			const chip = target?.closest?.(`[${CHIP_ATTR}]`) as HTMLElement | null;
			if (!chip || !editorRef.current?.contains(chip)) return;
			event.preventDefault();
			event.stopPropagation();
			deleteChipElement(chip);
			emitFromDom();
			editorRef.current?.focus();
		};

		const isVisuallyEmpty = parseInlineTokenParts(value).every(
			(part) =>
				part.type === "text" &&
				part.value.replaceAll(ZWSP, "").trim().length === 0,
		);

		return (
			<>
				{/* Keep PromptInput FormData happy; controlled submit prefers React state. */}
				<textarea
					name="message"
					className="sr-only"
					tabIndex={-1}
					readOnly
					aria-hidden
					value={stripInlineTokens(value)}
				/>
				<div
					className={cn(
						"relative min-h-0",
						compact ? "min-w-0 flex-1" : "flex-1",
					)}
				>
					{isVisuallyEmpty && placeholder ? (
						<div
							aria-hidden
							className={cn(
								"pointer-events-none absolute inset-0 px-0 text-muted-foreground/80",
								compact
									? "py-0 text-sm leading-5"
									: "py-1 text-[15px] leading-5",
							)}
						>
							{placeholder}
						</div>
					) : null}
					{/* Contenteditable is required for inline chip DOM; not a plain textarea. */}
					{/* biome-ignore lint/a11y/useSemanticElements: chips must live inside the editable surface */}
					<div
						ref={editorRef}
						{...{ [AGENT_COMPOSER_INPUT_ATTR]: "" }}
						role="textbox"
						aria-multiline="true"
						tabIndex={disabled ? -1 : 0}
						contentEditable={!disabled}
						suppressContentEditableWarning
						data-slot="input-group-control"
						className={cn(
							"agentero-scroll relative min-h-0 overflow-y-auto px-0 text-foreground outline-none",
							compact
								? "h-6 max-h-none min-w-0 flex-1 py-0 text-sm leading-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
								: "min-h-0 flex-1 py-1 text-[15px] leading-5",
							disabled && "opacity-60",
							className,
						)}
						onInput={handleInput}
						onKeyDown={handleKeyDown}
						onPaste={handlePaste}
						onClick={handleChipClick}
						{...compositionProps}
						{...aria}
					/>
				</div>
			</>
		);
	},
);

ComposerInlineInput.displayName = "ComposerInlineInput";
