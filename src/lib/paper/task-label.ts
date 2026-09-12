/**
 * Resolve a human-facing paper name for background-task rows.
 * Prefer catalog title; fall back to the folder basename (never the full
 * `papers/<id>` path).
 */

import { libraryStore } from "@/lib/paper/library-store";

function normalizePaperRel(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/**
 * Display label for a paper-scoped background task.
 * Returns `undefined` when there is no paper target (vault-scope jobs).
 */
export function paperTaskLabel(
	paperPath: string | null | undefined,
): string | undefined {
	const norm = normalizePaperRel(paperPath ?? "");
	if (!norm) return undefined;

	const parts = norm.split("/").filter(Boolean);
	// Paper units live under `papers/…/<id>`; bare `papers` / empty are not.
	if (parts[0] !== "papers" || parts.length < 2) return undefined;

	const folder = parts[parts.length - 1] ?? "";
	if (!folder) return undefined;

	const meta = libraryStore.getState().paperMetaByRelPath.get(norm);
	const title = meta?.title?.trim();
	if (title) return title.slice(0, 80);
	return folder.slice(0, 80);
}

/** Join a stable paper subject with a transient status / progress line. */
export function joinTaskDetail(
	subject: string | undefined,
	status: string | undefined,
): string | undefined {
	const s = subject?.trim();
	const st = status?.trim();
	if (s && st && s !== st) {
		if (st.startsWith(s)) return st.slice(0, 120);
		return `${s} · ${st}`.slice(0, 120);
	}
	const out = s || st;
	return out ? out.slice(0, 120) : undefined;
}
