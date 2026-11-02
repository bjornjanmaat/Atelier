/**
 * Render Course View DOM Elements with Details
 */
function renderCourseViewWithDetails(course, details) {
  if (courseHeaderTitle) courseHeaderTitle.textContent = course.name;
  const cleanCode = getCleanCourseCode(course);
  if (courseHeaderCode) {
    courseHeaderCode.textContent = cleanCode;
    courseHeaderCode.style.display = cleanCode ? '' : 'none';
  }
  if (courseHeaderTerm) courseHeaderTerm.textContent = course.term?.name || 'Active Semester';
  applyCourseHeaderCustomization(course);

  const teacher = course.teachers?.[0]?.display_name || 'Teaching Faculty';
  if (courseHeaderTeacher) courseHeaderTeacher.textContent = `Instructor: ${teacher}`;

  const enrollment = course.enrollments?.[0];
  const courseScore = enrollment?.computed_current_score;
  const courseLetter = enrollment?.computed_current_grade;
  if (courseScore != null) {
    const scoreStr = courseLetter ? `${courseScore}% (${courseLetter})` : `${courseScore}%`;
    if (courseHeaderGrade) courseHeaderGrade.textContent = `Grade: ${scoreStr}`;
    if (badgeGradesSummary) {
      badgeGradesSummary.textContent = `${courseScore}%`;
      badgeGradesSummary.classList.remove('hidden');
    }
  } else if (courseLetter) {
    if (courseHeaderGrade) courseHeaderGrade.textContent = `Grade: ${courseLetter}`;
    if (badgeGradesSummary) {
      badgeGradesSummary.textContent = courseLetter;
      badgeGradesSummary.classList.remove('hidden');
    }
  } else {
    if (courseHeaderGrade) courseHeaderGrade.textContent = 'Enrolled';
    if (badgeGradesSummary) {
      badgeGradesSummary.textContent = '';
      badgeGradesSummary.classList.add('hidden');
    }
  }

  // Render the Course Sections
  renderAnnouncementsTab(details.announcements || []);
  renderModulesTab(details.modules || []);
  renderAssignmentsTab(details.assignments || []);
  if (details.files) renderFilesTab(details.files);
  renderGradesTab(course, details.assignments || []);
}

async function triggerBackgroundCourseLiveFetch(tab, course) {
  if (appState.isDemo) return;
  if (!tab || !course || tab._isFetchingLive) return;
  const isOnline = Boolean(navigator.onLine && !appState.isOffline);
  if (!isOnline || !appState.currentToken) return;

  tab._isFetchingLive = true;
  try {
    if (window.canvasDesktop?.getCourseDetails) {
      const liveRes = await window.canvasDesktop.getCourseDetails({
        domain: appState.currentDomain,
        token: appState.currentToken,
        courseId: course.id,
        preferCache: false
      });
      if (liveRes && liveRes.success && liveRes.data) {
        tab.courseDetails = liveRes.data;
        appState.courseDetailsCache[course.id] = liveRes.data;
        if (appState.activeTabId === tab.id && appState.activeCourse?.id === course.id) {
          appState.courseDetails = liveRes.data;
          renderCourseViewWithDetails(course, liveRes.data);
        }
      }
    }
  } catch (err) {
    console.warn('Background course live fetch error:', err.message);
  } finally {
    tab._isFetchingLive = false;
  }
}

/**
 * Dedicated Tab-Aware Course Page Loader
 */
