/**
 * Single frontend facade for background work.
 *
 * The Rust JobCenter is the scheduling engine; this module wraps job
 * enqueue / cancel, renderer-executed job registration and the task-panel
 * projection (bridge implementation in `job-center.ts`). `runLocalActivity`
 * covers pure-frontend UI activities that do not go through the Host.
 */

import i18n from "@/i18n";
import {
	BackgroundTaskCancelledError,
	startBackgroundTaskProgressListener,
} from "@/lib/core/background-tasks";
import {
	commands,
	events,
	type JobKind,
	type JobLane,
	type JobOfferPayload,
	type JobSnapshot,
	type JobState,
	type Json,
} from "@/lib/core/bindings";
import { errorText } from "@/lib/core/error";
import { callApiResult } from "@/lib/core/ipc";
import {
	jobReport,
	registerJobExecutor,
	requestJobCancel,
	startJobCenterExecutorListener,
	startJobTaskProjection,
	stopJobCenterExecutorListener,
	stopJobTaskProjection,
} from "@/lib/core/job-center";
import { logger } from "@/lib/core/logger";
import { listenEventSafe } from "@/lib/core/tauri-events";

/** Local (non-Host) UI activity: legacy panel row + AbortController runner. */
export { enqueueBackgroundTask as runLocalActivity } from "@/lib/core/background-tasks";
export type { JobKind, JobSnapshot, JobState };

export type TaskSpec = {
	kind:
		| "parseRefs"
		| "parseBody"
		| "layoutAnalyze"
		| "downloadAssets"
		| "import"
		| "connectorSync";
	vaultPath: string;
	path: string;
	lane?: JobLane;
	force?: boolean;
	/** parseBody only: Host-side cooperative-cancel polling id. */
	taskId?: string | null;
	/**
	 * import / connectorSync: JSON-serializable mode + source identifiers;
	 * feeds the dedupe fingerprint.
	 */
	params?: unknown;
};

export async function enqueueTask(spec: TaskSpec): Promise<JobSnapshot> {
	const args = {
		vaultPath: spec.vaultPath,
		path: spec.path,
		lane: spec.lane ?? null,
		force: spec.force ?? false,
	};
	return callApiResult(
		() => {
			switch (spec.kind) {
				case "parseRefs":
					return commands.jobParseRefsEnqueue(args);
				case "parseBody":
					return commands.jobParseBodyEnqueue({
						...args,
						taskId: spec.taskId ?? null,
					});
				case "layoutAnalyze":
					return commands.jobLayoutAnalyzeEnqueue(args);
				case "downloadAssets":
					return commands.jobDownloadAssetsEnqueue(args);
				case "import":
					return commands.jobImportEnqueue({
						...args,
						params: (spec.params ?? null) as Json | null,
					});
				case "connectorSync":
					return commands.jobConnectorSyncEnqueue({
						...args,
						params: (spec.params ?? null) as Json | null,
					});
			}
		},
		{ fallback: "job enqueue failed" },
	);
}

export function isTerminalJobState(state: JobState): boolean {
	return (
		state === "succeeded" ||
		state === "failed" ||
		state === "cancelled" ||
		state === "skipped"
	);
}

/**
 * Resolve with the job's terminal snapshot. Legacy callers awaited the work
 * itself, so enqueue + this is the drop-in equivalent of `enqueueBackgroundTask`.
 */
function terminalSnapshot(job: JobSnapshot): Promise<JobSnapshot> {
	if (isTerminalJobState(job.state)) return Promise.resolve(job);
	return new Promise<JobSnapshot>((resolve) => {
		let off: (() => void) | null = null;
		const settle = (snapshot: JobSnapshot | null | undefined): void => {
			if (!snapshot || !isTerminalJobState(snapshot.state)) return;
			off?.();
			off = null;
			resolve(snapshot);
		};
		off = listenEventSafe(events.jobChanged, ({ job: next }) => {
			if (next.id === job.id) settle(next);
		});
		// The job can settle between the enqueue response and this subscription
		// (a deduped job, or a fast Host runner): re-read it once so the waiter
		// cannot hang forever.
		void callApiResult(() => commands.jobList({}), {
			fallback: "job list failed",
		})
			.then((jobs) => settle(jobs?.find((item) => item.id === job.id)))
			.catch(() => undefined);
	});
}

