/* ==========================================================================
   Centralized Global Content Search
   ========================================================================== */

let globalSearchDebounceTimer = null;

function populateGlobalSearchCourses(coursesList = appState.courses) {
  renderSearchPageCourseChips();
  updateGlobalSearchPlaceholder();
}

function updateGlobalSearchPlaceholder() {
  const filter = appState.globalSearchCourseFilter;
  let scopeLabel = 'all content';

  if (filter && filter !== 'all') {
    const course = (appState.courses || []).find(c => String(c.id) === String(filter));
    const title = course?.name || course?.course_code || 'Course';
    scopeLabel = `in ${title}`;
  }

  if (globalSearchInput) {
    globalSearchInput.placeholder = filter && filter !== 'all' ? `Search ${scopeLabel}` : 'Search all content';
  }
  if (topSearchPlaceholder) {
    topSearchPlaceholder.textContent = 'Search...';
  }
}

function syncGlobalSearchCourse(courseId) {
  const targetVal = courseId ? String(courseId) : 'all';
  appState.globalSearchCourseFilter = targetVal;
  updateGlobalSearchPlaceholder();
  renderSearchPageCourseChips();
}

function renderSearchPageCourseChips() {
  if (!searchPageCourseChips) return;
  searchPageCourseChips.innerHTML = '';
  const currentFilter = appState.globalSearchCourseFilter || 'all';

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = `search-course-chip ${currentFilter === 'all' ? 'active' : ''}`;
  allChip.textContent = 'All Courses';
  allChip.addEventListener('click', () => {
    appState.globalSearchCourseFilter = 'all';
    updateGlobalSearchPlaceholder();
    renderSearchPageCourseChips();
    executeGlobalSearch();
    globalSearchInput?.focus();
  });
  searchPageCourseChips.appendChild(allChip);

  (appState.courses || []).forEach(c => {
    const chip = document.createElement('button');
    chip.type = 'button';
    const isAct = String(c.id) === String(currentFilter);
    chip.className = `search-course-chip ${isAct ? 'active' : ''}`;
    // Display only the course title (name), not id or course code
    const courseTitle = c.name || c.course_code || 'Untitled Course';
    chip.textContent = courseTitle;
    chip.title = courseTitle;
    chip.addEventListener('click', () => {
      // Toggle if already selected, or select course
      appState.globalSearchCourseFilter = String(c.id);
      updateGlobalSearchPlaceholder();
      renderSearchPageCourseChips();
      executeGlobalSearch();
      globalSearchInput?.focus();
    });
    searchPageCourseChips.appendChild(chip);
  });
}

function getFileCacheKey(file, courseId) {
  if (!file) return '';
  return `${courseId || 'general'}_${file.id || file.url || file.filename || file.display_name || ''}`;
}

function extractTextFromFileObject(file) {
  if (!file) return '';
  const parts = [];

  if (typeof file.code_content === 'string' && file.code_content.trim()) {
    parts.push(file.code_content);
  }
  if (typeof file.text_content === 'string' && file.text_content.trim()) {
    parts.push(file.text_content);
  }
  if (typeof file.body === 'string' && file.body.trim()) {
    parts.push(stripHtml(file.body));
  }
  if (file.document_content) {
    if (typeof file.document_content === 'string') {
      parts.push(file.document_content);
    } else if (typeof file.document_content === 'object') {
      const doc = file.document_content;
      if (doc.title) parts.push(doc.title);
      if (doc.subtitle) parts.push(doc.subtitle);
      if (Array.isArray(doc.sections)) {
        for (const sec of doc.sections) {
          if (sec.heading) parts.push(sec.heading);
          if (sec.body) parts.push(sec.body);
          if (sec.callout) parts.push(sec.callout);
          if (Array.isArray(sec.table)) {
            for (const row of sec.table) {
              if (row && typeof row === 'object') {
                parts.push(Object.values(row).join(' '));
              }
            }
          }
        }
      }
    }
  }

  return parts.join('\n');
}

