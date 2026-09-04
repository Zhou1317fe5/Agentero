//! Domain features (feature-first layout, aligned with frontend `src/lib`).
//!
//! Tauri-free service bodies live in `agentero_core::features::*` and are
//! bridged here (`pub use`) so historical `crate::features::X` paths stay
//! stable; this crate keeps the desktop shells: `#[tauri::command]` surfaces,
//! JobCenter runners, watcher/agent/integration wiring. The headless CLI
//! consumes `agentero_core` directly; BYOA (`agent`) is desktop-only.

#[cfg(feature = "desktop")]
pub mod agent;
#[cfg(feature = "desktop")]
pub mod background_tasks;
#[cfg(feature = "desktop")]
#[path = "agent/install/mod.rs"]
pub mod cli_install;
#[cfg(feature = "desktop")]
pub mod host_hooks;
#[cfg(feature = "desktop")]
pub mod jobs;

pub mod lifecycle;

#[path = "../app/open_request/mod.rs"]
pub mod open_request;

pub mod markdown;
pub mod paper;
pub mod pdf;
pub mod system;
pub mod translate;
pub mod vault;

// Stable historical `features::` paths, backed by the semantic module tree.
#[cfg(feature = "desktop")]
pub use paper::analyze::layout;
#[cfg(feature = "desktop")]
pub use paper::analyze::layout::hosted as layout_remote;
#[cfg(feature = "desktop")]
pub use paper::analyze::layout::model_assets as layout_model;
#[cfg(not(any(target_os = "ios", target_os = "android")))]
pub use paper::analyze::parse as pdf_parse;

pub use markdown::wiki;
pub use paper::analyze::refs;
pub use paper::catalog;
pub use paper::import;
pub use paper::scholar_api;
pub use vault::doctor;
pub use vault::rename;
pub use vault::trash;

#[cfg(feature = "desktop")]
pub use markdown::search;
#[cfg(feature = "desktop")]
pub use pdf::export;
#[cfg(not(any(target_os = "ios", target_os = "android")))]
pub use pdf::locate as pdf_locate;
#[cfg(feature = "desktop")]
pub use system::settings;
#[cfg(feature = "desktop")]
pub use vault::watcher;

#[cfg(feature = "desktop")]
pub use paper::discovery::arxiv_proxy;
#[cfg(feature = "desktop")]
pub use paper::discovery::coolpapers;
pub use paper::discovery::feeds;
#[cfg(feature = "desktop")]
pub use paper::discovery::modelscope_proxy;
#[cfg(feature = "desktop")]
pub use paper::discovery::recommend;
#[cfg(feature = "desktop")]
pub use paper::import::site_proxy;
pub use paper::import::sources::zotero;
#[cfg(feature = "desktop")]
pub use paper::import::sources::zotero_sync;
