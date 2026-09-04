use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    if env::var_os("CARGO_FEATURE_DESKTOP").is_some() {
        tauri_build::build();
    }
    forward_posthog_key();
}

/// Bake the PostHog project API key into the binary at compile time.
/// An explicit `AGENTERO_POSTHOG_KEY` env var wins; otherwise fall back to
/// the repo-root `.env` (gitignored). Absent both, telemetry compiles out.
fn forward_posthog_key() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dotenv = manifest_dir.join("../.env");
    println!("cargo:rerun-if-env-changed=AGENTERO_POSTHOG_KEY");
    println!("cargo:rerun-if-changed={}", dotenv.display());
    if env::var("AGENTERO_POSTHOG_KEY").is_ok() {
        return;
    }
    let Ok(content) = fs::read_to_string(&dotenv) else {
        return;
    };
    for line in content.lines() {
        let Some(value) = line
            .trim()
            .strip_prefix("AGENTERO_POSTHOG_KEY=")
            .map(str::trim)
            .filter(|v| !v.is_empty())
        else {
            continue;
        };
        println!("cargo:rustc-env=AGENTERO_POSTHOG_KEY={value}");
        return;
    }
}
