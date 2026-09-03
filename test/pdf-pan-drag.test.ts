import { describe, expect, it, vi } from "vitest";
import { bindPanDragGesture, type PanDragTarget } from "@/lib/pdf/pan-drag";

class FakePointerEvent extends Event {
	readonly pointerId: number;
	readonly pointerType: string;
	readonly button: number;
	readonly clientX: number;
	readonly clientY: number;
	stopPropagationCalls = 0;

	constructor(type: string, init: PointerEventInit = {}) {
		super(type, init);
		this.pointerId = init.pointerId ?? 0;
		this.pointerType = init.pointerType ?? "mouse";
		this.button = init.button ?? 0;
		this.clientX = init.clientX ?? 0;
		this.clientY = init.clientY ?? 0;
	}

	override stopPropagation(): void {
		this.stopPropagationCalls += 1;
		super.stopPropagation();
	}
}

type RegisteredListener = {
	listener: (event: FakePointerEvent) => void;
	capture: boolean;
};

/** Fake scroll container: listener registry plus mutable scroll offsets. */
function panTargetHarness() {
	const listeners = new Map<string, RegisteredListener[]>();
	const captured = new Set<number>();
	const target = {
		scrollLeft: 100,
		scrollTop: 200,
		addEventListener: (
			type: string,
			listener: (event: FakePointerEvent) => void,
			options?: boolean | AddEventListenerOptions,
		) => {
			const capture =
				options === true ||
				(typeof options === "object" && options?.capture === true);
			listeners.set(type, [
				...(listeners.get(type) ?? []),
				{ listener, capture },
			]);
		},
		removeEventListener: (
			type: string,
			listener: (event: FakePointerEvent) => void,
		) => {
			const entries = listeners.get(type);
			if (!entries) return;
			const next = entries.filter((entry) => entry.listener !== listener);
			if (next.length > 0) listeners.set(type, next);
			else listeners.delete(type);
		},
		setPointerCapture: (pointerId: number) => {
			captured.add(pointerId);
		},
		releasePointerCapture: (pointerId: number) => {
			captured.delete(pointerId);
		},
		hasPointerCapture: (pointerId: number) => captured.has(pointerId),
	};

	return {
		target: target as unknown as PanDragTarget,
		dispatch(type: string, init: PointerEventInit = {}) {
			const event = new FakePointerEvent(type, {
				cancelable: true,
				...init,
			});
			for (const { listener } of listeners.get(type) ?? []) listener(event);
			return event;
		},
		scroll: () => ({ left: target.scrollLeft, top: target.scrollTop }),
		isCaptured: (pointerId: number) => captured.has(pointerId),
		isDownCaptured: () =>
			(listeners.get("pointerdown") ?? []).every((entry) => entry.capture),
		listenerCount: () =>
			[...listeners.values()].reduce(
				(total, entries) => total + entries.length,
				0,
			),
	};
}

function bind(harness: ReturnType<typeof panTargetHarness>, armed = false) {
	const states: string[] = [];
	const binding = bindPanDragGesture({
		target: harness.target,
		isLeftDragArmed: () => armed,
		isExcluded: () => false,
		onStateChange: (state) => states.push(state),
	});
	return { binding, states };
}

