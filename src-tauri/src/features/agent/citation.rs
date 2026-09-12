//! Resolve agent inline citation fragments to PDF layout coordinates.
//!
//! Citation links from agents look like:
//!   `papers/<id>/PAPER.md#section=2.3`
//!   `papers/<id>/<id>.pdf#figure=1`
//!   `papers/<id>/<id>.pdf#region=figure-1`
//!   `papers/<id>/<id>.pdf#page=3`
//!
//! The resolver maps those fragments to a page index and normalized bbox so the
//! PDF viewer can jump directly to the cited location.

use crate::core::error::AppError;
use crate::core::fs::sanitize_vault_rel;
use agentero_core::features::pdf::layout_index::{self, Bbox, LayoutIndexItem, LAYOUT_RAW_FILE};
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CitationTarget {
    /// Vault-relative paper folder path (`papers/<id>`).
    pub paper_path: String,
    /// Vault-relative path from the citation link.
    pub path: String,
    /// Raw fragment (e.g. `figure=1`).
    pub fragment: String,
    /// 0-based page index for the PDF viewer.
    pub page_index: u32,
    /// Normalized page bbox (0–1) to scroll to and highlight.
    pub bbox: Bbox,
    /// Human-readable title when available.
    pub title: Option<String>,
    /// Region id suitable for the PDF highlight registry.
    pub region_id: String,
}

/// Parse a citation source into `(path, fragment)`.
///
/// Accepts vault-relative paths with an optional leading `/` and an optional
/// `#key=value` fragment.
pub fn parse_citation_source(source: &str) -> Option<(String, String)> {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return None;
    }
    let without_prefix = trimmed.strip_prefix('/').unwrap_or(trimmed);
    let (path, fragment) = match without_prefix.find('#') {
        Some(idx) => (
            without_prefix[..idx].to_string(),
            without_prefix[idx + 1..].to_string(),
        ),
        None => (without_prefix.to_string(), String::new()),
    };
    if path.is_empty() {
        return None;
    }
    Some((path, fragment))
}

/// Resolve a citation source against the local vault.
pub fn resolve_citation(vault: &Path, source: &str) -> Result<CitationTarget, AppError> {
    let (path, fragment) = parse_citation_source(source)
        .ok_or_else(|| AppError::domain("citation_invalid_source", "empty citation source"))?;
    if fragment.is_empty() {
        return Err(AppError::domain(
            "citation_no_fragment",
            "citation has no fragment to resolve",
        ));
    }
    let paper_dir = resolve_paper_dir(vault, &path)?;
    let paper_rel = vault_relative(vault, &paper_dir)?;

    let (key, value) = fragment.split_once('=').ok_or_else(|| {
        AppError::domain(
            "citation_malformed_fragment",
            format!("fragment must be key=value, got `{fragment}`"),
        )
    })?;
    let value = urlencoding::decode(value)
        .map(|s| s.into_owned())
        .unwrap_or_else(|_| value.to_string());

    let target = match key {
        "section" => resolve_section(vault, &paper_rel, &value),
        "figure" | "table" | "algorithm" | "formula" => {
            resolve_layout_index_by_number(vault, &paper_rel, key, &value)
        }
        "region" => resolve_region(vault, &paper_rel, &value),
        "page" => resolve_page(&value),
        other => Err(AppError::domain(
            "citation_unknown_fragment",
            format!("unsupported citation fragment `{other}`"),
        )),
    }?;

    Ok(CitationTarget {
        paper_path: paper_rel,
        path,
        fragment,
        page_index: target.page_index,
        bbox: target.bbox,
        title: target.title,
        region_id: target.region_id,
    })
}

#[derive(Debug)]
struct ResolvedFragment {
    page_index: u32,
    bbox: Bbox,
    title: Option<String>,
    region_id: String,
}

