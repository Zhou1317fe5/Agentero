//! Semantic lifecycle events emitted at key backend milestones.
//!
//! The tauri-free paper fact events live in `agentero_core::features::lifecycle`
//! and are re-exported here so `crate::features::lifecycle::X` paths stay
//! stable. This file keeps the desktop job events, which depend on the
//! JobCenter snapshot types.
//!
//! @see docs/development/lifecycle-events.md

pub use agentero_core::features::lifecycle::*;

#[cfg(feature = "desktop")]
use serde::Serialize;
#[cfg(feature = "desktop")]
use std::path::Path;
#[cfg(feature = "desktop")]
use tauri::{AppHandle, Emitter};

#[cfg(feature = "desktop")]
pub const JOB_COMPLETED_EVENT: &str = "job:completed";
#[cfg(feature = "desktop")]
pub const JOB_FAILED_EVENT: &str = "job:failed";

#[cfg(feature = "desktop")]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JobEventPayload {
    job_id: String,
    kind: crate::features::jobs::JobKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    paper_id: Option<String>,
    timestamp: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Derive `job:completed` / `job:failed` when a job snapshot is terminal.
#[cfg(feature = "desktop")]
pub fn emit_job_terminal(app: &AppHandle, job: &crate::features::jobs::JobSnapshot) {
    use crate::features::jobs::JobState;
    let (event, error) = match job.state {
        JobState::Succeeded => (JOB_COMPLETED_EVENT, None),
        JobState::Failed => (JOB_FAILED_EVENT, job.error.clone()),
        _ => return,
    };
    let paper_id = job
        .paper_path
        .as_deref()
        .and_then(|p| p.rsplit(['/', '\\']).next())
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    if job.kind == crate::features::jobs::JobKind::DownloadAssets
        && job.state == JobState::Succeeded
    {
        if let Some(pid) = paper_id.as_deref() {
            let host_app = crate::core::app_handle::wrap(app);
            emit_paper_assets_ready(Some(&host_app), Path::new(&job.vault_path), pid);
        }
    }
    emit_or_log(
        app,
        event,
        JobEventPayload {
            job_id: job.id.clone(),
            kind: job.kind,
            paper_id,
            timestamp: now_ms(),
            error,
        },
    );
}

#[cfg(feature = "desktop")]
fn emit_or_log<T: Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
    if let Err(e) = app.emit(event, payload) {
        log::warn!(target: "agentero::lifecycle", "emit {event} failed: {e}");
    }
}