async function loadCoursePageForTab(tab, forceReload = false) {
  if (!tab || !tab.course) return;
  const course = tab.course;

  if (appState.activeTabId === tab.id) {
    if (courseHeaderTitle) courseHeaderTitle.textContent = course.name;
    const cleanCode = getCleanCourseCode(course);
    if (courseHeaderCode) {
      courseHeaderCode.textContent = cleanCode;
      courseHeaderCode.style.display = cleanCode ? '' : 'none';
    }
    if (courseHeaderTerm) courseHeaderTerm.textContent = course.term?.name || 'Active Semester';
  }

  const isOnline = Boolean(navigator.onLine && !appState.isOffline);

  // If already loaded and not force reload, restore instantly from cached details!
  const isMatchingDetails = tab.courseDetails &&
    (String(tab.courseDetails.courseId || tab.courseDetails.id) === String(course.id));

  if (isMatchingDetails && !forceReload) {
    if (appState.activeTabId === tab.id) {
      appState.courseDetails = tab.courseDetails;
      closeFilePreview();
      renderCourseViewWithDetails(course, tab.courseDetails);
      switchCourseTab(tab.courseTab || 'announcements');
      if (tab.scrollPosition) {
        const container = document.querySelector('.app-container');
        if (container) container.scrollTop = tab.scrollPosition;
      }
    }
    if (isOnline && appState.currentToken) {
      triggerBackgroundCourseLiveFetch(tab, course);
    }
    return;
  }

  // Clear stale courseDetails if they belonged to another course
  if (tab.courseDetails && !isMatchingDetails) {
    tab.courseDetails = null;
  }

  tab.isLoading = true;
  renderTabBar();

  let details = null;

  if (appState.isDemo) {
    details = appState.courseDetailsCache?.[course.id];
    if (!details && typeof getMockAccountData === 'function') {
      const mock = getMockAccountData();
      details = mock.courseDetails?.[course.id];
    }
    if (!details) {
      details = DEMO_COURSE_DETAILS;
    }
  } else {
    // 1. Cache-First: Check local disk cache immediately
    if (window.canvasDesktop?.getCourseDetails) {
      try {
        const cacheRes = await window.canvasDesktop.getCourseDetails({
          domain: appState.currentDomain,
          token: appState.currentToken || '',
          courseId: course.id,
          preferCache: true
        });
        if (cacheRes && cacheRes.success && cacheRes.data) {
          details = cacheRes.data;
        }
      } catch { }
    }

    // 2. If online and not yet cached (or forced reload), fetch live from Canvas
    if (isOnline && (!details || forceReload)) {
      try {
        if (window.canvasDesktop?.getCourseDetails) {
          const liveRes = await window.canvasDesktop.getCourseDetails({
            domain: appState.currentDomain,
            token: appState.currentToken,
            courseId: course.id,
            preferCache: false
          });
          if (liveRes && liveRes.success && liveRes.data) {
            details = liveRes.data;
          }
        }
      } catch (err) {
        console.warn('Live course fetch warning:', err.message);
      }
    } else if (isOnline && details && !forceReload) {
      // If we rendered cached details, trigger a background live fetch to get any updates
      triggerBackgroundCourseLiveFetch(tab, course);
    }

    if (!details) {
      details = { announcements: [], modules: [], assignments: [], files: [] };
    }

    // 3. If online, trigger background file and page synchronization for this course
    if (isOnline && window.canvasDesktop?.syncAllLocalContent && appState.currentToken) {
      window.canvasDesktop.syncAllLocalContent({
        domain: appState.currentDomain,
        token: appState.currentToken,
        courses: [course]
      }).then(() => updateOfflineSettingsStats()).catch(() => { });
    }
  }

  // Ensure all course files from modules and file directory are surfaced
  const combinedFiles = Array.isArray(details.files) ? [...details.files] : [];
  if (Array.isArray(details.modules)) {
    details.modules.forEach(mod => {
      (mod.items || []).forEach(it => {
        if ((it.type || '').toLowerCase() === 'file') {
          const fileId = it.content_id || it.id;
          const exists = combinedFiles.some(f => f.id === fileId || f.filename === it.title || f.display_name === it.title);
          if (!exists) {
            const rawTitle = it.title || 'file';
            const isCode = rawTitle.toLowerCase().includes('.py') || rawTitle.toLowerCase().includes('(python)') || rawTitle.toLowerCase().includes('.js');
            const isMd = rawTitle.toLowerCase().includes('.md') || rawTitle.toLowerCase().includes('markdown') || rawTitle.toLowerCase().includes('(markdown)');
            const isImg = rawTitle.toLowerCase().includes('.png') || rawTitle.toLowerCase().includes('.jpg') || rawTitle.toLowerCase().includes('(png)');
            const cType = isCode ? 'text/x-python' : (isMd ? 'text/markdown' : (isImg ? 'image/png' : 'application/pdf'));
            const validName = ensureFilenameExtension(rawTitle, cType);
            it.title = validName;

            combinedFiles.push({
              id: fileId,
              display_name: validName,
              filename: validName,
              content_type: cType,
              size: it.size || 0,
              url: it.url,
              module_name: mod.name,
              updated_at: it.updated_at || mod.unlock_at || new Date().toISOString()
            });
          }
        }
      });
    });
  }
  details.files = combinedFiles;
  details.courseId = course.id;

  appState.courseDetailsCache[course.id] = details;
  tab.courseDetails = details;
  tab.isLoading = false;
  renderTabBar();

  if (appState.activeTabId === tab.id) {
    appState.courseDetails = details;
    closeFilePreview();
    renderCourseViewWithDetails(course, details);
    switchCourseTab(tab.courseTab || 'announcements');
    syncCourseFilesLocally(course, details, false);
  }
}

/**
 * Dedicated Course Page Loader (Dispatches to active tab or new tab)
 */
async function loadCoursePage(course, options = {}) {
  if (options.newTab) {
    createNewTab({ type: 'course', course, activate: !options.background });
    return;
  }

  const activeTab = getActiveTab();
  if (activeTab) {
    navigateTab(activeTab.id, { type: 'course', course });
  } else {
    createNewTab({ type: 'course', course, activate: true });
  }
}

/**
 * Render Announcements Tab
 */
