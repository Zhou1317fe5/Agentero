/**
 * Convert bare http(s) URLs in markdown prose into `[domain](url)` inline links.
 *
 * Skips URLs that are already inside Markdown links `[]()` or inside backticks,
 * so agent-written citations and code are not double-wrapped.
 */
export function linkifyBareUrls(text: string): string {
	const urlPattern =
		/https?:\/\/[a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[-a-zA-Z0-9]+)+(?:\/[^`\s)\]>]*)?/g;

	// Walk through the string and only replace URLs that are not inside a
	// markdown link or inline code.
	let out = "";
	let lastIndex = 0;
	let match: RegExpExecArray | null = urlPattern.exec(text);
	const inLinkPattern = /\]\([^)]*$/; // text preceding `](...`
	const inCodePattern = /`[^`]*$/; // inside backticks

	while (match !== null) {
		const url = match[0];
		const start = match.index;
		const prefix = text.slice(0, start);
		const insideLink = inLinkPattern.test(prefix);
		const insideCode = inCodePattern.test(prefix);

		if (insideLink || insideCode) {
			out += text.slice(lastIndex, start + url.length);
			lastIndex = start + url.length;
		} else {
			out += text.slice(lastIndex, start);
			const host = new URL(url).hostname.replace(/^www\./, "");
			out += `[${host}](${url})`;
			lastIndex = start + url.length;
		}

		match = urlPattern.exec(text);
	}
	out += text.slice(lastIndex);
	return out;
}
