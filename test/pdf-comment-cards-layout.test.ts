import { describe, expect, it } from "vitest";

import {
	COMMENT_CARD_GAP_PX,
	commentConnectorPath,
	layoutCommentCards,
} from "@/components/viewer/pdf/layers/comment-cards-layer";
import type { PageAnnotationComment } from "@/components/viewer/pdf/types";

function comment(
	id: string,
	anchorY: number,
	text = "note",
	kind: PageAnnotationComment["kind"] = "highlight",
): PageAnnotationComment {
	return {
		id,
		pageIndex: 0,
		anchorY,
		rects: [{ x: 0.1, y: anchorY, w: 0.4, h: 0.02 }],
		quote: kind === "visual" ? "" : "quoted text",
		comment: text,
		color: "yellow",
		kind,
		linkAlias: null,
	};
}

describe("layoutCommentCards", () => {
	it("returns an empty layout for no comments", () => {
		expect(layoutCommentCards([], 800)).toEqual([]);
	});

	it("anchors each card at its highlight height", () => {
		const laid = layoutCommentCards([comment("a", 0.25)], 800);
		expect(laid).toHaveLength(1);
		expect(laid[0].id).toBe("a");
		expect(laid[0].topPx).toBeCloseTo(200);
		expect(laid[0].heightPx).toBeGreaterThan(0);
	});

	it("sorts by anchorY regardless of input order", () => {
		const laid = layoutCommentCards(
			[comment("b", 0.6), comment("a", 0.2)],
			800,
		);
		expect(laid.map((c) => c.id)).toEqual(["a", "b"]);
	});

	it("nudges overlapping cards down with a gap", () => {
		const laid = layoutCommentCards(
			[comment("a", 0.3), comment("b", 0.31)],
			800,
		);
		const [a, b] = laid;
		expect(b.topPx).toBeGreaterThanOrEqual(a.topPx + a.heightPx + 8);
	});

	it("keeps spaced cards at their anchors when they fit", () => {
		const laid = layoutCommentCards(
			[comment("a", 0.1), comment("b", 0.6)],
			800,
		);
		expect(laid[0].topPx).toBeCloseTo(80);
		expect(laid[1].topPx).toBeCloseTo(480);
	});

	it("lifts a card whose anchor would overflow the page bottom", () => {
		const laid = layoutCommentCards([comment("a", 0.95)], 800);
		expect(laid[0].topPx).toBeLessThan(0.95 * 800);
		expect(laid[0].topPx + laid[0].heightPx).toBeLessThanOrEqual(800);
	});

	it("clamps the stack into the page bottom", () => {
		const pageHeight = 800;
		const laid = layoutCommentCards(
			[comment("a", 0.95), comment("b", 0.97), comment("c", 0.99)],
			pageHeight,
		);
		for (const card of laid) {
			expect(card.topPx).toBeGreaterThanOrEqual(0);
			expect(card.topPx + card.heightPx).toBeLessThanOrEqual(pageHeight);
		}
		// Avoidance gap survives the clamp.
		for (let i = 1; i < laid.length; i += 1) {
			expect(laid[i].topPx).toBeGreaterThanOrEqual(
				laid[i - 1].topPx + laid[i - 1].heightPx + 8,
			);
		}
	});

	it("grows the estimated height with longer comments", () => {
		const short = layoutCommentCards([comment("a", 0.2, "short")], 800);
		const long = layoutCommentCards(
			[comment("a", 0.2, "很长的批注".repeat(60))],
			800,
		);
		expect(long[0].heightPx).toBeGreaterThan(short[0].heightPx);
	});

	it("clamps height once the comment exceeds three lines", () => {
		const threeLines = layoutCommentCards(
			[comment("a", 0.2, "x".repeat(200))],
			800,
		);
		const tenLines = layoutCommentCards(
			[comment("a", 0.2, "x".repeat(2000))],
			800,
		);
		expect(tenLines[0].heightPx).toBe(threeLines[0].heightPx);
	});

	it("grows the editing card so the in-place editor has room", () => {
		const item = comment("a", 0.2, "short");
		const viewing = layoutCommentCards([item], 800);
		const editing = layoutCommentCards([item], 800, "a");
		expect(editing[0].heightPx).toBeGreaterThan(viewing[0].heightPx);
	});

	it("lays out visual notes with no quote", () => {
		const laid = layoutCommentCards(
			[comment("v", 0.4, "region note", "visual")],
			800,
		);
		expect(laid).toHaveLength(1);
		expect(laid[0].id).toBe("v");
		expect(laid[0].topPx).toBeCloseTo(320);
		expect(laid[0].heightPx).toBeGreaterThan(0);
	});

	it("grows visual notes that carry an inline conversation preview", () => {
		const withoutMessages = layoutCommentCards(
			[comment("v", 0.4, "note", "visual")],
			800,
		);
		const withMessages = layoutCommentCards(
			[
				{
					...comment("v", 0.4, "note", "visual"),
					messages: [
						{ id: "m1", role: "user" as const, content: "explain this" },
					],
				},
			],
			800,
		);
		expect(withMessages[0]?.heightPx).toBeGreaterThan(
			withoutMessages[0]?.heightPx ?? 0,
		);
	});
});

describe("commentConnectorPath", () => {
	const pageW = 600;
	const pageH = 800;

	it("returns null for empty rects", () => {
		expect(
			commentConnectorPath(
				[],
				{ id: "a", topPx: 100, heightPx: 40 },
				pageW,
				pageH,
			),
		).toBeNull();
	});

	it("folds at the page edge toward the card left midpoint", () => {
		const rects = [{ x: 0.2, y: 0.1, w: 0.3, h: 0.04 }];
		const placement = { id: "a", topPx: 200, heightPx: 40 };
		const d = commentConnectorPath(rects, placement, pageW, pageH);
		expect(d).toBe(
			`M 300 96 L 600 96 L 600 220 L ${pageW + COMMENT_CARD_GAP_PX} 220`,
		);
	});

	it("uses the envelope of multi-segment rects", () => {
		const rects = [
			{ x: 0.1, y: 0.2, w: 0.2, h: 0.02 },
			{ x: 0.15, y: 0.24, w: 0.4, h: 0.02 },
		];
		const placement = { id: "a", topPx: 100, heightPx: 50 };
		const d = commentConnectorPath(rects, placement, pageW, pageH);
		// right = 0.55; midY = 0.23 → 184; card mid = 125
		expect(d).toBe(
			`M 330 184 L 600 184 L 600 125 L ${pageW + COMMENT_CARD_GAP_PX} 125`,
		);
	});

	it("follows the laid-out card when avoidance nudges it", () => {
		const item = comment("a", 0.25);
		const laid = layoutCommentCards([item], pageH);
		const d = commentConnectorPath(item.rects, laid[0], pageW, pageH);
		expect(d).not.toBeNull();
		const y2 = Math.round((laid[0].topPx + laid[0].heightPx / 2) * 100) / 100;
		expect(d).toContain(`L ${pageW + COMMENT_CARD_GAP_PX} ${y2}`);
	});
});
