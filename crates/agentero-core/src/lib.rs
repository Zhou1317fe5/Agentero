//! Tauri-independent foundations shared by the desktop Host and the headless CLI.
//!
//! Nothing in this crate may depend on `tauri` / `wry` / `tao`; the desktop
//! shell re-exports these modules as `agentero_lib::core::*` so both binaries
//! share one storage/plumbing layer.

pub mod background_tasks;
pub mod blocking;
pub mod error;
pub mod frontmatter;
pub mod fs;
pub mod http;
pub mod install_dirs;
pub mod log_util;
pub mod paths;
pub mod process;
pub mod remote;
pub mod sqlite;
pub mod time;
pub mod usage;
