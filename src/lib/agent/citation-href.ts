/**
 * Normalize agent citation hrefs so pills open the paper PDF (with optional
 * #page= / #section= / #figure= fragments) instead of TeX source paths.
 */

const TEX_EXT = /\.(tex|ltx)$/i;
const STATUS_TAG = /\s*\[(blocked|read|failed|denied)\]/gi;

/** Split `path#fragment` (fragment may be empty). */
export function splitCitationHref(href: string): {
	path: string;
	fragment: string;
} {
	const trimmed = href.trim();
	const idx = trimmed.indexOf("#");
	if (idx < 0) return { path: trimmed, fragment: "" };
	return { path: trimmed.slice(0, idx), fragment: trimmed.slice(idx + 1) };
}

/**
 * Infer the paper folder vault-relative path from a file under that paper
 * (e.g. `papers/a/source/x.tex` → `papers/a`, `papers/a/a.pdf` → `papers/a`).
 */
export function paperDirFromCitationPath(path: string): string | null {
	const norm = path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
	if (!norm) return null;
	const sourceIdx = norm.toLowerCase().indexOf("/source/");
	if (sourceIdx >= 0) return norm.slice(0, sourceIdx);
	const marksIdx = norm.toLowerCase().indexOf("/marks/");
	if (marksIdx >= 0) return norm.slice(0, marksIdx);
	const assetsIdx = norm.toLowerCase().indexOf("/assets/");
	if (assetsIdx >= 0) return norm.slice(0, assetsIdx);
	// papers/<shelf>/<id>/<file>
	const parts = norm.split("/");
	if (parts.length >= 3 && parts[0] === "papers") {
		const last = parts[parts.length - 1] ?? "";
		if (last.includes(".")) return parts.slice(0, -1).join("/");
	}
	if (
		parts.length >= 2 &&
		parts[0] === "papers" &&
		!parts[parts.length - 1]?.includes(".")
	) {
		return norm;
	}
	return null;
}

/**
 * Rewrite TeX/LTX citation targets to `{paper}/{id}.pdf`, preserving fragments.
 * Non-TeX hrefs are returned unchanged.
 */
export function rewriteCitationHrefToPdf(href: string): string {
	const { path, fragment } = splitCitationHref(href);
	if (!TEX_EXT.test(path)) return href.trim();
	const paperDir = paperDirFromCitationPath(path);
	if (!paperDir) return href.trim();
	const id = paperDir.split("/").filter(Boolean).pop();
	if (!id) return href.trim();
	const pdf = `${paperDir}/${id}.pdf`;
	return fragment ? `${pdf}#${fragment}` : pdf;
}

/**
 * Strip agent-authored status tags like `introduction.tex [blocked]` that
 * clutter the bubble and are not valid citation targets.
 */
export function stripCitationStatusTags(text: string): string {
	return text.replace(STATUS_TAG, "");
}
