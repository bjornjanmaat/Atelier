/* ==========================================================================
   Notes & Study Journal Module
   ========================================================================== */

let activeNote = null;
let notesSaveDebounceTimer = null;
let currentSelectionRange = null;

// Calendar Session Modal State
let sessionCalCurrentYear = new Date().getFullYear();
let sessionCalCurrentMonth = new Date().getMonth();
let sessionCalSelectedDate = new Date();
let sessionCalSearchQuery = '';

/**
 * Initialize Notes Module
 */
function initNotes() {
  bindNotesDomEvents();
  setupEditorMediaPasteAndDrop();
  setupSessionCalendarModal();
}

/**
 * Get available courses from state or fallback demo data
 */
function getAvailableCourses() {
  if (Array.isArray(appState.courses) && appState.courses.length > 0) {
    return appState.courses;
  }
  if (appState.isDemo && window.DEMO_DATA && Array.isArray(window.DEMO_DATA.courses)) {
    return window.DEMO_DATA.courses;
  }
  return [];
}

/**
 * Bind DOM Event Listeners for Notes UI
 */
function bindNotesDomEvents() {
  // New Note button in sidebar & empty state
  if (notesNewBtn) {
    notesNewBtn.addEventListener('click', () => createNewNote());
  }
  if (noteEmptyNewBtn) {
    noteEmptyNewBtn.addEventListener('click', () => createNewNote());
  }

  // Filter button & Course dropdown popover in notes sidebar
  if (notesFilterBtn) {
    notesFilterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNotesCourseFilterMenu();
    });
  }

  // Close filter menu when clicking outside
  document.addEventListener('click', (e) => {
    if (notesCourseFilterMenu && !notesCourseFilterMenu.classList.contains('hidden')) {
      if (!notesCourseFilterMenu.contains(e.target) && e.target !== notesFilterBtn) {
        notesCourseFilterMenu.classList.add('hidden');
      }
    }
  });

  // Storage location pill in editor meta bar
  if (noteStorageLocationBadge) {
    noteStorageLocationBadge.addEventListener('click', handleSelectNotesStorageDirectory);
  }

  // Search input & clear button
  if (notesSearchInput) {
    notesSearchInput.addEventListener('input', (e) => {
      appState.notesSearchQuery = e.target.value.trim().toLowerCase();
      if (notesSearchClearBtn) {
        if (appState.notesSearchQuery) {
          notesSearchClearBtn.classList.remove('hidden');
        } else {
          notesSearchClearBtn.classList.add('hidden');
        }
      }
      renderNotesList();
    });
  }
  if (notesSearchClearBtn) {
    notesSearchClearBtn.addEventListener('click', () => {
      if (notesSearchInput) notesSearchInput.value = '';
      appState.notesSearchQuery = '';
      notesSearchClearBtn.classList.add('hidden');
      renderNotesList();
    });
  }

  // Delete button
  if (noteDeleteBtn) {
    noteDeleteBtn.addEventListener('click', () => {
      if (!activeNote) return;
      const confirmDelete = window.confirm(`Are you sure you want to delete note "${activeNote.title || 'Untitled Note'}"?`);
      if (confirmDelete) {
        deleteNote(activeNote.id);
      }
    });
  }

  // Note Title input (auto-saves on typing with debounce, and immediately on blur)
  if (noteTitleInput) {
    noteTitleInput.addEventListener('input', () => {
      if (!activeNote) return;
      activeNote.title = noteTitleInput.value.trim() || 'Untitled Note';
      updateActiveNoteInList();
      triggerAutoSave();
    });
    noteTitleInput.addEventListener('blur', () => {
      saveCurrentNote(false);
    });
  }

  // Course Select dropdown in editor
  if (noteCourseSelect) {
    noteCourseSelect.addEventListener('change', () => {
      if (!activeNote) return;
      const courseId = noteCourseSelect.value;
      activeNote.courseId = courseId || null;
      if (courseId) {
        const courses = getAvailableCourses();
        const found = courses.find(c => String(c.id) === String(courseId));
        activeNote.courseName = found ? (found.name || found.course_code) : '';
      } else {
        activeNote.courseName = '';
      }
      renderLinkedFilesList();
      updateActiveNoteInList();
      saveCurrentNote(false);
    });
  }

  // Session Picker Button (opens Calendar Modal)
  if (noteSessionPickerBtn) {
    noteSessionPickerBtn.addEventListener('click', openSessionCalendarModal);
  }

  // Link File Button & Modal
  if (noteLinkFileBtn) {
    noteLinkFileBtn.addEventListener('click', openLinkFileModal);
  }

  // Link File Modal Close buttons
  const modalCloseBtn = document.getElementById('closeNoteLinkFileModalBtn');
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeLinkFileModal);
  }
  const modalCancelBtn = document.getElementById('noteLinkFileCancelBtn');
  if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', closeLinkFileModal);
  }

  // Click on backdrop to close Link File modal
  if (noteLinkFileModal) {
    noteLinkFileModal.addEventListener('click', (e) => {
      if (e.target === noteLinkFileModal) {
        closeLinkFileModal();
      }
    });
  }

  // Escape key to close open modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (noteLinkFileModal && !noteLinkFileModal.classList.contains('hidden')) {
        closeLinkFileModal();
      }
      if (noteSessionCalendarModal && !noteSessionCalendarModal.classList.contains('hidden')) {
        closeSessionCalendarModal();
      }
    }
  });

  if (noteLinkFileSearchInput) {
    noteLinkFileSearchInput.addEventListener('input', () => {
      filterLinkFileModalList();
    });
  }

  // Formatting Toolbar
  setupFormattingToolbar();

  // Hidden Media file input
  if (noteMediaFileInput) {
    noteMediaFileInput.addEventListener('change', handleMediaFileInputChange);
  }

  // Rich Text Editor typing (auto-saves on input with debounce, and immediately on blur)
  if (noteContentEditor) {
    noteContentEditor.addEventListener('input', () => {
      if (!activeNote) return;
      activeNote.contentHtml = noteContentEditor.innerHTML;
      updateWordCount();
      triggerAutoSave();
    });
    noteContentEditor.addEventListener('blur', () => {
      saveSelection();
      saveCurrentNote(false);
    });

    const saveSelection = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (noteContentEditor.contains(range.commonAncestorContainer)) {
          currentSelectionRange = range.cloneRange();
        }
      }
    };
    noteContentEditor.addEventListener('keyup', saveSelection);
    noteContentEditor.addEventListener('mouseup', saveSelection);

    // Keyboard shortcuts
    noteContentEditor.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveCurrentNote(true);
      }
    });
  }
}

