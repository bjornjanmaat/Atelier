/**
 * @file orchestrator.js
 * @description Central RAG Orchestrator for Atelier.
 * Coordinates document ingestion, section-aware chunking, hybrid vector search,
 * deduplication, citation tagging, and prompt context compilation.
 */

const path = require('path');
const fs = require('fs');
const { ingestLocalFile, ingestCanvasCourseDetails, cleanHtmlText } = require('./extractor');
const { chunkDocumentsBatch } = require('./chunker');
const { HybridVectorStore } = require('./vector-store');

class RAGOrchestrator {
  /**
   * @param {Object} options 
   * @param {Function} [options.getOfflineCacheDir]
   * @param {Function} [options.getCourseFilesDir]
   * @param {Function} [options.readOfflineCache]
   * @param {Function} [options.synthesizeCourseDetails]
   * @param {string} [options.dbPath]
   */
  constructor(options = {}) {
    this.getOfflineCacheDirFn = options.getOfflineCacheDir || (() => path.join(__dirname, '..', '..', 'Canvas_Offline_Cache'));
    this.getCourseFilesDirFn = options.getCourseFilesDir || null;
    this.readOfflineCacheFn = options.readOfflineCache || null;
    this.synthesizeCourseDetailsFn = options.synthesizeCourseDetails || null;

    const cacheDir = this.getOfflineCacheDirFn();
    const dbPath = options.dbPath || (cacheDir ? path.join(cacheDir, 'rag_hybrid_store.sqlite') : ':memory:');

    this.vectorStore = new HybridVectorStore({
      dbPath,
      openAiApiKey: options.openAiApiKey || null
    });

    this.isIndexed = false;
    this.isIndexing = false;
    this.lastIndexedAt = null;
    this.documents = new Map(); // docId -> IngestedDocument
    this.stats = {
      totalDocuments: 0,
      totalChunks: 0,
      byType: {}
    };
  }

  /**
   * Updates OpenAI API key for cloud embeddings if configured
   * @param {string} apiKey 
   */
  setOpenAiApiKey(apiKey) {
    if (this.vectorStore) {
      this.vectorStore.openAiApiKey = apiKey;
    }
  }

