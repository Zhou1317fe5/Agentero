//! Paper analysis: citation refs and PAPER.md body parse (tauri-free subset).

pub mod refs;

#[cfg(not(any(target_os = "ios", target_os = "android")))]
pub mod parse;
