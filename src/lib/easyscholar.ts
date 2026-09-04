/**
 * EasyScholar journal-ranking helpers.
 *
 * Tags live under a single namespace so they can be filtered, replaced,
 * and kept separate from user tags.
 */

import { invokeApi } from "@/lib/core/ipc";
import { isTauri } from "@/lib/core/tauri";
import type { PaperTag } from "@/lib/paper/tags";

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
	sciBase: "SCI基础版",
	sciUp: "SCI升级版",
	sciif: "SCIIF",
	sciif5: "SCIIF(5)",
	ssci: "SSCI",
	eii: "EI检索",
	cssci: "CSSCI",
	nju: "NJU",
	pku: "北大中文核心",
	xju: "XJU",
	ccf: "CCF",
	ahci: "A&HCI 检索",
	ajg: "AJG",
	cqu: "CQU",
	cscd: "CSCD",
	cufe: "CUFE",
	cug: "CUG",
	fdu: "FDU",
	hhu: "HHU",
	ruc: "RUC",
	jci: "JCI",
	sdufe: "SDUFE",
	sjtu: "SJTU",
	swjtu: "SWJTU",
	uibe: "UIBE",
	xmu: "XMU",
	xdu: "XDU",
	zhongguokejihexin: "中国科技核心期刊",
	fms: "FMS",
	scu: "SCU",
	sciwarn: "SCIWARN",
	zju: "ZJU",
	cju: "YangtzeU",
	ft50: "FT50",
	utd24: "UTD24",
	CPU: "CPU",
};

function tagValue(value: unknown): string {
	return String(value ?? "")
		.replace(/[\r\n]+/g, " ")
		.trim();
}

function addUniqueTag(tags: string[], tag: string) {
	if (
		tag &&
		!tags.some(
			(existing) => existing.toLocaleLowerCase() === tag.toLocaleLowerCase(),
		)
	) {
		tags.push(tag);
	}
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
): string[] {
	const tags: string[] = [];
	const title = tagValue(publicationTitle);
	if (title) {
		addUniqueTag(tags, `${EASY_SCHOLAR_TAG_PREFIX}journal=${title}`);
	}

	for (const [field, rawValue] of Object.entries(data)) {
		const value = tagValue(rawValue);
		if (!value) continue;

		if (field === "sciif") {
			if (Number.isFinite(Number(value))) {
				addUniqueTag(tags, `${EASY_SCHOLAR_TAG_PREFIX}if=${value}`);
			}
			continue;
		}
		if (field === "sciif5") {
			if (Number.isFinite(Number(value))) {
				addUniqueTag(tags, `${EASY_SCHOLAR_TAG_PREFIX}if5=${value}`);
			}
			continue;
		}
		if (field === "jci") {
			if (Number.isFinite(Number(value))) {
				addUniqueTag(tags, `${EASY_SCHOLAR_TAG_PREFIX}jci=${value}`);
			}
			continue;
		}

		const key = EASY_SCHOLAR_FIELD_NAMES[field] ?? field;
		addUniqueTag(
			tags,
			`${EASY_SCHOLAR_TAG_PREFIX}rank=${key}${value ? `=${value}` : ""}`,
		);
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
