//! Map Translator (Zotero API JSON) items onto [`PaperRecord`] for the import
//! pipeline: field extraction, arXiv/DOI/PMID recovery, canonical URLs.

use crate::error::AppError;
use crate::features::catalog::papers::{hide_arxiv_category_tag, PaperKind, PaperRecord, PaperTag};
use serde_json::Value;

pub fn map_zotero_item(item: &Value) -> Result<PaperRecord, AppError> {
    let title = item
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if title.is_empty() {
        return Err(AppError::message("translator item missing title"));
    }

    let zotero_type = item
        .get("itemType")
        .and_then(|v| v.as_str())
        .unwrap_or("journalArticle")
        .to_string();

    let mut authors = Vec::new();
    if let Some(arr) = item.get("creators").and_then(|v| v.as_array()) {
        for c in arr {
            let ctype = c
                .get("creatorType")
                .and_then(|v| v.as_str())
                .unwrap_or("author");
            if ctype != "author" && ctype != "editor" {
                continue;
            }
            if let Some(name) = c.get("name").and_then(|v| v.as_str()) {
                authors.push(name.trim().to_string());
            } else {
                let first = c
                    .get("firstName")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim();
                let last = c
                    .get("lastName")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim();
                let name = format!("{first} {last}").trim().to_string();
                if !name.is_empty() {
                    authors.push(name);
                }
            }
        }
    }

    let date = item
        .get("date")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let year = date.as_ref().and_then(|d| {
        d.chars()
            .take(4)
            .collect::<String>()
            .parse::<i32>()
            .ok()
            .filter(|&y| (1000..=2100).contains(&y))
    });

    let doi = item
        .get("DOI")
        .or_else(|| item.get("doi"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let isbn = item
        .get("ISBN")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let issn = item
        .get("ISSN")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let publication = item
        .get("publicationTitle")
        .or_else(|| item.get("proceedingsTitle"))
        .or_else(|| item.get("bookTitle"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let extra = item
        .get("extra")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let url = item
        .get("url")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Translator often puts arXiv id in archiveID ("arXiv:1706.03762"), extra, or url
    let arxiv_id = extract_arxiv_from_extra(extra.as_deref())
        .or_else(|| normalize_arxiv_field(item.get("archiveID").and_then(|v| v.as_str())))
        .or_else(|| normalize_arxiv_field(item.get("archiveLocation").and_then(|v| v.as_str())))
        .or_else(|| url.as_deref().and_then(extract_arxiv_from_url))
        .or_else(|| {
            // DOI form 10.48550/arXiv.1706.03762
            item.get("DOI")
                .or_else(|| item.get("doi"))
                .and_then(|v| v.as_str())
                .and_then(extract_arxiv_from_doi)
        });

    let pmid = extract_pmid_from_extra(extra.as_deref());

    // attachments may carry pdf url
    let mut pdf_url = None;
    if let Some(atts) = item.get("attachments").and_then(|v| v.as_array()) {
        for a in atts {
            let mime = a.get("mimeType").and_then(|v| v.as_str()).unwrap_or("");
            let aurl = a.get("url").and_then(|v| v.as_str()).unwrap_or("");
            if (mime.contains("pdf") || aurl.contains(".pdf") || aurl.contains("/pdf/"))
                && !aurl.is_empty()
            {
                pdf_url = Some(aurl.to_string());
                break;
            }
        }
    }
    // Direct url pointing at a PDF
    if pdf_url.is_none() {
        if let Some(ref u) = url {
            if u.contains("/pdf/") || u.ends_with(".pdf") {
                pdf_url = Some(u.clone());
            }
        }
    }

    let tags = item
        .get("tags")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| {
                    t.get("tag")
                        .and_then(|v| v.as_str())
                        .or_else(|| t.as_str())
                        .map(hide_arxiv_category_tag)
                        .filter(|s| !s.is_empty())
                        .map(PaperTag::new)
                })
                .collect()
        })
        .unwrap_or_default();

    let paper_type = if arxiv_id.is_some() {
        PaperKind::Arxiv
    } else if doi.is_some() {
        PaperKind::Doi
    } else if zotero_type == "webpage" {
        PaperKind::Html
    } else {
        PaperKind::Other
    };

    let id = arxiv_id
        .clone()
        .or_else(|| doi.clone().map(|d| doi_slug(&d)))
        .or_else(|| isbn.clone())
        .unwrap_or_else(|| citekey_fallback(&authors, year, &title));

    let mut record = PaperRecord::local_pdf(id, title);
    record.paper_type = paper_type;
    record.authors = authors;
    record.creators = item.get("creators").cloned();
    record.year = year;
    record.date = date;
    record.abstract_text = item
        .get("abstractNote")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    record.tags = tags;
    record.arxiv_id = arxiv_id;
    record.doi = doi;
    record.isbn = isbn;
    record.issn = issn;
    record.pmid = pmid;
    record.publication = publication;
    record.volume = str_field(item, "volume");
    record.issue = str_field(item, "issue");
    record.pages = str_field(item, "pages");
    record.publisher = str_field(item, "publisher");
    record.place = str_field(item, "place");
    record.series = str_field(item, "series");
    record.language = str_field(item, "language");
    record.pdf_url = pdf_url;
    record.html_url = if paper_type == PaperKind::Html {
        url.clone()
    } else {
        None
    };
    record.source_url = if paper_type == PaperKind::Html {
        None
    } else {
        url
    };
    record.zotero_item_type = Some(zotero_type);
    record.meta_source = str_field(item, "libraryCatalog");
    record.extra = extra;

    Ok(record)
}

pub fn enrich_remote_urls(meta: &mut PaperRecord) {
    if let Some(ref aid) = meta.arxiv_id {
        let bare = aid.trim().trim_start_matches("arXiv:").to_string();
        let bare = strip_v(&bare);
        // Always set canonical https arXiv preview URLs (overwrite http://arxiv.org/…)
        meta.pdf_url = Some(format!("https://arxiv.org/pdf/{bare}"));
        meta.html_url = Some(format!("https://arxiv.org/html/{bare}"));
        meta.source_url = Some(format!("https://arxiv.org/abs/{bare}"));
        if meta.bibtex_key.is_none() {
            meta.bibtex_key = Some(bare.replace('/', ""));
        }
        if meta.paper_type == PaperKind::Other {
            meta.paper_type = PaperKind::Arxiv;
        }
    } else if let Some(ref doi) = meta.doi {
        if meta.source_url.as_ref().is_none_or(|s| s.is_empty()) {
            meta.source_url = Some(format!("https://doi.org/{doi}"));
        }
    }

    // ACL Anthology landing pages don't expose a PDF attachment, but the PDF
    // is always available at <landing>.pdf.
    if meta.pdf_url.is_none() {
        if let Some(url) = meta.source_url.as_deref().or(meta.html_url.as_deref()) {
            if let Some(pdf) = acl_anthology_pdf_url(url) {
                meta.pdf_url = Some(pdf);
            }
        }
    }

    if meta.bibtex_key.is_none() {
        meta.bibtex_key = Some(meta.id.replace(['/', '.'], "_"));
    }
}

/// Derive the canonical ACL Anthology PDF URL from a paper landing page.
/// ACL Anthology paper URLs look like:
///   https://aclanthology.org/2026.acl-long.1248/
/// and the PDF is always:
///   https://aclanthology.org/2026.acl-long.1248.pdf
fn acl_anthology_pdf_url(url: &str) -> Option<String> {
    let lower = url.to_ascii_lowercase();
    if !lower.contains("aclanthology.org/") {
        return None;
    }
    // Already a PDF.
    if lower.ends_with(".pdf") {
        return Some(url.trim().to_string());
    }
    let trimmed = url.trim_end_matches('/');
    let slug = trimmed.rsplit('/').next()?;
    // Expect: YYYY.venue-type.number (e.g. 2026.acl-long.1248)
    let parts: Vec<&str> = slug.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    if parts[0].len() != 4 || !parts[0].chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    if !parts[1].contains('-') {
        return None;
    }
    if !parts[2].chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    Some(format!("{}.pdf", trimmed))
}

fn str_field(item: &Value, key: &str) -> Option<String> {
    item.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn extract_arxiv_from_extra(extra: Option<&str>) -> Option<String> {
    let extra = extra?;
    for line in extra.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("arXiv:") {
            return normalize_arxiv_id_token(rest.split_whitespace().next()?.trim());
        }
        if line.to_ascii_lowercase().starts_with("arxiv:") {
            return normalize_arxiv_id_token(
                line.split_once(':')?.1.split_whitespace().next()?.trim(),
            );
        }
    }
    None
}

fn normalize_arxiv_field(raw: Option<&str>) -> Option<String> {
    let s = raw?.trim();
    if s.is_empty() {
        return None;
    }
    let s = s
        .trim_start_matches("arXiv:")
        .trim_start_matches("arxiv:")
        .trim();
    // "1706.03762 [cs]" or "arXiv:1706.03762"
    let token = s.split_whitespace().next().unwrap_or(s);
    normalize_arxiv_id_token(token)
}

fn extract_arxiv_from_url(url: &str) -> Option<String> {
    // http://arxiv.org/abs/1706.03762 or /pdf/1706.03762
    let lower = url.to_ascii_lowercase();
    for marker in ["/abs/", "/pdf/", "/html/", "/src/", "/e-print/"] {
        if let Some(i) = lower.find(marker) {
            let rest = &url[i + marker.len()..];
            let token = rest
                .split(['?', '#', '/'])
                .next()
                .unwrap_or(rest)
                .trim_end_matches(".pdf");
            return normalize_arxiv_id_token(token);
        }
    }
    None
}

fn extract_arxiv_from_doi(doi: &str) -> Option<String> {
    // 10.48550/arXiv.1706.03762
    let lower = doi.to_ascii_lowercase();
    if let Some(i) = lower.find("arxiv.") {
        let rest = &doi[i + "arxiv.".len()..];
        return normalize_arxiv_id_token(rest.split_whitespace().next().unwrap_or(rest));
    }
    None
}

/// Bare arXiv id without version suffix.
fn normalize_arxiv_id_token(token: &str) -> Option<String> {
    let t = token
        .trim()
        .trim_start_matches("arXiv:")
        .trim_start_matches("arxiv:");
    if t.is_empty() {
        return None;
    }
    let bare = strip_v(t);
    // light validation: new-style NNNN.NNNNN or archive/NNNNNNN
    if bare.contains('.') || bare.contains('/') {
        Some(bare)
    } else {
        None
    }
}

fn extract_pmid_from_extra(extra: Option<&str>) -> Option<String> {
    let extra = extra?;
    for line in extra.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("PMID:") {
            return Some(rest.trim().to_string());
        }
    }
    None
}

