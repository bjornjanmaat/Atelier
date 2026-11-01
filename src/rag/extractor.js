/**
 * @file extractor.js
 * @description Document Ingestion & Extraction for Node.js Main Process.
 * Extracts plain, structured text from PDFs, Markdown, HTML, and Canvas REST entities.
 * Strictly operates on files already stored locally on user disk (No Canvas MCP server).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let pdfjsLib = null;
function getPdfLib() {
  if (!pdfjsLib) {
    try {
      pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
    } catch (err) {
      console.warn('[RAG Extractor] Warning: Could not load pdfjs-dist:', err.message);
    }
  }
  return pdfjsLib;
}

/**
 * Strips HTML formatting into structured text while preserving headings and lists
 * @param {string} html 
 * @returns {string}
 */
function cleanHtmlText(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n### $1\n')
    .replace(/<\/div>|<\/p>|<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n')
    .replace(/<th[^>]*>(.*?)<\/th>/gi, '$1 | ')
    .replace(/<td[^>]*>(.*?)<\/td>/gi, '$1 | ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

/**
 * Extracts sections from HTML by splitting on major header tags
 * @param {string} html
 * @param {string} defaultSection
 * @returns {Array<{ heading: string, text: string }>}
 */
function parseHtmlSections(html, defaultSection = 'Overview') {
  if (!html || typeof html !== 'string') return [];
  const clean = cleanHtmlText(html);
  if (!clean) return [];

  const parts = clean.split(/\n\n(?=###\s+)/g);
  const sections = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('### ')) {
      const firstLineEnd = trimmed.indexOf('\n');
      if (firstLineEnd !== -1) {
        const heading = trimmed.slice(4, firstLineEnd).trim();
        const text = trimmed.slice(firstLineEnd).trim();
        if (text) sections.push({ heading, text });
      } else {
        sections.push({ heading: trimmed.slice(4).trim(), text: trimmed });
      }
    } else {
      sections.push({ heading: defaultSection, text: trimmed });
    }
  }

  if (sections.length === 0 && clean) {
    sections.push({ heading: defaultSection, text: clean });
  }

  return sections;
}

/**
 * Parses markdown text into header-aware sections
 * @param {string} text 
 * @param {string} defaultSection 
 * @returns {Array<{ heading: string, text: string }>}
 */
function parseMarkdownSections(text, defaultSection = 'Document') {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split('\n');
  const sections = [];
  let currentHeading = defaultSection;
  let currentLines = [];

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headerMatch) {
      if (currentLines.length > 0) {
        const body = currentLines.join('\n').trim();
        if (body) {
          sections.push({ heading: currentHeading, text: body });
        }
        currentLines = [];
      }
      currentHeading = headerMatch[2].trim();
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    const body = currentLines.join('\n').trim();
    if (body) {
      sections.push({ heading: currentHeading, text: body });
    }
  }

  if (sections.length === 0 && text.trim()) {
    sections.push({ heading: defaultSection, text: text.trim() });
  }

  return sections;
}

/**
 * Extracts page-by-page text from PDF documents using pdfjs-dist
 * Preserves exact page numbers for academic citations
 * @param {string} filePath 
 * @param {number} maxPages 
 * @returns {Promise<Array<{ pageNumber: number, heading: string, text: string }>>}
 */
async function extractPdfPages(filePath, maxPages = 40) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const lib = getPdfLib();
  if (!lib) {
    console.warn('[RAG Extractor] pdfjs-dist unavailable, skipping PDF:', filePath);
    return [];
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0 || stat.size > 80 * 1024 * 1024) return [];

    const data = new Uint8Array(fs.readFileSync(filePath));
    let doc = null;
    try {
      const standardFontDataUrl = path.join(__dirname, '..', '..', 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/';
      doc = await lib.getDocument({
        data,
        isEvalSupported: false,
        disableFontFace: true,
        stopAtErrors: false,
        standardFontDataUrl
      }).promise;

      const numPages = Math.min(doc.numPages, maxPages);
      const pages = [];

      for (let p = 1; p <= numPages; p++) {
        try {
          const page = await doc.getPage(p);
          const content = await page.getTextContent({ disableCombineTextItems: true });
          const textItems = content.items
            .map(item => (typeof item.str === 'string' ? item.str.trim() : ''))
            .filter(Boolean);

          if (textItems.length > 0) {
            // First non-empty item often contains slide/section title
            const potentialHeading = textItems[0].length <= 80 ? textItems[0] : `Page ${p}`;
            const fullPageText = textItems.join(' ').replace(/\s+/g, ' ').trim();

            if (fullPageText.length > 15) {
              pages.push({
                pageNumber: p,
                heading: `p. ${p} - ${potentialHeading}`,
                text: fullPageText
              });
            }
          }
          try { page.cleanup(); } catch { }
        } catch (pageErr) {
          console.warn(`[RAG Extractor] Error on page ${p} of ${path.basename(filePath)}:`, pageErr.message);
        }
      }

      return pages;
    } finally {
      if (doc) {
        try { await doc.destroy(); } catch { }
      }
    }
  } catch (err) {
    console.warn(`[RAG Extractor] Failed to read PDF ${path.basename(filePath)}:`, err.message);
    return [];
  }
}

/**
 * Ingests a local file (PDF, Markdown, Source Code, Plain Text) into structured IngestedDocument
 * @param {string} filePath 
 * @param {Object} meta 
 * @returns {Promise<import('./types').IngestedDocument | null>}
 */
async function ingestLocalFile(filePath, meta = {}) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const ext = path.extname(filePath).toLowerCase();
  const filename = path.basename(filePath);
  const docId = `doc_${crypto.createHash('md5').update(filePath).digest('hex').slice(0, 12)}`;

  const baseDoc = {
    docId,
    courseId: String(meta.courseId || 'general'),
    courseName: meta.courseName || 'Enrolled Course',
    courseCode: meta.courseCode || 'ACAD',
    title: filename,
    localPath: filePath,
    sections: [],
    totalChars: 0
  };

  // 1. PDF File Extraction
  if (ext === '.pdf') {
    const pages = await extractPdfPages(filePath, meta.maxPages || 40);
    if (pages.length === 0) return null;

    baseDoc.sourceType = 'lecture_slide';
    baseDoc.sections = pages.map(pg => ({
      heading: pg.heading,
      pageNumber: pg.pageNumber,
      text: pg.text,
      metadata: { pageNumber: pg.pageNumber }
    }));
    baseDoc.totalChars = baseDoc.sections.reduce((acc, s) => acc + s.text.length, 0);
    return baseDoc;
  }

  // 2. Markdown / Plain Text
  if (['.md', '.markdown', '.txt'].includes(ext)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      baseDoc.sourceType = 'reading';
      baseDoc.sections = parseMarkdownSections(raw, filename);
      baseDoc.totalChars = raw.length;
      return baseDoc;
    } catch {
      return null;
    }
  }

  // 3. Source Code files
  if (['.py', '.js', '.ts', '.html', '.css', '.json', '.sql', '.sh', '.r'].includes(ext)) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > 2 * 1024 * 1024) return null; // 2MB max for code
      const raw = fs.readFileSync(filePath, 'utf8');
      baseDoc.sourceType = 'code';
      baseDoc.sections = [{
        heading: `File: ${filename}`,
        text: raw
      }];
      baseDoc.totalChars = raw.length;
      return baseDoc;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Normalizes Canvas Course Details into high-fidelity structured documents
 * Extracts Syllabi, Assignments, Rubrics, Modules, Pages, and Announcements
 * @param {string} courseId 
 * @param {Object} courseMeta 
 * @param {Object} details 
 * @returns {Array<import('./types').IngestedDocument>}
 */
