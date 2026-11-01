/**
 * @file types.js
 * @description Core types and schema definitions for the Atelier Local RAG Pipeline.
 * Compliant with Instructure Canvas API data policies (Zero-Training & Local Storage).
 */

/**
 * @typedef {'syllabus' | 'assignment_brief' | 'rubric' | 'lecture_slide' | 'announcement' | 'page' | 'code' | 'reading' | 'canvas_api'} SourceType
 */

/**
 * @typedef {'global' | 'course' | 'active_document'} RetrievalScope
 */

/**
 * @typedef {Object} DocumentSection
 * @property {string} heading - Logical section title (e.g. "Late Submission Policy", "Slide 3: Paxos vs Raft")
 * @property {number} [pageNumber] - 1-based page number for paginated docs (PDFs)
 * @property {string} text - Clean extracted text content of this section
 * @property {Record<string, any>} [metadata] - Section-specific attributes
 */

/**
 * @typedef {Object} IngestedDocument
 * @property {string} docId - Unique stable identifier for document
 * @property {string} courseId - Canvas Course ID or 'system'
 * @property {string} courseName - Human-readable course title
 * @property {string} courseCode - Course code (e.g. "CS 301")
 * @property {SourceType} sourceType - Classification of document
 * @property {string} title - Document title or filename
 * @property {string} [localPath] - Local filesystem path on user's disk
 * @property {DocumentSection[]} sections - Hierarchically partitioned sections
 * @property {number} totalChars - Total character length
 */

/**
 * @typedef {Object} RAGChunk
 * @property {string} id - Unique deterministic chunk ID (e.g., chk_ab12cd34)
 * @property {string} docId - Parent document ID
 * @property {string} courseId - Associated Course ID
 * @property {string} courseName - Associated Course Name
 * @property {string} courseCode - Course code
 * @property {SourceType} sourceType - Document category
 * @property {string} documentTitle - Document or file title
 * @property {string} section - Section heading or slide title
 * @property {number} [pageNumber] - 1-based page number
 * @property {string} header - Metadata prefix injected prior to embedding
 * @property {string} text - Body text of the chunk
 * @property {string} fullChunkText - Header + body text
 * @property {number} chunkIndex - Ordinal index within the document
 * @property {number} tokenEstimate - Approximate token count (~4 chars/token)
 * @property {string} [localPath] - Absolute path to local source file
 * @property {Float32Array | number[]} [denseVector] - Semantic embedding vector
 */

/**
 * @typedef {Object} CitationReference
 * @property {number} sourceNumber - 1-based ordinal citation index ([Source 1])
 * @property {string} docId - Referenced document ID
 * @property {string} title - Source document title
 * @property {string} section - Section or heading
 * @property {number} [pageNumber] - Page number (if PDF/slide)
 * @property {SourceType} sourceType - Category
 * @property {string} courseId - Course ID
 * @property {string} courseCode - Course code
 * @property {string} courseName - Course name
 * @property {number} relevancePercent - Normalized match confidence (0-100%)
 * @property {string} [localPath] - Local disk file path
 * @property {string} citationTag - Formatted citation string (e.g., "[Source: CS301_Syllabus.pdf, p. 2]")
 * @property {string} snippet - Brief verifiable excerpt
 */

/**
 * @typedef {Object} ScoredSearchResult
 * @property {RAGChunk} chunk - Retrieved chunk
 * @property {number} ftsScore - Sparse BM25 / FTS5 score
 * @property {number} denseScore - Dense vector cosine similarity
 * @property {number} rrfScore - Reciprocal Rank Fusion combined score
 * @property {number} finalScore - Adjusted score with intent and scope multipliers
 * @property {number} relevancePercent - Scaled 0-100% relevance score
 * @property {number} rank - Retrieval rank position
 */

/**
 * @typedef {Object} RetrievalQueryParams
 * @property {string} query - Student natural language question
 * @property {RetrievalScope} [scope='global'] - Scope filter ('global' | 'course' | 'active_document')
 * @property {string} [courseId='all'] - Course ID when scope is 'course'
 * @property {string} [activeFilePath=null] - Local path when scope is 'active_document'
 * @property {string} [activeDocTitle=null] - Title when scope is 'active_document'
 * @property {number} [topK=5] - Number of top chunks to assemble
 * @property {number} [budgetLimit=null] - Max characters for prompt budget
 * @property {'local' | 'cloud'} [modelType='local'] - Target LLM model architecture
 */

module.exports = {};