function renderAnnouncementsTab(announcements) {
  if (badgeAnnouncementsCount) badgeAnnouncementsCount.textContent = announcements.length;
  announcementsList.innerHTML = '';

  const query = (announcementSearchInput?.value || '').trim().toLowerCase();
  const filtered = announcements.filter(item => {
    if (!query) return true;
    const author = (item.user_name || item.author?.display_name || '').toLowerCase();
    const title = (item.title || '').toLowerCase();
    const msg = (item.message || '').toLowerCase();
    return author.includes(query) || title.includes(query) || msg.includes(query);
  });

  if (filtered.length === 0) {
    emptyAnnouncementsState.classList.remove('hidden');
    return;
  }

  emptyAnnouncementsState.classList.add('hidden');

  filtered.forEach((item) => {
    const card = document.createElement('div');
    const isUnread = isAnnouncementUnread(item);
    const isCurrentlyActive = Boolean(appState.activeFile && appState.activeFile.is_announcement && String(appState.activeFile.id) === String(item.id));
    card.className = 'announcement-card' + (isCurrentlyActive ? ' active' : '') + (isUnread ? ' unread' : '');
    card.setAttribute('data-announcement-id', String(item.id));
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.title = 'Click to open announcement in sidepanel';

    const authorName = item.user_name || item.author?.display_name || 'Course Instructor';
    const postDate = new Date(item.posted_at || item.created_at || Date.now()).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    card.innerHTML = `
      <div class="announcement-header">
        <div class="announcement-header-top">
          <h4 class="announcement-title">${escapeHtml(item.title)}</h4>
          <div class="announcement-top-actions">
            ${isUnread ? '<span class="announcement-badge unread">Unread</span>' : ''}
            <svg class="announcement-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </div>

        <div class="announcement-meta-row">
          <div class="author-wrap">
            <div class="author-avatar">${escapeHtml(authorName.charAt(0))}</div>
            <div class="author-info">
              <span class="author-name">${escapeHtml(authorName)}</span>
              <span class="meta-dot">&bull;</span>
              <span class="announcement-date">Posted on ${escapeHtml(postDate)}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    const openInSidepanel = () => {
      document.querySelectorAll('.announcement-card').forEach(c => c.classList.remove('active'));
      document.querySelectorAll('.home-announcement-item').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      card.classList.remove('unread');
      const badge = card.querySelector('.announcement-badge.unread');
      if (badge) badge.remove();

      const currentCourse = appState.activeCourse;
      const annWithCourse = {
        ...item,
        course: item.course || currentCourse,
        courseTitle: item.courseTitle || (currentCourse ? getCleanCourseTitle(currentCourse) : 'Course')
      };

      const previewFn = window.handleAnnouncementPreview || (typeof handleAnnouncementPreview === 'function' ? handleAnnouncementPreview : null);
      if (typeof previewFn === 'function') {
        previewFn(annWithCourse, card);
      }
    };

    card.addEventListener('click', openInSidepanel);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openInSidepanel();
      }
    });

    announcementsList.appendChild(card);
  });
}

/**
 * Render Modules Tab
 */
function renderModulesTab(modules) {
  if (badgeModulesCount) badgeModulesCount.textContent = modules.length;
  modulesList.innerHTML = '';

  if (modules.length === 0) {
    emptyModulesState.classList.remove('hidden');
    return;
  }

  emptyModulesState.classList.add('hidden');

  modules.forEach((mod, idx) => {
    const card = document.createElement('div');
    card.className = 'module-card' + (idx === 0 || mod.state === 'in-progress' ? ' open' : '');

    card.innerHTML = `
      <div class="module-header">
        <div class="module-header-left">
          <svg class="module-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          <span class="module-name">${escapeHtml(mod.name)}</span>
        </div>
      </div>

      <div class="module-items-list">
        ${(mod.items || []).map(it => {
      const itemType = (it.type || '').toLowerCase();

      // SubHeaders are purely organizational section titles - not files or pages
      if (itemType === 'subheader') {
        return `
              <div class="module-subheader-row" data-item-id="${it.id}">
                <span class="module-subheader-title">${escapeHtml(it.title)}</span>
              </div>
            `;
      }

      const isPage = itemType === 'page';
      const isFile = itemType === 'file' || it.file_name;
      const isExternal = itemType === 'externalurl' || itemType === 'external_url' || itemType === 'externaltool' || Boolean(it.external_url);
      const displayedTitle = isFile ? ensureFilenameExtension(it.title, 'application/pdf') : it.title;
      const displayedType = isExternal ? 'External Link' : (itemType === 'page' ? 'Page' : it.type);

      return `
            <div class="module-item-row" data-item-id="${it.id}" data-item-type="${itemType}">
              <div class="module-item-left">
                <div>
                  <div class="item-title">${escapeHtml(displayedTitle)}</div>
                  <div class="item-meta">${it.points ? `${it.points} pts &bull; ` : ''}${displayedType}</div>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <button class="module-item-tab-btn" data-newtab-id="${it.id}" title="Open in New Tab" aria-label="Open in New Tab">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                </button>
              </div>
            </div>
          `;
    }).join('')}
      </div>
    `;

    // Collapsible header toggle
    card.querySelector('.module-header').addEventListener('click', () => {
      card.classList.toggle('open');
    });

    // New Tab button for module items (pages, files, assignments, etc.)
    card.querySelectorAll('.module-item-tab-btn[data-newtab-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const itemId = Number(btn.getAttribute('data-newtab-id'));
        const it = (mod.items || []).find(x => x.id === itemId);
        if (it) openModuleItemInNewTab(it, mod);
      });
    });

    // Preview button for files
    card.querySelectorAll('.module-item-preview-btn[data-preview-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const itemId = Number(btn.getAttribute('data-preview-id'));
        const it = (mod.items || []).find(x => x.id === itemId);
        if (it) handleModuleItemPreview(it, mod);
      });
    });

    // Open button for pages
    card.querySelectorAll('.module-item-preview-btn[data-page-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const itemId = Number(btn.getAttribute('data-page-id'));
        const it = (mod.items || []).find(x => x.id === itemId);
        if (it) handleModulePagePreview(it, mod);
      });
    });

    // Row clicks for files, pages, and external links
    card.querySelectorAll('.module-item-row').forEach(row => {
      const itemId = Number(row.getAttribute('data-item-id'));
      const it = (mod.items || []).find(x => x.id === itemId);
      if (!it) return;
      const type = (it.type || '').toLowerCase();
      if (type === 'file' || it.file_name) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', (e) => {
          if (e.target.closest('.module-item-tab-btn')) return;
          handleModuleItemPreview(it, mod);
        });
      } else if (type === 'page') {
        row.style.cursor = 'pointer';
        row.addEventListener('click', (e) => {
          if (e.target.closest('.module-item-tab-btn')) return;
          handleModulePagePreview(it, mod);
        });
      } else if (type === 'assignment') {
        row.style.cursor = 'pointer';
        row.addEventListener('click', (e) => {
          if (e.target.closest('.module-item-tab-btn')) return;
          handleAssignmentPreview(it, mod);
        });
      } else if (type === 'externalurl' || type === 'external_url' || type === 'externaltool' || Boolean(it.external_url)) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', (e) => {
          if (e.target.closest('.module-item-tab-btn')) return;
          handleModuleExternalUrlPreview(it, mod);
        });
      }
    });

    modulesList.appendChild(card);
  });
}

/**
 * Open a Module Item (page, file, or assignment) in a New Tab
 */
function openModuleItemInNewTab(item, moduleObj) {
  const currentCourse = appState.activeCourse;
  if (!currentCourse) return;

  const currentDetails = appState.courseDetails;

  // Make sure sidepanel is closed
  closeFilePreview();

  // Create new dedicated tab of type 'module-item'
  const newTab = createNewTab({
    type: 'module-item',
    course: currentCourse,
    courseDetails: currentDetails,
    item: item,
    module: moduleObj,
    activate: true
  });

  renderTabBar();
}

/**
 * Render Full-Page Module Item Reader
 */
async function renderFullPageModuleItem(tab) {
  if (!moduleReaderSection || !moduleReaderContent) return;
  const item = tab.item;
  const moduleObj = tab.module;
  const course = tab.course || appState.activeCourse;
  if (!item) return;

  // Make sure right-side preview drawer stays closed
  closeFilePreview();

  const itemType = (item.type || '').toLowerCase();
  const rawTitle = item.title || item.display_name || 'Document';
  const courseTitle = course ? getCleanCourseTitle(course) : 'Course';
  const moduleName = moduleObj?.name || 'Module';

  // Update Header UI elements
  if (readerItemTitle) readerItemTitle.textContent = rawTitle;
  if (readerItemTitle) readerItemTitle.title = rawTitle;
  if (readerCourseName) readerCourseName.textContent = courseTitle;
  if (readerModuleName) readerModuleName.textContent = moduleName;
  if (readerBackBtnLabel) readerBackBtnLabel.textContent = `${courseTitle} Modules`;

  const isExternal = itemType === 'externalurl' || itemType === 'external_url' || itemType === 'externaltool' || Boolean(item.external_url);

  // Item icon
  if (readerItemIcon) {
    if (itemType === 'page') {
      readerItemIcon.textContent = '📖';
    } else if (isExternal) {
      readerItemIcon.textContent = '🔗';
    } else if (itemType === 'file' || item.file_name) {
      readerItemIcon.textContent = '📄';
    } else if (itemType === 'assignment') {
      readerItemIcon.textContent = '📝';
    } else {
      readerItemIcon.textContent = '📄';
    }
  }

  // Handle external URL button visibility
  if (readerExternalBtn) {
    const hasExternal = Boolean(item.external_url || item.html_url || item.url);
    readerExternalBtn.classList.toggle('hidden', !hasExternal);
  }

  // Branch by type: Page vs Assignment vs External URL vs File / Document
  if (itemType === 'page') {
    if (readerOpenAppBtn) readerOpenAppBtn.classList.add('hidden');
    if (readerRevealFinderBtn) readerRevealFinderBtn.classList.add('hidden');
    await renderFullPageCoursePage(item, moduleObj, tab);
  } else if (itemType === 'assignment') {
    if (readerOpenAppBtn) readerOpenAppBtn.classList.add('hidden');
    if (readerRevealFinderBtn) readerRevealFinderBtn.classList.add('hidden');
    await renderFullPageAssignment(item, moduleObj, tab);
  } else if (isExternal) {
    if (readerOpenAppBtn) readerOpenAppBtn.classList.add('hidden');
    if (readerRevealFinderBtn) readerRevealFinderBtn.classList.add('hidden');
    await renderFullPageWebpage(item, moduleObj, tab);
  } else {
    if (readerOpenAppBtn) readerOpenAppBtn.classList.remove('hidden');
    if (readerRevealFinderBtn) readerRevealFinderBtn.classList.remove('hidden');
    await renderFullPageDocumentFile(item, moduleObj, tab);
  }
}

/**
 * Render Full-Page Canvas Course Page (HTML / Body content)
 */
async function renderFullPageCoursePage(item, moduleObj, tab) {
  const pageTitle = item.title || 'Course Page';
  const pageUrl = item.page_url || (item.url && item.url.includes('/pages/') ? item.url.split('/pages/').pop() : null);

  // If item already has body cached
  if (item.body) {
    displayFullPageBodyContent(pageTitle, item.body, moduleObj);
    return;
  }

  // Show loading indicator
  moduleReaderContent.innerHTML = `
    <div class="preview-loading-wrap" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; height:100%;">
      <div class="preview-loading-spinner"></div>
      <span style="font-weight:600; font-size:15px; color:var(--color-text-primary);">Loading "${escapeHtml(pageTitle)}"...</span>
      <span style="font-size:12px; color:var(--color-text-muted);">Fetching page content from Canvas</span>
    </div>
  `;

  // Fetch from live Canvas if available
  if (!appState.isDemo && window.canvasDesktop?.getPageContent && (pageUrl || item.id)) {
    try {
      const res = await window.canvasDesktop.getPageContent({
        domain: appState.currentDomain,
        token: appState.currentToken,
        courseId: (tab.course || appState.activeCourse)?.id,
        pageUrl: pageUrl,
        pageId: item.page_id || item.id,
        url: item.url
      });

      if (res && res.success && res.page) {
        item.body = res.page.body || '<p>No content provided for this page.</p>';
        if (res.page.title) {
          item.title = res.page.title;
          if (readerItemTitle) readerItemTitle.textContent = res.page.title;
        }
        displayFullPageBodyContent(res.page.title || pageTitle, item.body, moduleObj);
        return;
      }
    } catch (err) {
      console.warn('Could not fetch Canvas page content for full-page reader:', err);
    }
  }

  // Fallback demo or offline display
  const pageDirectUrl = item.html_url || (item.url && item.url.startsWith('http') ? item.url : null);
  const fallbackHtml = `
    <div style="line-height:1.8; font-size: 15px;">
      <p>This page is part of module <strong>${escapeHtml(moduleObj?.name || 'this module')}</strong>.</p>
      <div style="background:var(--color-bg-card); padding:24px; border-radius:var(--radius-md); border:1px solid var(--color-border-subtle); margin:20px 0;">
        <h3 style="margin:0 0 10px 0; color:var(--color-text-primary); font-size:17px;">${escapeHtml(pageTitle)}</h3>
        <p style="margin:0 0 16px 0; font-size:14px; color:var(--color-text-secondary); line-height: 1.6;">
          ${item.body ? item.body : 'Module learning page registered in course curriculum.'}
        </p>
        ${pageDirectUrl ? `
          <button class="primary-button" id="readerPageDirectOpenBtn" style="font-size:13px; padding:7px 18px; cursor:pointer;">
            Open Page in Canvas LMS
          </button>
        ` : ''}
      </div>
    </div>
  `;
  displayFullPageBodyContent(pageTitle, fallbackHtml, moduleObj);

  if (pageDirectUrl) {
    setTimeout(() => {
      const btn = document.getElementById('readerPageDirectOpenBtn');
      if (btn) {
        btn.addEventListener('click', () => {
          if (window.canvasDesktop?.openExternal) {
            window.canvasDesktop.openExternal(pageDirectUrl);
          } else {
            window.open(pageDirectUrl, '_blank');
          }
        });
      }
    }, 10);
  }
}

function displayFullPageBodyContent(title, htmlBody, moduleObj) {
  if (!moduleReaderContent) return;
  moduleReaderContent.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.style.cssText = 'flex: 1; height: 100%; overflow-y: auto; overflow-x: hidden; padding: 32px 24px 60px;';

  wrap.innerHTML = `
    <div class="reader-page-container">
      <div class="reader-page-header">
        <span class="reader-module-tag">
          ${escapeHtml(moduleObj?.name || 'Course Module')}
        </span>
        <h1 class="reader-page-h1">
          ${escapeHtml(title)}
        </h1>
      </div>
      <div class="reader-page-body">
        ${htmlBody}
      </div>
    </div>
  `;

  moduleReaderContent.appendChild(wrap);
}

/**
 * Render Full-Page External Webpage in dedicated reader tab
 */
async function renderFullPageWebpage(item, moduleObj, tab) {
  if (!moduleReaderContent) return;
  moduleReaderContent.innerHTML = '';

  const url = item.external_url || item.url || item.html_url || '';
  const title = item.title || 'External Webpage';

  if (!url) {
    moduleReaderContent.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--color-text-secondary);">
        <p style="font-size: 15px; font-weight: 500;">No URL provided for this external module item.</p>
      </div>
    `;
    return;
  }

  const container = document.createElement('div');
  container.className = 'preview-webpage-container';

  const navBar = document.createElement('div');
  navBar.className = 'preview-webpage-bar';
  navBar.style.padding = '8px 20px';
  navBar.innerHTML = `
    <div class="preview-webpage-url-wrap" title="${escapeHtml(url)}">
      <svg class="preview-webpage-lock-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
      <span class="preview-webpage-url-text">${escapeHtml(url)}</span>
    </div>
    <div class="preview-webpage-actions">
      <button class="preview-webpage-action-btn" id="fullpageWebReloadBtn" title="Reload Webpage" aria-label="Reload Webpage">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
      </button>
      <button class="preview-webpage-action-btn" id="fullpageWebOpenExternalBtn" title="Open in External Browser" aria-label="Open in External Browser">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      </button>
    </div>
  `;

  const frameWrap = document.createElement('div');
  frameWrap.className = 'preview-webpage-frame-wrap';

  const loadingWrap = document.createElement('div');
  loadingWrap.className = 'preview-loading-wrap';
  loadingWrap.style.cssText = 'position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; z-index: 2; background: var(--color-bg-surface, #101524); pointer-events: none; transition: opacity 0.25s ease;';
  loadingWrap.innerHTML = `
    <div class="preview-loading-spinner"></div>
    <span style="font-weight: 600; font-size: 14px; color: var(--color-text-primary);">Loading "${escapeHtml(title)}"...</span>
    <span style="font-size: 12px; color: var(--color-text-muted); max-width: 80%; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(url)}</span>
  `;

  const iframe = document.createElement('iframe');
  iframe.className = 'preview-webpage-iframe';
  iframe.src = url;
  iframe.setAttribute('allow', 'fullscreen; clipboard-read; clipboard-write');

  iframe.addEventListener('load', () => {
    loadingWrap.style.opacity = '0';
    setTimeout(() => loadingWrap.remove(), 250);
  });

  setTimeout(() => {
    if (loadingWrap.parentElement) {
      loadingWrap.style.opacity = '0';
      setTimeout(() => loadingWrap.remove(), 250);
    }
  }, 4000);

  frameWrap.appendChild(loadingWrap);
  frameWrap.appendChild(iframe);

  container.appendChild(navBar);
  container.appendChild(frameWrap);
  moduleReaderContent.appendChild(container);

  const reloadBtn = navBar.querySelector('#fullpageWebReloadBtn');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      iframe.src = url;
    });
  }

  const openExtBtn = navBar.querySelector('#fullpageWebOpenExternalBtn');
  if (openExtBtn) {
    openExtBtn.addEventListener('click', () => {
      if (window.canvasDesktop?.openExternal) {
        window.canvasDesktop.openExternal(url);
      } else {
        window.open(url, '_blank');
      }
    });
  }
}

