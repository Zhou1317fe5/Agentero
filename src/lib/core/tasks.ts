/**
 * Single frontend facade for background work.
 *
 * The Rust JobCenter is the scheduling engine; this module wraps job
 * enqueue / cancel, renderer-executed job registration and the task-panel
 * projection (bridge implementation in `job-center.ts`). `runLocalActivity`
 * covers pure-frontend UI activities that do not go through the Host.
 */

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
import { listenEventSafe } from "@/lib/core/tauri-events";

/** Local (non-Host) UI activity: legacy panel row + AbortController runner. */
export { enqueueBackgroundTask as runLocalActivity } from "@/lib/core/background-tasks";
export type { JobKind, JobSnapshot, JobState };

export type TaskSpec = {
	kind: "parseRefs" | "parseBody" | "layoutAnalyze" | "downloadAssets";
	vaultPath: string;
	path: string;
	lane?: JobLane;
	force?: boolean;
	/** parseBody only: Host-side cooperative-cancel polling id. */
	taskId?: string | null;
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
			}
		},
		{ fallback: "job enqueue failed" },
	);
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
	return () => {
		stopJobCenterExecutorListener();
		stopJobTaskProjection();
	};
}