  /**
   * Ingests and indexes all course materials found on local disk
   */
  async indexAllCourseMaterials() {
    if (this.isIndexing) return { status: 'already_indexing' };
    this.isIndexing = true;
    console.log('[RAG Orchestrator] Starting ingestion and hybrid indexing of course materials...');

    try {
      this.documents.clear();
      this.vectorStore.clear();

      // 1. Read courses from offline cache
      let cachedCourses = [];
      if (this.readOfflineCacheFn) {
        cachedCourses = this.readOfflineCacheFn('courses.json') || [];
      }

      // Fallback demo courses if empty cache
      if (!cachedCourses || cachedCourses.length === 0) {
        cachedCourses = [
          {
            id: '48201',
            name: 'CS 301: Distributed Systems & Cloud Infrastructure',
            course_code: 'CS 301',
            term: 'Fall 2026',
            instructor: 'Dr. Marcus Vance'
          },
          {
            id: '48202',
            name: 'CS 340: Database Internals & Query Optimization',
            course_code: 'CS 340',
            term: 'Fall 2026',
            instructor: 'Prof. Elena Rostova'
          },
          {
            id: '48203',
            name: 'CS 410: Machine Learning Systems & Deep Learning Ops',
            course_code: 'CS 410',
            term: 'Fall 2026',
            instructor: 'Dr. Kenji Sato'
          }
        ];
      }

      const allIngestedDocs = [];

      for (const course of cachedCourses) {
        const cId = String(course.id);
        const cName = course.name || `Course ${cId}`;
        const cCode = course.course_code || 'COURSE';

        // A. Canvas REST course details (Syllabi, Assignments, Rubrics, Modules, Announcements)
        let details = null;
        if (this.readOfflineCacheFn) {
          details = this.readOfflineCacheFn(`courses/${cId}.json`);
        }
        if (!details && this.synthesizeCourseDetailsFn) {
          details = this.synthesizeCourseDetailsFn(cId);
        }
        if (!details && cId === '48201') {
          details = this.getDemoCs301Details();
        }

        if (details) {
          const courseDocs = ingestCanvasCourseDetails(cId, { name: cName, course_code: cCode }, details);
          for (const d of courseDocs) {
            this.documents.set(d.docId, d);
            allIngestedDocs.push(d);
          }
        }

        // B. Local Course Files on Disk (PDFs, Markdown, Python, Code files)
        const candidateDirs = [];
        if (this.getCourseFilesDirFn) {
          const dir = this.getCourseFilesDirFn(cId);
          if (dir && fs.existsSync(dir)) candidateDirs.push(dir);
        }

        // Demo assets directory
        const assetsDir = path.join(__dirname, '..', 'assets', 'files');
        if (fs.existsSync(assetsDir) && !candidateDirs.includes(assetsDir)) {
          candidateDirs.push(assetsDir);
        }

        for (const dir of candidateDirs) {
          try {
            const files = fs.readdirSync(dir);
            for (const file of files) {
              if (file.startsWith('.')) continue;
              const fullPath = path.join(dir, file);
              const stat = fs.statSync(fullPath);
              if (!stat.isFile()) continue;

              const ingested = await ingestLocalFile(fullPath, {
                courseId: cId,
                courseName: cName,
                courseCode: cCode,
                maxPages: 35
              });

              if (ingested) {
                this.documents.set(ingested.docId, ingested);
                allIngestedDocs.push(ingested);
              }
            }
          } catch (dirErr) {
            console.warn(`[RAG Orchestrator] Note on files directory ${dir}:`, dirErr.message);
          }
        }
      }

      // 2. Section-Aware Chunking with metadata header prepending
      const allChunks = chunkDocumentsBatch(allIngestedDocs, {
        maxChunkTokens: 500,
        overlapRatio: 0.12
      });

      // 3. Embedded Vector Store Indexing (FTS5 + Dense Embeddings)
      await this.vectorStore.indexChunks(allChunks);

      // Compute statistics
      const byType = {};
      for (const c of allChunks) {
        byType[c.sourceType] = (byType[c.sourceType] || 0) + 1;
      }

      this.stats = {
        totalDocuments: this.documents.size,
        totalChunks: allChunks.length,
        byType,
        lastIndexedAt: new Date().toISOString()
      };

      this.isIndexed = true;
      this.lastIndexedAt = new Date();

      console.log(`[RAG Orchestrator] Successfully indexed ${allChunks.length} chunks across ${this.documents.size} documents into Hybrid Store.`);
      return { success: true, stats: this.stats };

    } catch (err) {
      console.error('[RAG Orchestrator] Indexing failed:', err);
      return { success: false, error: err.message };
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * Deduplicates retrieved chunks that share the same document section or high text overlap
   * @param {import('./types').ScoredSearchResult[]} results 
   * @returns {import('./types').ScoredSearchResult[]}
   */
  deduplicateChunks(results) {
    const seenSections = new Set();
    const deduplicated = [];

    for (const item of results) {
      const c = item.chunk;
      const key = `${c.docId}_${c.section}`;
      if (seenSections.has(key)) {
        continue;
      }
      seenSections.add(key);
      deduplicated.push(item);
    }

    return deduplicated;
  }

  /**
   * Main RAG retrieval & context compilation pipeline.
   * Generates budget-aware context, structured citation references,
   * zero-training guarantee metadata, and academic integrity guidance.
   * @param {import('./types').RetrievalQueryParams} params 
   */
  async buildAugmentedContext(params = {}) {
    const {
      query = '',
      scope = 'global',
      courseId = 'all',
      activeFilePath = null,
      activeDocTitle = null,
      modelType = 'local',
      topK = null,
      budgetLimit = null
    } = params;

    const isCloud = modelType === 'cloud';
    // Local GGUF models need tight budget (~3,800 chars) to prevent context shift. Cloud can handle ~35,000 chars.
    const effectiveBudget = budgetLimit || (isCloud ? 35000 : 3800);
    const effectiveTopK = topK || (isCloud ? 8 : 4);

    // Retrieve from Hybrid Vector Store
    const rawResults = await this.vectorStore.searchHybrid({
      query,
      scope,
      courseId,
      activeFilePath,
      activeDocTitle,
      topK: effectiveTopK * 2, // overfetch before dedup
      modelType
    });

    const deduplicated = this.deduplicateChunks(rawResults).slice(0, effectiveTopK);

    // Build Formatted RAG Prompt Context Block
    let contextHeader = `=== RETRIEVED COURSE KNOWLEDGE (ATELIER LOCAL RAG) ===\n`;
    contextHeader += `Query: "${query}"\n`;
    contextHeader += `Scope: ${scope.toUpperCase()}${courseId !== 'all' ? ` (Course ID: ${courseId})` : ''}${activeDocTitle ? ` (Active: ${activeDocTitle})` : ''}\n`;
    contextHeader += `The following verified excerpts were retrieved strictly from your local course files:\n\n`;

    let contextBody = '';
    const retrievedSources = [];
    let currentChars = contextHeader.length;

    for (let i = 0; i < deduplicated.length; i++) {
      const item = deduplicated[i];
      const c = item.chunk;
      const sourceNum = i + 1;

      // Format citation string: [Source: <Doc Title>, p. <Page#>] or [Source: <Doc Title>, <Section>]
      const citationTag = c.pageNumber
        ? `[Source: ${c.documentTitle}, p. ${c.pageNumber}]`
        : `[Source: ${c.documentTitle}, ${c.section}]`;

      const titleLine = `[Source ${sourceNum}: ${c.courseCode ? c.courseCode + ' · ' : ''}${c.documentTitle} | ${c.section}]`;
      const metaLine = `Type: ${c.sourceType.toUpperCase()} | Course: ${c.courseName} | Match Confidence: ${item.relevancePercent}%`;
      const content = c.text;

      const passage = `${titleLine}\n${metaLine}\n${content}\n\n`;

      if (currentChars + passage.length > effectiveBudget) {
        // Truncate to fit remaining budget
        const remaining = effectiveBudget - currentChars - (titleLine.length + metaLine.length + 30);
        if (remaining > 180) {
          contextBody += `${titleLine}\n${metaLine}\n${content.slice(0, remaining)}...\n\n`;
          retrievedSources.push({
            sourceNumber: sourceNum,
            id: c.id,
            docId: c.docId,
            title: c.documentTitle,
            section: c.section,
            pageNumber: c.pageNumber,
            sourceType: c.sourceType,
            courseId: c.courseId,
            courseName: c.courseName,
            courseCode: c.courseCode,
            relevancePercent: item.relevancePercent,
            localPath: c.localPath,
            citationTag,
            snippet: content.slice(0, 240) + '...'
          });
        }
        break;
      }

      contextBody += passage;
      currentChars += passage.length;

      retrievedSources.push({
        sourceNumber: sourceNum,
        id: c.id,
        docId: c.docId,
        title: c.documentTitle,
        section: c.section,
        pageNumber: c.pageNumber,
        sourceType: c.sourceType,
        courseId: c.courseId,
        courseName: c.courseName,
        courseCode: c.courseCode,
        relevancePercent: item.relevancePercent,
        localPath: c.localPath,
        citationTag,
        snippet: content.slice(0, 240) + (content.length > 240 ? '...' : '')
      });
    }

    if (!contextBody) {
      contextBody = `No specific document chunks directly matched the query tokens. Ground answers in general syllabus overview.\n\n`;
    }

    return {
      success: true,
      query,
      scope,
      courseId,
      retrievedCount: retrievedSources.length,
      retrievedSources,
      augmentedPromptContext: contextHeader + contextBody,
      compliance: {
        zeroTraining: true,
        localFirst: true,
        academicIntegrityNotice: 'Responses are AI-generated based on local course documents. Comply with your institution\'s academic integrity code.',
        privacyNotice: 'Your coursework files remain stored locally on disk and are never used to train AI models.'
      },
      stats: {
        totalIndexedChunks: this.vectorStore.chunksMap.size,
        totalDocuments: this.documents.size,
        topRelevance: retrievedSources[0]?.relevancePercent || 0
      }
    };
  }

  /**
   * Demo Details Fallback for CS 301
   */
  getDemoCs301Details() {
    return {
      syllabus_body: `CS 301: Distributed Systems & Cloud Infrastructure
Instructor: Dr. Marcus Vance | Office Hours: Mon & Thu 3:30 - 5:00 PM (Room 412)
Course Overview:
This course examines the foundations and design of modern distributed cloud computing platforms.
Key Topics:
1. RPC and Failure Semantics (At-most-once, At-least-once)
2. Clock Synchronization: Physical clock drift and Lamport Logical Clocks (1978)
3. State Machine Replication & Consensus: Paxos and Raft protocols
4. Data Replication, Consistency Models, and CAP Theorem
Grading Scale & Course Weights:
• 3 Programming Projects (Raft Consensus, Distributed KV Store): 40%
• Problem Sets & Quizzes: 20%
• Midterm Exam: 20%
• Final Project / Exam: 20%`,
      announcements: [
        {
          id: 901,
          title: "Midterm Exam Logistics & Practice Problems Released",
          posted_at: "2026-10-10T14:30:00Z",
          message: "Midterm exam is scheduled for next Wednesday. Optional review session will be held Monday evening at 6:00 PM in Room 302 and Zoom. Practice problems are posted in Module 4."
        },
        {
          id: 902,
          title: "Project 2: Raft Leader Election Test Suites Available",
          posted_at: "2026-10-06T09:15:00Z",
          message: "Automated verification harnesses for test cases 2A (Leader Election) and 2B (Log Replication) are available. Please test your network partition handling."
        }
      ],
      modules: [
        {
          id: 1101,
          name: "Module 1: Foundations of Distributed Systems",
          items: [
            {
              id: 201,
              title: "Lecture 1: The Network Fallacies & Clock Synchronization",
              body: "The 8 Fallacies of Distributed Computing: 1. Network is reliable. 2. Latency is zero. 3. Bandwidth is infinite. 4. Network is secure. 5. Topology does not change. 6. One administrator. 7. Transport cost is zero. 8. Network is homogeneous."
            }
          ]
        },
        {
          id: 1102,
          name: "Module 2: Consensus & Replicated State Machines",
          items: [
            {
              id: 205,
              title: "Lecture 3: The Raft Consensus Algorithm",
              body: "Raft decomposes consensus into three independent sub-problems: Leader Election, Log Replication, and Safety. Heartbeats are broadcast periodically by the leader to prevent candidate election timeouts."
            }
          ]
        }
      ],
      assignments: [
        {
          id: 501,
          name: "Assignment 1: Distributed RPC Key-Value Store",
          due_at: "2026-10-15T23:59:00Z",
          points_possible: 100,
          description: "Implement a thread-safe distributed key-value store using Python sockets and JSON-RPC. Handle packet loss and server failure with exponential backoff retries.",
          rubric: [
            { description: "RPC serialization and network reliability", points: 40 },
            { description: "Thread safety and concurrency handling", points: 30 },
            { description: "Unit tests and performance benchmarks", points: 30 }
          ]
        },
        {
          id: 502,
          name: "Assignment 2: Raft Consensus Protocol Implementation",
          due_at: "2026-10-30T23:59:00Z",
          points_possible: 150,
          description: "Implement the Raft consensus algorithm based on the Ongaro & Ousterhout paper. Pass automated network partition tests and election split-vote tests.",
          rubric: [
            { description: "Test 2A: Leader election and heartbeat reliability", points: 50 },
            { description: "Test 2B: Log entry replication across majority quorum", points: 50 },
            { description: "Test 2C: Partition recovery and state machine persistence", points: 50 }
          ]
        }
      ]
    };
  }

  /**
   * Returns current RAG system status
   */
  getStatus() {
    return {
      isIndexed: this.isIndexed,
      isIndexing: this.isIndexing,
      lastIndexedAt: this.lastIndexedAt,
      totalChunks: this.vectorStore.chunksMap.size,
      totalDocuments: this.documents.size,
      stats: this.stats
    };
  }
}

module.exports = {
  RAGOrchestrator
};
