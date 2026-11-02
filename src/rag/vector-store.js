/**
 * @file vector-store.js
 * @description Embedded Hybrid Vector Store (SQLite FTS5 + Dense Cosine Vector Similarity).
 * Combines exact lexical search (BM25) with semantic vector search via Reciprocal Rank Fusion (RRF).
 * Local-first, zero cloud dependencies for local mode, optional cloud embedding endpoint support.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// Dimension for local lightweight dense vector embeddings
const LOCAL_VECTOR_DIM = 384;

/**
 * Standard English & Academic Stopwords
 */
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but',
  'by', 'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for',
  'from', 'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself',
  'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just',
  'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once',
  'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same',
  'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them',
  'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which',
  'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'course',
  'tell', 'show', 'give', 'explain', 'what', 'how'
]);

class HybridVectorStore {
  /**
   * @param {Object} options
   * @param {string} [options.dbPath] - Path to SQLite file, or ':memory:'
   * @param {string} [options.openAiApiKey] - Optional OpenAI key for text-embedding-3-small
   * @param {string} [options.ollamaEndpoint] - Optional Ollama endpoint
   */
  constructor(options = {}) {
    this.dbPath = options.dbPath || ':memory:';
    this.openAiApiKey = options.openAiApiKey || null;
    this.ollamaEndpoint = options.ollamaEndpoint || 'http://127.0.0.1:11434';

    this.db = null;
    this.chunksMap = new Map(); // chunkId -> RAGChunk
    this.vectorMap = new Map(); // chunkId -> Float32Array
    this.isInitialized = false;

    this.initDatabase();
  }