pub fn doi_slug(doi: &str) -> String {
    doi.replace(['/', '.'], "_")
}

pub(crate) fn citekey_fallback(authors: &[String], year: Option<i32>, title: &str) -> String {
    let author = authors
        .first()
        .map(|a| {
            a.split_whitespace()
                .last()
                .unwrap_or("paper")
                .chars()
                .filter(|c| c.is_ascii_alphanumeric())
                .collect::<String>()
                .to_lowercase()
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "paper".into());
    let y = year.map(|y| y.to_string()).unwrap_or_else(|| "0000".into());
    let word = title
        .split_whitespace()
        .next()
        .unwrap_or("item")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase();
    format!("{author}{y}{word}")
}

fn strip_v(id: &str) -> String {
    if let Some(i) = id.rfind('v') {
        if id[i + 1..].chars().all(|c| c.is_ascii_digit()) && i > 0 {
            return id[..i].to_string();
        }
    }
    id.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn map_translator_arxiv_item_fills_pdf_html() {
        // Real shape from translation-server /search 1706.03762
        let item = json!({
            "itemType": "preprint",
            "title": "Attention Is All You Need",
            "creators": [
                {"firstName": "Ashish", "lastName": "Vaswani", "creatorType": "author"}
            ],
            "date": "2023-08-02",
            "abstractNote": "The dominant sequence transduction models…",
            "archiveID": "arXiv:1706.03762",
            "extra": "arXiv:1706.03762 [cs]",
            "libraryCatalog": "arXiv.org",
            "repository": "arXiv",
            "url": "http://arxiv.org/abs/1706.03762",
            "DOI": "10.48550/arXiv.1706.03762",
            "tags": [
                {"tag": "Computer Science - Machine Learning"},
                {"tag": "Computer Science - Computation and Language"},
                {"tag": "survey"}
            ]
        });
        let mut meta = map_zotero_item(&item).expect("map");
        enrich_remote_urls(&mut meta);
        assert_eq!(meta.arxiv_id.as_deref(), Some("1706.03762"));
        assert_eq!(
            meta.tags,
            vec![
                PaperTag::new("@arxiv:Computer Science - Machine Learning"),
                PaperTag::new("@arxiv:Computer Science - Computation and Language"),
                PaperTag::new("survey"),
            ]
        );
        assert_eq!(
            meta.pdf_url.as_deref(),
            Some("https://arxiv.org/pdf/1706.03762")
        );
        assert_eq!(
            meta.html_url.as_deref(),
            Some("https://arxiv.org/html/1706.03762")
        );
        assert_eq!(
            meta.source_url.as_deref(),
            Some("https://arxiv.org/abs/1706.03762")
        );
        // metadata.json must use snake_case keys for the frontend
        let json = serde_json::to_string(&meta).unwrap();
        assert!(json.contains("\"pdf_url\""), "got {json}");
        assert!(json.contains("\"arxiv_id\""), "got {json}");
        assert!(!json.contains("\"pdfUrl\""));
    }

    #[test]
    fn acl_anthology_pdf_url_derivation() {
        assert_eq!(
            acl_anthology_pdf_url("https://aclanthology.org/2026.acl-long.1248/"),
            Some("https://aclanthology.org/2026.acl-long.1248.pdf".to_string())
        );
        assert_eq!(
            acl_anthology_pdf_url("https://aclanthology.org/2026.acl-long.1248.pdf"),
            Some("https://aclanthology.org/2026.acl-long.1248.pdf".to_string())
        );
        assert_eq!(
            acl_anthology_pdf_url("https://www.aclanthology.org/2025.emnlp-main.42/"),
            Some("https://www.aclanthology.org/2025.emnlp-main.42.pdf".to_string())
        );
        assert!(acl_anthology_pdf_url("https://aclanthology.org/venues/acl/").is_none());
        assert!(acl_anthology_pdf_url("https://example.com/2026.acl-long.1248/").is_none());
    }

    #[test]
    fn enrich_remote_urls_fills_acl_anthology_pdf() {
        // Translator response shape for an ACL Anthology conference paper.
        let item = json!({
            "itemType": "conferencePaper",
            "title": "Enabling Agents to Communicate Entirely in Latent Space",
            "creators": [
                {"firstName": "Zhuoyun", "lastName": "Du", "creatorType": "author"}
            ],
            "date": "2026-07",
            "url": "https://aclanthology.org/2026.acl-long.1248/",
            "DOI": "10.18653/v1/2026.acl-long.1248",
            "libraryCatalog": "ACLWeb"
        });
        let mut meta = map_zotero_item(&item).expect("map");
        enrich_remote_urls(&mut meta);
        assert_eq!(
            meta.pdf_url.as_deref(),
            Some("https://aclanthology.org/2026.acl-long.1248.pdf")
        );
    }
}