describe("PDF drag-to-pan gesture", () => {
	it("pans both axes with the middle button, content following the cursor", () => {
		const harness = panTargetHarness();
		const { states } = bind(harness);

		const down = harness.dispatch("pointerdown", {
			button: 1,
			pointerId: 3,
			clientX: 50,
			clientY: 60,
		});
		expect(down.defaultPrevented).toBe(true);
		// Capture-phase stopPropagation is what keeps EmbedPDF selection out.
		expect(down.stopPropagationCalls).toBe(1);
		expect(harness.isDownCaptured()).toBe(true);
		expect(harness.isCaptured(3)).toBe(true);
		expect(states).toEqual(["panning"]);

		harness.dispatch("pointermove", {
			pointerId: 3,
			clientX: 20,
			clientY: 90,
		});
		expect(harness.scroll()).toEqual({ left: 130, top: 170 });

		harness.dispatch("pointerup", { pointerId: 3 });
		expect(states).toEqual(["panning", "idle"]);
		expect(harness.isCaptured(3)).toBe(false);

		harness.dispatch("pointermove", {
			pointerId: 3,
			clientX: 0,
			clientY: 0,
		});
		expect(harness.scroll()).toEqual({ left: 130, top: 170 });
	});

	it("leaves an unarmed left drag to text selection", () => {
		const harness = panTargetHarness();
		const { states } = bind(harness);

		const down = harness.dispatch("pointerdown", {
			button: 0,
			pointerId: 1,
			clientX: 10,
			clientY: 10,
		});
		expect(down.defaultPrevented).toBe(false);
		expect(states).toEqual([]);

		harness.dispatch("pointermove", {
			pointerId: 1,
			clientX: 60,
			clientY: 60,
		});
		expect(harness.scroll()).toEqual({ left: 100, top: 200 });
	});

	it("pans with the left button once Space arms the hand tool", () => {
		const harness = panTargetHarness();
		const { states } = bind(harness, true);

		harness.dispatch("pointerdown", {
			button: 0,
			pointerId: 2,
			clientX: 40,
			clientY: 40,
		});
		harness.dispatch("pointermove", {
			pointerId: 2,
			clientX: 90,
			clientY: 15,
		});
		expect(harness.scroll()).toEqual({ left: 50, top: 225 });
		expect(states).toEqual(["panning"]);
	});

	it("ignores events the caller excludes, such as an in-page editor", () => {
		const harness = panTargetHarness();
		const states: string[] = [];
		const isExcluded = vi.fn(() => true);
		bindPanDragGesture({
			target: harness.target,
			isLeftDragArmed: () => true,
			isExcluded,
			onStateChange: (state) => states.push(state),
		});

		const editable = harness.dispatch("pointerdown", {
			button: 1,
			pointerId: 1,
		});
		expect(editable.defaultPrevented).toBe(false);
		// The predicate sees the event, so it can differ per button.
		expect(isExcluded).toHaveBeenCalledWith(editable);
		expect(states).toEqual([]);
	});

	it("ignores the right button and touch pointers", () => {
		const harness = panTargetHarness();
		const { states } = bind(harness, true);

		const right = harness.dispatch("pointerdown", {
			button: 2,
			pointerId: 2,
		});
		expect(right.defaultPrevented).toBe(false);

		const touch = harness.dispatch("pointerdown", {
			button: 1,
			pointerId: 3,
			pointerType: "touch",
		});
		expect(touch.defaultPrevented).toBe(false);
		expect(states).toEqual([]);
	});

	it("ignores a second pointer while a drag is in flight", () => {
		const harness = panTargetHarness();
		const { states } = bind(harness);

		harness.dispatch("pointerdown", {
			button: 1,
			pointerId: 1,
			clientX: 10,
			clientY: 10,
		});
		harness.dispatch("pointerdown", {
			button: 1,
			pointerId: 2,
			clientX: 500,
			clientY: 500,
		});
		expect(states).toEqual(["panning"]);

		harness.dispatch("pointermove", {
			pointerId: 2,
			clientX: 600,
			clientY: 600,
		});
		expect(harness.scroll()).toEqual({ left: 100, top: 200 });
	});

	it("suppresses the compatibility mousedown behind the middle button", () => {
		const harness = panTargetHarness();
		bind(harness);

		harness.dispatch("pointerdown", { button: 1, pointerId: 2 });
		const middle = harness.dispatch("mousedown", { button: 1 });
		expect(middle.defaultPrevented).toBe(true);
		expect(middle.stopPropagationCalls).toBe(1);

		const left = harness.dispatch("mousedown", { button: 0 });
		expect(left.defaultPrevented).toBe(false);
	});

	it("ends the drag on pointercancel and lostpointercapture", () => {
		const harness = panTargetHarness();
		const { binding, states } = bind(harness);

		harness.dispatch("pointerdown", {
			button: 1,
			pointerId: 4,
			clientX: 10,
			clientY: 10,
		});
		harness.dispatch("pointercancel", { pointerId: 4 });
		expect(states).toEqual(["panning", "idle"]);
		expect(harness.isCaptured(4)).toBe(false);

		harness.dispatch("pointerdown", {
			button: 1,
			pointerId: 5,
			clientX: 10,
			clientY: 10,
		});
		harness.dispatch("lostpointercapture", { pointerId: 5 });
		expect(states).toEqual(["panning", "idle", "panning", "idle"]);

		binding.cancel();
		expect(states).toEqual(["panning", "idle", "panning", "idle"]);
	});

	it("cancel ends an in-flight drag but keeps the binding alive", () => {
		const harness = panTargetHarness();
		const { binding, states } = bind(harness);

		harness.dispatch("pointerdown", {
			button: 1,
			pointerId: 6,
			clientX: 30,
			clientY: 30,
		});
		binding.cancel();
		expect(states).toEqual(["panning", "idle"]);
		expect(harness.listenerCount()).toBe(6);

		harness.dispatch("pointermove", {
			pointerId: 6,
			clientX: 90,
			clientY: 90,
		});
		expect(harness.scroll()).toEqual({ left: 100, top: 200 });

		harness.dispatch("pointerdown", {
			button: 1,
			pointerId: 7,
			clientX: 30,
			clientY: 30,
		});
		harness.dispatch("pointermove", {
			pointerId: 7,
			clientX: 10,
			clientY: 50,
		});
		expect(harness.scroll()).toEqual({ left: 120, top: 180 });
	});

	it("dispose releases an in-flight drag and removes every listener", () => {
		const harness = panTargetHarness();
		const { binding, states } = bind(harness);

		harness.dispatch("pointerdown", {
			button: 1,
			pointerId: 8,
			clientX: 10,
			clientY: 10,
		});
		expect(harness.listenerCount()).toBe(6);

		binding.dispose();
		expect(states).toEqual(["panning", "idle"]);
		expect(harness.listenerCount()).toBe(0);
		expect(harness.isCaptured(8)).toBe(false);

		binding.dispose();
		expect(states).toEqual(["panning", "idle"]);
	});
});
