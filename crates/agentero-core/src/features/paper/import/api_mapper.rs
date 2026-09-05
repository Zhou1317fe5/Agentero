//! Map [`ApiPaper`] candidates from `scholar_api` into [`PaperRecord`].

use crate::features::catalog::papers::{PaperKind, PaperRecord};
use crate::features::import::map::{doi_slug, enrich_remote_urls};
use crate::features::import::slug_from_stem;
use crate::features::scholar_api::scoring::{normalize_title, title_similarity};
use crate::features::scholar_api::ApiPaper;

/// Convert a single API candidate into a `PaperRecord`, choosing an id and
/// paper type from the available identifiers.
pub fn api_paper_to_meta(paper: &ApiPaper) -> PaperRecord {
    let id = paper
        .identifiers
        .arxiv_id
        .clone()
        .or_else(|| paper.identifiers.doi.clone().map(|d| doi_slug(&d)))
        .unwrap_or_else(|| slug_from_stem(&paper.title));

    let paper_type = if paper.identifiers.arxiv_id.is_some() {
        PaperKind::Arxiv
    } else if paper.identifiers.doi.is_some() {
        PaperKind::Doi
    } else {
        PaperKind::Pdf
    };

    let mut meta = PaperRecord::local_pdf(id, paper.title.clone());
    meta.paper_type = paper_type;
    meta.authors = paper.authors.clone();
    meta.year = paper.year;
    meta.date = paper.date.clone();
    meta.publication = paper.venue.clone();
    meta.doi = paper.identifiers.doi.clone();
    meta.arxiv_id = paper.identifiers.arxiv_id.clone();
    meta.volume = paper.volume.clone();
    meta.issue = paper.issue.clone();
    meta.pages = paper.pages.clone();
    meta.publisher = paper.publisher.clone();
    meta.abstract_text = paper.abstract_text.clone();
    meta.language = paper.language.clone();
    meta.pdf_url = paper.urls.pdf.clone();
    meta.html_url = paper.urls.html.clone();
    meta.source_url = paper.urls.landing.clone();
    meta.meta_source = Some(paper.source.into());
    meta.citation_count = paper.citation_count;

    // Ensure canonical arXiv URLs when we have an arXiv id.
    enrich_remote_urls(&mut meta);

    meta
}

/// Merge `other` into `base`, preferring non-empty fields from `other`.
/// The returned `PaperRecord` keeps `base.source` unless `other` contributes
/// identifiers or bibliographic fields.
pub fn merge_api_papers(base: &ApiPaper, other: &ApiPaper) -> PaperRecord {
    let mut merged = api_paper_to_meta(base);

    if other.identifiers.doi.is_some() {
        merged.doi = other.identifiers.doi.clone();
    }
    if other.year.is_some() {
        merged.year = other.year;
        merged.date = other.date.clone();
    }
    if other.venue.is_some() {
        merged.publication = other.venue.clone();
    }
    if other.volume.is_some() {
        merged.volume = other.volume.clone();
    }
    if other.issue.is_some() {
        merged.issue = other.issue.clone();
    }
    if other.pages.is_some() {
        merged.pages = other.pages.clone();
    }
    if other.publisher.is_some() {
        merged.publisher = other.publisher.clone();
    }
    if other.abstract_text.is_some() {
        merged.abstract_text = other.abstract_text.clone();
    }
    if other.urls.html.is_some() || other.urls.landing.is_some() {
        merged.html_url = other.urls.html.clone().or(other.urls.landing.clone());
        merged.source_url = other.urls.landing.clone();
    }
    // Same quantity, different coverage: the larger count is the tighter lower bound.
    merged.citation_count = match (merged.citation_count, other.citation_count) {
        (Some(a), Some(b)) => Some(a.max(b)),
        (a, b) => a.or(b),
    };

    merged.meta_source = Some(format!("{}+{}", base.source, other.source));

    // Re-apply arXiv canonicalization in case the merge changed identifiers.
    enrich_remote_urls(&mut merged);

    merged
}

/// Compute a title-similarity score between a query and a candidate.
pub fn score_against_query(paper: &ApiPaper, norm_query: &str) -> i32 {
    title_similarity(norm_query, &normalize_title(&paper.title))
}

/// Pick the candidate with the highest title similarity.
pub fn best_match<'a>(candidates: &'a [ApiPaper], norm_query: &str) -> Option<&'a ApiPaper> {
    candidates
        .iter()
        .max_by_key(|c| score_against_query(c, norm_query))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::scholar_api::{PaperIdentifiers, PaperUrls};

    fn api_paper(source: &'static str, citation_count: Option<i64>) -> ApiPaper {
        ApiPaper {
            identifiers: PaperIdentifiers {
                doi: Some("10.1/attention".into()),
                ..Default::default()
            },
            title: "Attention Is All You Need".into(),
            authors: vec!["Vaswani".into()],
            year: Some(2017),
            date: None,
            venue: Some("NeurIPS".into()),
            volume: None,
            issue: None,
            pages: None,
            publisher: None,
            abstract_text: None,
            urls: PaperUrls::default(),
            citation_count,
            language: None,
            source,
        }
    }

    #[test]
    fn api_paper_to_meta_keeps_citation_count() {
        let mapped = api_paper_to_meta(&api_paper("s2", Some(123_456)));
        assert_eq!(mapped.citation_count, Some(123_456));
        assert_eq!(mapped.meta_source.as_deref(), Some("s2"));

        let unmapped = api_paper_to_meta(&api_paper("crossref", None));
        assert_eq!(unmapped.citation_count, None);
    }

    #[test]
    fn merge_api_papers_keeps_the_larger_citation_count() {
        // Sources disagree in both directions; neither may downgrade the other.
        let low = api_paper("s2", Some(900));
        let high = api_paper("crossref", Some(1_500));
        assert_eq!(merge_api_papers(&low, &high).citation_count, Some(1_500));
        assert_eq!(merge_api_papers(&high, &low).citation_count, Some(1_500));

        // A missing count never erases a known one.
        let unknown = api_paper("openalex", None);
        assert_eq!(
            merge_api_papers(&high, &unknown).citation_count,
            Some(1_500)
        );
        assert_eq!(
            merge_api_papers(&unknown, &high).citation_count,
            Some(1_500)
        );
        assert_eq!(
            merge_api_papers(&api_paper("s2", None), &unknown).citation_count,
            None
        );
    }
}
