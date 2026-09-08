import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
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
								<p className="truncate text-xs" title={agent.error}>
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
}: {
	report: AgentAcpDiagnostic[] | null;
	loading: boolean;
}) {
	const { t } = useTranslation("settings");
	const failed = report?.filter((agent) => !agent.ok).length ?? 0;
	return (
		<DoctorSection
			title={t("doctor.sections.agents")}
			description={t("doctor.sectionHints.agents")}
			ok={failed === 0}
			issueCount={failed}
			framed={false}
			action={
				loading && report ? (
					<Loader2
						className="size-3.5 animate-spin text-muted-foreground"
						aria-hidden
					/>
				) : undefined
			}
		>
			{loading && !report ? (
				<div className="flex items-center gap-2.5 rounded-xl border bg-card px-3.5 py-2.5">
					<Loader2
						className="size-3.5 animate-spin text-muted-foreground"
						aria-hidden
					/>
					<p className="text-muted-foreground text-xs">
						{t("doctor.agent.probing")}
					</p>
				</div>
			) : report && report.length > 0 ? (
				<div className="flex flex-col gap-2">
					{report.map((agent) => (
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