async function extractTextFromPdfBytes(bytes) {
  try {
    let pdfjs = window.pdfjsLib;
    if (!pdfjs) {
      try {
        pdfjs = await import('../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs';
        window.pdfjsLib = pdfjs;
      } catch (err) {
        return '';
      }
    }
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      disableFontFace: true,
      isEvalSupported: false,
      stopAtErrors: false
    });
    const pdfDoc = await loadingTask.promise;
    let fullText = '';
    const maxPages = Math.min(pdfDoc.numPages, 25);
    for (let p = 1; p <= maxPages; p++) {
      try {
        const page = await pdfDoc.getPage(p);
        const textContent = await page.getTextContent({ disableCombineTextItems: true });
        const pageText = textContent.items.map(it => it.str).join(' ');
        fullText += ' ' + pageText;
        try { page.cleanup(); } catch { }
      } catch { }
    }
    try { await pdfDoc.destroy(); } catch { }
    return fullText.trim();
  } catch (err) {
    console.warn('PDF text extraction error:', err);
    return '';
  }
}

async function loadAndCacheFileText(file, course) {
  if (!file) return '';
  const cId = course?.id || 'general';
  const fKey = getFileCacheKey(file, cId);
  if (appState.fileTextCache[fKey]) {
    return appState.fileTextCache[fKey];
  }

  // 1. In-memory content properties
  const inline = extractTextFromFileObject(file);
  if (inline && inline.trim()) {
    appState.fileTextCache[fKey] = inline;
    return inline;
  }

  const fName = file.display_name || file.filename || '';
  const ext = (fName.split('.').pop() || '').toLowerCase();
  const isPdf = ext === 'pdf';
  const isText = ['txt', 'py', 'js', 'ts', 'json', 'md', 'markdown', 'html', 'css', 'csv', 'c', 'cpp', 'h', 'java', 'sh', 'yml', 'yaml', 'sql', 'xml'].includes(ext);

  // 2. Desktop IPC reading
  if (window.canvasDesktop?.readFileText) {
    try {
      const res = await window.canvasDesktop.readFileText({
        filePath: file.local_path,
        courseId: cId,
        filename: fName
      });
      if (res?.success) {
        if (res.type === 'text' && res.text) {
          appState.fileTextCache[fKey] = res.text;
          return res.text;
        } else if (res.type === 'pdf' && res.localPath && window.canvasDesktop?.readFileBytes) {
          const byteRes = await window.canvasDesktop.readFileBytes(res.localPath);
          if (byteRes?.success && byteRes.data) {
            const pdfText = await extractTextFromPdfBytes(new Uint8Array(byteRes.data));
            if (pdfText) {
              appState.fileTextCache[fKey] = pdfText;
              return pdfText;
            }
          }
        }
      }
    } catch { }
  }

  // 3. Relative asset URL fetch
  if (file.url && file.url.startsWith('.')) {
    try {
      if (isText) {
        const resp = await fetch(file.url);
        if (resp.ok) {
          const text = await resp.text();
          appState.fileTextCache[fKey] = text;
          return text;
        }
      } else if (isPdf) {
        const resp = await fetch(file.url);
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          const pdfText = await extractTextFromPdfBytes(new Uint8Array(buf));
          if (pdfText) {
            appState.fileTextCache[fKey] = pdfText;
            return pdfText;
          }
        }
      }
    } catch { }
  }

  return '';
}

let isIndexingFilesQueue = false;

