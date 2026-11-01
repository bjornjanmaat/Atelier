/**
 * @file chunker.js
 * @description Semantic & Hierarchical Section-Aware Chunker.
 * Preserves strict logical boundaries (e.g. "Late Policy", "Grading Criteria", "Rubric Criteria").
 * Injects mandatory metadata header: [Course: <Course Name> | Doc: <Document Title> | Section: <Heading/Page>]
 */

const crypto = require('crypto');

/**
 * Section-aware chunking options
 */
const DEFAULT_CHUNKER_OPTIONS = {
  minChunkTokens: 250,
  maxChunkTokens: 600,
  charsPerToken: 4,
  overlapRatio: 0.12 // 12% overlap
};

/**
 * Creates deterministic hash ID for a chunk
 * @param {string} seed 
 * @returns {string}
 */
function makeChunkId(seed) {
  return `chk_${crypto.createHash('md5').update(seed).digest('hex').slice(0, 10)}`;
}

/**
 * Estimates token count from text length
 * @param {string} text 
 * @returns {number}
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Splits long section text into overlapping paragraphs or sentences
 * respecting semantic boundaries rather than breaking mid-sentence.
 * @param {string} text 
 * @param {number} maxChars 
 * @param {number} overlapChars 
 * @returns {string[]}
 */
function splitSectionText(text, maxChars = 2000, overlapChars = 240) {
  const clean = text.trim();
  if (clean.length <= maxChars) {
    return [clean];
  }

  const chunks = [];
  let start = 0;

  while (start < clean.length) {
    let end = start + maxChars;
    if (end >= clean.length) {
      end = clean.length;
    } else {
      // Look for natural boundary within lookahead window
      const lookahead = clean.slice(start + Math.floor(maxChars * 0.75), Math.min(clean.length, end + 100));
      const pBreak = lookahead.lastIndexOf('\n\n');
      const nlBreak = lookahead.lastIndexOf('\n');
      const sBreak = Math.max(
        lookahead.lastIndexOf('. '),
        lookahead.lastIndexOf('? '),
        lookahead.lastIndexOf('! ')
      );

      if (pBreak !== -1) {
        end = start + Math.floor(maxChars * 0.75) + pBreak + 2;
      } else if (sBreak !== -1) {
        end = start + Math.floor(maxChars * 0.75) + sBreak + 2;
      } else if (nlBreak !== -1) {
        end = start + Math.floor(maxChars * 0.75) + nlBreak + 1;
      }
    }

    const snippet = clean.slice(start, end).trim();
    if (snippet.length >= 35) {
      chunks.push(snippet);
    }

    if (end >= clean.length) break;
    start = end - overlapChars;
    if (start <= 0 || (chunks.length > 0 && start <= start - overlapChars)) {
      start = end; // prevent loop
    }
  }

  return chunks;
}

/**
 * Chunks an ingested document into section-aware, metadata-prefixed RAG chunks
 * @param {import('./types').IngestedDocument} doc 
 * @param {Object} [options] 
 * @returns {import('./types').RAGChunk[]}
 */
function chunkDocument(doc, options = {}) {
  if (!doc || !Array.isArray(doc.sections) || doc.sections.length === 0) {
    return [];
  }

  const maxChars = (options.maxChunkTokens || 550) * (options.charsPerToken || 4);
  const overlapChars = Math.round(maxChars * (options.overlapRatio || 0.12));
  const chunks = [];
  let chunkIdx = 0;

  for (const section of doc.sections) {
    const heading = section.heading || 'General';
    const pageNumber = section.pageNumber || null;
    const sectionText = (section.text || '').trim();
    if (!sectionText) continue;

    // Split section only if exceeding window
    const textPieces = splitSectionText(sectionText, maxChars, overlapChars);

    for (let i = 0; i < textPieces.length; i++) {
      const piece = textPieces[i];
      const sectionLabel = pageNumber ? `p. ${pageNumber} - ${heading}` : heading;

      // Mandatory format: [Course: <Course Name> | Doc: <Document Title> | Section: <Heading/Page>]
      const header = `[Course: ${doc.courseName || doc.courseCode} | Doc: ${doc.title} | Section: ${sectionLabel}]`;
      const fullChunkText = `${header}\n${piece}`;
      const chunkId = makeChunkId(`${doc.docId}_${heading}_${pageNumber || 0}_${chunkIdx}_${piece.slice(0, 30)}`);

      chunks.push({
        id: chunkId,
        docId: doc.docId,
        courseId: doc.courseId,
        courseName: doc.courseName,
        courseCode: doc.courseCode,
        sourceType: doc.sourceType,
        documentTitle: doc.title,
        section: sectionLabel,
        pageNumber: pageNumber,
        header,
        text: piece,
        fullChunkText,
        chunkIndex: chunkIdx,
        tokenEstimate: estimateTokens(fullChunkText),
        localPath: doc.localPath || null
      });

      chunkIdx++;
    }
  }

  return chunks;
}

/**
 * Chunks a batch of ingested documents
 * @param {import('./types').IngestedDocument[]} docs 
 * @param {Object} [options] 
 * @returns {import('./types').RAGChunk[]}
 */
function chunkDocumentsBatch(docs, options = {}) {
  const allChunks = [];
  for (const doc of docs) {
    const docChunks = chunkDocument(doc, options);
    allChunks.push(...docChunks);
  }
  return allChunks;
}

module.exports = {
  chunkDocument,
  chunkDocumentsBatch,
  estimateTokens,
  splitSectionText,
  DEFAULT_CHUNKER_OPTIONS
};
