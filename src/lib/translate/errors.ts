import i18n from "@/i18n";

/** Host marker for "the built-in provider has no compiled-in key". */
export const ERR_TRANSLATE_NO_BUILTIN_KEY = "translate.no_builtin_key";

/**
 * User-facing text for translation failures: map known Host markers to i18n,
 * return anything else unchanged. Mirrors `displayAgentError`.
 */
export function displayTranslateError(error: string): string {
	return error.includes(ERR_TRANSLATE_NO_BUILTIN_KEY)
		? i18n.t("settings:translate.errors.noBuiltinKey")
		: error;
}