async function indexAllAvailableFilesForSearch() {
  if (isIndexingFilesQueue) return;
  isIndexingFilesQueue = true;

  try {
    const queue = [];
    const coursesList = appState.courses || [];
    for (const course of coursesList) {
      const details = appState.courseDetailsCache[course.id] ||
        (String(course.id).startsWith('4820') || appState.isDemo ? DEMO_COURSE_DETAILS : null);
      if (!details) continue;

      if (Array.isArray(details.files)) {
        for (const f of details.files) {
          const fKey = getFileCacheKey(f, course.id);
          if (appState.fileTextCache[fKey]) continue;

          const inlineText = extractTextFromFileObject(f);
          if (inlineText) {
            appState.fileTextCache[fKey] = inlineText;
          } else {
            queue.push({ item: f, course });
          }
        }
      }

      if (Array.isArray(details.modules)) {
        for (const m of details.modules) {
          for (const it of (m.items || [])) {
            if (it.type?.toLowerCase() === 'file' || it.file_name) {
              const fKey = getFileCacheKey(it, course.id);
              if (appState.fileTextCache[fKey]) continue;

              const inlineText = extractTextFromFileObject(it);
              if (inlineText) {
                appState.fileTextCache[fKey] = inlineText;
              } else {
                queue.push({ item: it, course });
              }
            }
          }
        }
      }
    }

    if (queue.length === 0) return;

    // Process files with bounded concurrency (2 at a time) to prevent worker OOM
    const concurrency = 2;
    let idx = 0;
    const worker = async () => {
      while (idx < queue.length) {
        const cur = queue[idx++];
        try {
          await loadAndCacheFileText(cur.item, cur.course);
        } catch { }
      }
    };

    const workers = [];
    for (let w = 0; w < Math.min(concurrency, queue.length); w++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    if (globalSearchInput?.value?.trim()) {
      executeGlobalSearch();
    }
  } finally {
    isIndexingFilesQueue = false;
  }
}

let isRefreshingAllDetails = false;

async function refreshAllCourseDetailsLive(forceLive = true) {
  if (isRefreshingAllDetails) return;
  const coursesList = appState.courses || [];
  if (!coursesList || coursesList.length === 0) return;

  const isOnline = Boolean(navigator.onLine && !appState.isOffline);
  if (!isOnline && forceLive) return;

  const domain = appState.currentDomain || localStorage.getItem(STORAGE_KEYS.DOMAIN) || '';
  const token = appState.currentToken || localStorage.getItem(STORAGE_KEYS.TOKEN) || '';
  if (!token && !appState.isDemo) return;

  isRefreshingAllDetails = true;
  try {
    const fetchPromises = coursesList.map(async (course) => {
      if (appState.isDemo || String(course.id).startsWith('4820')) {
        appState.courseDetailsCache[course.id] = DEMO_COURSE_DETAILS;
        return;
      }
      if (window.canvasDesktop?.getCourseDetails) {
        try {
          const res = await window.canvasDesktop.getCourseDetails({
            domain,
            token,
            courseId: course.id,
            preferCache: !forceLive
          });
          if (res && res.success && res.data) {
            appState.courseDetailsCache[course.id] = res.data;
            const activeTab = typeof getActiveTab === 'function' ? getActiveTab() : null;
            if (activeTab && activeTab.type === 'course' && String(activeTab.course?.id) === String(course.id)) {
              activeTab.courseDetails = res.data;
              if (appState.activeCourse?.id === course.id && typeof renderCourseViewWithDetails === 'function') {
                appState.courseDetails = res.data;
                renderCourseViewWithDetails(course, res.data);
              }
            }
          }
        } catch (err) {
          console.warn(`refreshAllCourseDetailsLive error for course ${course.id}:`, err);
        }
      }
    });

    await Promise.allSettled(fetchPromises);
    if (typeof indexAllAvailableFilesForSearch === 'function') {
      indexAllAvailableFilesForSearch();
    }
    if (appState.activeView === 'home' && typeof renderHomeDashboardWidgets === 'function') {
      renderHomeDashboardWidgets();
    } else if (appState.activeView === 'assignments' && typeof renderDedicatedAssignmentsPage === 'function') {
      renderDedicatedAssignmentsPage();
    } else if (appState.activeView === 'announcements' && typeof renderDedicatedAnnouncementsPage === 'function') {
      renderDedicatedAnnouncementsPage();
    }
  } finally {
    isRefreshingAllDetails = false;
  }
}
window.refreshAllCourseDetailsLive = refreshAllCourseDetailsLive;

async function preloadAllCourseDetailsForSearch(coursesList = appState.courses) {
  if (!coursesList || coursesList.length === 0) return;

  const fetchPromises = coursesList.map(async (course) => {
    if (appState.courseDetailsCache[course.id]) return;

    if (appState.isDemo || String(course.id).startsWith('4820')) {
      appState.courseDetailsCache[course.id] = DEMO_COURSE_DETAILS;
      if (appState.activeView === 'home') renderHomeDashboardWidgets();
      return;
    }

    if (window.canvasDesktop?.getCourseDetails) {
      try {
        const res = await window.canvasDesktop.getCourseDetails({
          domain: appState.currentDomain || localStorage.getItem(STORAGE_KEYS.DOMAIN) || '',
          token: appState.currentToken || localStorage.getItem(STORAGE_KEYS.TOKEN) || '',
          courseId: course.id,
          preferCache: true
        });
        if (res && res.success && res.data) {
          appState.courseDetailsCache[course.id] = res.data;
          if (appState.activeView === 'home') {
            renderHomeDashboardWidgets();
          }
        }
      } catch { }
    }
  });

  await Promise.allSettled(fetchPromises);
  indexAllAvailableFilesForSearch();
  if (appState.activeView === 'home') {
    renderHomeDashboardWidgets();
  }
}

function openGlobalSearch() {
  if (typeof isUserAuthenticated === 'function' && !isUserAuthenticated()) return;
  if (appState.activeView === 'auth') return;
  if (!searchPageOverlay) return;

  searchPageOverlay.classList.remove('hidden', 'closing');
  void searchPageOverlay.offsetWidth;
  searchPageOverlay.classList.add('open');

  renderSearchPageCourseChips();
  updateGlobalSearchPlaceholder();

  if (globalSearchInput) {
    globalSearchInput.focus();
    globalSearchInput.select();
  }

  indexAllAvailableFilesForSearch();
  executeGlobalSearch();
}

function closeGlobalSearch() {
  if (!searchPageOverlay || searchPageOverlay.classList.contains('hidden')) return;

  searchPageOverlay.classList.remove('open');
  searchPageOverlay.classList.add('closing');

  appState.globalSearchHighlightedIndex = -1;
  const items = globalSearchResultsList?.querySelectorAll('.global-search-item');
  if (items) items.forEach(it => it.classList.remove('highlighted'));

  setTimeout(() => {
    if (searchPageOverlay.classList.contains('closing')) {
      searchPageOverlay.classList.remove('closing');
      searchPageOverlay.classList.add('hidden');
    }
  }, 220);
}

function toggleGlobalSearch() {
  if (typeof isUserAuthenticated === 'function' && !isUserAuthenticated()) return;
  if (appState.activeView === 'auth') return;
  if (searchPageOverlay && searchPageOverlay.classList.contains('open')) {
    closeGlobalSearch();
  } else {
    openGlobalSearch();
  }
}

function focusGlobalSearch() {
  if (typeof isUserAuthenticated === 'function' && !isUserAuthenticated()) return;
  if (appState.activeView === 'auth') return;
  openGlobalSearch();
}

function debounceGlobalSearch() {
  clearTimeout(globalSearchDebounceTimer);
  globalSearchDebounceTimer = setTimeout(() => {
    executeGlobalSearch();
  }, 120);
}

function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
}

