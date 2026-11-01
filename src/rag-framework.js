/**
 * ============================================================================
 * Atelier RAG (Retrieval-Augmented Generation) Framework
 * ============================================================================
 * 
 * Production-grade, local-first RAG engine designed specifically for Canvas LMS
 * academic desktop environments:
 * 
 * 1. Document Ingestion: PDF (page-level preservation via pdfjs-dist),
 *    Markdown, HTML / Rich Text, Syllabi, Assignments, Rubrics, Modules, Announcements.
 * 2. Semantic & Hierarchical Chunking: Logical boundary-aware chunking
 *    (300-600 tokens) with prepended metadata header:
 *    [Course: <Course Name> | Doc: <Document Title> | Section: <Heading/Page>]
 * 3. Embedded Hybrid Vector Store: SQLite FTS5 (BM25) + Dense Vector Cosine Similarity
 *    fused with Reciprocal Rank Fusion (RRF). Zero cloud dependencies required.
 * 4. Scoping & Orchestration: Global, Course-Specific, or Active Document scoping.
 * 5. Verifiable Source Citations: Generates [Source: <Doc Title>, p. <Page#>]
 *    clickable citations that jump directly to referenced pages in the split viewer.
 * 6. Safety & Policy Compliance: Strict Instructure Canvas API Compliance,
 *    Zero-Data Retention (ZDR) non-training guarantees, and Academic Integrity disclosures.
 */

const { RAGOrchestrator } = require('./rag/orchestrator');
const { HybridVectorStore } = require('./rag/vector-store');
const { chunkDocument, chunkDocumentsBatch } = require('./rag/chunker');
const { ingestLocalFile, ingestCanvasCourseDetails, extractPdfPages, cleanHtmlText } = require('./rag/extractor');

class RAGFramework extends RAGOrchestrator {
  constructor(options = {}) {
    super(options);
    // Backward compatibility aliases
    this.chunkSize = options.chunkSize || 520;
    this.chunkOverlap = options.chunkOverlap || 90;
  }

  // Alias for legacy chunks property
  get chunks() {
    return Array.from(this.vectorStore.chunksMap.values());
  }

  // Alias for legacy documentsMeta property
  get documentsMeta() {
    return this.documents;
  }

  // Legacy sync retrieve wrapper
  retrieve(options = {}) {
    // When called synchronously, return top chunks matching query
    const query = options.query || '';
    const courseId = options.courseId || 'all';
    const topK = options.topK || 5;

    const all = Array.from(this.vectorStore.chunksMap.values());
    const filtered = all.filter(c => courseId === 'all' || String(c.courseId) === String(courseId));
    const qLower = query.toLowerCase();

    const scored = filtered.map(c => {
      let score = 0.3;
      if (c.documentTitle.toLowerCase().includes(qLower)) score += 0.4;
      if (c.text.toLowerCase().includes(qLower)) score += 0.3;
      return { chunk: c, score, relevancePercent: Math.round(score * 100) };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}

module.exports = {
  RAGFramework,
  RAGOrchestrator,
  HybridVectorStore,
  chunkDocument,
  chunkDocumentsBatch,
  ingestLocalFile,
  ingestCanvasCourseDetails,
  extractPdfPages,
  cleanHtmlText
};
