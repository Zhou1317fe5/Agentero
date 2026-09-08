//! Doctor-side ACP diagnostics: re-probe every registered Agent and classify
//! failure reasons so Settings can show actionable causes instead of raw text.

use crate::core::error::AppError;
use crate::features::agent::acp::client::{
    effective_local_agent_env, resolve_command_in_agent_env,
};
use crate::features::agent::acp::probe_agent;
use crate::features::agent::models::{AgentDescriptor, AgentTemplate, ProbeResult};
use crate::features::agent::registry::store::chrono_like_now;
use crate::features::agent::service::emit_registry_changed;
use crate::features::agent::{AgentRegistry, AgentWarmGate};
use futures_util::stream::{self, StreamExt};
use serde::Serialize;
use tauri::AppHandle;

/// Cold starts (node adapters, MCP discovery) are slow; keep concurrency small
/// so Doctor does not spawn every CLI at once.
const PROBE_CONCURRENCY: usize = 3;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "kebab-case")]
pub enum AcpFailureCategory {
    CommandMissing,
    NotLoggedIn,
    Timeout,
    SpawnFailed,
    ProtocolFailed,
    Unknown,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AgentAcpDiagnostic {
    pub agent_id: String,
    pub name: String,
    pub template: AgentTemplate,
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_path: Option<String>,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_category: Option<AcpFailureCategory>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub protocol_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub probed_at: Option<String>,
}

/// Map raw ACP/probe error text onto a fixed category. Order matters: auth
/// failures are often wrapped in `initialize failed: {e}` (probe.rs), so
/// NotLoggedIn must be checked before ProtocolFailed. Mirrors the frontend
/// `isAgentAuthFailure` classifier in `src/lib/agent/api.ts`.
pub(crate) fn classify_acp_error(text: &str) -> AcpFailureCategory {
    let lower = text.to_ascii_lowercase();
    let contains_any = |needles: &[&str]| needles.iter().any(|needle| lower.contains(needle));

    if contains_any(&[
        "not found on path",
        "no such file or directory",
        "(os error 2)",
    ]) {
        return AcpFailureCategory::CommandMissing;
    }
    if contains_any(&[
        "invalid_grant",
        "failed to authenticate",
        "authentication failed",
        "not authenticated",
        "login required",
        "unauthenticated",
        "authentication required",
        "authrequired",
        "not logged in",
    ]) {
        return AcpFailureCategory::NotLoggedIn;
    }
    if lower.contains("timed out") {
        return AcpFailureCategory::Timeout;
    }
    if contains_any(&[
        "failed to start",
        "permission denied",
        "(os error 13)",
        "(os error 193)",
    ]) {
        return AcpFailureCategory::SpawnFailed;
    }
    if contains_any(&[
        "initialize failed",
        "no initialize response",
        "unsupported protocol",
        "method not found",
    ]) {
        return AcpFailureCategory::ProtocolFailed;
    }
    AcpFailureCategory::Unknown
}

/// Probe one agent without spawning when its command is known to be missing
/// (mirrors the `agent_probe` fast path in commands/registry.rs).
async fn probe_one(registry: &AgentRegistry, desc: &AgentDescriptor) -> ProbeResult {
    let result = if !desc.available {
        ProbeResult {
            agent_id: desc.id.clone(),
            available: false,
            agent_name: None,
            protocol_version: None,
            error: desc
                .last_error
                .clone()
                .or_else(|| Some(format!("command `{}` not found on PATH", desc.command))),
            session_capabilities: None,
        }
    } else {
        probe_agent(desc, None).await
    };
    let _ = registry.apply_probe_result(&desc.id, &result);
    result
}

fn diagnostic(desc: &AgentDescriptor, result: &ProbeResult) -> AgentAcpDiagnostic {
    let environment = effective_local_agent_env(desc);
    let resolved_path = resolve_command_in_agent_env(&desc.command, &environment)
        .map(|path| path.display().to_string());
    let error = if result.available {
        None
    } else {
        result.error.clone()
    };
    let failure_category = error
        .as_deref()
        .map(|text| Some(classify_acp_error(text)))
        .unwrap_or_else(|| {
            if result.available {
                None
            } else {
                Some(AcpFailureCategory::Unknown)
            }
        });
    AgentAcpDiagnostic {
        agent_id: desc.id.clone(),
        name: desc.name.clone(),
        template: desc.template.clone(),
        command: desc.command.clone(),
        resolved_path,
        ok: result.available,
        failure_category,
        error,
        agent_name: result.agent_name.clone(),
        protocol_version: result.protocol_version.clone(),
        probed_at: Some(chrono_like_now()),
    }
}

/// Re-probe every registered Agent over ACP initialize and write results back
/// to the registry (so the Agent settings pane stays in sync). Doctor is a
/// user-initiated retry: it ignores the warm-gate cooldown and clears the gate
/// on success, but never records new failures there.
pub async fn diagnose_agents(
    registry: &AgentRegistry,
    warm_gate: &AgentWarmGate,
    app: &AppHandle,
) -> Result<Vec<AgentAcpDiagnostic>, AppError> {
    // Snapshot once: it already refreshes command availability, and repeated
    // snapshots would re-run `which` for every agent each time.
    let agents = registry.snapshot()?.agents;
    if agents.is_empty() {
        return Ok(Vec::new());
    }

    let diagnostics = stream::iter(agents.into_iter().map(|desc| async move {
        let result = probe_one(registry, &desc).await;
        if result.available {
            warm_gate.clear(&desc.id);
        }
        diagnostic(&desc, &result)
    }))
    .buffered(PROBE_CONCURRENCY)
    .collect::<Vec<_>>()
    .await;

    emit_registry_changed(app);
    Ok(diagnostics)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_command_missing() {
        assert_eq!(
            classify_acp_error(
                "command `codex-acp` not found on PATH (or common install locations)"
            ),
            AcpFailureCategory::CommandMissing
        );
        assert_eq!(
            classify_acp_error("failed to spawn agent: No such file or directory (os error 2)"),
            AcpFailureCategory::CommandMissing
        );
    }

    #[test]
    fn classifies_not_logged_in() {
        assert_eq!(
            classify_acp_error("Codex is not logged in"),
            AcpFailureCategory::NotLoggedIn
        );
        assert_eq!(
            classify_acp_error("invalid_grant: token expired"),
            AcpFailureCategory::NotLoggedIn
        );
    }

    #[test]
    fn classifies_timeout() {
        assert_eq!(
            classify_acp_error("probe timed out after 30s (check Agent proxy / network)"),
            AcpFailureCategory::Timeout
        );
        assert_eq!(
            classify_acp_error("initialize timed out after 30s"),
            AcpFailureCategory::Timeout
        );
    }

    #[test]
    fn classifies_spawn_failed() {
        assert_eq!(
            classify_acp_error("failed to start: Permission denied (os error 13)"),
            AcpFailureCategory::SpawnFailed
        );
        assert_eq!(
            classify_acp_error("%1 is not a valid Win32 application. (os error 193)"),
            AcpFailureCategory::SpawnFailed
        );
    }

    #[test]
    fn classifies_protocol_failed() {
        assert_eq!(
            classify_acp_error("initialize failed: agent returned an error"),
            AcpFailureCategory::ProtocolFailed
        );
        assert_eq!(
            classify_acp_error("no initialize response"),
            AcpFailureCategory::ProtocolFailed
        );
    }

    #[test]
    fn auth_wrapped_in_initialize_wins_over_protocol() {
        assert_eq!(
            classify_acp_error("initialize failed: authentication required"),
            AcpFailureCategory::NotLoggedIn
        );
        assert_eq!(
            classify_acp_error("initialize failed: request timed out after 15s"),
            AcpFailureCategory::Timeout
        );
    }

    #[test]
    fn os_error_2_does_not_match_other_codes() {
        assert_eq!(
            classify_acp_error("boom (os error 22)"),
            AcpFailureCategory::Unknown
        );
    }

    #[test]
    fn falls_back_to_unknown() {
        assert_eq!(
            classify_acp_error("something went wrong"),
            AcpFailureCategory::Unknown
        );
    }
}
