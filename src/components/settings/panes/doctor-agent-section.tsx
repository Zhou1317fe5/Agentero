import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/core/utils";
import type { AgentAcpDiagnostic } from "@/lib/doctor/api";
import { DoctorSection } from "./doctor-sections";

function formatLocationVersion(
	path?: string | null,
	version?: string | null,
): string | null {
	const parts = [path?.trim() || null, version?.trim() || null].filter(Boolean);
	return parts.length > 0 ? parts.join(" · ") : null;
}

function AgentCardShimmer() {
	return (
		<div className="rounded-xl border bg-card px-3.5 py-2.5" aria-hidden>
			<div className="flex items-start gap-2.5">
				<Skeleton className="library-shimmer mt-0.5 size-3.5 shrink-0 rounded-full" />
				<div className="min-w-0 flex-1 space-y-2">
					<div className="flex items-center justify-between gap-3">
						<Skeleton className="library-shimmer h-3.5 w-28" />
						<Skeleton className="library-shimmer h-3 w-12" />
					</div>
					<Skeleton className="library-shimmer h-3 w-4/5" />
					<Skeleton className="library-shimmer h-3 w-3/4" />
					<Skeleton className="library-shimmer h-3 w-1/3" />
				</div>
			</div>
		</div>
	);
}

function AgentCard({ agent }: { agent: AgentAcpDiagnostic }) {
	const { t } = useTranslation("settings");
	const category = agent.failureCategory ?? "unknown";
	const agentLine = formatLocationVersion(agent.agentPath, agent.agentVersion);
	const acpLine = formatLocationVersion(agent.resolvedPath, agent.acpVersion);
	const authStatus = agent.authStatus ?? "unknown";
	return (
		<div className="rounded-xl border bg-card px-3.5 py-2.5">
			<div className="flex items-start gap-2.5">
				{agent.ok ? (
					<CheckCircle2
						className="mt-0.5 size-3.5 shrink-0 text-emerald-600"
						aria-hidden
					/>
				) : (
					<TriangleAlert
						className="mt-0.5 size-3.5 shrink-0 text-amber-600"
						aria-hidden
					/>
				)}
				<div className="min-w-0 flex-1">
					<div className="flex items-baseline justify-between gap-3">
						<p className="truncate font-medium text-[13px]" title={agent.name}>
							{agent.name}
							{agent.template !== "custom" ? (
								<span className="ml-1.5 font-normal text-muted-foreground text-xs">
									{agent.template}
								</span>
							) : null}
						</p>
						<p
							className={cn(
								"shrink-0 text-xs",
								agent.ok ? "text-emerald-700" : "text-amber-700",
							)}
						>
							{agent.ok
								? t("doctor.agent.ready")
								: t(`doctor.agent.categories.${category}`)}
						</p>
					</div>
					<div className="mt-1.5 space-y-0.5 text-muted-foreground text-xs">
						<p className="truncate" title={agentLine ?? undefined}>
							<span className="text-foreground/70">Agent</span>
							<span className="mx-1.5 text-border">·</span>
							{agentLine ?? t("doctor.agent.locationMissing")}
						</p>
						<p className="truncate" title={acpLine ?? undefined}>
							<span className="text-foreground/70">ACP</span>
							<span className="mx-1.5 text-border">·</span>
							{acpLine ?? t("doctor.agent.locationMissing")}
						</p>
						<p>
							<span className="text-foreground/70">
								{t("doctor.agent.authLabel")}
							</span>
							<span className="mx-1.5 text-border">·</span>
							<span
								className={cn(
									authStatus === "authenticated" && "text-emerald-700",
									authStatus === "unauthenticated" && "text-amber-700",
								)}
							>
								{t(`doctor.agent.authStatus.${authStatus}`)}
							</span>
						</p>
					</div>
					{!agent.ok ? (
						<div className="mt-1.5 space-y-0.5">
							{agent.error ? (
								<p className="whitespace-pre-wrap break-words text-xs">
									{agent.error}
								</p>
							) : null}
							<p className="text-muted-foreground text-xs">
								{t(`doctor.agent.hints.${category}`)}
							</p>
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

export function DoctorAgentSection({
	report,
	loading,
	error,
}: {
	report: AgentAcpDiagnostic[] | null;
	loading: boolean;
	error?: string | null;
}) {
	const { t } = useTranslation("settings");
	const failed = error ? 1 : (report?.filter((agent) => !agent.ok).length ?? 0);
	const hasAgents = Boolean(report && report.length > 0);
	// While probing with nothing useful to show, prefer shimmer over "none".
	const showShimmer = loading && !error && !hasAgents;
	return (
		<DoctorSection
			title={t("doctor.sections.agents")}
			description={t("doctor.sectionHints.agents")}
			ok={failed === 0}
			issueCount={failed}
			framed={false}
			action={
				loading && hasAgents ? (
					<Loader2
						className="size-3.5 animate-spin text-muted-foreground"
						aria-hidden
					/>
				) : undefined
			}
		>
			{error ? (
				<div className="rounded-xl border bg-card px-3.5 py-2.5">
					<div className="flex items-start gap-2.5">
						<TriangleAlert
							className="mt-0.5 size-3.5 shrink-0 text-amber-600"
							aria-hidden
						/>
						<p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs">
							{error}
						</p>
					</div>
				</div>
			) : showShimmer ? (
				<div
					className="flex flex-col gap-2"
					role="status"
					aria-busy="true"
					aria-label={t("doctor.agent.probing")}
				>
					<AgentCardShimmer />
					<AgentCardShimmer />
				</div>
			) : hasAgents ? (
				<div className="flex flex-col gap-2">
					{report?.map((agent) => (
						<AgentCard key={agent.agentId} agent={agent} />
					))}
				</div>
			) : (
				<div className="rounded-xl border bg-card px-3.5 py-2.5">
					<p className="text-muted-foreground text-xs">
						{t("doctor.agent.none")}
					</p>
				</div>
			)}
		</DoctorSection>
	);
}