/**
 * Render Full-Page Document / File (PDF, Code, Markdown, Image)
 */
async function renderFullPageDocumentFile(item, moduleObj, tab) {
  const filesList = (tab.courseDetails || appState.courseDetails)?.files || [];

  // Match file in course file repository
  let matchingFile = null;
  if (item.content_id) {
    matchingFile = filesList.find(f => f.id === item.content_id);
  }
  if (!matchingFile && item.id) {
    matchingFile = filesList.find(f => f.id === item.id);
  }
  if (!matchingFile && (item.file_name || item.filename)) {
    const targetName = (item.file_name || item.filename).toLowerCase();
    matchingFile = filesList.find(f =>
      (f.filename && f.filename.toLowerCase() === targetName) ||
      (f.display_name && f.display_name.toLowerCase() === targetName)
    );
  }
  if (!matchingFile && item.title) {
    const titleLower = item.title.toLowerCase();
    matchingFile = filesList.find(f => {
      const fName = (f.filename || '').toLowerCase().replace(/\.[^/.]+$/, '');
      const dName = (f.display_name || '').toLowerCase().replace(/\.[^/.]+$/, '');
      return (fName && titleLower.includes(fName)) || (dName && titleLower.includes(dName)) ||
        (fName && fName.includes(titleLower)) || (dName && dName.includes(titleLower));
    });
  }

  let targetFile = matchingFile;
  if (!targetFile) {
    const rawTitle = item.title || 'Document';
    const isCode = rawTitle.toLowerCase().includes('.py') || rawTitle.toLowerCase().includes('(python)') || rawTitle.toLowerCase().includes('.js');
    const isMd = rawTitle.toLowerCase().includes('.md') || rawTitle.toLowerCase().includes('markdown') || rawTitle.toLowerCase().includes('(markdown)');
    const isImg = rawTitle.toLowerCase().includes('.png') || rawTitle.toLowerCase().includes('.jpg') || rawTitle.toLowerCase().includes('(png)');
    const contentType = isCode ? 'text/x-python' : (isMd ? 'text/markdown' : (isImg ? 'image/png' : 'application/pdf'));
    const finalFilename = ensureFilenameExtension(rawTitle, contentType);

    targetFile = {
      id: item.content_id || item.id || Date.now(),
      content_id: item.content_id,
      display_name: finalFilename,
      filename: finalFilename,
      content_type: contentType,
      mime_class: isCode ? 'code' : (isMd ? 'markdown' : (isImg ? 'image' : 'pdf')),
      size: item.size || 1024,
      url: item.url || null,
      description: `Module resource from ${moduleObj?.name || 'Course Module'}: ${item.title}`
    };
  }

  // Attach readerFile to tab for action buttons
  tab.readerFile = targetFile;
  appState.activeFile = targetFile;

  const typeInfo = getFileTypeInfo(targetFile);
  const fileName = ensureFilenameExtension(targetFile.display_name || targetFile.filename || 'Document', targetFile.content_type || (typeInfo.type === 'pdf' ? 'application/pdf' : ''));
  targetFile.display_name = fileName;
  targetFile.filename = fileName;

  // Loading state
  moduleReaderContent.innerHTML = `
    <div class="preview-loading-wrap" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; height:100%;">
      <div class="preview-loading-spinner"></div>
      <span style="font-weight:600; font-size:15px; color:var(--color-text-primary);">Loading "${escapeHtml(fileName)}"...</span>
      <span style="font-size:12px; color:var(--color-text-muted);">Preparing full-page document view</span>
    </div>
  `;

  // Download locally if needed
  if (!targetFile.local_path && !appState.isDemo) {
    try {
      if (window.canvasDesktop?.getFileData) {
        const res = await window.canvasDesktop.getFileData({
          domain: appState.currentDomain,
          token: appState.currentToken,
          fileUrl: targetFile.url,
          fileId: targetFile.id,
          filename: fileName,
          courseId: (tab.course || appState.activeCourse)?.id,
          mimeType: targetFile['content-type'] || targetFile.content_type
        });

        if (res && res.success) {
          targetFile.local_path = res.localPath;
          targetFile.is_downloaded = true;
          if (res.type === 'text') {
            if (typeInfo.type === 'markdown') {
              targetFile.text_content = res.content;
            } else {
              targetFile.code_content = res.content;
            }
          } else if (res.type === 'pdf') {
            targetFile.localPdfPath = res.localPath;
            targetFile.dataUrl = res.dataUrl;
          } else if (res.type === 'image') {
            targetFile.dataUrl = res.dataUrl;
          }
        }
      }
    } catch (err) {
      console.warn('Error loading file data for full page reader:', err);
    }
  } else if (!targetFile.local_path && appState.isDemo) {
    await ensureFileDownloaded(targetFile);
  }

  // Render into moduleReaderContent
  moduleReaderContent.innerHTML = '';
  if (typeInfo.type === 'pdf') {
    renderPdfDocument(targetFile, fileName, moduleReaderContent);
  } else if (typeInfo.type === 'image') {
    const imgSrc = targetFile.local_path ? `file://${targetFile.local_path}` : (targetFile.dataUrl || targetFile.url);
    const imgContainer = document.createElement('div');
    imgContainer.className = 'preview-image-container';
    imgContainer.style.cssText = 'flex: 1; height: 100%; display: flex; align-items: center; justify-content: center; overflow: auto; padding: 24px;';
    imgContainer.innerHTML = `<img src="${imgSrc}" alt="${escapeHtml(fileName)}" style="max-width: 95%; max-height: 95%; object-fit: contain; border-radius: var(--radius-md); box-shadow: 0 6px 24px rgba(0,0,0,0.25);" />`;
    moduleReaderContent.appendChild(imgContainer);
  } else if (typeInfo.type === 'code') {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'flex: 1; height: 100%; overflow: auto; padding: 24px;';
    const codeText = targetFile.code_content || `// ${fileName}\n// File content loaded from Canvas LMS\nconsole.log("Ready");`;

    wrap.innerHTML = `
      <div class="preview-code-wrap" style="max-width: 980px; margin: 0 auto;">
        <div class="preview-code-bar">
          <span style="font-weight:600; font-size:13px;">${escapeHtml(fileName)}</span>
          <button class="secondary-button small-btn" id="readerCopyCodeBtn">Copy Code</button>
        </div>
        <pre class="preview-code-content" style="max-height: 70vh;"><code>${escapeHtml(codeText)}</code></pre>
      </div>
    `;

    wrap.querySelector('#readerCopyCodeBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(codeText);
      showToast('Source code copied to clipboard!');
    });

    moduleReaderContent.appendChild(wrap);
  } else if (typeInfo.type === 'markdown') {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'flex: 1; height: 100%; overflow: auto; padding: 32px 24px;';
    const mdText = targetFile.text_content || `# ${fileName}\n\nDocument notes preview.`;

    let formatted = escapeHtml(mdText)
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/\n\n/gim, '<p></p>')
      .replace(/\n/gim, '<br />');

    const mdWrap = document.createElement('div');
    mdWrap.className = 'preview-markdown-view';
    mdWrap.style.cssText = 'max-width: 860px; margin: 0 auto;';
    mdWrap.innerHTML = formatted;
    wrap.appendChild(mdWrap);
    moduleReaderContent.appendChild(wrap);
  } else {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'flex: 1; height: 100%; overflow: auto; padding: 32px 24px;';
    const content = targetFile.text_content || 'Document ready for viewing.';
    wrap.innerHTML = `
      <div class="preview-desc-banner" style="max-width: 860px; margin: 0 auto;">
        <h4>${escapeHtml(fileName)}</h4>
        <pre style="margin-top: 14px; font-family: monospace; white-space: pre-wrap; font-size: 13px; line-height: 1.6;">${escapeHtml(content)}</pre>
      </div>
    `;
    moduleReaderContent.appendChild(wrap);
  }
}