  /**
   * Initializes SQLite FTS5 table and metadata tables
   */
  initDatabase() {
    try {
      if (this.dbPath !== ':memory:') {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new DatabaseSync(this.dbPath);

      // Create chunks table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS chunks_meta (
          id TEXT PRIMARY KEY,
          doc_id TEXT,
          course_id TEXT,
          course_name TEXT,
          course_code TEXT,
          source_type TEXT,
          document_title TEXT,
          section TEXT,
          page_number INTEGER,
          token_estimate INTEGER,
          local_path TEXT,
          header TEXT,
          text TEXT,
          full_text TEXT,
          dense_vector BLOB
        );
      `);

      // Create FTS5 Virtual Table for BM25 Keyword Search
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
          id UNINDEXED,
          course_id,
          course_code,
          document_title,
          section,
          content,
          tokenize = 'porter unicode61'
        );
      `);

      this.isInitialized = true;
    } catch (err) {
      console.error('[HybridVectorStore] Init error:', err);
      throw err;
    }
  }

  /**
   * Computes dense vector embedding for text
   * Uses high-dimensional semantic feature projection + Ollama / Cloud fallback
   * @param {string} text 
   * @param {Object} options
   * @returns {Promise<Float32Array>}
   */
  async generateEmbedding(text, options = {}) {
    const clean = (text || '').trim();

    // 1. If cloud mode requested and API key available, try OpenAI text-embedding-3-small
    if (options.useCloud && this.openAiApiKey) {
      try {
        const res = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.openAiApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: clean.slice(0, 8000),
            dimensions: LOCAL_VECTOR_DIM
          }),
          signal: AbortSignal.timeout(4000)
        });
        if (res.ok) {
          const json = await res.json();
          const vec = json.data?.[0]?.embedding;
          if (Array.isArray(vec) && vec.length > 0) {
            return this.normalizeVector(new Float32Array(vec));
          }
        }
      } catch {
        // Fall back to local fast embedding
      }
    }

    // 2. High-speed local semantic hash projection with L2 normalization
    return this.computeDeterministicDenseVector(clean, LOCAL_VECTOR_DIM);
  }

  /**
   * Computes a deterministic, dense semantic representation using subword hashes,
   * positional n-grams, and semantic frequency weighting (L2 normalized).
   * Runs in microseconds without downloading gigabytes of external weights.
   * @param {string} text 
   * @param {number} dim 
   * @returns {Float32Array}
   */
  computeDeterministicDenseVector(text, dim = LOCAL_VECTOR_DIM) {
    const vec = new Float32Array(dim);
    if (!text) return vec;

    const words = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);

    if (words.length === 0) return vec;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const isStop = STOPWORDS.has(w);
      const weight = isStop ? 0.25 : 1.25;

      // 1. Unigram projection
      let h1 = 0x811c9dc5;
      for (let j = 0; j < w.length; j++) {
        h1 ^= w.charCodeAt(j);
        h1 = Math.imul(h1, 0x01000193);
      }
      const idx1 = Math.abs(h1) % dim;
      const sign1 = (h1 & 1) === 0 ? 1 : -1;
      vec[idx1] += sign1 * weight;

      // 2. Bigram context projection (words i and i+1)
      if (i < words.length - 1) {
        const bigram = `${w}_${words[i + 1]}`;
        let h2 = 0x811c9dc5;
        for (let j = 0; j < bigram.length; j++) {
          h2 ^= bigram.charCodeAt(j);
          h2 = Math.imul(h2, 0x01000193);
        }
        const idx2 = Math.abs(h2) % dim;
        const sign2 = (h2 & 1) === 0 ? 1 : -1;
        vec[idx2] += sign2 * (weight * 1.5);
      }

      // 3. Character 3-gram feature projection for technical terms
      if (w.length >= 4) {
        for (let j = 0; j <= w.length - 3; j++) {
          const trigram = w.slice(j, j + 3);
          let h3 = 0x811c9dc5;
          for (let k = 0; k < 3; k++) {
            h3 ^= trigram.charCodeAt(k);
            h3 = Math.imul(h3, 0x01000193);
          }
          const idx3 = Math.abs(h3) % dim;
          vec[idx3] += ((h3 & 1) === 0 ? 0.4 : -0.4) * weight;
        }
      }
    }

    return this.normalizeVector(vec);
  }

  /**
   * L2 normalizes a vector in-place
   * @param {Float32Array} vec 
   * @returns {Float32Array}
   */
  normalizeVector(vec) {
    let normSq = 0;
    for (let i = 0; i < vec.length; i++) {
      normSq += vec[i] * vec[i];
    }
    const norm = Math.sqrt(normSq);
    if (norm > 0) {
      for (let i = 0; i < vec.length; i++) {
        vec[i] /= norm;
      }
    }
    return vec;
  }

  /**
   * Dot product cosine similarity of two normalized vectors
   * @param {Float32Array} a 
   * @param {Float32Array} b 
   * @returns {number}
   */
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return Math.max(0, dot);
  }

  /**
   * Clears the store
   */
  clear() {
    if (this.db) {
      this.db.exec('DELETE FROM chunks_meta;');
      this.db.exec('DELETE FROM chunks_fts;');
    }
    this.chunksMap.clear();
    this.vectorMap.clear();
  }

  /**
   * Adds or updates chunks in the hybrid vector store
   * @param {import('./types').RAGChunk[]} chunks 
   * @param {Object} [options] 
   */
  async indexChunks(chunks, options = {}) {
    if (!this.db || !Array.isArray(chunks) || chunks.length === 0) return;

    const insertMeta = this.db.prepare(`
      INSERT OR REPLACE INTO chunks_meta (
        id, doc_id, course_id, course_name, course_code, source_type,
        document_title, section, page_number, token_estimate, local_path,
        header, text, full_text, dense_vector
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    const insertFts = this.db.prepare(`
      INSERT INTO chunks_fts (id, course_id, course_code, document_title, section, content)
      VALUES (?, ?, ?, ?, ?, ?);
    `);

    for (const chunk of chunks) {
      this.chunksMap.set(chunk.id, chunk);

      // Generate dense embedding
      const vec = await this.generateEmbedding(chunk.fullChunkText, options);
      this.vectorMap.set(chunk.id, vec);

      const buffer = Buffer.from(vec.buffer);

      insertMeta.run(
        chunk.id,
        chunk.docId,
        chunk.courseId,
        chunk.courseName || '',
        chunk.courseCode || '',
        chunk.sourceType || 'other',
        chunk.documentTitle || '',
        chunk.section || '',
        chunk.pageNumber != null ? chunk.pageNumber : null,
        chunk.tokenEstimate || 0,
        chunk.localPath || null,
        chunk.header || '',
        chunk.text || '',
        chunk.fullChunkText || '',
        buffer
      );

      insertFts.run(
        chunk.id,
        chunk.courseId,
        chunk.courseCode || '',
        chunk.documentTitle || '',
        chunk.section || '',
        `${chunk.documentTitle} ${chunk.section} ${chunk.text}`
      );
    }
  }

  /**
   * Tokenizes search query into clean FTS5 search terms
   * @param {string} query 
   * @returns {string}
   */
  formatFtsQuery(query) {
    if (!query) return '';
    const terms = query
      .replace(/[^\w\s-]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(t => t.length >= 2 && !STOPWORDS.has(t.toLowerCase()));

    if (terms.length === 0) return '';
    // Use FTS5 OR/AND prefix matching
    return terms.map(t => `"${t}"*`).join(' OR ');
  }

  /**
   * Executes sparse FTS5 BM25 search
   * @param {string} query 
   * @param {Object} filter 
   * @param {number} limit 
   * @returns {Array<{ chunkId: string, bm25Score: number }>}
   */
  searchSparseFts(query, filter = {}, limit = 30) {
    const ftsQuery = this.formatFtsQuery(query);
    if (!ftsQuery) return [];

    try {
      let sql = `
        SELECT id, bm25(chunks_fts) AS rank_score
        FROM chunks_fts
        WHERE chunks_fts MATCH ?
      `;
      const params = [ftsQuery];

      if (filter.courseId && filter.courseId !== 'all') {
        sql += ` AND course_id = ?`;
        params.push(String(filter.courseId));
      }

      sql += ` ORDER BY rank_score ASC LIMIT ?;`;
      params.push(limit);

      const rows = this.db.prepare(sql).all(...params);
      return rows.map((r, idx) => ({
        chunkId: r.id,
        // In SQLite FTS5 bm25(), lower is more relevant (negative score)
        bm25Score: Math.abs(r.rank_score || (idx + 1)),
        rank: idx + 1
      }));
    } catch (err) {
      console.warn('[HybridVectorStore] Sparse FTS query error:', err.message);
      return [];
    }
  }

  /**
   * Executes dense vector similarity search
   * @param {Float32Array} queryVector 
   * @param {Object} filter 
   * @param {number} limit 
   * @returns {Array<{ chunkId: string, cosineScore: number, rank: number }>}
   */
  searchDenseVector(queryVector, filter = {}, limit = 30) {
    const scored = [];

    for (const [chunkId, vec] of this.vectorMap.entries()) {
      const chunk = this.chunksMap.get(chunkId);
      if (!chunk) continue;

      // Course scoping filter
      if (filter.courseId && filter.courseId !== 'all' && String(chunk.courseId) !== String(filter.courseId)) {
        continue;
      }

      // Active Document scoping filter
      if (filter.activeFilePath && chunk.localPath !== filter.activeFilePath) {
        continue;
      }
      if (filter.activeDocTitle && !chunk.documentTitle.toLowerCase().includes(filter.activeDocTitle.toLowerCase())) {
        continue;
      }

      const cosine = this.cosineSimilarity(queryVector, vec);
      scored.push({ chunkId, cosineScore: cosine });
    }

    scored.sort((a, b) => b.cosineScore - a.cosineScore);
    return scored.slice(0, limit).map((s, idx) => ({
      chunkId: s.chunkId,
      cosineScore: s.cosineScore,
      rank: idx + 1
    }));
  }

  /**
   * Detects student academic intent from query
   * @param {string} query 
   * @returns {Record<string, boolean>}
   */
  detectIntent(query) {
    const q = (query || '').toLowerCase();
    return {
      rubricDue: /\b(due|deadline|rubric|points|pts|grading|criteria|late|submission|turn in)\b/i.test(q),
      syllabus: /\b(syllabus|policy|office hours|professor|instructor|breakdown|prereq|attendance|textbook)\b/i.test(q),
      slides: /\b(slide|slides|lecture|notes|presentation|topic|algorithm|concept|diagram)\b/i.test(q),
      announcements: /\b(announcement|announcements|update|exam logistics|post)\b/i.test(q),
      code: /\b(code|python|script|function|class|socket|test|harness|repo|git)\b/i.test(q)
    };
  }

  /**
   * Hybrid Search executing Reciprocal Rank Fusion (RRF)
   * Combines sparse FTS5 BM25 with dense vector cosine similarity
   * @param {import('./types').RetrievalQueryParams} params 
   * @returns {Promise<import('./types').ScoredSearchResult[]>}
   */
  async searchHybrid(params = {}) {
    const {
      query,
      scope = 'global',
      courseId = 'all',
      activeFilePath = null,
      activeDocTitle = null,
      topK = 5,
      modelType = 'local'
    } = params;

    if (!query || this.chunksMap.size === 0) return [];

    // Filter object based on scope
    const filter = {};
    if (scope === 'course' && courseId && courseId !== 'all') {
      filter.courseId = String(courseId);
    } else if (scope === 'active_document') {
      if (activeFilePath) filter.activeFilePath = activeFilePath;
      if (activeDocTitle) filter.activeDocTitle = activeDocTitle;
      if (courseId && courseId !== 'all') filter.courseId = String(courseId);
    }

    // 1. Sparse FTS5 BM25 Search
    const sparseResults = this.searchSparseFts(query, filter, 40);

    // 2. Dense Vector Semantic Search
    // Must match how the index was built (indexChunks uses local vectors): vectors from a
    // different embedding model have the same length, but comparing them is meaningless.
    const queryVector = await this.generateEmbedding(query);
    const denseResults = this.searchDenseVector(queryVector, filter, 40);

    // 3. Reciprocal Rank Fusion (RRF)
    // RRF_score(d) = w_sparse / (k + rank_sparse) + w_dense / (k + rank_dense)
    const k = 60;
    const wSparse = 0.45;
    const wDense = 0.55;

    const rankMap = new Map();

    sparseResults.forEach((item) => {
      if (!rankMap.has(item.chunkId)) {
        rankMap.set(item.chunkId, { chunkId: item.chunkId, sparseRank: null, denseRank: null, sparseScore: 0, denseScore: 0 });
      }
      const entry = rankMap.get(item.chunkId);
      entry.sparseRank = item.rank;
      entry.sparseScore = item.bm25Score;
    });

    denseResults.forEach((item) => {
      if (!rankMap.has(item.chunkId)) {
        rankMap.set(item.chunkId, { chunkId: item.chunkId, sparseRank: null, denseRank: null, sparseScore: 0, denseScore: 0 });
      }
      const entry = rankMap.get(item.chunkId);
      entry.denseRank = item.rank;
      entry.denseScore = item.cosineScore;
    });

    const intent = this.detectIntent(query);
    const qLower = query.toLowerCase();
    const scoredList = [];

    for (const entry of rankMap.values()) {
      const chunk = this.chunksMap.get(entry.chunkId);
      if (!chunk) continue;

      let rrfScore = 0;
      if (entry.sparseRank != null) {
        rrfScore += wSparse / (k + entry.sparseRank);
      }
      if (entry.denseRank != null) {
        rrfScore += wDense / (k + entry.denseRank);
      }

      // Intent multipliers
      let intentMultiplier = 1.0;
      if (intent.rubricDue && (chunk.sourceType === 'assignment_brief' || chunk.sourceType === 'rubric')) {
        intentMultiplier += 0.45;
      }
      if (intent.syllabus && chunk.sourceType === 'syllabus') {
        intentMultiplier += 0.45;
      }
      if (intent.slides && (chunk.sourceType === 'lecture_slide' || chunk.sourceType === 'page')) {
        intentMultiplier += 0.40;
      }
      if (intent.announcements && chunk.sourceType === 'announcement') {
        intentMultiplier += 0.50;
      }
      if (intent.code && chunk.sourceType === 'code') {
        intentMultiplier += 0.40;
      }

      // Exact phrase match bonus
      let lexicalBonus = 1.0;
      const cTextLower = chunk.text.toLowerCase();
      const cTitleLower = chunk.documentTitle.toLowerCase();
      if (cTitleLower.includes(qLower)) lexicalBonus += 0.35;
      if (cTextLower.includes(qLower)) lexicalBonus += 0.25;

      const finalScore = rrfScore * intentMultiplier * lexicalBonus;

      scoredList.push({
        chunk,
        ftsScore: entry.sparseScore,
        denseScore: entry.denseScore,
        rrfScore,
        finalScore
      });
    }

    scoredList.sort((a, b) => b.finalScore - a.finalScore);

    // Normalize relevance percentage (0-99%)
    const maxScore = scoredList.length > 0 ? scoredList[0].finalScore : 1;
    return scoredList.slice(0, topK).map((item, idx) => {
      const pct = Math.min(99, Math.max(15, Math.round((item.finalScore / maxScore) * 85 + 14)));
      return {
        chunk: item.chunk,
        ftsScore: item.ftsScore,
        denseScore: item.denseScore,
        rrfScore: item.rrfScore,
        finalScore: item.finalScore,
        relevancePercent: pct,
        rank: idx + 1
      };
    });
  }

  /**
   * Returns current vector store statistics
   */
  getStats() {
    return {
      totalChunks: this.chunksMap.size,
      totalVectors: this.vectorMap.size,
      dbPath: this.dbPath,
      isInitialized: this.isInitialized
    };
  }
}

module.exports = {
  HybridVectorStore,
  LOCAL_VECTOR_DIM
};
