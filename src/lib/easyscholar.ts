/**
 * EasyScholar journal-ranking key helpers and availability probe.
 */

import { invokeApi } from "@/lib/core/ipc";
import { isTauri } from "@/lib/core/tauri";

export type EasyScholarProbeStatus = "idle" | "probing" | "ok" | "fail";

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
