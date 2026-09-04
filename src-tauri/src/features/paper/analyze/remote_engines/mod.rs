//! Desktop cloud body-parse engines (MinerU / Paddle / OpenAI-compatible VLM).
//!
//! These engines share the layout provider credential pool
//! (`features::layout::hosted`), so they stay in the Host crate; the tauri-free
//! engine framework (trait, snapshot, dispatch, local liteparse engine) lives
//! in `agentero_core::features::paper::analyze::parse::engines`. Registration
//! happens inside [`refresh_parser_config`], which runs at startup and on
//! every settings change, so the registry is populated before the first parse.

mod mineru;
mod openai_vlm;
mod paddle;

use crate::features::paper::analyze::parse::engines;
use crate::features::settings::AppSettingsStore;
use std::collections::HashMap;
use std::sync::Arc;

/// Register the cloud engines and the settings-backed provider resolver with
/// the core engine registry. Idempotent (replaces existing entries).
pub fn register_remote_engines() {
    engines::register_engine("mineru", || Arc::new(mineru::MineruBodyEngine));
    engines::register_engine("paddle", || Arc::new(paddle::PaddleBodyEngine));
    engines::register_engine("openaicompatible", || {
        Arc::new(openai_vlm::OpenAiVlmBodyEngine)
    });
    engines::set_provider_resolver(crate::features::settings::layout_provider_settings_key);
}

/// Rebuild the snapshot from the settings store; plaintext keys never leave
/// the Host process.
pub fn refresh_parser_config(store: &AppSettingsStore) {
    register_remote_engines();
    let mut credentials = HashMap::new();
    for provider in ["paddle", "mineru", "openaiCompatible"] {
        credentials.insert(
            provider.to_string(),
            engines::EngineCredentials {
                api_key: store.layout_api_key(provider),
                base_url: store.layout_base_url(provider),
                model: store.layout_model(provider),
                prompt: store.layout_prompt(provider),
                language: store.layout_language(provider),
                is_ocr: store.layout_is_ocr(provider),
            },
        );
    }
    engines::configure_parser(engines::ParserEngineConfig {
        backend: store.parser_backend(),
        credentials,
    });
}

#[cfg(test)]
mod tests {
    use super::engines::*;
    use super::*;
    use std::path::Path;

    #[test]
    fn engine_registry_resolves_backends() {
        register_remote_engines();
        assert_eq!(engine_for("local").id(), "local");
        assert_eq!(engine_for("mineru").id(), "mineru");
        assert_eq!(engine_for("paddle").id(), "paddle");
        assert_eq!(engine_for("openaiCompatible").id(), "openaiCompatible");
        assert_eq!(engine_for("bogus").id(), "local");
        assert_eq!(engine_for("").id(), "local");
    }

    #[test]
    fn provider_lookup_matches_settings_keys() {
        register_remote_engines();
        assert_eq!(provider_for_backend("mineru"), Some("mineru"));
        assert_eq!(
            provider_for_backend("openaiCompatible"),
            Some("openaiCompatible")
        );
        assert_eq!(provider_for_backend("local"), None);
    }

    /// A cloud engine that cannot even start (no API key) must hand over to
    /// the local parser and leave the reason in `messages`.
    ///
    /// Mutates the process-wide snapshot, so it restores the default; no other
    /// test reads `PARSER_CONFIG`.
    #[tokio::test]
    async fn cloud_failure_falls_back_to_local_with_reason() {
        register_remote_engines();
        configure_parser(ParserEngineConfig {
            backend: "mineru".to_string(),
            credentials: HashMap::from([("mineru".to_string(), EngineCredentials::default())]),
        });

        let mut messages = Vec::new();
        // The local hop then fails too (no such PDF), which is fine: the
        // assertion is about the handover, not the local parse.
        let _ =
            parse_body_with_engine(Path::new("missing-test-input.pdf"), None, &mut messages).await;

        configure_parser(ParserEngineConfig::default());

        assert!(
            messages
                .iter()
                .any(|m| m.contains("mineru failed") && m.contains("falling back to local")),
            "expected a mineru fallback note, got {messages:?}"
        );
    }
}