/**
 * Toggle Course Filter Dropdown in Notes Sidebar
 */
function toggleNotesCourseFilterMenu() {
  if (!notesCourseFilterMenu) return;
  const isHidden = notesCourseFilterMenu.classList.contains('hidden');
  if (isHidden) {
    populateNotesCourseFilterMenuOptions();
    notesCourseFilterMenu.classList.remove('hidden');
  } else {
    notesCourseFilterMenu.classList.add('hidden');
  }
}

/**
 * Populate Course Filter Menu Popover
 */
function populateNotesCourseFilterMenuOptions() {
  if (!notesCourseFilterOptions) return;
  const courses = getAvailableCourses();
  const activeFilter = appState.notesCourseFilter || 'all';

  let html = `
    <div class="notes-filter-opt ${activeFilter === 'all' ? 'active' : ''}" onclick="selectNotesCourseFilter('all')">
      <span>All Courses</span>
      ${activeFilter === 'all' ? '<span class="notes-filter-check">✓</span>' : ''}
    </div>
    <div class="notes-filter-opt ${activeFilter === 'general' ? 'active' : ''}" onclick="selectNotesCourseFilter('general')">
      <span>General (No Course)</span>
      ${activeFilter === 'general' ? '<span class="notes-filter-check">✓</span>' : ''}
    </div>
  `;

  if (courses.length > 0) {
    html += '<div class="notes-filter-sep"></div>';
    courses.forEach(c => {
      const isSelected = String(c.id) === String(activeFilter);
      const name = c.name || c.course_code || `Course ${c.id}`;
      html += `
        <div class="notes-filter-opt ${isSelected ? 'active' : ''}" onclick="selectNotesCourseFilter('${escapeHtml(String(c.id))}')">
          <span class="notes-filter-opt-name">${escapeHtml(name)}</span>
          ${isSelected ? '<span class="notes-filter-check">✓</span>' : ''}
        </div>
      `;
    });
  }

  notesCourseFilterOptions.innerHTML = html;
}

/**
 * Handle selecting course filter
 */
function selectNotesCourseFilter(val) {
  appState.notesCourseFilter = val;
  if (notesCourseFilterMenu) {
    notesCourseFilterMenu.classList.add('hidden');
  }
  if (notesFilterBtn) {
    if (val !== 'all') {
      notesFilterBtn.classList.add('filter-active');
      notesFilterBtn.title = `Filtered by course`;
    } else {
      notesFilterBtn.classList.remove('filter-active');
      notesFilterBtn.title = `Filter by Course`;
    }
  }
  renderNotesList();
}

/**
 * Setup Formatting Toolbar Actions
 */
function setupFormattingToolbar() {
  if (!noteFormatToolbar) return;

  if (formatBlockSelect) {
    formatBlockSelect.addEventListener('change', () => {
      const block = formatBlockSelect.value;
      restoreSelection();
      if (block === 'pre') {
        document.execCommand('formatBlock', false, '<pre>');
      } else {
        document.execCommand('formatBlock', false, `<${block}>`);
      }
      noteContentEditor?.focus();
    });
  }

  const bindCmdBtn = (id, cmd, val = null) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        restoreSelection();
        document.execCommand(cmd, false, val);
        noteContentEditor?.focus();
      });
    }
  };

  bindCmdBtn('formatBoldBtn', 'bold');
  bindCmdBtn('formatItalicBtn', 'italic');
  bindCmdBtn('formatUnderlineBtn', 'underline');
  bindCmdBtn('formatStrikeBtn', 'strikeThrough');
  bindCmdBtn('formatBulletListBtn', 'insertUnorderedList');
  bindCmdBtn('formatNumberListBtn', 'insertOrderedList');
  bindCmdBtn('formatHrBtn', 'insertHorizontalRule');
  bindCmdBtn('formatClearBtn', 'removeFormat');

  const highlightBtn = document.getElementById('formatHighlightBtn');
  if (highlightBtn) {
    highlightBtn.addEventListener('click', (e) => {
      e.preventDefault();
      restoreSelection();
      document.execCommand('hiliteColor', false, '#fef08a');
      noteContentEditor?.focus();
    });
  }

  const quoteBtn = document.getElementById('formatQuoteBtn');
  if (quoteBtn) {
    quoteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      restoreSelection();
      document.execCommand('formatBlock', false, '<blockquote>');
      noteContentEditor?.focus();
    });
  }

  const linkBtn = document.getElementById('formatLinkBtn');
  if (linkBtn) {
    linkBtn.addEventListener('click', (e) => {
      e.preventDefault();
      restoreSelection();
      const url = window.prompt('Enter link URL (e.g. https://...):');
      if (url) {
        document.execCommand('createLink', false, url);
      }
      noteContentEditor?.focus();
    });
  }

  if (formatInsertMediaBtn) {
    formatInsertMediaBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      restoreSelection();
      if (window.canvasDesktop && typeof window.canvasDesktop.selectNoteAttachment === 'function') {
        try {
          const res = await window.canvasDesktop.selectNoteAttachment();
          if (res && !res.canceled && res.dataUrl) {
            insertMediaAttachment(res.name, res.type, res.dataUrl);
            return;
          }
        } catch (err) {
          console.warn('Native selectNoteAttachment fallback:', err);
        }
      }
      if (noteMediaFileInput) {
        noteMediaFileInput.click();
      }
    });
  }
}

/**
 * Restore selection range inside note editor
 */
function restoreSelection() {
  if (currentSelectionRange && window.getSelection) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(currentSelectionRange);
  }
}

/**
 * Handle Media file input change
 */
function handleMediaFileInputChange(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const reader = new FileReader();
    reader.onload = (event) => {
      insertMediaAttachment(file.name, file.type, event.target.result);
    };
    reader.readAsDataURL(file);
  }
  e.target.value = '';
}

/**
 * Insert media attachment into note HTML at current cursor position
 */
function insertMediaAttachment(fileName, mimeType, dataUrl) {
  restoreSelection();
  noteContentEditor?.focus();

  let htmlToInsert = '';
  if (mimeType.startsWith('image/')) {
    htmlToInsert = `<div class="note-media-wrapper"><img src="${dataUrl}" alt="${escapeHtml(fileName)}" class="note-embedded-image" /><div class="note-media-caption">${escapeHtml(fileName)}</div></div><p><br></p>`;
  } else if (mimeType.startsWith('video/')) {
    htmlToInsert = `<div class="note-media-wrapper"><video controls src="${dataUrl}" class="note-embedded-video"></video><div class="note-media-caption">${escapeHtml(fileName)}</div></div><p><br></p>`;
  } else if (mimeType.startsWith('audio/')) {
    htmlToInsert = `<div class="note-media-wrapper"><audio controls src="${dataUrl}" class="note-embedded-audio"></audio><div class="note-media-caption">${escapeHtml(fileName)}</div></div><p><br></p>`;
  } else {
    htmlToInsert = `<div class="note-file-attachment-card" contenteditable="false"><svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg><div class="note-file-info"><span class="note-file-name">${escapeHtml(fileName)}</span><span class="note-file-meta">Attached Document</span></div></div><p><br></p>`;
  }

  document.execCommand('insertHTML', false, htmlToInsert);
  if (activeNote) {
    activeNote.contentHtml = noteContentEditor.innerHTML;
    saveCurrentNote(false);
  }
}

