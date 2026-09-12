import { describe, expect, it } from "vitest";
import { linkifyBareUrls } from "@/lib/agent/bare-url-link";

describe("linkifyBareUrls", () => {
	it("wraps a bare http url in a markdown link", () => {
		expect(linkifyBareUrls("See https://example.com for details.")).toBe(
			"See [example.com](https://example.com) for details.",
		);
	});

	it("does not double-wrap existing markdown links", () => {
		expect(
			linkifyBareUrls("[example](https://example.com) and https://other.com"),
		).toBe("[example](https://example.com) and [other.com](https://other.com)");
	});

	it("skips urls inside inline code", () => {
		expect(linkifyBareUrls("`https://example.com` is a url.")).toBe(
			"`https://example.com` is a url.",
		);
	});

	it("strips www from the label", () => {
		expect(linkifyBareUrls("https://www.arxiv.org/abs/1234")).toBe(
			"[arxiv.org](https://www.arxiv.org/abs/1234)",
		);
	});
});
