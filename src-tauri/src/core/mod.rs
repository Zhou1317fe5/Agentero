//! Cross-cutting foundations shared by Host features and the headless CLI.
//!
//! Tauri-independent foundations live in the `agentero-core` crate and are
//! re-exported here so `crate::core::X` paths (and `agentero_lib::core::X` for
//! the CLI) stay stable. Modules kept in this crate:
//!
//! - [`app_handle`]: headless `AppHandle` shim; its `not(desktop)` gate only
//!   exists in this crate (agentero-core has no `desktop` feature).
//! - [`telemetry`]: PostHog sender — `posthog-rs` (desktop-only optional dep)
//!   plus `tauri::VERSION` in the payload.
//! - [`usage::commands`]: `#[tauri::command]` surface over the tauri-free
//!   storage layer in `agentero_core::usage`.

pub mod app_handle;
#[cfg(feature = "desktop")]
pub mod telemetry;
pub mod usage;

pub use agentero_core::background_tasks;
pub use agentero_core::blocking;
pub use agentero_core::error;
pub use agentero_core::frontmatter;
pub use agentero_core::fs;
pub use agentero_core::http;
pub use agentero_core::install_dirs;
pub use agentero_core::log_util;
pub use agentero_core::paths;
pub use agentero_core::process;
pub use agentero_core::remote;
pub use agentero_core::sqlite;
pub use agentero_core::time;
