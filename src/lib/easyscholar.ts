/**
 * EasyScholar journal-ranking helpers.
 *
 * Tags live under a single namespace so they can be filtered, replaced,
 * and kept separate from user tags.
 */

import { invokeApi } from "@/lib/core/ipc";
import { isTauri } from "@/lib/core/tauri";
import type { PaperTag, PaperTagInput } from "@/lib/paper/tags";
import type { TagColorId } from "@/lib/ui/tag-colors";

export const EASY_SCHOLAR_TAG_PREFIX = "#easyscholar:";

export type EasyScholarProbeStatus = "idle" | "probing" | "ok" | "fail";

export type EasyScholarRankData = Record<string, unknown>;

export type EasyScholarRankResponse = {
	code?: number;
	msg?: string;
	data?: {
		officialRank?: {
			all?: EasyScholarRankData;
		};
		[key: string]: unknown;
	};
};

/**
 * Map EasyScholar field names to human-readable indicator names used in
 * `#easyscholar:rank=<indicator>=<level>` tags.
 */
const EASY_SCHOLAR_FIELD_NAMES: Record<string, string> = {
	sci: "SCI",
	ssci: "SSCI",
	eii: "EI检索",
	cssci: "CSSCI",
	pku: "北大中文核心",
	ccf: "CCF",
};

/** Color for IF / 5-year IF tags; everything else uses the "other" color. */
const EASY_SCHOLAR_IF_COLOR: TagColorId = "green";
const EASY_SCHOLAR_OTHER_COLOR: TagColorId = "blue";

function tagValue(value: unknown): string {
	return String(value ?? "")
		.replace(/[\r\n]+/g, " ")
		.trim();
}

/**
 * Build namespaced EasyScholar tags from API rank data.
 *
 * Generated tags:
 *   - #easyscholar:journal=<期刊名>
 *   - #easyscholar:if=<影响因子>
 *   - #easyscholar:if5=<五年影响因子>
 *   - #easyscholar:jci=<JCI>
 *   - #easyscholar:rank=<指标>=<等级>
 */
export function buildEasyScholarTags(
	publicationTitle: string,
	data: EasyScholarRankData,
): PaperTagInput[] {
	const tags: PaperTagInput[] = [];
	const title = tagValue(publicationTitle);
	if (title) {
		tags.push({
			name: `${EASY_SCHOLAR_TAG_PREFIX}journal=${title}`,
			color: EASY_SCHOLAR_OTHER_COLOR,
		});
	}

	for (const [field, rawValue] of Object.entries(data)) {
		const value = tagValue(rawValue);
		if (!value) continue;

		if (field === "sciif") {
			if (Number.isFinite(Number(value))) {
				tags.push({
					name: `${EASY_SCHOLAR_TAG_PREFIX}if=${value}`,
					color: EASY_SCHOLAR_IF_COLOR,
				});
			}
			continue;
		}
		if (field === "sciif5") {
			if (Number.isFinite(Number(value))) {
				tags.push({
					name: `${EASY_SCHOLAR_TAG_PREFIX}if5=${value}`,
					color: EASY_SCHOLAR_IF_COLOR,
				});
			}
			continue;
		}
		if (field === "jci") {
			if (Number.isFinite(Number(value))) {
				tags.push({
					name: `${EASY_SCHOLAR_TAG_PREFIX}jci=${value}`,
					color: EASY_SCHOLAR_OTHER_COLOR,
				});
			}
			continue;
		}

		const key = EASY_SCHOLAR_FIELD_NAMES[field];
		if (!key) continue;
		tags.push({
			name: `${EASY_SCHOLAR_TAG_PREFIX}rank=${key}${value ? `=${value}` : ""}`,
			color: EASY_SCHOLAR_OTHER_COLOR,
		});
	}

	return tags;
}

/** Whether a tag belongs to the EasyScholar namespace. */
export function isEasyScholarTag(tag: string): boolean {
	return tag.trim().toLocaleLowerCase().startsWith(EASY_SCHOLAR_TAG_PREFIX);
}

/** Strip EasyScholar tags from a list while preserving user tags. */
export function removeEasyScholarTags(tags: PaperTag[]): PaperTag[] {
	return tags.filter((tag) => !isEasyScholarTag(tag.name));
}

/**
 * Host redacts API keys to the same number of `*` characters.
 * Must match `mask_translate_api_key` in `src-tauri/.../settings/mod.rs`.
 */
export function maskEasyScholarKey(key: string): string {
	const n = [...key.trim()].length;
	return n === 0 ? "" : "*".repeat(n);
}

export function isEasyScholarKeyMask(key: string | undefined): boolean {
	const t = key?.trim() ?? "";
	return t.length > 0 && /^\*+$/.test(t);
}

/** True when a non-empty key is stored (plaintext or Host `*`-mask). */
export function hasEasyScholarKey(key: string | undefined): boolean {
	return Boolean(key?.trim());
}

/**
 * Probe the configured EasyScholar key through the Host. The WebView never
 * sees the plaintext secret; the Host reads it from durable settings.
 */
export async function probeEasyScholarKey(
	signal?: AbortSignal,
): Promise<boolean> {
	if (!isTauri()) return false;
	try {
		const ok = await invokeApi<boolean>("easy_scholar_probe", undefined, {
			fallback: "EasyScholar probe failed",
		});
		if (signal?.aborted) return false;
		return ok;
	} catch {
		return false;
	}
}

/**
 * Fetch EasyScholar rank data for a publication through the Host.
 * The WebView never sees the plaintext secret.
 */
export async function fetchEasyScholarRank(
	publicationName: string,
): Promise<EasyScholarRankResponse> {
	if (!isTauri()) {
		throw new Error("EasyScholar rank lookup requires the desktop app.");
	}
	return invokeApi<EasyScholarRankResponse>(
		"easy_scholar_get_rank",
		{ publicationName },
		{ fallback: "Failed to fetch EasyScholar rank" },
	);
}
