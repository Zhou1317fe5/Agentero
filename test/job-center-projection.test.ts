import { afterEach, describe, expect, it, vi } from "vitest";
import { backgroundTasksStore } from "@/lib/core/background-tasks";
import {
	type JobChangedSnapshot,
	projectJobToBackgroundTask,
	startJobTaskProjection,
	stopJobTaskProjection,
} from "@/lib/core/job-center";

const globalWithWindow = globalThis as typeof globalThis & {
	window?: { setTimeout: typeof setTimeout };
};
globalWithWindow.window = { setTimeout };

type FakeListener = (e: {
	event: string;
	id: number;
	payload: unknown;
}) => void;

const mocks = vi.hoisted(() => {
	type CommandSpy = ReturnType<typeof vi.fn>;
	type FakeListener = (e: {
		event: string;
		id: number;
		payload: unknown;
	}) => void;
	const commandSpies = new Map<string, CommandSpy>();
	const eventBindings = new Map<
		string,
		{ listeners: FakeListener[]; unlistens: CommandSpy[] }
	>();
	const bindingFor = (name: string) => {
		let binding = eventBindings.get(name);
		if (!binding) {
			binding = { listeners: [], unlistens: [] };
			eventBindings.set(name, binding);
		}
		return binding;
	};
	return {
		tauri: false,
		commandSpies,
		eventBindings,
		/** Typed-error envelope (`Result<ApiResult<T>, String>`), as specta wraps. */
		commandSpy: (name: string): CommandSpy => {
			let spy = commandSpies.get(name);
			if (!spy) {
				spy = vi.fn(async () => ({
					status: "ok",
					data: { ok: true, data: null },
				}));
				commandSpies.set(name, spy);
			}
			return spy;
		},
		bindingFor,
		/** Fire a wire payload through every captured `events.*` listener. */
		emit: (name: string, payload: unknown) => {
			for (const listener of [...bindingFor(name).listeners]) {
				listener({ event: name, id: 1, payload });
			}
		},
	};
});

vi.mock("@/lib/core/tauri", () => ({
	isTauri: () => mocks.tauri,
}));

vi.mock("@/lib/core/ipc", () => ({
	callApi: vi.fn(async () => undefined),
	// Faithful to the real helper: invoke the bound command and unwrap the
	// typed-error + ApiResult envelope.
	callApiResult: vi.fn(
		async (
			fn: () => Promise<{
				status: string;
				error?: string;
				data: { ok: boolean; data: unknown };
			}>,
		) => {
			const res = await fn();
			if (res.status === "error") throw new Error(res.error ?? "ipc error");
			if (!res.data.ok) throw new Error("host error");
			return res.data.data;
		},
	),
	callResult: vi.fn(async () => undefined),
}));

vi.mock("@/lib/core/bindings", () => ({
	commands: new Proxy({} as Record<string, unknown>, {
		get: (_target, prop) =>
			typeof prop === "string" ? mocks.commandSpy(prop) : undefined,
	}),
	events: new Proxy({} as Record<string, unknown>, {
		get: (_target, prop) => {
			if (typeof prop !== "string") return undefined;
			const binding = mocks.bindingFor(prop);
			// Typed specta binding: `listen(cb)` resolves to the UnlistenFn.
			return {
				listen: (cb: FakeListener) => {
					const unlisten = vi.fn(() => {
						const idx = binding.listeners.indexOf(cb);
						if (idx >= 0) binding.listeners.splice(idx, 1);
					});
					binding.listeners.push(cb);
					binding.unlistens.push(unlisten);
					return Promise.resolve(unlisten);
				},
			};
		},
	}),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

function layoutJob(
	overrides: Partial<JobChangedSnapshot> = {},
): JobChangedSnapshot {
	return {
		id: "job-layout-1",
		kind: "layoutAnalyze",
		state: "running",
		vaultPath: "/vault",
		paperPath: "papers/a",
		progress: 40,
		phase: "analyzing",
		...overrides,
	};
}

describe("job task projection", () => {
	afterEach(async () => {
		stopJobTaskProjection();
		mocks.tauri = false;
		vi.clearAllMocks();
		await flush();
		for (const binding of mocks.eventBindings.values()) {
			binding.listeners.length = 0;
			binding.unlistens.length = 0;
		}
		backgroundTasksStore.setState({ tasks: [], expanded: false });
	});

	it("mirrors a running layout job into the background-task panel", () => {
		projectJobToBackgroundTask(layoutJob());
		const task = backgroundTasksStore
			.getState()
			.tasks.find((item) => item.id === "job-layout-1");
		expect(task?.kind).toBe("layout");
		expect(task?.status).toBe("running");
		expect(task?.progress).toBe(40);
	});

	it("does not resurrect a cancelled layout job from a late running event", async () => {
		mocks.tauri = true;
		startJobTaskProjection();
		expect(mocks.bindingFor("jobChanged").listeners).toHaveLength(1);

		// Inject `job:changed` wire payloads through the captured typed binding.
		mocks.emit("jobChanged", { job: layoutJob({ state: "running" }) });
		mocks.emit("jobChanged", { job: layoutJob({ state: "cancelled" }) });
		mocks.emit("jobChanged", {
			job: layoutJob({ state: "running", progress: 80, phase: "analyzing" }),
		});

		const task = backgroundTasksStore
			.getState()
			.tasks.find((item) => item.id === "job-layout-1");
		expect(task?.status).toBe("cancelled");
		// The panel cancellation still reaches the Host JobCenter.
		expect(mocks.commandSpy("jobCancel")).toHaveBeenCalledWith("job-layout-1");

		// Stopping disposes the typed binding's pending-safe unlisten.
		stopJobTaskProjection();
		await flush();
		expect(mocks.bindingFor("jobChanged").unlistens[0]).toHaveBeenCalledTimes(
			1,
		);
		expect(mocks.bindingFor("jobChanged").listeners).toHaveLength(0);
	});

	it("does not resurrect a completed layout job from a late running event", () => {
		projectJobToBackgroundTask(layoutJob({ state: "running" }));
		projectJobToBackgroundTask(
			layoutJob({ state: "succeeded", progress: 100 }),
		);
		projectJobToBackgroundTask(
			layoutJob({ state: "running", progress: 55, phase: "analyzing" }),
		);

		const task = backgroundTasksStore
			.getState()
			.tasks.find((item) => item.id === "job-layout-1");
		expect(task?.status).toBe("completed");
	});
});
