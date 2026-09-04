//! Cooperative-cancellation registry for frontend background tasks.
//!
//! Frontend-tracked tasks (imports, downloads, parses, citing scans, …) pass a
//! `task_id`; long-running work polls [`is_cancelled`], the cancel command sets
//! it, and command exits call [`finish`] so a stale flag never kills the next
//! task reusing the id. Lives in `core` (not any one domain) because
//! import/refs/layout_model/agent all participate.
//!
//! Owners with a supervised task lifecycle (JobCenter runners) register a
//! per-task [`CancellationToken`] via [`register_token`] instead of relying on
//! the global flag set: [`cancel`] fires the registered token when present,
//! [`is_cancelled`] consults it, and the owner calls [`unregister_token`] when
//! the task exits (any exit path, including panics). Registration replaces any
//! stale entry, so cancel state can neither leak nor poison a later task that
//! reuses the same id. The flag set remains for legacy owners that clear it
//! themselves with [`finish`].

use std::collections::{HashMap, HashSet};
use std::sync::{LazyLock, Mutex};
use tokio_util::sync::CancellationToken;

static CANCELLED: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

/// Task-id keyed tokens registered by supervising owners (JobCenter). All
/// locks are short-lived `std::sync::Mutex` guards that are never held across
/// an await point.
static TOKENS: LazyLock<Mutex<HashMap<String, CancellationToken>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Register `token` as the cancellation state for `task_id`, replacing any
/// previous entry. Called by the task supervisor when the task starts.
pub fn register_token(task_id: &str, token: CancellationToken) {
    if let Ok(mut tokens) = TOKENS.lock() {
        tokens.insert(task_id.to_string(), token);
    }
}

/// Drop the token registration for `task_id`. Called by the task supervisor
/// when the task exits (success / failure / panic), so no cancel state
/// outlives the task it belongs to.
pub fn unregister_token(task_id: &str) {
    if let Ok(mut tokens) = TOKENS.lock() {
        tokens.remove(task_id);
    }
}

pub fn cancel(task_id: &str) {
    let registered = TOKENS
        .lock()
        .ok()
        .and_then(|tokens| tokens.get(task_id).cloned());
    if let Some(token) = registered {
        // Owner-managed lifecycle: the token dies with the registration, so
        // nothing leaks and a reused id cannot inherit a stale cancellation.
        token.cancel();
        return;
    }
    if let Ok(mut tasks) = CANCELLED.lock() {
        tasks.insert(task_id.to_string());
    }
}

pub fn is_cancelled(task_id: &str) -> bool {
    if let Ok(tokens) = TOKENS.lock() {
        if tokens
            .get(task_id)
            .is_some_and(|token| token.is_cancelled())
        {
            return true;
        }
    }
    CANCELLED
        .lock()
        .map(|tasks| tasks.contains(task_id))
        .unwrap_or(false)
}

pub fn finish(task_id: &str) {
    if let Ok(mut tasks) = CANCELLED.lock() {
        tasks.remove(task_id);
    }
}