/**
 * Setup Copy-Paste and Drag-and-Drop for note editor
 */
function setupEditorMediaPasteAndDrop() {
  if (!noteContentEditor) return;

  noteContentEditor.addEventListener('paste', (e) => {
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            const reader = new FileReader();
            reader.onload = (loadEvent) => {
              insertMediaAttachment(`Pasted_Image_${Date.now()}.png`, blob.type, loadEvent.target.result);
            };
            reader.readAsDataURL(blob);
            break;
          }
        }
      }
    }
  });

  noteContentEditor.addEventListener('dragover', (e) => {
    e.preventDefault();
    noteContentEditor.classList.add('drag-over');
  });

  noteContentEditor.addEventListener('dragleave', (e) => {
    e.preventDefault();
    noteContentEditor.classList.remove('drag-over');
  });

  noteContentEditor.addEventListener('drop', (e) => {
    e.preventDefault();
    noteContentEditor.classList.remove('drag-over');

    const files = e.dataTransfer ? e.dataTransfer.files : null;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = (event) => {
          insertMediaAttachment(file.name, file.type, event.target.result);
        };
        reader.readAsDataURL(file);
      }
    }
  });
}

/**
 * Load Notes from User's Persistent Storage Location
 */
async function loadNotes(forceReload = false) {
  if (appState.isDemo) {
    let loadedNotes = [];
    if (window.canvasDesktop && typeof window.canvasDesktop.loadNotesFromDir === 'function') {
      try {
        const res = await window.canvasDesktop.loadNotesFromDir('mock-account/notes');
        if (res && res.success && Array.isArray(res.notes) && res.notes.length > 0) {
          loadedNotes = res.notes;
        }
      } catch (err) {
        console.warn('Failed to load mock notes from disk:', err);
      }
    }
    if (loadedNotes.length === 0 && typeof getMockAccountData === 'function') {
      const mockData = getMockAccountData();
      if (Array.isArray(mockData.notes)) {
        loadedNotes = mockData.notes;
      }
    }
    appState.notesStoragePath = 'mock-account/notes';
    updateStorageLocationLabels();
    populateNotesCourseFilterOptions();
    loadedNotes.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    appState.notes = loadedNotes;
    updateSidebarNotesCount();
    renderNotesList();
    if (appState.notes.length > 0) {
      const noteToOpen = appState.activeNoteId
        ? appState.notes.find(n => n.id === appState.activeNoteId) || appState.notes[0]
        : appState.notes[0];
      openNote(noteToOpen.id);
    } else {
      showEmptyEditor();
    }
    return;
  }

  let storedPath = localStorage.getItem(STORAGE_KEYS.NOTES_STORAGE_PATH);
  if (!storedPath && window.canvasDesktop && typeof window.canvasDesktop.getDefaultNotesDirectory === 'function') {
    try {
      const res = await window.canvasDesktop.getDefaultNotesDirectory();
      storedPath = res?.directoryPath || res;
      if (storedPath) {
        localStorage.setItem(STORAGE_KEYS.NOTES_STORAGE_PATH, storedPath);
      }
    } catch (err) {
      console.warn('Could not get default notes directory:', err);
    }
  }

  appState.notesStoragePath = storedPath || 'Documents/CanvasNotes';
  updateStorageLocationLabels();
  populateNotesCourseFilterOptions();

  let loadedNotes = [];
  if (window.canvasDesktop && typeof window.canvasDesktop.loadNotesFromDir === 'function' && storedPath) {
    try {
      const res = await window.canvasDesktop.loadNotesFromDir(storedPath);
      if (res && res.success && Array.isArray(res.notes)) {
        loadedNotes = res.notes;
      }
    } catch (err) {
      console.warn('Failed to load notes from disk:', err);
    }
  }

  if (loadedNotes.length === 0) {
    const cached = localStorage.getItem(STORAGE_KEYS.NOTES_CACHE);
    if (cached) {
      try {
        loadedNotes = JSON.parse(cached);
      } catch (e) {
        loadedNotes = [];
      }
    }
  }

  // Sort notes by updatedAt desc (NO DUMMY NOTES)
  loadedNotes.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  appState.notes = loadedNotes;

  updateSidebarNotesCount();
  renderNotesList();

  if (appState.notes.length > 0) {
    const noteToOpen = appState.activeNoteId
      ? appState.notes.find(n => n.id === appState.activeNoteId) || appState.notes[0]
      : appState.notes[0];
    openNote(noteToOpen.id);
  } else {
    showEmptyEditor();
  }
}

/**
 * Handle user selecting a custom storage folder
 */
async function handleSelectNotesStorageDirectory() {
  let selectedDir = null;

  try {
    if (window.canvasDesktop && typeof window.canvasDesktop.selectNotesDirectory === 'function') {
      const res = await window.canvasDesktop.selectNotesDirectory(appState.notesStoragePath);
      if (res && !res.canceled && (res.directoryPath || res.path)) {
        selectedDir = res.directoryPath || res.path;
      }
    }
  } catch (err) {
    console.warn('Native selectNotesDirectory IPC error:', err);
  }

  if (!selectedDir) {
    const current = appState.notesStoragePath || 'Documents/CanvasNotes';
    const input = window.prompt(
      'Enter notes storage folder path (e.g. iCloud Drive or custom folder):\n(Tip: Restart "npm start" in terminal to enable native macOS Finder dialog)',
      current
    );
    if (input && input.trim() && input.trim() !== current) {
      selectedDir = input.trim();
    }
  }

  if (selectedDir) {
    appState.notesStoragePath = selectedDir;
    localStorage.setItem(STORAGE_KEYS.NOTES_STORAGE_PATH, selectedDir);
    updateStorageLocationLabels();
    showToast(`Storage folder set to: ${truncatePath(selectedDir, 35)}`);

    if (window.canvasDesktop && typeof window.canvasDesktop.saveNoteFile === 'function') {
      for (const note of appState.notes) {
        try {
          await window.canvasDesktop.saveNoteFile(selectedDir, note);
        } catch (e) {}
      }
    }
  }
}