/**
 * Enqueue, then settle like the legacy runner did: resolves on success/skip,
 * throws {@link BackgroundTaskCancelledError} on cancel and the job's error on
 * failure, so existing `isBackgroundTaskCancelledError` / `notifyError` call
 * sites keep working.
 */
export async function enqueueTaskSettled(spec: TaskSpec): Promise<JobSnapshot> {
	return awaitTaskSettled(await enqueueTask(spec));
}

/** Settle an already-enqueued job (for callers that need the job id first). */
export async function awaitTaskSettled(job: JobSnapshot): Promise<JobSnapshot> {
	const terminal = await terminalSnapshot(job);
	if (terminal.state === "cancelled") throw new BackgroundTaskCancelledError();
	if (terminal.state === "failed") {
		throw new Error(terminal.error?.trim() || i18n.t("app:tasks.failed"));
	}
	return terminal;
}

/** Best-effort cancel routed to `job_cancel` (same path as the panel's). */
export function cancelTask(jobId: string): void {
	requestJobCancel(jobId);
}

export type TaskReportArgs = {
	progress?: number | null;
	phase?: string | null;
	error?: string | null;
	state?: JobState | null;
};

export type TaskExecutorContext = {
	jobId: string;
	kind: JobKind;
	vaultPath: string;
	paperPath: string | null;
	force: boolean;
	params: Json | null;
	/** Aborts when `job:changed` reports this job cancelled. */
	signal: AbortSignal;
	report: (args: TaskReportArgs) => Promise<void>;
};

export type TaskExecutor = (ctx: TaskExecutorContext) => Promise<void>;

/**
 * Status text for the panel row (the legacy `setDetail`). Best-effort: a
 * dropped report must not fail the work itself.
 */
export function reportTaskPhase(
	ctx: TaskExecutorContext,
	phase: string,
): Promise<void> {
	return ctx.report({ phase }).catch((error) => {
		logger.warn("task phase report failed", {
			jobId: ctx.jobId,
			error: errorText(error),
		});
	});
}

/** Cancellation checkpoint — the legacy runner's post-await throw. */
export function throwIfTaskCancelled(ctx: TaskExecutorContext): void {
	if (ctx.signal.aborted) throw new BackgroundTaskCancelledError();
}

/**
 * Register the renderer-side executor for a `job:offer` kind. Must run before
 * {@link startTaskRuntime} so the initial running-job re-claim sees it.
 */
export function registerTaskExecutor(
	kind: JobKind,
	executor: TaskExecutor,
): void {
	registerJobExecutor(kind, (offer) => runTaskExecutor(offer, executor));
}

function runTaskExecutor(
	offer: JobOfferPayload,
	executor: TaskExecutor,
): Promise<void> {
	const controller = new AbortController();
	const dispose = listenEventSafe(events.jobChanged, ({ job }) => {
		if (job.id === offer.jobId && job.state === "cancelled") {
			controller.abort();
		}
	});
	return executor({
		jobId: offer.jobId,
		kind: offer.kind,
		vaultPath: offer.vaultPath,
		paperPath: offer.paperPath,
		force: offer.force,
		params: offer.params,
		signal: controller.signal,
		report: (args) => jobReport({ jobId: offer.jobId, ...args }),
	}).finally(dispose);
}

/**
 * Start the offer listener + task-panel projection. Caller owns the disposer.
 */
export function startTaskRuntime(): () => void {
	startJobCenterExecutorListener();
	startJobTaskProjection();
	startBackgroundTaskProgressListener();
	return () => {
		stopJobCenterExecutorListener();
		stopJobTaskProjection();
	};
}
