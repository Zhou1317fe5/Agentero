import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/core/utils";
import type { AgentAcpDiagnostic } from "@/lib/doctor/api";
import { DoctorSection } from "./doctor-sections";

function formatProbedAt(value?: string | null): string | null {
	if (!value) return null;
	const secs = Number(value);
	if (!Number.isFinite(secs) || secs <= 0) return null;
	return new Date(secs * 1000).toLocaleString();
}

function AgentRow({ agent }: { agent: AgentAcpDiagnostic }) {
	const { t } = useTranslation("settings");
	const category = agent.failureCategory ?? "unknown";
	const probedAt = formatProbedAt(agent.probedAt);
	const successDetail = [
		agent.agentName,
		agent.protocolVersion ? `v${agent.protocolVersion}` : null,
		probedAt,
	]
		.filter(Boolean)
		.join(" · ");
	return (
		<div className="flex items-start gap-2.5 border-b px-3.5 py-2.5 last:border-b-0">
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
				{agent.ok ? (
					<>
						{successDetail ? (
							<p className="truncate text-muted-foreground text-xs">
								{successDetail}
							</p>
						) : null}
						{agent.resolvedPath ? (
							<p
								className="truncate text-muted-foreground text-xs"
								title={agent.resolvedPath}
							>
								{agent.resolvedPath}
							</p>
						) : null}
					</>
				) : (
					<>
						{agent.error ? (
							<p className="truncate text-xs" title={agent.error}>
								{agent.error}
							</p>
						) : null}
						<p className="text-muted-foreground text-xs">
							{t(`doctor.agent.hints.${category}`)}
						</p>
					</>
				)}
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
				<div className="flex items-center gap-2.5 px-3.5 py-2.5">
					<Loader2
						className="size-3.5 animate-spin text-muted-foreground"
						aria-hidden
					/>
					<p className="text-muted-foreground text-xs">
						{t("doctor.agent.probing")}
					</p>
				</div>
			) : report && report.length > 0 ? (
				report.map((agent) => <AgentRow key={agent.agentId} agent={agent} />)
			) : (
				<div className="px-3.5 py-2.5">
					<p className="text-muted-foreground text-xs">
						{t("doctor.agent.none")}
					</p>
				</div>
			)}
		</DoctorSection>
	);
}