/**
 * Handle Module Page Preview / Open
 */
async function handleModulePagePreview(item, moduleObj) {
  if (!filePreviewPanel) return;

  const itemType = (item.type || '').toLowerCase();
  if (itemType === 'externalurl' || itemType === 'external_url' || itemType === 'externaltool' || Boolean(item.external_url)) {
    handleModuleExternalUrlPreview(item, moduleObj);
    return;
  }

  const pageTitle = item.title || 'Course Page';
  const pageUrl = item.page_url || (item.url && item.url.includes('/pages/') ? item.url.split('/pages/').pop() : null);

  const pagePseudoFile = {
    id: item.id || Date.now(),
    display_name: pageTitle,
    filename: pageTitle,
    content_type: 'text/html',
    mime_class: 'page',
    is_page: true,
    url: item.html_url || item.url || null
  };

  appState.activeFile = pagePseudoFile;

  if (previewFileIcon) previewFileIcon.textContent = '📖';
  if (previewFileName) previewFileName.textContent = pageTitle;
  if (previewFileMetaTop) previewFileMetaTop.textContent = `Course Page • ${moduleObj?.name || 'Module'}`;

  if (previewOpenAppBtn) previewOpenAppBtn.style.display = 'none';
  if (previewExternalBtn) {
    previewExternalBtn.style.display = '';
    previewExternalBtn.title = 'Open in Browser';
  }

  filePreviewPanel.classList.remove('hidden');

  // If item already has body text/html, render it directly
  if (item.body) {
    renderPageBodyContent(pageTitle, item.body, moduleObj);
    return;
  }

  // If live Canvas and we have page identifier, fetch page content via IPC
  if (!appState.isDemo && window.canvasDesktop?.getPageContent && (pageUrl || item.id)) {
    if (previewBody) {
      previewBody.innerHTML = `
        <div class="preview-loading-wrap" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; height:100%;">
          <div class="preview-loading-spinner"></div>
          <span style="font-weight:600; font-size:14px; color:var(--color-text-primary);">Loading "${escapeHtml(pageTitle)}"...</span>
          <span style="font-size: 12px; color: var(--color-text-muted);">Fetching page content from Canvas</span>
        </div>
      `;
    }

    try {
      const res = await window.canvasDesktop.getPageContent({
        domain: appState.currentDomain,
        token: appState.currentToken,
        courseId: appState.activeCourse?.id,
        pageUrl: pageUrl,
        pageId: item.page_id || item.id,
        url: item.url
      });

      if (res && res.success && res.page) {
        item.body = res.page.body || '<p>No content provided for this page.</p>';
        if (res.page.title) pagePseudoFile.display_name = res.page.title;
        if (res.page.html_url) pagePseudoFile.url = res.page.html_url;
        renderPageBodyContent(res.page.title || pageTitle, item.body, moduleObj);
        return;
      } else if (res && !res.success) {
        console.warn('Canvas page fetch returned failure:', res.error);
      }
    } catch (err) {
      console.warn('Could not fetch Canvas page content via API:', err);
    }
  }

  // Fallback demo / page info content
  const pageDirectUrl = item.html_url || (item.url && item.url.startsWith('http') ? item.url : null);
  const fallbackHtml = `
    <div style="line-height:1.7;">
      <p>This page is part of module <strong>${escapeHtml(moduleObj?.name || 'this module')}</strong>.</p>
      <div style="background:var(--color-bg-subtle); padding:18px; border-radius:var(--radius-md); border:1px solid var(--color-border-subtle); margin:16px 0;">
        <h4 style="margin:0 0 8px 0; color:var(--color-text-primary); font-size:15px;">${escapeHtml(pageTitle)}</h4>
        <p style="margin:0 0 14px 0; font-size:13px; color:var(--color-text-secondary);">
          ${item.body ? item.body : 'Page details registered in course curriculum.'}
        </p>
        ${pageDirectUrl ? `
          <button class="secondary-button" id="previewPageOpenLinkBtn" style="font-size:12px; padding:6px 14px; cursor:pointer;">
            Open Page in Canvas
          </button>
        ` : ''}
      </div>
    </div>
  `;
  renderPageBodyContent(pageTitle, fallbackHtml, moduleObj);

  if (pageDirectUrl) {
    setTimeout(() => {
      const btn = document.getElementById('previewPageOpenLinkBtn');
      if (btn) {
        btn.addEventListener('click', () => {
          if (window.canvasDesktop?.openExternal) {
            window.canvasDesktop.openExternal(pageDirectUrl);
          } else {
            window.open(pageDirectUrl, '_blank');
          }
        });
      }
    }, 10);
  }
}

