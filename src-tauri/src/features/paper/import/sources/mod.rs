//! Import sources. The tauri-free Zotero codec/io lives in `agentero_core`;
//! the local `zotero` module bridges it and keeps the desktop shells
//! (local-library reader `db`, Tauri commands). `zotero_sync` is desktop-only.

pub mod zotero;

#[cfg(feature = "desktop")]
pub mod zotero_sync;