/**
 * Update UI labels showing the active storage location
 */
function updateStorageLocationLabels() {
  const path = appState.notesStoragePath || 'Documents/CanvasNotes';
  const displayPath = truncatePath(path, 24);

  const locText = document.getElementById('noteStorageLocationText');
  if (locText) {
    locText.textContent = displayPath;
  }
  if (noteStorageLocationBadge) {
    noteStorageLocationBadge.title = `Click to change storage folder. Full path: ${path}`;
  }
}

/**
 * Truncate long file paths nicely for UI
 */
function truncatePath(fullPath, maxLen = 24) {
  if (!fullPath || fullPath.length <= maxLen) return fullPath;
  const parts = fullPath.split(/[\/\\]/);
  if (parts.length > 2) {
    return '.../' + parts.slice(-2).join('/');
  }
  return fullPath.substring(0, 10) + '...' + fullPath.slice(-10);
}

/**
 * Populate Course Filter options
 */
function populateNotesCourseFilterOptions() {
  const courses = getAvailableCourses();

  // Populate editor course select
  if (noteCourseSelect) {
    const currentCourseVal = activeNote ? activeNote.courseId : '';
    let html = '<option value="">Course: General</option>';
    courses.forEach(course => {
      const name = course.name || course.course_code || `Course ${course.id}`;
      html += `<option value="${course.id}">Course: ${escapeHtml(name)}</option>`;
    });
    noteCourseSelect.innerHTML = html;
    if (currentCourseVal && Array.from(noteCourseSelect.options).some(o => o.value === String(currentCourseVal))) {
      noteCourseSelect.value = String(currentCourseVal);
    } else {
      noteCourseSelect.value = '';
    }
  }
}

/**
 * Render Notes List in master pane
 */