function renderPageBodyContent(title, htmlBody, moduleObj) {
  if (!previewBody) return;
  previewBody.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'preview-scroll-content';
  wrap.style.cssText = 'flex: 1; height: 100%; overflow-y: auto; overflow-x: hidden; padding: 20px; max-width: 100%; box-sizing: border-box; min-width: 0;';

  wrap.innerHTML = `
    <div class="preview-page-container" style="max-width: 100%; width: 100%; margin: 0 auto; box-sizing: border-box; overflow-x: hidden; min-width: 0;">
      <div class="preview-page-header" style="margin-bottom: 20px; padding-bottom: 14px; border-bottom: 1px solid var(--color-border-subtle);">
        <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-brand-primary);">
          ${escapeHtml(moduleObj?.name || 'Module Page')}
        </span>
        <h2 style="margin: 6px 0 0 0; font-size: 20px; font-weight: 700; color: var(--color-text-primary);">
          ${escapeHtml(title)}
        </h2>
      </div>
      <div class="preview-page-content" style="color: var(--color-text-primary); font-size: 14px; line-height: 1.7; min-width: 0; max-width: 100%; overflow-x: hidden;">
        ${htmlBody}
      </div>
    </div>
  `;

  // Post-process images & containers to guarantee responsive scaling inside sidepanel
  wrap.querySelectorAll('img').forEach(img => {
    img.removeAttribute('width');
    img.removeAttribute('height');
    img.style.setProperty('max-width', '100%', 'important');
    img.style.setProperty('width', 'auto', 'important');
    img.style.setProperty('height', 'auto', 'important');
    img.style.setProperty('display', 'block', 'important');
    img.style.setProperty('object-fit', 'contain', 'important');
    img.style.setProperty('box-sizing', 'border-box', 'important');
    img.loading = 'lazy';

    // Walk up the DOM tree and relax any parents with explicit fixed widths
    let parent = img.parentElement;
    while (parent && parent !== wrap && parent !== previewBody) {
      if (parent.style.width && (parseInt(parent.style.width, 10) > 300 || parent.style.width.includes('px'))) {
        parent.style.width = '100%';
        parent.style.maxWidth = '100%';
      }
      if (parent.style.minWidth) {
        parent.style.minWidth = '0px';
      }
      if (parent.getAttribute('width')) {
        parent.removeAttribute('width');
      }
      parent = parent.parentElement;
    }
  });

  // Also sanitize tables, figures, iframes with fixed widths
  wrap.querySelectorAll('table, figure, iframe, embed, object').forEach(el => {
    if (el.getAttribute('width')) {
      el.removeAttribute('width');
    }
    if (el.style.width && (parseInt(el.style.width, 10) > 300 || el.style.width.includes('px'))) {
      el.style.width = '100%';
      el.style.maxWidth = '100%';
    }
    el.style.minWidth = '0';
  });

  previewBody.appendChild(wrap);
}

