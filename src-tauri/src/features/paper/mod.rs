//! Paper domain: catalog metadata, import/discovery, citation analysis, and
//! paper-scoped filesystem operations.

pub mod analyze;
pub mod capabilities;
pub mod catalog;
pub mod discovery;
pub mod import;
// Tauri command + desktop-only usage-db rename; callers (app handlers,
// connector) are desktop-only.
#[cfg(feature = "desktop")]
pub mod r#move;
pub mod scholar_api;