fn resolve_paper_dir(vault: &Path, path: &str) -> Result<PathBuf, AppError> {
    let rel = sanitize_vault_rel(path).map_err(AppError::message)?;
    let abs = vault.join(&rel);
    let mut current = abs.as_path();
    while let Some(parent) = current.parent() {
        if !parent.starts_with(vault) {
            break;
        }
        if is_paper_folder(parent) {
            return Ok(parent.to_path_buf());
        }
        current = parent;
    }
    Err(AppError::domain(
        "citation_paper_not_found",
        format!("cannot locate paper folder for `{path}`"),
    ))
}

fn is_paper_folder(dir: &Path) -> bool {
    dir.join("NOTES.md").is_file()
        || dir.join("metadata.json").is_file()
        || dir.join("PAPER.md").is_file()
}

fn vault_relative(vault: &Path, abs: &Path) -> Result<String, AppError> {
    abs.strip_prefix(vault)
        .map_err(|_| AppError::domain("citation_path", "resolved paper dir is outside vault"))?
        .to_str()
        .map(|s| s.replace('\\', "/"))
        .ok_or_else(|| AppError::domain("citation_path", "paper path is not valid UTF-8"))
}

fn resolve_section(
    vault: &Path,
    paper_path: &str,
    heading: &str,
) -> Result<ResolvedFragment, AppError> {
    let raw = read_raw_layout(vault, paper_path)?;
    let headers = raw.regions.iter().filter(|r| r.kind == "header");
    let needle = normalize_heading(heading);

    let mut candidates: Vec<(f64, &LayoutRegion)> = Vec::new();
    for region in headers {
        let text = region
            .title
            .as_deref()
            .or(region.text.as_deref())
            .unwrap_or("");
        let normalized = normalize_heading(text);
        if normalized == needle {
            return Ok(region.into());
        }
        let score = heading_similarity(&needle, &normalized);
        if score > 0.0 {
            candidates.push((score, region));
        }
    }

    candidates.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    let best = candidates
        .into_iter()
        .map(|(_, r)| r)
        .next()
        .ok_or_else(|| {
            AppError::domain(
                "citation_section_not_found",
                format!("no header matching `{heading}` in {paper_path}/source/layout.json"),
            )
        })?;
    Ok(best.into())
}

fn resolve_layout_index_by_number(
    vault: &Path,
    paper_path: &str,
    section: &str,
    number: &str,
) -> Result<ResolvedFragment, AppError> {
    let n: usize = number.parse().map_err(|_| {
        AppError::domain(
            "citation_bad_number",
            format!("`{section}` citation expects a number, got `{number}`"),
        )
    })?;

    // Try the most likely sidebar id first (e.g. `figure-1`).
    let likely_id = format!("{section}-{n}");
    if let Ok(result) = layout_index::get_region(vault, paper_path, &likely_id) {
        return Ok((&result.item).into());
    }

    let listed = layout_index::list_regions(vault, paper_path, &[], None)?;
    let matches: Vec<&LayoutIndexItem> = listed
        .items
        .iter()
        .filter(|item| item_matches_numbered_citation(item, section, n))
        .collect();

    let item = matches.into_iter().next().ok_or_else(|| {
        AppError::domain(
            "citation_region_not_found",
            format!("no {section} {n} found in {paper_path}/source/layout-index.json"),
        )
    })?;
    Ok(item.into())
}

fn resolve_region(
    vault: &Path,
    paper_path: &str,
    region_id: &str,
) -> Result<ResolvedFragment, AppError> {
    let result = layout_index::get_region(vault, paper_path, region_id)?;
    Ok((&result.item).into())
}

fn resolve_page(value: &str) -> Result<ResolvedFragment, AppError> {
    let page: u32 = value.parse().map_err(|_| {
        AppError::domain(
            "citation_bad_page",
            format!("`page` citation expects a 1-based number, got `{value}`"),
        )
    })?;
    if page == 0 {
        return Err(AppError::domain(
            "citation_bad_page",
            "page number must be >= 1",
        ));
    }
    Ok(ResolvedFragment {
        page_index: page - 1,
        bbox: Bbox {
            x: 0.0,
            y: 0.0,
            w: 1.0,
            h: 1.0,
        },
        title: Some(format!("Page {page}")),
        region_id: format!("page-{page}"),
    })
}