/**
 * Handle Module External URL Preview / Open in Sidepanel
 */
function handleModuleExternalUrlPreview(item, moduleObj) {
  if (!filePreviewPanel) return;

  const url = item.external_url || item.url || item.html_url || '';
  const title = item.title || 'External Link';

  const pseudoFile = {
    id: item.id || Date.now(),
    display_name: title,
    filename: title,
    content_type: 'text/html',
    mime_class: 'webpage',
    is_external_url: true,
    url: url
  };

  appState.activeFile = pseudoFile;

  if (previewFileIcon) previewFileIcon.textContent = '🔗';
  if (previewFileName) previewFileName.textContent = title;
  if (previewFileMetaTop) previewFileMetaTop.textContent = `External Link • ${moduleObj?.name || 'Module'}`;

  if (previewOpenAppBtn) previewOpenAppBtn.style.display = 'none';
  if (previewExternalBtn) {
    previewExternalBtn.style.display = '';
    previewExternalBtn.title = 'Open in Browser';
  }

  filePreviewPanel.classList.remove('hidden');

  renderWebpagePreviewBody(url, title);
}

function renderWebpagePreviewBody(url, title) {
  if (!previewBody) return;
  previewBody.innerHTML = '';

  if (!url) {
    previewBody.innerHTML = `
      <div style="padding: 32px 20px; text-align: center; color: var(--color-text-secondary);">
        <p style="font-size: 14px; font-weight: 500;">No URL provided for this external module item.</p>
      </div>
    `;
    return;
  }

  const container = document.createElement('div');
  container.className = 'preview-webpage-container';

  // Frame container
  const frameWrap = document.createElement('div');
  frameWrap.className = 'preview-webpage-frame-wrap';

  const loadingWrap = document.createElement('div');
  loadingWrap.className = 'preview-loading-wrap';
  loadingWrap.style.cssText = 'position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; z-index: 2; background: var(--color-bg-surface, #101524); pointer-events: none; transition: opacity 0.25s ease;';
  loadingWrap.innerHTML = `
    <div class="preview-loading-spinner"></div>
    <span style="font-weight: 600; font-size: 13px; color: var(--color-text-primary);">Loading webpage...</span>
    <span style="font-size: 11px; color: var(--color-text-muted); max-width: 80%; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(url)}</span>
  `;

  const iframe = document.createElement('iframe');
  iframe.className = 'preview-webpage-iframe';
  iframe.src = url;
  iframe.setAttribute('allow', 'fullscreen; clipboard-read; clipboard-write');

  iframe.addEventListener('load', () => {
    loadingWrap.style.opacity = '0';
    setTimeout(() => loadingWrap.remove(), 250);
  });

  setTimeout(() => {
    if (loadingWrap.parentElement) {
      loadingWrap.style.opacity = '0';
      setTimeout(() => loadingWrap.remove(), 250);
    }
  }, 4000);

  frameWrap.appendChild(loadingWrap);
  frameWrap.appendChild(iframe);

  container.appendChild(frameWrap);
  previewBody.appendChild(container);
}