function highlightSearchMatch(text, query) {
  if (!text) return '';
  const escapedText = escapeHtml(text);
  if (!query) return escapedText;
  const qClean = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!qClean) return escapedText;
  const regex = new RegExp(`(${qClean})`, 'gi');
  return escapedText.replace(regex, '<mark>$1</mark>');
}

function getSnippetAroundMatch(text, query, maxLen = 80) {
  if (!text) return '';
  const clean = stripHtml(text);
  if (!query) return clean.slice(0, maxLen);
  const idx = clean.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return clean.slice(0, maxLen);
  const start = Math.max(0, idx - 25);
  const end = Math.min(clean.length, idx + query.length + maxLen - 25);
  return (start > 0 ? '…' : '') + clean.slice(start, end) + (end < clean.length ? '…' : '');
}

function executeGlobalSearch() {
  if (!globalSearchResultsList || !globalSearchResultsPanel) return;

  const rawQuery = (globalSearchInput?.value || '').trim();
  const q = rawQuery.toLowerCase();

  if (globalSearchClearBtn) {
    globalSearchClearBtn.classList.toggle('hidden', rawQuery.length === 0);
  }

  const selectedCourseId = globalSearchCourseSelect?.value || appState.globalSearchCourseFilter || 'all';
  const typeFilter = appState.globalSearchTypeFilter || 'all';

  const coursesToSearch = (selectedCourseId === 'all')
    ? (appState.courses || [])
    : (appState.courses || []).filter(c => String(c.id) === String(selectedCourseId));

  if (!q) {
    if (globalSearchResultsCount) {
      const scopeLabel = selectedCourseId === 'all' ? 'All Courses' : (coursesToSearch[0]?.course_code || 'selected course');
      globalSearchResultsCount.textContent = `Searching in ${scopeLabel}`;
    }
    renderGlobalSearchPrompt(selectedCourseId, coursesToSearch[0]);
    return;
  }

  const results = [];

  for (const course of coursesToSearch) {
    const details = appState.courseDetailsCache[course.id] ||
      (appState.activeCourse?.id === course.id ? appState.courseDetails : null) ||
      (appState.isDemo || String(course.id).startsWith('4820') ? DEMO_COURSE_DETAILS : null);

    // 1. Match Course Title or Code
    const courseTitle = course.name || '';
    const courseCode = course.course_code || '';
    if (courseTitle.toLowerCase().includes(q) || courseCode.toLowerCase().includes(q)) {
      results.push({
        type: 'course',
        title: courseTitle,
        subtitle: courseCode ? `${courseCode} • Enrolled Course` : 'Course Dashboard',
        course,
        raw: course,
        priority: courseTitle.toLowerCase().startsWith(q) || courseCode.toLowerCase().startsWith(q) ? 1 : 2
      });
    }

    if (!details) continue;

    // 2. Announcements
    if (Array.isArray(details.announcements)) {
      for (const ann of details.announcements) {
        const title = ann.title || '';
        const msg = ann.message || '';
        const author = ann.user_name || ann.author?.display_name || '';

        const titleMatch = title.toLowerCase().includes(q);
        const msgMatch = msg.toLowerCase().includes(q);
        const authorMatch = author.toLowerCase().includes(q);

        if (titleMatch || msgMatch || authorMatch) {
          const dateStr = ann.posted_at ? new Date(ann.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
          const snippet = msgMatch ? getSnippetAroundMatch(msg, q, 70) : (stripHtml(msg).slice(0, 70) || (author ? `By ${author}` : ''));
          results.push({
            type: 'announcement',
            title,
            subtitle: `${dateStr ? `${dateStr} • ` : ''}${snippet}`,
            course,
            raw: ann,
            priority: titleMatch ? 1 : 3
          });
        }
      }
    }

    // 3. Modules & Learning Items
    if (Array.isArray(details.modules)) {
      for (const mod of details.modules) {
        const modName = mod.name || '';
        if (modName.toLowerCase().includes(q)) {
          results.push({
            type: 'module',
            title: modName,
            subtitle: `Learning Module • ${(mod.items || []).length} items`,
            course,
            raw: mod,
            priority: modName.toLowerCase().startsWith(q) ? 1 : 2
          });
        }

        for (const it of (mod.items || [])) {
          const itemType = (it.type || '').toLowerCase();
          const itTitle = it.title || '';
          const body = it.body || '';

          const isFile = itemType === 'file' || Boolean(it.file_name);
          let fileText = '';
          if (isFile) {
            const fKey = getFileCacheKey(it, course.id);
            fileText = appState.fileTextCache[fKey] || extractTextFromFileObject(it);
            if (!fileText && it.content_id && Array.isArray(details.files)) {
              const linkedFile = details.files.find(f => f.id === it.content_id);
              if (linkedFile) {
                fileText = appState.fileTextCache[getFileCacheKey(linkedFile, course.id)] || extractTextFromFileObject(linkedFile);
              }
            }
          }

          const titleMatch = itTitle.toLowerCase().includes(q);
          const bodyMatch = body.toLowerCase().includes(q);
          const contentMatch = Boolean(fileText && fileText.toLowerCase().includes(q));

          if (titleMatch || bodyMatch || contentMatch) {
            const isPage = itemType === 'page';
            const resType = isPage ? 'page' : (isFile ? 'file' : 'module');
            let snippet = '';
            if (contentMatch) {
              snippet = `Found in file: "${getSnippetAroundMatch(fileText, q, 65)}"`;
            } else if (bodyMatch) {
              snippet = getSnippetAroundMatch(body, q, 65);
            } else {
              snippet = `In ${modName} • ${it.type || 'Item'}`;
            }

            if (!results.some(r => r.type === 'file' && (r.title === itTitle || (r.raw?.id && (r.raw.id === it.id || r.raw.id === it.content_id))))) {
              results.push({
                type: resType,
                title: itTitle,
                subtitle: snippet,
                course,
                module: mod,
                raw: it,
                contentMatch,
                searchQuery: rawQuery,
                priority: titleMatch ? 1 : 2
              });
            }
          }
        }
      }
    }

    // 4. Course Files (Search by filename, metadata, and full text content)
    if (Array.isArray(details.files)) {
      for (const f of details.files) {
        const fName = f.display_name || f.filename || '';
        const fDesc = f.description || '';
        const fMod = f.module_name || '';
        const fKey = getFileCacheKey(f, course.id);

        let fileText = appState.fileTextCache[fKey];
        if (!fileText) {
          fileText = extractTextFromFileObject(f);
          if (fileText) appState.fileTextCache[fKey] = fileText;
        }

        const nameMatch = fName.toLowerCase().includes(q);
        const descMatch = fDesc.toLowerCase().includes(q);
        const modMatch = fMod.toLowerCase().includes(q);
        const contentMatch = Boolean(fileText && fileText.toLowerCase().includes(q));

        if (nameMatch || descMatch || modMatch || contentMatch) {
          const existingIdx = results.findIndex(r => r.type === 'file' && (r.title === fName || (r.raw?.id && r.raw.id === f.id)));
          const sizeStr = f.size ? formatFileSize(f.size) : 'File';
          let subtitle = '';
          let priority = 3;

          if (contentMatch) {
            const snippet = getSnippetAroundMatch(fileText, q, 65);
            subtitle = `${sizeStr} • Found in file: "${snippet}"`;
            priority = nameMatch ? 1 : 2;
          } else if (nameMatch) {
            priority = fName.toLowerCase().startsWith(q) ? 1 : 2;
            subtitle = fMod ? `${sizeStr} • In ${fMod}` : (fDesc ? fDesc.slice(0, 60) : `${sizeStr} • Document`);
          } else {
            priority = 3;
            subtitle = fMod ? `${sizeStr} • In ${fMod}` : (fDesc ? fDesc.slice(0, 60) : `${sizeStr} • Document`);
          }

          const fileResult = {
            type: 'file',
            title: fName,
            subtitle,
            course,
            raw: f,
            contentMatch,
            searchQuery: rawQuery,
            priority
          };

          if (existingIdx !== -1) {
            if (contentMatch || priority < results[existingIdx].priority) {
              results[existingIdx] = fileResult;
            }
          } else {
            results.push(fileResult);
          }
        }
      }
    }

    // 5. Assignments
    if (Array.isArray(details.assignments)) {
      for (const a of details.assignments) {
        const aTitle = a.name || a.title || '';
        const aDesc = a.description || '';

        const titleMatch = aTitle.toLowerCase().includes(q);
        const descMatch = aDesc.toLowerCase().includes(q);

        if (titleMatch || descMatch) {
          const pts = a.points_possible != null ? `${a.points_possible} pts` : '';
          const dueStr = a.due_at ? `Due ${new Date(a.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '';
          const meta = [pts, dueStr].filter(Boolean).join(' • ') || 'Assignment deliverable';
          results.push({
            type: 'assignment',
            title: aTitle,
            subtitle: meta,
            course,
            raw: a,
            priority: titleMatch ? 1 : 3
          });
        }
      }
    }
  }

  // Filter by Type Chip Filter
  let filteredResults = results;
  if (typeFilter !== 'all') {
    if (typeFilter === 'module') {
      filteredResults = results.filter(r => r.type === 'module' || r.type === 'page');
    } else {
      filteredResults = results.filter(r => r.type === typeFilter);
    }
  }

  // Sort by priority (exact match / title first)
  filteredResults.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.title.localeCompare(b.title);
  });

  if (globalSearchResultsCount) {
    const scopeLabel = selectedCourseId === 'all' ? 'All Courses' : (coursesToSearch[0]?.course_code || 'course');
    globalSearchResultsCount.textContent = `${filteredResults.length} result${filteredResults.length === 1 ? '' : 's'} in ${scopeLabel}`;
  }

  renderGlobalSearchResults(filteredResults, q);
}

function renderGlobalSearchPrompt(selectedCourseId, activeCourseObj) {
  if (!globalSearchResultsList) return;
  const courseName = selectedCourseId === 'all' ? 'all enrolled courses' : (activeCourseObj?.name || 'This Course');
  globalSearchResultsList.innerHTML = `
    <div class="global-search-welcome">
      <div class="search-welcome-icon">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </div>
      <span class="search-welcome-title">Search in ${escapeHtml(courseName)}</span>
      <span class="search-welcome-sub">Type keywords to search announcements, lecture modules, files, and assignments.</span>
    </div>
  `;
}

function renderGlobalSearchResults(results, query) {
  if (!globalSearchResultsList) return;
  globalSearchResultsList.innerHTML = '';
  appState.globalSearchHighlightedIndex = -1;

  if (results.length === 0) {
    globalSearchResultsList.innerHTML = `
      <div class="global-search-empty">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          <line x1="8" y1="11" x2="14" y2="11"></line>
        </svg>
        <span>No matches found for "${escapeHtml(query)}"</span>
        <span style="font-size:11px; opacity:0.8;">Try selecting "All Courses" or adjusting your search term.</span>
      </div>
    `;
    return;
  }

  results.slice(0, 40).forEach((res, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'global-search-item';
    itemEl.setAttribute('data-result-index', index);
    itemEl.setAttribute('role', 'button');
    itemEl.setAttribute('tabindex', '0');

    const courseColor = res.course ? getCourseColor(res.course) : 'var(--color-brand-primary)';
    const courseCode = res.course?.course_code || `Course #${res.course?.id || ''}`;

    let iconBadgeClass = res.type;
    let iconSvg = '';
    if (res.type === 'announcement') {
      iconSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
    } else if (res.type === 'file') {
      iconSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
    } else if (res.type === 'assignment') {
      iconSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>`;
    } else if (res.type === 'page') {
      iconBadgeClass = 'module';
      iconSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
    } else if (res.type === 'course') {
      iconSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;
    } else {
      iconBadgeClass = 'module';
      iconSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`;
    }

    const matchBadge = res.contentMatch
      ? `<span class="search-item-match-badge" title="Matching text found inside file content"><svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>In-File Match</span>`
      : '';

    itemEl.innerHTML = `
      <div class="search-item-icon-badge ${iconBadgeClass}">
        ${iconSvg}
      </div>
      <div class="search-item-info">
        <div class="search-item-title-row">
          <div style="display:flex; align-items:center; gap:6px; min-width:0; overflow:hidden;">
            <span class="search-item-title">${highlightSearchMatch(res.title, query)}</span>
            ${matchBadge}
          </div>
          <span class="search-item-course-tag" style="border-color:${courseColor}44; color:${courseColor}; background:${courseColor}14;">${escapeHtml(courseCode)}</span>
        </div>
        <span class="search-item-meta">${highlightSearchMatch(res.subtitle, query)}</span>
      </div>
    `;

    itemEl.addEventListener('click', () => {
      selectGlobalSearchResult(res, query);
    });

    globalSearchResultsList.appendChild(itemEl);
  });
}

function selectGlobalSearchResult(res, searchQuery = '') {
  closeGlobalSearch();
  if (!res || !res.course) return;

  const targetQuery = searchQuery || res.searchQuery || '';

  if (res.type === 'course') {
    loadCoursePage(res.course);
    return;
  }

  if (res.type === 'file') {
    appState.activeCourse = res.course;
    if (appState.currentView !== 'course' || !coursePage || coursePage.classList.contains('hidden')) {
      loadCoursePage(res.course);
    }
    setTimeout(() => {
      handleModuleItemPreview(res.raw, res.module || null, targetQuery);
    }, 120);
    return;
  }

  if (res.type === 'page' || res.type === 'module-item') {
    createNewTab({
      type: 'module-item',
      course: res.course,
      item: res.raw,
      module: res.module,
      title: `${getCleanCourseTitle(res.course)} - ${res.raw.title || 'Page'}`,
      activate: true
    });
    return;
  }

  if (res.type === 'module') {
    loadCoursePage(res.course);
    switchCourseTab('modules');
    return;
  }

  if (res.type === 'announcement') {
    loadCoursePage(res.course);
    switchCourseTab('announcements');
    setTimeout(() => {
      const cards = announcementsList?.querySelectorAll('.announcement-card');
      if (cards) {
        cards.forEach(card => {
          const titleEl = card.querySelector('.announcement-title');
          if (titleEl && (titleEl.textContent.trim() === (res.title || '').trim() || card.getAttribute('data-announcement-id') === String(res.id))) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.click();
          }
        });
      }
    }, 200);
    return;
  }

  if (res.type === 'assignment') {
    loadCoursePage(res.course);
    switchCourseTab('assignments');
    setTimeout(() => {
      const cards = assignmentsList?.querySelectorAll('.assignment-row-card');
      if (cards) {
        cards.forEach(card => {
          const titleEl = card.querySelector('.assign-title');
          if (titleEl && titleEl.textContent.trim() === (res.title || '').trim()) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.style.outline = '2px solid var(--color-brand-primary)';
            setTimeout(() => { card.style.outline = ''; }, 2000);
          }
        });
      }
      handleAssignmentPreview(res.raw || res);
    }, 200);
    return;
  }
}

function handleGlobalSearchKeydown(e) {
  if (!globalSearchResultsList) return;
  const items = Array.from(globalSearchResultsList.querySelectorAll('.global-search-item'));
  if (items.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    appState.globalSearchHighlightedIndex = (appState.globalSearchHighlightedIndex + 1) % items.length;
    items.forEach((it, i) => it.classList.toggle('highlighted', i === appState.globalSearchHighlightedIndex));
    items[appState.globalSearchHighlightedIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (appState.globalSearchHighlightedIndex <= 0) {
      appState.globalSearchHighlightedIndex = items.length - 1;
    } else {
      appState.globalSearchHighlightedIndex--;
    }
    items.forEach((it, i) => it.classList.toggle('highlighted', i === appState.globalSearchHighlightedIndex));
    items[appState.globalSearchHighlightedIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const targetIdx = appState.globalSearchHighlightedIndex >= 0 ? appState.globalSearchHighlightedIndex : 0;
    if (items[targetIdx]) {
      items[targetIdx].click();
    }
  } else if (e.key === 'Escape') {
    closeGlobalSearch();
    globalSearchInput?.blur();
  }
}