fn item_matches_numbered_citation(item: &LayoutIndexItem, section: &str, n: usize) -> bool {
    if item.section != section {
        return false;
    }
    if item.id == format!("{section}-{n}") {
        return true;
    }
    let title = item.title.as_deref().unwrap_or("");
    let patterns = match section {
        "figure" => vec![
            format!("figure {n}"),
            format!("fig {n}"),
            format!("fig. {n}"),
        ],
        "table" => vec![format!("table {n}"), format!("tab. {n}")],
        "algorithm" => vec![
            format!("algorithm {n}"),
            format!("alg. {n}"),
            format!("alg {n}"),
        ],
        "formula" => vec![format!("({n})"), format!("{n}")],
        _ => Vec::new(),
    };
    let normalized = normalize_caption_title(title);
    patterns.iter().any(|p| normalized.starts_with(p))
}

fn normalize_heading(text: &str) -> String {
    text.to_lowercase()
        .replace(['\u{00A0}', '\t'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn normalize_caption_title(text: &str) -> String {
    text.to_lowercase()
        .replace(['\u{00A0}', '\t', ':', '.'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn heading_similarity(needle: &str, text: &str) -> f64 {
    // Exact substring match is preferred.
    if text.contains(needle) {
        return 1.0;
    }
    // Number-only needle ("2.3") also matches as a standalone token.
    if needle
        .split_whitespace()
        .all(|part| text.split_whitespace().any(|token| token == part))
    {
        return 0.9;
    }
    // Token overlap for headings with extra words.
    let needle_tokens: std::collections::HashSet<&str> = needle.split_whitespace().collect();
    let text_tokens: std::collections::HashSet<&str> = text.split_whitespace().collect();
    if needle_tokens.is_empty() {
        return 0.0;
    }
    let intersection: Vec<_> = needle_tokens.intersection(&text_tokens).collect();
    intersection.len() as f64 / needle_tokens.len() as f64
}

/// Lightweight raw layout.json reader for section/header resolution.
struct LayoutRegion {
    id: String,
    page_index: u32,
    kind: String,
    title: Option<String>,
    text: Option<String>,
    bbox: Bbox,
}

struct RawLayout {
    regions: Vec<LayoutRegion>,
}

fn read_raw_layout(vault: &Path, paper_path: &str) -> Result<RawLayout, AppError> {
    let dir = vault.join(paper_path).join("source");
    let raw_path = dir.join(LAYOUT_RAW_FILE);
    if !raw_path.is_file() {
        return Err(AppError::domain(
            "citation_layout_missing",
            format!("{paper_path}/source/{LAYOUT_RAW_FILE} not found; run layout analysis first"),
        ));
    }
    let text = std::fs::read_to_string(&raw_path)
        .map_err(|e| AppError::message(format!("failed to read raw layout: {e}")))?;
    let value: Value = serde_json::from_str(&text)
        .map_err(|e| AppError::message(format!("invalid raw layout json: {e}")))?;
    let regions = parse_raw_layout(&value)?;
    Ok(RawLayout { regions })
}

fn parse_raw_layout(value: &Value) -> Result<Vec<LayoutRegion>, AppError> {
    let arr = value
        .get("regions")
        .and_then(|v| v.as_array())
        .ok_or_else(|| {
            AppError::domain(
                "citation_layout_invalid",
                "layout.json missing regions array",
            )
        })?;

    let mut regions = Vec::with_capacity(arr.len());
    for (i, entry) in arr.iter().enumerate() {
        if let Some(region) = parse_raw_region(entry) {
            regions.push(region);
        } else {
            return Err(AppError::domain(
                "citation_layout_invalid",
                format!("invalid raw layout region at index {i}"),
            ));
        }
    }
    Ok(regions)
}

fn parse_raw_region(v: &Value) -> Option<LayoutRegion> {
    let id = v.get("id")?.as_str()?.to_string();
    let page_index = v.get("pageIndex")?.as_u64()? as u32;
    let kind = v.get("kind")?.as_str()?.to_string();
    let title = v
        .get("title")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty());
    let text = v
        .get("text")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty());
    let bbox_v = v.get("bbox")?;
    let bbox = Bbox {
        x: bbox_v.get("x")?.as_f64()?,
        y: bbox_v.get("y")?.as_f64()?,
        w: bbox_v.get("w")?.as_f64()?,
        h: bbox_v.get("h")?.as_f64()?,
    };
    Some(LayoutRegion {
        id,
        page_index,
        kind,
        title,
        text,
        bbox,
    })
}

impl From<&LayoutRegion> for ResolvedFragment {
    fn from(region: &LayoutRegion) -> Self {
        Self {
            page_index: region.page_index,
            bbox: region.bbox.clone(),
            title: region.title.clone().or_else(|| region.text.clone()),
            region_id: region.id.clone(),
        }
    }
}

impl From<&LayoutIndexItem> for ResolvedFragment {
    fn from(item: &LayoutIndexItem) -> Self {
        Self {
            page_index: item.page_index,
            bbox: item.bbox.clone(),
            title: item.title.clone(),
            region_id: item.layout_region_id.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn make_paper(vault: &Path, paper: &str) -> PathBuf {
        let dir = vault.join(paper);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("NOTES.md"), "# Notes").unwrap();
        fs::create_dir(dir.join("source")).unwrap();
        dir
    }

    fn write_raw_layout(paper: &Path, body: &str) {
        fs::write(paper.join("source").join("layout.json"), body).unwrap();
    }

    fn write_index(paper: &Path, body: &str) {
        fs::write(paper.join("source").join("layout-index.json"), body).unwrap();
    }

    #[test]
    fn resolves_section_header() {
        let dir = tempdir().unwrap();
        let vault = dir.path();
        let paper = make_paper(vault, "papers/p1");
        write_raw_layout(
            &paper,
            r#"{
                "schemaVersion": 3,
                "source": {"mode": "embedpdf-layout", "generatedAt": "t"},
                "regions": [
                  {"id":"h1","pageIndex":2,"kind":"header","label":"header","score":0.9,"readingOrder":1,"rect":{"x":0,"y":0,"w":1,"h":1},"bbox":{"x":0.1,"y":0.2,"w":0.8,"h":0.05},"title":"2.3 Method"}
                ]
            }"#,
        );
        let target = resolve_citation(vault, "papers/p1/PAPER.md#section=2.3").unwrap();
        assert_eq!(target.page_index, 2);
        assert_eq!(target.region_id, "h1");
        assert!((target.bbox.y - 0.2).abs() < 1e-9);
    }

    #[test]
    fn resolves_figure_by_number() {
        let dir = tempdir().unwrap();
        let vault = dir.path();
        let paper = make_paper(vault, "papers/p1");
        write_index(
            &paper,
            r#"{
                "schemaVersion": 1,
                "source": {"mode": "sidebar", "from": "layout.json", "generatedAt": "t", "minScore": 0.3},
                "items": [
                  {"id":"figure-1","stableKey":"a","kind":"image","section":"figure","page":2,"pageIndex":1,"bbox":{"x":0,"y":0,"w":1,"h":1},"score":0.9,"title":"Figure 1: overview","layoutRegionId":"r1"}
                ]
            }"#,
        );
        let target = resolve_citation(vault, "papers/p1/p1.pdf#figure=1").unwrap();
        assert_eq!(target.page_index, 1);
        assert_eq!(target.region_id, "r1");
    }

    #[test]
    fn resolves_page_fragment() {
        let dir = tempdir().unwrap();
        let vault = dir.path();
        let _paper = make_paper(vault, "papers/p1");
        let target = resolve_citation(vault, "papers/p1/p1.pdf#page=5").unwrap();
        assert_eq!(target.page_index, 4);
        assert_eq!(target.region_id, "page-5");
    }
}