function renderNotesList() {
  if (!notesList) return;

  let filtered = appState.notes || [];

  // Course filter
  if (appState.notesCourseFilter && appState.notesCourseFilter !== 'all') {
    if (appState.notesCourseFilter === 'general') {
      filtered = filtered.filter(n => !n.courseId);
    } else {
      filtered = filtered.filter(n => String(n.courseId) === String(appState.notesCourseFilter));
    }
  }

  // Search filter
  if (appState.notesSearchQuery) {
    const q = appState.notesSearchQuery;
    filtered = filtered.filter(n => {
      const titleMatch = (n.title || '').toLowerCase().includes(q);
      const contentMatch = (n.contentHtml || '').toLowerCase().includes(q);
      const courseMatch = (n.courseName || '').toLowerCase().includes(q);
      const sessionMatch = (n.sessionTitle || '').toLowerCase().includes(q);
      return titleMatch || contentMatch || courseMatch || sessionMatch;
    });
  }

  if (filtered.length === 0) {
    notesList.innerHTML = `
      <div class="notes-empty-list">
        <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" fill="none" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
        <p>No notes found</p>
        <button class="primary-button extra-small-btn" onclick="createNewNote()">+ Create Note</button>
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach(note => {
    const isActive = activeNote && note.id === activeNote.id;
    const timeFormatted = formatNoteDate(note.updatedAt || note.createdAt);
    const plainSnippet = extractPlainTextSnippet(note.contentHtml);
    const hasFiles = note.linkedFiles && note.linkedFiles.length > 0;

    html += `
      <div class="notes-item-card ${isActive ? 'active' : ''}" data-note-id="${note.id}" onclick="openNote('${note.id}')">
        <div class="notes-item-header">
          <h4 class="notes-item-title">${escapeHtml(note.title || 'Untitled Note')}</h4>
          <span class="notes-item-time">${timeFormatted}</span>
        </div>
        <p class="notes-item-snippet">${escapeHtml(plainSnippet || 'Empty note...')}</p>
        <div class="notes-item-footer">
          ${note.courseName ? `<span class="notes-course-tag" title="Course: ${escapeHtml(note.courseName)}"><svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" fill="none" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>${escapeHtml(note.courseName)}</span>` : '<span class="notes-general-tag">General</span>'}
          ${note.sessionTitle ? `<span class="notes-session-tag" title="Calendar Session: ${escapeHtml(note.sessionTitle)}"><svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" fill="none" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>${escapeHtml(note.sessionTitle)}</span>` : ''}
          ${hasFiles ? `<span class="notes-files-badge" title="${note.linkedFiles.length} linked file(s)"><svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" fill="none" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>${note.linkedFiles.length}</span>` : ''}
        </div>
      </div>
    `;
  });

  notesList.innerHTML = html;

  // Bind right-click context menu on each note item
  document.querySelectorAll('.notes-item-card').forEach(card => {
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const noteId = card.getAttribute('data-note-id');
      const noteObj = (appState.notes || []).find(n => n.id === noteId);
      if (!noteObj) return;

      if (typeof showContextMenu === 'function') {
        showContextMenu(e.clientX, e.clientY, [
          {
            label: 'Open Note',
            icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
            action: () => openNote(noteId)
          },
          {
            label: 'Duplicate Note',
            icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
            action: () => duplicateNote(noteId)
          },
          { separator: true },
          {
            label: 'Delete Note',
            danger: true,
            icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
            action: () => deleteNote(noteId)
          }
        ]);
      }
    });
  });
}

/**
 * Duplicate a note
 */
async function duplicateNote(noteId) {
  const original = (appState.notes || []).find(n => n.id === noteId);
  if (!original) return;

  const newId = 'note_' + Date.now();
  const dup = {
    id: newId,
    title: `${original.title || 'Untitled Note'} (Copy)`,
    courseId: original.courseId || null,
    courseName: original.courseName || '',
    sessionId: original.sessionId || null,
    sessionTitle: original.sessionTitle || '',
    linkedFiles: JSON.parse(JSON.stringify(original.linkedFiles || [])),
    contentHtml: original.contentHtml || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  appState.notes.unshift(dup);
  saveNotesToLocalStorage();

  if (window.canvasDesktop && typeof window.canvasDesktop.saveNoteFile === 'function') {
    try {
      await window.canvasDesktop.saveNoteFile(appState.notesStoragePath, dup);
    } catch (e) {}
  }

  updateSidebarNotesCount();
  renderNotesList();
  openNote(newId);
  showToast(`Duplicated note: ${dup.title}`);
}

/**
 * Open Note in Editor Pane
 */
function openNote(noteId) {
  const found = (appState.notes || []).find(n => n.id === noteId);
  if (!found) return;

  activeNote = found;
  appState.activeNoteId = noteId;

  if (noteEditorEmptyState) noteEditorEmptyState.classList.add('hidden');
  if (noteEditorCard) noteEditorCard.classList.remove('hidden');

  if (noteTitleInput) {
    noteTitleInput.value = found.title || '';
  }

  populateNotesCourseFilterOptions();
  if (noteCourseSelect) {
    noteCourseSelect.value = found.courseId ? String(found.courseId) : '';
  }

  updateSessionPickerDisplay(found.sessionTitle);

  if (noteContentEditor) {
    noteContentEditor.innerHTML = found.contentHtml || '<p><br></p>';
  }

  renderLinkedFilesList();
  updateNoteSaveStatus('Saved');
  updateWordCount();
  updateStorageLocationLabels();

  document.querySelectorAll('.notes-item-card').forEach(el => {
    if (el.getAttribute('data-note-id') === noteId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
}

/**
 * Update the button text for the selected session
 */
function updateSessionPickerDisplay(sessionTitle) {
  if (!noteSessionSelectedText) return;
  if (sessionTitle && sessionTitle.trim()) {
    noteSessionSelectedText.textContent = `Session: ${sessionTitle.trim()}`;
    if (noteSessionPickerBtn) {
      noteSessionPickerBtn.classList.add('has-session');
      noteSessionPickerBtn.title = `Linked to: ${sessionTitle.trim()}`;
    }
  } else {
    noteSessionSelectedText.textContent = 'Session';
    if (noteSessionPickerBtn) {
      noteSessionPickerBtn.classList.remove('has-session');
      noteSessionPickerBtn.title = 'Choose timetable session from calendar';
    }
  }
}

/**
 * Create a new Note
 */
function createNewNote() {
  const newId = 'note_' + Date.now();
  let defaultCourseId = null;
  let defaultCourseName = '';

  if (appState.notesCourseFilter && appState.notesCourseFilter !== 'all' && appState.notesCourseFilter !== 'general') {
    defaultCourseId = appState.notesCourseFilter;
    const courses = getAvailableCourses();
    const foundCourse = courses.find(c => String(c.id) === String(defaultCourseId));
    defaultCourseName = foundCourse ? (foundCourse.name || foundCourse.course_code) : '';
  }

  const newNote = {
    id: newId,
    title: 'New Study Note',
    courseId: defaultCourseId,
    courseName: defaultCourseName,
    sessionId: null,
    sessionTitle: '',
    linkedFiles: [],
    contentHtml: '<p><br></p>',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  appState.notes.unshift(newNote);
  updateSidebarNotesCount();
  renderNotesList();
  openNote(newId);
  saveCurrentNote(true);

  if (noteTitleInput) {
    noteTitleInput.focus();
    noteTitleInput.select();
  }
}

/**
 * Delete a Note
 */
async function deleteNote(noteId) {
  const index = appState.notes.findIndex(n => n.id === noteId);
  if (index === -1) return;

  appState.notes.splice(index, 1);

  if (window.canvasDesktop && typeof window.canvasDesktop.deleteNoteFile === 'function') {
    try {
      await window.canvasDesktop.deleteNoteFile(appState.notesStoragePath, noteId);
    } catch (e) {
      console.warn('Failed to delete note file:', e);
    }
  }

  saveNotesToLocalStorage();
  updateSidebarNotesCount();
  renderNotesList();

  if (appState.notes.length > 0) {
    openNote(appState.notes[0].id);
  } else {
    activeNote = null;
    appState.activeNoteId = null;
    showEmptyEditor();
  }
  showToast('Note deleted');
}

/**
 * Show Empty State when no note is selected
 */
function showEmptyEditor() {
  if (noteEditorEmptyState) noteEditorEmptyState.classList.remove('hidden');
  if (noteEditorCard) noteEditorCard.classList.add('hidden');
}

/**
 * Save Current Note to Disk & Local Storage (Auto-save)
 */
async function saveCurrentNote(manual = false) {
  if (!activeNote) return;

  updateNoteSaveStatus('Saving...');
  activeNote.title = (noteTitleInput?.value || '').trim() || 'Untitled Note';
  activeNote.courseId = noteCourseSelect?.value || null;
  activeNote.contentHtml = noteContentEditor?.innerHTML || '';
  activeNote.updatedAt = new Date().toISOString();

  let savedToFile = false;
  if (window.canvasDesktop && typeof window.canvasDesktop.saveNoteFile === 'function') {
    try {
      const storageDir = appState.notesStoragePath;
      const res = await window.canvasDesktop.saveNoteFile(storageDir, activeNote);
      if (res && res.success) {
        savedToFile = true;
      }
    } catch (err) {
      console.warn('Could not save note to disk:', err);
    }
  }

  saveNotesToLocalStorage();
  updateActiveNoteInList();
  updateNoteSaveStatus(savedToFile ? 'Saved to folder' : 'Saved');

  if (manual) {
    showToast(`Note saved: ${activeNote.title}`);
  }
}

/**
 * Debounced Auto-save (500ms)
 */
function triggerAutoSave() {
  updateNoteSaveStatus('Unsaved changes...');
  if (notesSaveDebounceTimer) clearTimeout(notesSaveDebounceTimer);
  notesSaveDebounceTimer = setTimeout(() => {
    saveCurrentNote(false);
  }, 500);
}

/**
 * Save notes list to localStorage cache
 */
function saveNotesToLocalStorage() {
  if (appState.isDemo) return;
  try {
    localStorage.setItem(STORAGE_KEYS.NOTES_CACHE, JSON.stringify(appState.notes));
  } catch (err) {
    console.warn('LocalStorage save failed:', err);
  }
}

/**
 * Update active note title and snippet in list without full re-render
 */
function updateActiveNoteInList() {
  if (!activeNote) return;
  const card = document.querySelector(`.notes-item-card[data-note-id="${activeNote.id}"]`);
  if (card) {
    const titleEl = card.querySelector('.notes-item-title');
    if (titleEl) titleEl.textContent = activeNote.title;
    const snippetEl = card.querySelector('.notes-item-snippet');
    if (snippetEl) snippetEl.textContent = extractPlainTextSnippet(activeNote.contentHtml);
    const timeEl = card.querySelector('.notes-item-time');
    if (timeEl) timeEl.textContent = formatNoteDate(activeNote.updatedAt || new Date().toISOString());
  }
}

/**
 * Update save status indicator text
 */
function updateNoteSaveStatus(status) {
  if (noteSaveStatus) {
    noteSaveStatus.textContent = status;
    if (status.includes('Unsaved')) {
      noteSaveStatus.classList.add('unsaved');
    } else {
      noteSaveStatus.classList.remove('unsaved');
    }
  }
}

/**
 * Update Live Word and Character Count
 */
function updateWordCount() {
  if (!noteWordCount || !noteContentEditor) return;
  const text = noteContentEditor.innerText || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  noteWordCount.textContent = `${words} word${words === 1 ? '' : 's'} · ${chars} char${chars === 1 ? '' : 's'}`;
}

/**
 * Update Sidebar Notes Badge Count
 */
function updateSidebarNotesCount() {
  if (sidebarNotesCount) {
    const count = (appState.notes || []).length;
    sidebarNotesCount.textContent = count > 0 ? count : '';
    if (count > 0) {
      sidebarNotesCount.classList.remove('hidden');
    } else {
      sidebarNotesCount.classList.add('hidden');
    }
  }
}

/**
 * Render Linked Module Files Chips
 */
function renderLinkedFilesList() {
  if (!noteLinkedFilesList) return;
  const files = activeNote ? (activeNote.linkedFiles || []) : [];

  if (files.length === 0) {
    noteLinkedFilesList.innerHTML = '<span class="notes-no-linked-files">No files linked from course modules yet.</span>';
    return;
  }

  let html = '';
  files.forEach((file, index) => {
    html += `
      <div class="linked-file-tag" data-index="${index}">
        <span class="linked-file-tag-name" onclick="handleOpenLinkedFile(${index})" title="Click to view file: ${escapeHtml(file.title || file.name)}">
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
            <polyline points="13 2 13 9 20 9"></polyline>
          </svg>
          ${escapeHtml(file.title || file.name || 'File')}
        </span>
        <button class="linked-file-tag-remove" onclick="handleRemoveLinkedFile(${index})" title="Unlink file">
          &times;
        </button>
      </div>
    `;
  });

  noteLinkedFilesList.innerHTML = html;
}

/**
 * Remove a linked file from active note
 */
function handleRemoveLinkedFile(index) {
  if (!activeNote || !activeNote.linkedFiles) return;
  activeNote.linkedFiles.splice(index, 1);
  renderLinkedFilesList();
  renderNotesList();
  saveCurrentNote(false);
}

/**
 * Open a linked file in document previewer
 */
function handleOpenLinkedFile(index) {
  if (!activeNote || !activeNote.linkedFiles || !activeNote.linkedFiles[index]) return;
  const file = activeNote.linkedFiles[index];

  if (typeof openModuleReaderItem === 'function') {
    openModuleReaderItem(file);
  } else if (typeof openFilePreviewModal === 'function') {
    openFilePreviewModal(file);
  } else if (file.url) {
    window.open(file.url, '_blank');
  } else {
    showToast(`Opening file: ${file.title || file.name}`);
  }
}

/**
 * Open Link File Modal
 */
function openLinkFileModal() {
  if (!activeNote) {
    showToast('Please select or create a note first');
    return;
  }
  if (noteLinkFileModal) {
    noteLinkFileModal.classList.remove('hidden');
    if (noteLinkFileSearchInput) {
      noteLinkFileSearchInput.value = '';
      noteLinkFileSearchInput.focus();
    }
    populateLinkFileModalList();
  }
}

/**
 * Close Link File Modal
 */
function closeLinkFileModal() {
  if (noteLinkFileModal) {
    noteLinkFileModal.classList.add('hidden');
  }
}

/**
 * Populate files list inside Link File Modal from course modules
 */
function populateLinkFileModalList() {
  if (!noteLinkFileOptionsList) return;

  const courseId = activeNote ? activeNote.courseId : null;
  let availableFiles = [];

  if (courseId && appState.courseDetailsCache && appState.courseDetailsCache[courseId]) {
    const details = appState.courseDetailsCache[courseId];
    if (details.modules && Array.isArray(details.modules)) {
      details.modules.forEach(mod => {
        if (mod.items && Array.isArray(mod.items)) {
          mod.items.forEach(item => {
            if (item.type === 'File' || item.type === 'Page' || item.type === 'Assignment' || item.url || item.html_url) {
              availableFiles.push({
                id: item.id,
                title: item.title,
                type: item.type,
                moduleName: mod.name,
                url: item.url || item.html_url,
                courseId: courseId,
                courseName: activeNote.courseName
              });
            }
          });
        }
      });
    }
    if (details.files && Array.isArray(details.files)) {
      details.files.forEach(f => {
        if (!availableFiles.some(af => af.id === f.id)) {
          availableFiles.push({
            id: f.id,
            title: f.display_name || f.filename,
            type: 'File',
            moduleName: 'Course Files',
            url: f.url,
            courseId: courseId,
            courseName: activeNote.courseName
          });
        }
      });
    }
  } else {
    Object.keys(appState.courseDetailsCache || {}).forEach(cId => {
      const details = appState.courseDetailsCache[cId];
      const courses = getAvailableCourses();
      const course = courses.find(c => String(c.id) === String(cId));
      const cName = course ? (course.name || course.course_code) : `Course ${cId}`;
      if (details.modules) {
        details.modules.forEach(mod => {
          (mod.items || []).forEach(item => {
            availableFiles.push({
              id: item.id,
              title: item.title,
              type: item.type || 'File',
              moduleName: `${cName} · ${mod.name}`,
              url: item.url || item.html_url,
              courseId: cId,
              courseName: cName
            });
          });
        });
      }
    });
  }

  if (availableFiles.length === 0) {
    availableFiles = [
      { id: 'f1', title: 'Week 1 - Introduction to Algorithms.pdf', type: 'File', moduleName: 'Week 1', courseName: 'Computer Science' },
      { id: 'f2', title: 'Lecture Notes - Dynamic Programming.pdf', type: 'File', moduleName: 'Week 3', courseName: 'Computer Science' },
      { id: 'f3', title: 'Project Specification & Rubric.pdf', type: 'File', moduleName: 'Assignments', courseName: 'Computer Science' },
      { id: 'f4', title: 'Chapter 4 Reading - Graph Theory.pdf', type: 'File', moduleName: 'Readings', courseName: 'Mathematics' },
    ];
  }

  window._currentModalAvailableFiles = availableFiles;
  filterLinkFileModalList();
}

/**
 * Filter and render modal options
 */
function filterLinkFileModalList() {
  if (!noteLinkFileOptionsList) return;
  const files = window._currentModalAvailableFiles || [];
  const query = (noteLinkFileSearchInput?.value || '').trim().toLowerCase();

  const filtered = files.filter(f => {
    return (f.title || '').toLowerCase().includes(query) || (f.moduleName || '').toLowerCase().includes(query);
  });

  if (filtered.length === 0) {
    noteLinkFileOptionsList.innerHTML = '<div class="notes-empty-list"><p>No matching files found</p></div>';
    return;
  }

  let html = '';
  filtered.forEach(file => {
    const alreadyLinked = (activeNote?.linkedFiles || []).some(lf => lf.title === file.title || lf.id === file.id);
    html += `
      <div class="note-link-file-card-item ${alreadyLinked ? 'already-linked' : ''}" onclick="selectFileToLink('${escapeHtml(String(file.id))}')">
        <div class="note-link-file-icon">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
        </div>
        <div class="note-link-file-details">
          <span class="note-link-file-title">${escapeHtml(file.title)}</span>
          <span class="note-link-file-module">${escapeHtml(file.moduleName || 'Module')}</span>
        </div>
        <button class="primary-button extra-small-btn note-link-file-action-btn">
          ${alreadyLinked ? 'Linked' : '+ Link'}
        </button>
      </div>
    `;
  });

  noteLinkFileOptionsList.innerHTML = html;
}

/**
 * Link selected file to active note
 */
function selectFileToLink(fileId) {
  if (!activeNote) return;
  const files = window._currentModalAvailableFiles || [];
  const file = files.find(f => String(f.id) === String(fileId));
  if (!file) return;

  if (!activeNote.linkedFiles) activeNote.linkedFiles = [];
  const alreadyLinked = activeNote.linkedFiles.some(lf => lf.title === file.title || String(lf.id) === String(file.id));

  if (alreadyLinked) {
    activeNote.linkedFiles = activeNote.linkedFiles.filter(lf => lf.title !== file.title && String(lf.id) !== String(file.id));
    showToast(`Unlinked "${file.title}"`);
  } else {
    activeNote.linkedFiles.push(file);
    showToast(`Linked "${file.title}" to note`);
  }

  renderLinkedFilesList();
  renderNotesList();
  filterLinkFileModalList();
  saveCurrentNote(false);
}

// =============================================================================
// Calendar Session Modal Implementation
// =============================================================================

/**
 * Setup Calendar Session Modal Listeners
 */
function setupSessionCalendarModal() {
  if (closeNoteSessionModalBtn) {
    closeNoteSessionModalBtn.addEventListener('click', closeSessionCalendarModal);
  }
  if (noteSessionCancelBtn) {
    noteSessionCancelBtn.addEventListener('click', closeSessionCalendarModal);
  }
  if (noteSessionCalendarModal) {
    noteSessionCalendarModal.addEventListener('click', (e) => {
      if (e.target === noteSessionCalendarModal) {
        closeSessionCalendarModal();
      }
    });
  }

  // Prev / Next month buttons
  if (noteCalPrevMonthBtn) {
    noteCalPrevMonthBtn.addEventListener('click', () => {
      sessionCalCurrentMonth--;
      if (sessionCalCurrentMonth < 0) {
        sessionCalCurrentMonth = 11;
        sessionCalCurrentYear--;
      }
      renderSessionCalendarGrid();
    });
  }
  if (noteCalNextMonthBtn) {
    noteCalNextMonthBtn.addEventListener('click', () => {
      sessionCalCurrentMonth++;
      if (sessionCalCurrentMonth > 11) {
        sessionCalCurrentMonth = 0;
        sessionCalCurrentYear++;
      }
      renderSessionCalendarGrid();
    });
  }
  if (noteCalTodayBtn) {
    noteCalTodayBtn.addEventListener('click', () => {
      const now = new Date();
      sessionCalCurrentYear = now.getFullYear();
      sessionCalCurrentMonth = now.getMonth();
      sessionCalSelectedDate = now;
      renderSessionCalendarGrid();
      renderSessionAgendaList();
    });
  }

  // Search input inside session calendar modal
  if (noteSessionSearchInput) {
    noteSessionSearchInput.addEventListener('input', (e) => {
      sessionCalSearchQuery = e.target.value.trim().toLowerCase();
      renderSessionAgendaList();
    });
  }

  // Clear Session Button
  if (noteSessionClearBtn) {
    noteSessionClearBtn.addEventListener('click', () => {
      if (!activeNote) return;
      activeNote.sessionId = null;
      activeNote.sessionTitle = '';
      updateSessionPickerDisplay('');
      closeSessionCalendarModal();
      saveCurrentNote(false);
      renderNotesList();
      showToast('Calendar session unlinked');
    });
  }
}

/**
 * Open Session Calendar Modal
 */
function openSessionCalendarModal() {
  if (!activeNote) {
    showToast('Please select or create a note first');
    return;
  }

  const now = new Date();
  sessionCalCurrentYear = now.getFullYear();
  sessionCalCurrentMonth = now.getMonth();
  sessionCalSelectedDate = now;
  sessionCalSearchQuery = '';
  if (noteSessionSearchInput) noteSessionSearchInput.value = '';

  if (noteSessionCalendarModal) {
    noteSessionCalendarModal.classList.remove('hidden');
    renderSessionCalendarGrid();
    renderSessionAgendaList();
  }
}

/**
 * Close Session Calendar Modal
 */
function closeSessionCalendarModal() {
  if (noteSessionCalendarModal) {
    noteSessionCalendarModal.classList.add('hidden');
  }
}

/**
 * Render Session Calendar Month Grid
 */
function renderSessionCalendarGrid() {
  if (!noteCalDaysGrid || !noteCalMonthTitle) return;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  noteCalMonthTitle.textContent = `${monthNames[sessionCalCurrentMonth]} ${sessionCalCurrentYear}`;

  const firstDay = new Date(sessionCalCurrentYear, sessionCalCurrentMonth, 1);
  const lastDay = new Date(sessionCalCurrentYear, sessionCalCurrentMonth + 1, 0);

  // Day of week: 0 is Sun, we want Mon as 0
  let startDayIndex = firstDay.getDay() - 1;
  if (startDayIndex === -1) startDayIndex = 6;

  const totalDays = lastDay.getDate();
  const allEvents = appState.scheduleEvents || [];

  // Group events by YYYY-M-D
  const eventsByDateKey = {};
  allEvents.forEach(ev => {
    if (!ev.start) return;
    const d = new Date(ev.start);
    if (isNaN(d.getTime())) return;
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!eventsByDateKey[k]) eventsByDateKey[k] = [];
    eventsByDateKey[k].push(ev);
  });

  const today = new Date();
  let html = '';

  // Padding days from previous month
  const prevMonthLastDay = new Date(sessionCalCurrentYear, sessionCalCurrentMonth, 0).getDate();
  for (let i = startDayIndex - 1; i >= 0; i--) {
    const dNum = prevMonthLastDay - i;
    html += `<div class="note-cal-day-cell other-month"><span>${dNum}</span></div>`;
  }

  // Current month days
  for (let day = 1; day <= totalDays; day++) {
    const isToday =
      today.getFullYear() === sessionCalCurrentYear &&
      today.getMonth() === sessionCalCurrentMonth &&
      today.getDate() === day;

    const isSelected =
      sessionCalSelectedDate &&
      sessionCalSelectedDate.getFullYear() === sessionCalCurrentYear &&
      sessionCalSelectedDate.getMonth() === sessionCalCurrentMonth &&
      sessionCalSelectedDate.getDate() === day;

    const k = `${sessionCalCurrentYear}-${sessionCalCurrentMonth}-${day}`;
    const hasEvents = eventsByDateKey[k] && eventsByDateKey[k].length > 0;
    const eventCount = hasEvents ? eventsByDateKey[k].length : 0;

    html += `
      <div class="note-cal-day-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasEvents ? 'has-events' : ''}" 
           onclick="selectCalendarModalDay(${day})">
        <span class="note-cal-day-num">${day}</span>
        ${hasEvents ? `<span class="note-cal-event-dot" title="${eventCount} session(s)"></span>` : ''}
      </div>
    `;
  }

  // Trailing days
  const totalCells = startDayIndex + totalDays;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let j = 1; j <= remaining; j++) {
    html += `<div class="note-cal-day-cell other-month"><span>${j}</span></div>`;
  }

  noteCalDaysGrid.innerHTML = html;
}

/**
 * Handle user clicking a day in the mini calendar
 */
function selectCalendarModalDay(day) {
  sessionCalSelectedDate = new Date(sessionCalCurrentYear, sessionCalCurrentMonth, day);
  renderSessionCalendarGrid();
  renderSessionAgendaList();
}

/**
 * Render Session Agenda on the right side of the calendar modal
 */
function renderSessionAgendaList() {
  if (!noteCalSessionsList || !noteCalSessionsDateLabel) return;

  const allEvents = appState.scheduleEvents || [];
  const activeCourseId = activeNote ? activeNote.courseId : null;

  let filtered = allEvents;

  // If search query is present, search across all sessions
  if (sessionCalSearchQuery) {
    const q = sessionCalSearchQuery;
    filtered = allEvents.filter(ev => {
      const title = (ev.title || ev.summary || '').toLowerCase();
      const desc = (ev.description || '').toLowerCase();
      const loc = (ev.location || '').toLowerCase();
      return title.includes(q) || desc.includes(q) || loc.includes(q);
    });
    noteCalSessionsDateLabel.textContent = `Search Results (${filtered.length})`;
  } else {
    // Show sessions on selected date
    const targetY = sessionCalSelectedDate.getFullYear();
    const targetM = sessionCalSelectedDate.getMonth();
    const targetD = sessionCalSelectedDate.getDate();

    filtered = allEvents.filter(ev => {
      if (!ev.start) return false;
      const d = new Date(ev.start);
      return d.getFullYear() === targetY && d.getMonth() === targetM && d.getDate() === targetD;
    });

    const dateFormatted = sessionCalSelectedDate.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    // If no sessions on that day, show upcoming sessions
    if (filtered.length === 0) {
      filtered = allEvents.slice(0, 8);
      noteCalSessionsDateLabel.textContent = `No sessions on ${dateFormatted} · Upcoming Sessions:`;
    } else {
      noteCalSessionsDateLabel.textContent = `Sessions on ${dateFormatted} (${filtered.length}):`;
    }
  }

  // Prioritize active course sessions
  if (activeCourseId) {
    const courseObj = getAvailableCourses().find(c => String(c.id) === String(activeCourseId));
    const courseCode = courseObj ? (courseObj.course_code || courseObj.name || '').toLowerCase() : '';
    filtered.sort((a, b) => {
      const aMatches = String(a.courseId) === String(activeCourseId) || (courseCode && (a.title || '').toLowerCase().includes(courseCode));
      const bMatches = String(b.courseId) === String(activeCourseId) || (courseCode && (b.title || '').toLowerCase().includes(courseCode));
      return (bMatches ? 1 : 0) - (aMatches ? 1 : 0);
    });
  }

  if (filtered.length === 0) {
    noteCalSessionsList.innerHTML = `
      <div class="note-cal-empty-sessions">
        <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" fill="none" stroke-width="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <p>No calendar sessions found</p>
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach(ev => {
    const id = ev.id || ev.uid || `${ev.title}_${ev.start}`;
    const isLinked = activeNote && String(activeNote.sessionId) === String(id);
    const title = ev.title || ev.summary || 'Scheduled Session';

    let timeStr = '';
    let dateStr = '';
    if (ev.start) {
      try {
        const dStart = new Date(ev.start);
        dateStr = dStart.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStart = dStart.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
        let timeEnd = '';
        if (ev.end) {
          const dEnd = new Date(ev.end);
          timeEnd = ` - ${dEnd.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`;
        }
        timeStr = `${timeStart}${timeEnd}`;
      } catch (e) {}
    }

    html += `
      <div class="note-session-card-item ${isLinked ? 'active-session' : ''}" onclick="selectSessionFromModal('${escapeHtml(String(id))}')">
        <div class="note-session-card-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </div>
        <div class="note-session-card-details">
          <div class="note-session-card-title">${escapeHtml(title)}</div>
          <div class="note-session-card-meta">
            ${dateStr ? `<span>${escapeHtml(dateStr)}</span>` : ''}
            ${timeStr ? `<span>· ${escapeHtml(timeStr)}</span>` : ''}
            ${ev.location ? `<span>· 📍 ${escapeHtml(ev.location)}</span>` : ''}
          </div>
        </div>
        <button class="primary-button extra-small-btn">
          ${isLinked ? 'Linked' : 'Select'}
        </button>
      </div>
    `;
  });

  noteCalSessionsList.innerHTML = html;
}

/**
 * Handle user selecting a session from the modal
 */
function selectSessionFromModal(sessionId) {
  if (!activeNote) return;
  const allEvents = appState.scheduleEvents || [];
  const found = allEvents.find(ev => {
    const id = ev.id || ev.uid || `${ev.title}_${ev.start}`;
    return String(id) === String(sessionId);
  });

  if (!found) return;

  const title = found.title || found.summary || 'Scheduled Session';
  activeNote.sessionId = sessionId;
  activeNote.sessionTitle = title;

  updateSessionPickerDisplay(title);
  closeSessionCalendarModal();
  saveCurrentNote(false);
  renderNotesList();
  showToast(`Linked session: ${title}`);
}

/**
 * Helper: Extract plain text snippet from HTML
 */
function extractPlainTextSnippet(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').trim().replace(/\s+/g, ' ').substring(0, 110);
}

/**
 * Helper: Format date for note card
 */
function formatNoteDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (e) {
    return '';
  }
}