function handleModuleItemPreview(item, moduleObj, searchQuery = '') {
  const itemType = (item.type || '').toLowerCase();
  if (itemType === 'assignment') {
    handleAssignmentPreview(item, moduleObj, searchQuery);
    return;
  }
  if (itemType === 'externalurl' || itemType === 'external_url' || itemType === 'externaltool' || Boolean(item.external_url)) {
    handleModuleExternalUrlPreview(item, moduleObj);
    return;
  }

  const filesList = appState.courseDetails?.files || [];

  // 1. Match by content_id (standard Canvas LMS module file link)
  let matchingFile = null;
  if (item.content_id) {
    matchingFile = filesList.find(f => f.id === item.content_id);
  }

  // 2. Match by id
  if (!matchingFile && item.id) {
    matchingFile = filesList.find(f => f.id === item.id);
  }

  // 3. Match by file_name or filename
  if (!matchingFile && (item.file_name || item.filename)) {
    const targetName = (item.file_name || item.filename).toLowerCase();
    matchingFile = filesList.find(f =>
      (f.filename && f.filename.toLowerCase() === targetName) ||
      (f.display_name && f.display_name.toLowerCase() === targetName)
    );
  }

  // 4. Match by title comparison
  if (!matchingFile && item.title) {
    const titleLower = item.title.toLowerCase();
    matchingFile = filesList.find(f => {
      const fName = (f.filename || '').toLowerCase().replace(/\.[^/.]+$/, '');
      const dName = (f.display_name || '').toLowerCase().replace(/\.[^/.]+$/, '');
      return (fName && titleLower.includes(fName)) || (dName && titleLower.includes(dName)) ||
        (fName && fName.includes(titleLower)) || (dName && dName.includes(titleLower));
    });
  }

  // 5. If found in course files, open that file directly!
  if (matchingFile) {
    openFilePreview(matchingFile, searchQuery);
    return;
  }

  // 6. Build a tailored preview representation for this item (defaulting academic documents to PDF)
  const rawTitle = item.title || 'Module File';
  const isCode = rawTitle.toLowerCase().includes('.py') || rawTitle.toLowerCase().includes('(python)') || rawTitle.toLowerCase().includes('.js');
  const isMd = rawTitle.toLowerCase().includes('.md') || rawTitle.toLowerCase().includes('markdown') || rawTitle.toLowerCase().includes('(markdown)');
  const isImg = rawTitle.toLowerCase().includes('.png') || rawTitle.toLowerCase().includes('.jpg') || rawTitle.toLowerCase().includes('(png)');
  const contentType = isCode ? 'text/x-python' : (isMd ? 'text/markdown' : (isImg ? 'image/png' : 'application/pdf'));
  const finalFilename = ensureFilenameExtension(rawTitle, contentType);

  const customFile = {
    id: item.content_id || item.id || Date.now(),
    content_id: item.content_id,
    display_name: finalFilename,
    filename: finalFilename,
    content_type: contentType,
    mime_class: isCode ? 'code' : (isMd ? 'markdown' : (isImg ? 'image' : 'pdf')),
    size: item.size || 1024,
    url: item.url || null,
    description: `Module resource from ${moduleObj?.name || 'Course Module'}: ${item.title}`
  };

  openFilePreview(customFile, searchQuery);
}


