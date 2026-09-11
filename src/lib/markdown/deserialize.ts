/**
 * Markdown → Plate deserialize prep.
 *
 * 1. Preserve extra blank lines that CommonMark would otherwise collapse.
 * 2. Prevent an unclosed block-math fence from consuming the rest of a document.
 */

const BLOCK_MATH_FENCE = /^ {0,3}\$\$[ \t]*\r?$/;
const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})/;
/** Matches Plate's empty-paragraph serialize placeholder. */
const BLANK_PARAGRAPH_PLACEHOLDER = "\u200B";

/**
 * `remark` / CommonMark collapse 2+ blank lines between blocks into one break.
 * Plate keeps extra empty paragraphs on disk as ZWSP-only lines; rewrite raw
 * extra blanks into that shape before deserialize so external edits and
 * Agent writes round-trip with the same spacing.
 *
 * Skips fenced code and `$$` math blocks. Already-placeholder lines are left
 * alone so Agentero-saved files are not double-wrapped.
 */
export function preserveExtraBlankLines(source: string): string {
	const lines = source.split("\n");
	const out: string[] = [];
	let codeFence: { character: string; length: number } | null = null;
	let inMath = false;
	let i = 0;

	while (i < lines.length) {
		const line = lines[i] ?? "";
		const codeMatch = line.match(CODE_FENCE);

		if (!inMath && codeMatch) {
			const marker = codeMatch[1];
			if (!codeFence) {
				codeFence = { character: marker[0], length: marker.length };
			} else if (
				marker[0] === codeFence.character &&
				marker.length >= codeFence.length
			) {
				codeFence = null;
			}
			out.push(line);
			i += 1;
			continue;
		}

		if (!codeFence && BLOCK_MATH_FENCE.test(line)) {
			inMath = !inMath;
			out.push(line);
			i += 1;
			continue;
		}

		if (codeFence || inMath || !isCollapsibleBlankLine(line)) {
			out.push(line);
			i += 1;
			continue;
		}

		let j = i;
		while (j < lines.length && isCollapsibleBlankLine(lines[j] ?? "")) {
			j += 1;
		}
		const blankCount = j - i;
		if (blankCount <= 1) {
			for (let k = i; k < j; k += 1) out.push(lines[k] ?? "");
		} else {
			// One blank separates blocks; each extra blank → empty paragraph.
			out.push("");
			for (let extra = 0; extra < blankCount - 1; extra += 1) {
				out.push(BLANK_PARAGRAPH_PLACEHOLDER);
				out.push("");
			}
		}
		i = j;
	}

	return out.join("\n");
}

/** Empty / whitespace-only; ZWSP placeholders count as content. */
function isCollapsibleBlankLine(line: string): boolean {
	return line.replace(/\r$/, "").trim() === "";
}

/**
 * `remark-math` treats a standalone `$$` as a block fence. When its closing
 * fence is missing, the parser legitimately puts all following Markdown into
 * the equation node, which makes unrelated content appear broken in Plate.
 */
function escapeUnclosedBlockMath(source: string): string {
	const fences: number[] = [];
	let codeFence: { character: string; length: number } | null = null;
	let offset = 0;

	for (const line of source.split("\n")) {
		const codeMatch = line.match(CODE_FENCE);
		if (codeMatch) {
			const marker = codeMatch[1];
			if (!codeFence) {
				codeFence = { character: marker[0], length: marker.length };
			} else if (
				marker[0] === codeFence.character &&
				marker.length >= codeFence.length
			) {
				codeFence = null;
			}
		} else if (!codeFence && BLOCK_MATH_FENCE.test(line)) {
			fences.push(offset + line.search(/\$\$/));
		}
		offset += line.length + 1;
	}

	if (fences.length % 2 === 0) return source;

	const dollarOffset = fences.at(-1);
	if (dollarOffset === undefined) return source;
	return `${source.slice(0, dollarOffset)}\\${source.slice(dollarOffset)}`;
}

export function prepareMarkdownForDeserialize(source: string): string {
	return escapeUnclosedBlockMath(preserveExtraBlankLines(source));
}
