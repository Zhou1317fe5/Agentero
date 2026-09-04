//! Host handle bridge: wraps the desktop `tauri::AppHandle` into the
//! tauri-free [`AppHandle`] from `agentero-core` so the migrated domain
//! services can emit frontend events and schedule JobCenter follow-ups
//! through [`HostHooks`] without knowing about Tauri.
//!
//! Headless (CLI) callers pass `None` / [`AppHandle::headless`]; every hook
//! is then a no-op, matching the historical headless shim semantics.

pub use agentero_core::app_handle::{AppHandle, HostHooks};

#[cfg(feature = "desktop")]
mod desktop {
    use super::{AppHandle, HostHooks};
    use std::path::Path;
    use std::sync::Arc;
    use tauri::Emitter;

    /// Routes the host callbacks to the desktop runtime: Tauri events for
    /// `emit`, JobCenter spawns for the follow-up jobs.
    pub struct TauriHostHooks(pub tauri::AppHandle);

    impl HostHooks for TauriHostHooks {
        fn emit(&self, event: &str, payload: serde_json::Value) {
            if let Err(e) = self.0.emit(event, payload) {
                log::warn!(target: "agentero::lifecycle", "emit {event} failed: {e}");
            }
        }
        fn spawn_parse_body_after_assets(&self, vault: &Path, path_rel: &str, force: bool) {
            crate::features::jobs::spawn_parse_body_after_assets(
                Some(&self.0),
                vault,
                path_rel,
                force,
            );
        }
        fn spawn_parse_after_import(&self, vault: &Path, path_rel: &str) -> bool {
            crate::features::refs::spawn_parse_after_import(Some(&self.0), vault, path_rel);
            true
        }
        fn spawn_recognize_metadata(&self, vault: &Path, path_rel: &str) {
            crate::features::jobs::spawn_recognize_metadata(Some(&self.0), vault, path_rel);
        }
    }

    /// Wrap a desktop handle for the migrated (tauri-free) service APIs.
    pub fn wrap(app: &tauri::AppHandle) -> AppHandle {
        AppHandle::with_hooks(Arc::new(TauriHostHooks(app.clone())))
    }
}

#[cfg(feature = "desktop")]
pub use desktop::{wrap, TauriHostHooks};