function ingestCanvasCourseDetails(courseId, courseMeta = {}, details = {}) {
  const cId = String(courseId);
  const cName = courseMeta.name || `Course ${cId}`;
  const cCode = courseMeta.course_code || 'COURSE';
  const docs = [];

  if (!details) return docs;

  // A. Syllabus Document
  const syllabusBody = details.syllabus_body || courseMeta.syllabus_body;
  if (syllabusBody && typeof syllabusBody === 'string' && syllabusBody.trim().length > 20) {
    const sDocId = `syl_${cId}`;
    const sections = parseHtmlSections(syllabusBody, 'Course Policies & Overview');
    docs.push({
      docId: sDocId,
      courseId: cId,
      courseName: cName,
      courseCode: cCode,
      sourceType: 'syllabus',
      title: `${cCode} Syllabus`,
      sections,
      totalChars: sections.reduce((acc, s) => acc + s.text.length, 0)
    });
  }

  // B. Assignment Briefs & Rubrics
  const assignments = Array.isArray(details.assignments) ? details.assignments : [];
  for (const asg of assignments) {
    if (!asg || (!asg.name && !asg.description)) continue;
    const asgId = `asg_${cId}_${asg.id || asg.name}`;
    const dueStr = asg.due_at ? `Due: ${asg.due_at.split('T')[0]}` : 'No due date';
    const ptsStr = asg.points_possible != null ? `${asg.points_possible} pts` : '';
    const asgTitle = asg.name || 'Assignment Brief';

    const sections = [];

    // Description / Brief
    if (asg.description) {
      const descSections = parseHtmlSections(asg.description, `${asgTitle} (${dueStr}${ptsStr ? ' · ' + ptsStr : ''})`);
      sections.push(...descSections);
    } else {
      sections.push({
        heading: `${asgTitle} Specifications`,
        text: `Assignment: ${asgTitle}\nDeadline: ${dueStr}\nPoints: ${ptsStr || 'Unspecified'}`
      });
    }

    // Rubric Criteria Section
    if (Array.isArray(asg.rubric) && asg.rubric.length > 0) {
      const rubricText = asg.rubric.map((r, i) => {
        const critDesc = r.description || `Criterion ${i + 1}`;
        const pts = r.points != null ? `${r.points} pts` : '';
        const longDesc = r.long_description ? ` - ${cleanHtmlText(r.long_description)}` : '';
        return `• ${critDesc} (${pts})${longDesc}`;
      }).join('\n');

      sections.push({
        heading: 'Grading Rubric Criteria',
        text: `Official Grading Rubric:\n${rubricText}`,
        metadata: { isRubric: true }
      });
    }

    docs.push({
      docId: asgId,
      courseId: cId,
      courseName: cName,
      courseCode: cCode,
      sourceType: 'assignment_brief',
      title: asgTitle,
      sections,
      totalChars: sections.reduce((acc, s) => acc + s.text.length, 0)
    });
  }

  // C. Announcements
  const announcements = Array.isArray(details.announcements) ? details.announcements : [];
  for (const ann of announcements) {
    if (!ann || (!ann.title && !ann.message)) continue;
    const annId = `ann_${cId}_${ann.id || ann.title}`;
    const postDate = ann.posted_at ? ann.posted_at.split('T')[0] : 'Recent';
    const cleanMsg = cleanHtmlText(ann.message || '');
    if (!cleanMsg) continue;

    docs.push({
      docId: annId,
      courseId: cId,
      courseName: cName,
      courseCode: cCode,
      sourceType: 'announcement',
      title: ann.title || 'Announcement',
      sections: [{
        heading: `Posted on ${postDate}`,
        text: cleanMsg
      }],
      totalChars: cleanMsg.length
    });
  }

  // D. Modules & Pages
  const modules = Array.isArray(details.modules) ? details.modules : [];
  for (const mod of modules) {
    const modItems = Array.isArray(mod.items) ? mod.items : [];
    for (const item of modItems) {
      if (item && item.body) {
        const cleanBody = cleanHtmlText(item.body);
        if (cleanBody && cleanBody.length > 15) {
          const pDocId = `page_${cId}_${item.id || item.title}`;
          const sections = parseHtmlSections(item.body, `Module: ${mod.name || 'Course Content'}`);
          docs.push({
            docId: pDocId,
            courseId: cId,
            courseName: cName,
            courseCode: cCode,
            sourceType: 'page',
            title: item.title || 'Lesson Page',
            sections,
            totalChars: cleanBody.length
          });
        }
      }
    }
  }

  return docs;
}

module.exports = {
  cleanHtmlText,
  parseHtmlSections,
  parseMarkdownSections,
  extractPdfPages,
  ingestLocalFile,
  ingestCanvasCourseDetails
};
