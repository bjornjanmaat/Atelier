async function loadSavedCredentials() {
  try {
    const savedDomain = localStorage.getItem(STORAGE_KEYS.DOMAIN);
    const savedToken = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const savedRemember = localStorage.getItem(STORAGE_KEYS.REMEMBER);

    if (typeof isDemoCredentials === 'function' && isDemoCredentials(savedDomain, savedToken)) {
      await loadDemoMode(false);
      return;
    }

    if (savedDomain) {
      if (canvasDomainInput) canvasDomainInput.value = savedDomain;
      if (settingsDomainInput) settingsDomainInput.value = savedDomain;
      appState.currentDomain = savedDomain;
    }

    if (savedRemember === 'false') {
      if (rememberCredentialsCheckbox) rememberCredentialsCheckbox.checked = false;
      if (settingsRemember) settingsRemember.checked = false;
    }

    if (savedToken) {
      if (accessTokenInput) accessTokenInput.value = savedToken;
      if (settingsTokenInput) settingsTokenInput.value = savedToken;
      appState.currentToken = savedToken;
    }

    // Schedule iCal feed URL initialization
    const DEFAULT_SCHEDULE_URL = '';
    const savedScheduleUrl = localStorage.getItem(STORAGE_KEYS.SCHEDULE_ICAL) || DEFAULT_SCHEDULE_URL;
    if (savedScheduleUrl) {
      appState.scheduleIcalUrl = savedScheduleUrl;
      if (settingsScheduleIcalInput) settingsScheduleIcalInput.value = savedScheduleUrl;
      localStorage.setItem(STORAGE_KEYS.SCHEDULE_ICAL, savedScheduleUrl);
      // Fetch or rehydrate schedule in background
      syncScheduleFromUrl(false);
    }

    // 1. Cache-First: Check if we have cached profile and courses on disk
    let cachedProfile = null;
    let cachedCourses = [];
    try {
      if (window.canvasDesktop?.getUserProfile) {
        const pRes = await window.canvasDesktop.getUserProfile({ domain: savedDomain || '', token: '' });
        if (pRes && pRes.success && pRes.data) cachedProfile = pRes.data;
      }
      if (window.canvasDesktop?.getCourses) {
        const cRes = await window.canvasDesktop.getCourses({ domain: savedDomain || '', token: '', preferCache: true });
        if (cRes && cRes.success && cRes.data?.courses) cachedCourses = cRes.data.courses;
      }
      if ((!cachedCourses || cachedCourses.length === 0) && localStorage.getItem('canvas_cached_courses')) {
        cachedCourses = JSON.parse(localStorage.getItem('canvas_cached_courses'));
      }
    } catch { }

    const hasOfflineContent = Boolean(cachedCourses && cachedCourses.length > 0);
    const isOnline = navigator.onLine;

    if (hasOfflineContent) {
      // CACHE-FIRST: Render saved offline content immediately!
      appState.isOffline = !isOnline;
      appState.profileData = cachedProfile || (savedDomain ? { profile: { name: 'Canvas Student' } } : DEMO_DATA);
      appState.courses = typeof filterActiveCoursesOnly === 'function' ? filterActiveCoursesOnly(cachedCourses) : cachedCourses;
      appState.currentDomain = savedDomain || '';
      appState.currentToken = savedToken || '';
      appState.isDemo = false;

      if (canvasDomainInput && savedDomain) canvasDomainInput.value = savedDomain;
      if (accessTokenInput && savedToken) accessTokenInput.value = savedToken;
      if (settingsDomainInput && savedDomain) settingsDomainInput.value = savedDomain;
      if (settingsTokenInput && savedToken) settingsTokenInput.value = savedToken;

      renderProfile(appState.profileData, false);
      renderCourses(appState.courses);
      initTabs();
      switchView('home');

      if (!isOnline) {
        updateStatusPill('Offline Mode', 'offline');
        showOfflineBanner(true);
        showToast('Loaded offline content. Ready to work offline.');
        updateOfflineSettingsStats();
        return;
      } else {
        updateStatusPill('Connected', 'connected');
        showOfflineBanner(false);
        updateOfflineSettingsStats();
        // Fetch new courses and updates immediately when connected
        if (savedDomain && savedToken && savedRemember !== 'false') {
          (async () => {
            try {
              await fetchAndRenderCourses(savedDomain, savedToken);
              if (typeof renderHomeDashboardWidgets === 'function') {
                renderHomeDashboardWidgets();
              }
              if (typeof refreshAllCourseDetailsLive === 'function') {
                await refreshAllCourseDetailsLive(true);
              }
              performBackgroundSync(savedDomain, savedToken);
            } catch (err) {
              console.warn('Startup live sync warning:', err);
            }
          })();
        }
        return;
      }
    }

    // 2. If no cached content exists yet:
    const hasDomain = Boolean(savedDomain && savedDomain.trim().length > 0);
    const hasToken = Boolean(savedToken && savedToken.trim().length > 0 && rememberCredentialsCheckbox?.checked);

    if (hasDomain && hasToken && isOnline) {
      await performAuthentication(savedDomain, savedToken, false);
    } else if (!isOnline) {
      enterOfflineMode({ useDemoFallback: true });
    } else {
      switchView('auth');
      // DO NOT pop up modal automatically! Users can connect or click "Work Offline" without modal interruption.
    }
  } catch (err) {
    console.error('Error during loadSavedCredentials:', err);
    if (appLoadingScreen) appLoadingScreen.classList.add('hidden');
    switchView('auth');
  }
}

function setupEventListeners() {
  // Sidebar Profile Card -> Click opens Settings page as dedicated tab
  if (sidebarProfileCard) {
    sidebarProfileCard.addEventListener('click', (e) => {
      e.stopPropagation();
      if (appState.profileData || appState.isDemo) {
        if (e.metaKey || e.ctrlKey || e.button === 1) {
          createNewTab({ type: 'settings', title: 'Settings', activate: true });
        } else {
          const activeTab = getActiveTab();
          if (activeTab && activeTab.type !== 'settings') {
            navigateTab(activeTab.id, { type: 'settings', title: 'Settings' });
          } else if (!activeTab) {
            createNewTab({ type: 'settings', title: 'Settings', activate: true });
          }
        }
      } else {
        switchView('auth');
      }
    });
  }

  // Windowbar Right Corner Settings Button -> Settings & Profile Page
  if (navSettingsBtn) {
    navSettingsBtn.addEventListener('click', () => {
      const activeTab = getActiveTab();
      if (activeTab && activeTab.type === 'settings') {
        navigateTab(activeTab.id, { type: 'home', title: 'Dashboard' });
      } else if (appState.profileData || appState.isDemo) {
        if (activeTab) {
          navigateTab(activeTab.id, { type: 'settings', title: 'Settings' });
        } else {
          createNewTab({ type: 'settings', title: 'Settings', activate: true });
        }
      } else {
        switchView('auth');
      }
    });
  }

  // Sidebar Collapse / Expand buttons
  if (sidebarCollapseBtn) {
    sidebarCollapseBtn.addEventListener('click', () => setSidebarCollapsed(true));
  }
  if (sidebarExpandBtn) {
    sidebarExpandBtn.addEventListener('click', () => setSidebarCollapsed(false));
  }

  // Keyboard shortcut to toggle sidebar: Cmd+B (Mac) or Ctrl+B
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
      if (typeof isUserAuthenticated === 'function' && !isUserAuthenticated()) return;
      if (appState.activeView === 'auth') return;
      e.preventDefault();
      toggleSidebar();
    }
  });

  // Sidebar Brand Logo -> return to Home / Dashboard
  const sidebarBrandLogo = document.getElementById('sidebarBrandLogo');
  if (sidebarBrandLogo) {
    sidebarBrandLogo.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.button === 1) {
        createNewTab({ type: 'home', activate: true });
      } else {
        const activeTab = getActiveTab();
        if (activeTab && activeTab.type !== 'home') {
          navigateTab(activeTab.id, { type: 'home' });
        } else if (!activeTab) {
          createNewTab({ type: 'home', activate: true });
        }
      }
    });
  }

  // Sidebar Dashboard Button -> return to Home / Courses
  if (sidebarHomeBtn) {
    sidebarHomeBtn.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.button === 1) {
        createNewTab({ type: 'home', activate: true });
      } else {
        const activeTab = getActiveTab();
        if (activeTab && activeTab.type !== 'home') {
          navigateTab(activeTab.id, { type: 'home' });
        } else if (!activeTab) {
          createNewTab({ type: 'home', activate: true });
        }
      }
    });
  }

  // Sidebar Calendar Button -> open dedicated Calendar page
  if (sidebarCalendarBtn) {
    sidebarCalendarBtn.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.button === 1) {
        createNewTab({ type: 'calendar', title: 'Calendar', activate: true });
      } else {
        const activeTab = getActiveTab();
        if (activeTab && activeTab.type !== 'calendar') {
          navigateTab(activeTab.id, { type: 'calendar', title: 'Calendar' });
        } else if (!activeTab) {
          createNewTab({ type: 'calendar', title: 'Calendar', activate: true });
        }
      }
    });
  }

  // Sidebar Assignments Button -> open dedicated Assignments page
  if (sidebarAssignmentsBtn) {
    sidebarAssignmentsBtn.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.button === 1) {
        createNewTab({ type: 'assignments', title: 'Assignments', activate: true });
      } else {
        const activeTab = getActiveTab();
        if (activeTab && activeTab.type !== 'assignments') {
          navigateTab(activeTab.id, { type: 'assignments', title: 'Assignments' });
        } else if (!activeTab) {
          createNewTab({ type: 'assignments', title: 'Assignments', activate: true });
        }
      }
    });
  }

  // Sidebar Announcements Button -> open dedicated Announcements page
  if (sidebarAnnouncementsBtn) {
    sidebarAnnouncementsBtn.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.button === 1) {
        createNewTab({ type: 'announcements', title: 'Announcements', activate: true });
      } else {
        const activeTab = getActiveTab();
        if (activeTab && activeTab.type !== 'announcements') {
          navigateTab(activeTab.id, { type: 'announcements', title: 'Announcements' });
        } else if (!activeTab) {
          createNewTab({ type: 'announcements', title: 'Announcements', activate: true });
        }
      }
    });
  }

  // Sidebar Inbox Button -> open dedicated Canvas Inbox page
  if (sidebarInboxBtn) {
    sidebarInboxBtn.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.button === 1) {
        createNewTab({ type: 'inbox', title: 'Inbox', activate: true });
      } else {
        const activeTab = getActiveTab();
        if (activeTab && activeTab.type !== 'inbox') {
          navigateTab(activeTab.id, { type: 'inbox', title: 'Inbox' });
        } else if (!activeTab) {
          createNewTab({ type: 'inbox', title: 'Inbox', activate: true });
        }
      }
    });
  }

  // Sidebar Notes Button -> open dedicated Notes page
  if (sidebarNotesBtn) {
    sidebarNotesBtn.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.button === 1) {
        createNewTab({ type: 'notes', title: 'Notes', activate: true });
      } else {
        const activeTab = getActiveTab();
        if (activeTab && activeTab.type !== 'notes') {
          navigateTab(activeTab.id, { type: 'notes', title: 'Notes' });
        } else if (!activeTab) {
          createNewTab({ type: 'notes', title: 'Notes', activate: true });
        }
      }
    });
  }

  // Sidebar Assistant Button -> open dedicated AI page
  if (sidebarAiBtn) {
    sidebarAiBtn.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.button === 1) {
        createNewTab({ type: 'ai', title: 'Assistant', activate: true });
      } else {
        const activeTab = getActiveTab();
        if (activeTab && activeTab.type !== 'ai') {
          navigateTab(activeTab.id, { type: 'ai', title: 'Assistant' });
        } else if (!activeTab) {
          createNewTab({ type: 'ai', title: 'Assistant', activate: true });
        }
      }
    });
  }

  if (calPageSettingsLinkBtn) {
    calPageSettingsLinkBtn.addEventListener('click', () => {
      const activeTab = getActiveTab();
      if (activeTab && activeTab.type !== 'settings') {
        navigateTab(activeTab.id, { type: 'settings' });
      } else if (!activeTab) {
        createNewTab({ type: 'settings', activate: true });
      }
    });
  }

  if (calPageSyncBtn) {
    calPageSyncBtn.addEventListener('click', async () => {
      if (typeof syncScheduleFromUrl === 'function') {
        calPageSyncBtn.disabled = true;
        await syncScheduleFromUrl(true);
        if (typeof renderDedicatedCalendarPage === 'function') {
          renderDedicatedCalendarPage();
        }
        calPageSyncBtn.disabled = false;
        showToast('Calendar schedule refreshed');
      }
    });
  }

  // Course Page Breadcrumb in windowbar -> return to Courses
  if (titlebarCourseBreadcrumb) {
    titlebarCourseBreadcrumb.addEventListener('click', () => {
      const activeTab = getActiveTab();
      if (activeTab && activeTab.historyIndex > 0) {
        tabGoBack();
      } else if (activeTab) {
        navigateTab(activeTab.id, { type: 'home' });
      }
    });
  }

  // Back to Courses from Settings Page
  if (backToCoursesBtn) {
    backToCoursesBtn.addEventListener('click', () => {
      const activeTab = getActiveTab();
      if (activeTab && activeTab.historyIndex > 0) {
        tabGoBack();
      } else if (activeTab) {
        navigateTab(activeTab.id, { type: 'home' });
      }
    });
  }

  // Back to Home from Course Page
  if (courseBackToHomeBtn) {
    courseBackToHomeBtn.addEventListener('click', () => {
      const activeTab = getActiveTab();
      if (activeTab && activeTab.historyIndex > 0) {
        tabGoBack();
      } else if (activeTab) {
        navigateTab(activeTab.id, { type: 'home' });
      }
    });
  }

  // Course Page Internal Tabs
  document.querySelectorAll('.course-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      switchCourseTab(tabName);
    });
  });

  // Files Tab Search & Filter
  if (filesSearchInput) {
    filesSearchInput.addEventListener('input', () => {
      renderFilesTab(appState.courseDetails?.files || []);
    });
  }

  // Download All Course Files Locally
  if (downloadAllFilesBtn) {
    downloadAllFilesBtn.addEventListener('click', () => {
      if (!appState.activeCourse || !appState.courseDetails) return;
      syncCourseFilesLocally(appState.activeCourse, appState.courseDetails, true);
    });
  }

  // Right-Side File Preview Controls
  if (previewCloseBtn) {
    previewCloseBtn.addEventListener('click', closeFilePreview);
  }

  // Full-Page Module Reader Controls
  if (readerBackToCourseBtn) {
    readerBackToCourseBtn.addEventListener('click', () => {
      const activeTab = getActiveTab();
      if (activeTab && activeTab.type === 'module-item' && activeTab.course) {
        navigateTab(activeTab.id, {
          type: 'course',
          course: activeTab.course,
          courseTab: 'modules'
        });
      } else if (appState.activeCourse) {
        switchView('course');
        switchCourseTab('modules');
      } else {
        switchView('home');
      }
    });
  }

  if (readerOpenAppBtn) {
    readerOpenAppBtn.addEventListener('click', () => {
      const tab = getActiveTab();
      const fileToOpen = tab?.readerFile || appState.activeFile;
      if (fileToOpen) {
        openFileLocally(fileToOpen);
      }
    });
  }

  if (readerRevealFinderBtn) {
    readerRevealFinderBtn.addEventListener('click', () => {
      const tab = getActiveTab();
      const fileToOpen = tab?.readerFile || appState.activeFile;
      if (fileToOpen) {
        revealFileInFinder(fileToOpen);
      }
    });
  }

  if (readerExternalBtn) {
    readerExternalBtn.addEventListener('click', () => {
      const tab = getActiveTab();
      const targetUrl = tab?.readerFile?.url || tab?.item?.html_url || tab?.item?.url || null;
      if (targetUrl) {
        if (window.canvasDesktop?.openExternal) {
          window.canvasDesktop.openExternal(targetUrl);
        } else {
          window.open(targetUrl, '_blank');
        }
      }
    });
  }

  if (previewOpenAppBtn) {
    previewOpenAppBtn.addEventListener('click', () => {
      if (appState.activeFile) {
        openFileLocally(appState.activeFile);
      }
    });
  }

  if (previewExternalBtn) {
    previewExternalBtn.addEventListener('click', () => {
      if (!appState.activeFile) return;
      const file = appState.activeFile;
      const isWebpage = Boolean(
        file.is_external_url ||
        file.is_wiki_page ||
        file.is_page ||
        file.is_assignment ||
        file.is_announcement ||
        file.mime_class === 'webpage' ||
        file.mime_class === 'announcement' ||
        (file.content_type === 'text/html' && !file.localPdfPath && !file.local_path && !file.size)
      );

      if (isWebpage) {
        const url = file.url || file.external_url || file.html_url || (file.id ? `${appState.profileData?.meta?.instanceUrl || 'https://canvas.instructure.com'}/files/${file.id}` : '');
        if (url) {
          if (window.canvasDesktop?.openExternal) {
            window.canvasDesktop.openExternal(url);
          } else {
            window.open(url, '_blank');
          }
        }
      } else {
        openFileLocally(file);
      }
    });
  }

  if (previewDownloadBtn) {
    previewDownloadBtn.addEventListener('click', () => {
      if (!appState.activeFile) return;
      const file = appState.activeFile;
      const fileName = ensureFilenameExtension(
        file.display_name || file.filename || 'download.txt',
        file.content_type || file['content-type'] || (file.localPdfPath ? 'application/pdf' : '')
      );
      if (file.code_content || file.text_content) {
        const blob = new Blob([file.code_content || file.text_content], { type: file.content_type || 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast(`Downloaded ${fileName}`);
      } else if (file.url) {
        if (window.canvasDesktop?.openExternal) {
          window.canvasDesktop.openExternal(file.url);
        } else {
          window.open(file.url, '_blank');
        }
      } else {
        showToast(`Downloaded ${fileName}`);
      }
    });
  }

  // Resizable Sidepanel Handle
  if (previewResizeHandle && filePreviewPanel) {
    const savedWidth = localStorage.getItem('canvas_preview_panel_width');
    if (savedWidth) {
      const parsedW = parseInt(savedWidth, 10);
      if (!isNaN(parsedW) && parsedW >= 360 && parsedW <= window.innerWidth * 0.88) {
        filePreviewPanel.style.width = `${parsedW}px`;
      }
    }

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    previewResizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isResizing = true;
      startX = e.clientX;
      startWidth = filePreviewPanel.getBoundingClientRect().width;
      filePreviewPanel.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const deltaX = startX - e.clientX;
      const minW = 360;
      // Keep in sync with max-width on .file-preview-panel in styles.css
      const maxW = Math.floor(filePreviewPanel.parentElement.clientWidth * 0.6);
      const newWidth = Math.max(minW, Math.min(startWidth + deltaX, maxW));
      filePreviewPanel.style.width = `${newWidth}px`;
    });

    window.addEventListener('mouseup', () => {
      if (!isResizing) return;
      isResizing = false;
      filePreviewPanel.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const finalWidth = parseInt(filePreviewPanel.style.width, 10);
      if (!isNaN(finalWidth)) {
        localStorage.setItem('canvas_preview_panel_width', finalWidth);
      }
      // Re-trigger layout/resize event for active PDF or viewer if present
      window.dispatchEvent(new Event('resize'));
    });
  }

  // Escape key closes file preview or credentials modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (filePreviewPanel && !filePreviewPanel.classList.contains('hidden')) {
        closeFilePreview();
      }
      if (credentialsModal && !credentialsModal.classList.contains('hidden')) {
        hideMissingCredentialsModal();
        if (appState.activeView === 'auth') {
          enterOfflineMode();
        }
      }
    }
  });

  // Assignment filter pills in Course Page
  document.querySelectorAll('[data-assign-filter]').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('[data-assign-filter]').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      appState.assignmentFilter = pill.getAttribute('data-assign-filter');
      renderAssignmentsTab(appState.courseDetails?.assignments || []);
    });
  });

  // Open active course in Canvas
  if (courseOpenExternalBtn) {
    courseOpenExternalBtn.addEventListener('click', () => {
      if (!appState.activeCourse) return;
      const host = appState.profileData?.meta?.instanceUrl || 'https://canvas.instructure.com';
      const courseUrl = `${host}/courses/${appState.activeCourse.id}`;
      if (window.canvasDesktop?.openExternal) {
        window.canvasDesktop.openExternal(courseUrl);
      } else {
        window.open(courseUrl, '_blank');
      }
    });
  }

  // Course customization button in course hero
  if (courseCustomizeBtn) {
    courseCustomizeBtn.addEventListener('click', () => {
      if (appState.activeCourse) {
        openCourseCustomizationModal(appState.activeCourse);
      }
    });
  }

  // Course customization modal events
  if (closeCourseCustomizationModalBtn) {
    closeCourseCustomizationModalBtn.addEventListener('click', closeCourseCustomizationModal);
  }
  if (customizationCancelBtn) {
    customizationCancelBtn.addEventListener('click', closeCourseCustomizationModal);
  }
  if (customizationSaveBtn) {
    customizationSaveBtn.addEventListener('click', saveCurrentCourseCustomization);
  }
  if (customizationResetBtn) {
    customizationResetBtn.addEventListener('click', resetCurrentCourseCustomization);
  }
  if (courseCustomizationModal) {
    courseCustomizationModal.addEventListener('click', (e) => {
      if (e.target === courseCustomizationModal) {
        closeCourseCustomizationModal();
      }
    });
  }
  if (customizationCustomColorPicker) {
    customizationCustomColorPicker.addEventListener('input', (e) => {
      selectCustomColor(e.target.value);
    });
  }
  if (customizationCustomColorInput) {
    customizationCustomColorInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        selectCustomColor(val);
      }
    });
  }

  // Course Archiving Modal & Sidebar 3-dots button
  if (sidebarCoursesSettingsBtn) {
    sidebarCoursesSettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof openCourseArchiveModal === 'function') {
        openCourseArchiveModal();
      }
    });
  }

  if (closeCourseArchiveModalBtn) {
    closeCourseArchiveModalBtn.addEventListener('click', () => {
      if (typeof closeCourseArchiveModal === 'function') {
        closeCourseArchiveModal();
      }
    });
  }

  if (closeCourseArchiveDoneBtn) {
    closeCourseArchiveDoneBtn.addEventListener('click', () => {
      if (typeof closeCourseArchiveModal === 'function') {
        closeCourseArchiveModal();
      }
    });
  }

  if (courseArchiveModal) {
    courseArchiveModal.addEventListener('click', (e) => {
      if (e.target === courseArchiveModal && typeof closeCourseArchiveModal === 'function') {
        closeCourseArchiveModal();
      }
    });

    const archivePills = courseArchiveModal.querySelectorAll('[data-archive-filter]');
    archivePills.forEach(pill => {
      pill.addEventListener('click', () => {
        archivePills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        courseArchiveFilter = pill.getAttribute('data-archive-filter') || 'all';
        if (typeof renderCourseArchiveModalList === 'function') {
          renderCourseArchiveModalList();
        }
      });
    });
  }

  if (courseArchiveSearchInput) {
    courseArchiveSearchInput.addEventListener('input', (e) => {
      courseArchiveSearchQuery = e.target.value;
      if (typeof renderCourseArchiveModalList === 'function') {
        renderCourseArchiveModalList();
      }
    });
  }

  if (openSettingsViewFromArchiveBtn) {
    openSettingsViewFromArchiveBtn.addEventListener('click', () => {
      if (typeof closeCourseArchiveModal === 'function') {
        closeCourseArchiveModal();
      }
      const activeTab = getActiveTab();
      if (activeTab && activeTab.type !== 'settings') {
        navigateTab(activeTab.id, { type: 'settings', title: 'Settings' });
      } else if (!activeTab) {
        createNewTab({ type: 'settings', title: 'Settings', activate: true });
      } else {
        switchView('settings');
      }
      setTimeout(() => {
        if (settingsCoursesCard) {
          settingsCoursesCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    });
  }

  if (settingsCoursesCard) {
    const settingsPills = settingsCoursesCard.querySelectorAll('[data-settings-archive-filter]');
    settingsPills.forEach(pill => {
      pill.addEventListener('click', () => {
        settingsPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        settingsCourseArchiveFilter = pill.getAttribute('data-settings-archive-filter') || 'all';
        if (typeof renderSettingsCoursesCardList === 'function') {
          renderSettingsCoursesCardList();
        }
      });
    });
  }

  if (settingsCoursesSearchInput) {
    settingsCoursesSearchInput.addEventListener('input', (e) => {
      settingsCourseArchiveSearchQuery = e.target.value;
      if (typeof renderSettingsCoursesCardList === 'function') {
        renderSettingsCoursesCardList();
      }
    });
  }

  // Refresh active course details
  if (refreshCourseDetailsBtn) {
    refreshCourseDetailsBtn.addEventListener('click', async () => {
      if (!appState.activeCourse) return;
      await loadCoursePage(appState.activeCourse);
      showToast('Course content refreshed');
    });
  }

  // Theme toggle on Settings Page
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }
  document.querySelectorAll('.theme-preview-card').forEach(card => {
    card.addEventListener('click', () => {
      const targetTheme = card.getAttribute('data-theme-select');
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      if (targetTheme && targetTheme !== cur) {
        setTheme(targetTheme);
      }
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const targetTheme = card.getAttribute('data-theme-select');
        const cur = document.documentElement.getAttribute('data-theme') || 'dark';
        if (targetTheme && targetTheme !== cur) {
          setTheme(targetTheme);
        }
      }
    });
  });

  // Docs Modal (if opened via help)
  if (closeDocsModalBtn) closeDocsModalBtn.addEventListener('click', () => docsModal?.classList.add('hidden'));
  if (docsModal) {
    docsModal.addEventListener('click', (e) => {
      if (e.target === docsModal) docsModal.classList.add('hidden');
    });
  }

  // Missing Credentials Warning Modal
  if (closeCredentialsModalBtn) {
    closeCredentialsModalBtn.addEventListener('click', () => {
      hideMissingCredentialsModal();
      if (appState.activeView === 'auth') {
        enterOfflineMode();
      }
    });
  }
  if (credentialsModal) {
    credentialsModal.addEventListener('click', (e) => {
      if (e.target === credentialsModal) {
        hideMissingCredentialsModal();
        if (appState.activeView === 'auth') {
          enterOfflineMode();
        }
      }
    });
  }
  if (credentialsModalOfflineBtn) {
    credentialsModalOfflineBtn.addEventListener('click', () => {
      hideMissingCredentialsModal();
      enterOfflineMode();
    });
  }
  if (loadOfflineBtn) {
    loadOfflineBtn.addEventListener('click', () => {
      enterOfflineMode();
    });
  }
  if (offlineBarReconnectBtn) {
    offlineBarReconnectBtn.addEventListener('click', () => {
      reconnectCanvas();
    });
  }
  if (btnToggleOfflineMode) {
    btnToggleOfflineMode.addEventListener('click', () => {
      toggleOfflineMode();
    });
  }
  if (btnPrecacheAllCourses) {
    btnPrecacheAllCourses.addEventListener('click', () => {
      precacheAllForOffline();
    });
  }

  // Clear All Cache Modal & Action
  if (btnClearCacheBtn && clearCacheConfirmModal) {
    btnClearCacheBtn.addEventListener('click', () => {
      clearCacheConfirmModal.classList.remove('hidden');
    });
  }

  const hideClearCacheModal = () => {
    if (clearCacheConfirmModal) clearCacheConfirmModal.classList.add('hidden');
  };

  if (closeClearCacheModalBtn) closeClearCacheModalBtn.addEventListener('click', hideClearCacheModal);
  if (cancelClearCacheBtn) cancelClearCacheBtn.addEventListener('click', hideClearCacheModal);
  if (clearCacheConfirmModal) {
    clearCacheConfirmModal.addEventListener('click', (e) => {
      if (e.target === clearCacheConfirmModal) hideClearCacheModal();
    });
  }

  if (confirmClearCacheBtn) {
    confirmClearCacheBtn.addEventListener('click', async () => {
      confirmClearCacheBtn.disabled = true;
      confirmClearCacheBtn.textContent = 'Clearing...';
      try {
        if (window.canvasDesktop?.clearCache) {
          await window.canvasDesktop.clearCache();
        }
        localStorage.removeItem(STORAGE_KEYS.SCHEDULE_CACHE);
        hideClearCacheModal();
        showToast('All local cache cleared successfully.');
        if (typeof updateOfflineSettingsStats === 'function') {
          updateOfflineSettingsStats();
        }
      } catch (err) {
        showToast(`Failed to clear cache: ${err.message || 'Error'}`);
      } finally {
        confirmClearCacheBtn.disabled = false;
        confirmClearCacheBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          <span>Clear Cache</span>
        `;
      }
    });
  }

  // Calendar Connect Schedule Onboarding Modal
  const hideCalendarScheduleModal = () => {
    if (calendarConnectScheduleModal) calendarConnectScheduleModal.classList.add('hidden');
  };

  if (closeCalendarScheduleModalBtn) {
    closeCalendarScheduleModalBtn.addEventListener('click', hideCalendarScheduleModal);
  }
  if (dismissCalendarScheduleModalBtn) {
    dismissCalendarScheduleModalBtn.addEventListener('click', hideCalendarScheduleModal);
  }
  if (calendarConnectScheduleModal) {
    calendarConnectScheduleModal.addEventListener('click', (e) => {
      if (e.target === calendarConnectScheduleModal) hideCalendarScheduleModal();
    });
  }

  if (goToSettingsScheduleBtn) {
    goToSettingsScheduleBtn.addEventListener('click', () => {
      hideCalendarScheduleModal();
      if (typeof navigateToDedicatedTab === 'function') {
        navigateToDedicatedTab('settings', 'Settings');
      } else if (typeof getActiveTab === 'function' && typeof navigateTab === 'function') {
        const activeTab = getActiveTab();
        if (activeTab && activeTab.type !== 'settings') {
          navigateTab(activeTab.id, { type: 'settings', title: 'Settings' });
        } else if (!activeTab && typeof createNewTab === 'function') {
          createNewTab({ type: 'settings', title: 'Settings', activate: true });
        }
      } else if (typeof switchView === 'function') {
        switchView('settings');
      }
      setTimeout(() => {
        const scheduleInput = document.getElementById('settingsScheduleIcalInput');
        if (scheduleInput) {
          scheduleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          scheduleInput.focus();
        }
      }, 150);
    });
  }

  // Network Online / Offline Detection
  window.addEventListener('offline', () => {
    appState.isOffline = true;
    updateStatusPill('Offline Mode', 'offline');
    showOfflineBanner(true);
    updateOfflineSettingsStats();
    showToast('Network disconnected. Atelier is working in Offline Mode.');
  });
  window.addEventListener('online', () => {
    appState.isOffline = false;
    updateStatusPill('Connected', 'connected');
    showOfflineBanner(false);
    updateOfflineSettingsStats();
    showToast('Internet connection restored! Checking for course updates in background...');
    if (appState.currentDomain && appState.currentToken && !appState.isDemo) {
      performBackgroundSync(appState.currentDomain, appState.currentToken);
    }
  });

  if (toggleModalTokenVisibility && modalTokenInput) {
    toggleModalTokenVisibility.addEventListener('click', () => {
      const isPw = modalTokenInput.type === 'password';
      modalTokenInput.type = isPw ? 'text' : 'password';
      toggleModalTokenVisibility.style.color = isPw ? 'var(--color-brand-primary)' : 'var(--color-text-muted)';
    });
  }

  if (modalDomainInput) {
    modalDomainInput.addEventListener('input', (e) => {
      canvasDomainInput.value = e.target.value;
      if (settingsDomainInput) settingsDomainInput.value = e.target.value;
    });
  }
  if (modalTokenInput) {
    modalTokenInput.addEventListener('input', (e) => {
      accessTokenInput.value = e.target.value;
    });
  }

  if (credentialsModalEnterBtn) {
    credentialsModalEnterBtn.addEventListener('click', async () => {
      const domain = (modalDomainInput && modalDomainInput.value.trim()) || canvasDomainInput.value.trim();
      const token = (modalTokenInput && modalTokenInput.value.trim()) || accessTokenInput.value.trim();

      if (domain) {
        canvasDomainInput.value = domain;
        if (settingsDomainInput) settingsDomainInput.value = domain;
      }
      if (token) {
        accessTokenInput.value = token;
      }

      if (!domain || !token) {
        showMissingCredentialsModal({
          missingDomain: !domain,
          missingToken: !token
        });
        if (!domain && modalDomainInput) modalDomainInput.focus();
        else if (!token && modalTokenInput) modalTokenInput.focus();
        return;
      }

      hideMissingCredentialsModal();
      switchView('auth');
      await performAuthentication(domain, token, true);
    });
  }
  if (credentialsModalDemoBtn) {
    credentialsModalDemoBtn.addEventListener('click', () => {
      hideMissingCredentialsModal();
      loadDemoMode();
    });
  }

  // Password visibility
  toggleTokenVisibilityBtn.addEventListener('click', () => {
    const isPw = accessTokenInput.type === 'password';
    accessTokenInput.type = isPw ? 'text' : 'password';
    toggleTokenVisibilityBtn.style.color = isPw ? 'var(--color-brand-primary)' : 'var(--color-text-muted)';
  });
  toggleSettingsTokenVisibility.addEventListener('click', () => {
    const isPw = settingsTokenInput.type === 'password';
    settingsTokenInput.type = isPw ? 'text' : 'password';
    toggleSettingsTokenVisibility.style.color = isPw ? 'var(--color-brand-primary)' : 'var(--color-text-muted)';
  });

  // Domain Presets
  document.querySelectorAll('.preset-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const domain = pill.getAttribute('data-domain');
      canvasDomainInput.value = domain;
      if (settingsDomainInput) settingsDomainInput.value = domain;
      if (modalDomainInput) modalDomainInput.value = domain;
      appState.currentDomain = domain;
      document.querySelectorAll('.preset-pill').forEach(p => {
        p.classList.toggle('active', p.getAttribute('data-domain') === domain);
      });
    });
  });

  // Auth Form
  initialAuthForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const domain = canvasDomainInput.value.trim();
    const token = accessTokenInput.value.trim();
    if (!domain || !token) {
      showMissingCredentialsModal({
        missingDomain: !domain,
        missingToken: !token
      });
      return;
    }
    hideMissingCredentialsModal();
    await performAuthentication(domain, token, true);
  });

  // Demo Account
  if (loadDemoBtn) {
    loadDemoBtn.addEventListener('click', () => loadDemoMode());
  }

  // Settings Save
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const domain = settingsDomainInput ? settingsDomainInput.value.trim() : '';
      const token = settingsTokenInput ? settingsTokenInput.value.trim() : '';
      if (!token) {
        showToast('Canvas Access Token is required.');
        return;
      }
      if (saveCredentialsBtn) {
        saveCredentialsBtn.disabled = true;
        saveCredentialsBtn.textContent = 'Saving...';
      }
      try {
        await performAuthentication(domain, token, true);
        showToast('Settings saved & reconnected!');
        const menu = document.getElementById('profileSettingsMenu');
        if (menu) menu.classList.add('hidden');
      } finally {
        if (saveCredentialsBtn) {
          saveCredentialsBtn.disabled = false;
          saveCredentialsBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            <span>Save</span>
          `;
        }
      }
    });
  }

  // Profile Settings Menu Toggle
  const profileSettingsBtn = document.getElementById('profileSettingsBtn');
  const profileSettingsMenu = document.getElementById('profileSettingsMenu');
  if (profileSettingsBtn && profileSettingsMenu) {
    profileSettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = profileSettingsMenu.classList.contains('hidden');
      profileSettingsMenu.classList.toggle('hidden');
      profileSettingsBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    });

    profileSettingsMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    document.addEventListener('click', (e) => {
      if (!profileSettingsMenu.classList.contains('hidden') && !profileSettingsBtn.contains(e.target)) {
        profileSettingsMenu.classList.add('hidden');
        profileSettingsBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Schedule URL Save & Test Sync
  if (btnSaveScheduleUrl) {
    btnSaveScheduleUrl.addEventListener('click', async () => {
      const url = settingsScheduleIcalInput ? settingsScheduleIcalInput.value.trim() : '';
      if (!url) {
        showToast('Please enter an iCal feed URL.');
        return;
      }
      appState.scheduleIcalUrl = url;
      localStorage.setItem(STORAGE_KEYS.SCHEDULE_ICAL, url);
      showToast('Schedule URL saved. Syncing timetable...');
      btnSaveScheduleUrl.disabled = true;
      try {
        await syncScheduleFromUrl(true);
        showToast('Schedule synced successfully!');
      } finally {
        btnSaveScheduleUrl.disabled = false;
      }
    });
  }

  if (btnTestSyncSchedule) {
    btnTestSyncSchedule.addEventListener('click', async () => {
      const url = settingsScheduleIcalInput ? settingsScheduleIcalInput.value.trim() : '';
      if (url) {
        appState.scheduleIcalUrl = url;
        localStorage.setItem(STORAGE_KEYS.SCHEDULE_ICAL, url);
      }
      btnTestSyncSchedule.disabled = true;
      try {
        await syncScheduleFromUrl(true);
        showToast('Schedule refreshed from iCal feed!');
      } catch (err) {
        showToast(`Sync failed: ${err.message || 'Error'}`);
      } finally {
        btnTestSyncSchedule.disabled = false;
      }
    });
  }

  // Disconnect
  if (disconnectSettingsBtn) {
    disconnectSettingsBtn.addEventListener('click', () => disconnectAccount());
  }

  // Refresh Profile
  if (refreshProfileBtn) {
    refreshProfileBtn.addEventListener('click', async () => {
      if (appState.isDemo) {
        showToast('Demo profile refreshed');
        return;
      }
      await performAuthentication(appState.currentDomain, appState.currentToken, false);
      showToast('Profile refreshed from Canvas API');
    });
  }

  // Refresh Courses (Home)
  if (refreshCoursesBtn) {
    refreshCoursesBtn.addEventListener('click', async () => {
      if (appState.isDemo) {
        renderCourses(DEMO_DATA.courses);
        showToast('Demo courses refreshed');
        return;
      }
      await fetchAndRenderCourses(appState.currentDomain, appState.currentToken);
      showToast('Courses refreshed from Canvas LMS');
    });
  }

  // Search & Filter Courses
  if (courseSearchInput) courseSearchInput.addEventListener('input', applyCourseFilters);
  if (termFilterSelect) termFilterSelect.addEventListener('change', applyCourseFilters);
  if (resetCourseFilterBtn) {
    resetCourseFilterBtn.addEventListener('click', () => {
      if (courseSearchInput) courseSearchInput.value = '';
      if (termFilterSelect) termFilterSelect.value = 'all';
      applyCourseFilters();
    });
  }

  // Centralized Global Search Listeners
  if (topSearchTriggerBar) {
    topSearchTriggerBar.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof isUserAuthenticated === 'function' && !isUserAuthenticated()) return;
      if (appState.activeView === 'auth') return;
      openGlobalSearch();
    });
    topSearchTriggerBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (typeof isUserAuthenticated === 'function' && !isUserAuthenticated()) return;
        if (appState.activeView === 'auth') return;
        openGlobalSearch();
      }
    });
  }

  if (searchPageBackdrop) {
    searchPageBackdrop.addEventListener('click', () => {
      closeGlobalSearch();
    });
  }

  if (searchPageCloseBtn) {
    searchPageCloseBtn.addEventListener('click', () => {
      closeGlobalSearch();
    });
  }

  if (globalSearchInput) {
    globalSearchInput.addEventListener('input', debounceGlobalSearch);
    globalSearchInput.addEventListener('keydown', handleGlobalSearchKeydown);
  }

  if (globalSearchCourseSelect) {
    globalSearchCourseSelect.addEventListener('change', () => {
      appState.globalSearchCourseFilter = globalSearchCourseSelect.value;
      updateGlobalSearchPlaceholder();
      renderSearchPageCourseChips();
      executeGlobalSearch();
    });
  }

  if (globalSearchClearBtn) {
    globalSearchClearBtn.addEventListener('click', () => {
      if (globalSearchInput) {
        globalSearchInput.value = '';
        globalSearchInput.focus();
      }
      globalSearchClearBtn.classList.add('hidden');
      executeGlobalSearch();
    });
  }

  if (globalSearchTypeFilters) {
    globalSearchTypeFilters.addEventListener('click', (e) => {
      const chip = e.target.closest('.search-filter-chip');
      if (!chip) return;
      globalSearchTypeFilters.querySelectorAll('.search-filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      appState.globalSearchTypeFilter = chip.getAttribute('data-type-filter') || 'all';
      executeGlobalSearch();
    });
  }

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (typeof isUserAuthenticated === 'function' && !isUserAuthenticated()) return;
      if (appState.activeView === 'auth') return;
      toggleGlobalSearch();
    } else if (e.key === 'Escape' && searchPageOverlay && searchPageOverlay.classList.contains('open')) {
      e.preventDefault();
      closeGlobalSearch();
    }
  });

  // Copy ICS & Subscribe
  if (copyIcsBtn) {
    copyIcsBtn.addEventListener('click', () => {
      const icsUrl = icsFeedInput ? icsFeedInput.value : '';
      if (icsUrl && !icsUrl.includes('No feed')) {
        navigator.clipboard.writeText(icsUrl);
        showToast('Calendar ICS Feed copied!');
      }
    });
  }
  if (openIcsBtn) {
    openIcsBtn.addEventListener('click', () => {
      const icsUrl = icsFeedInput ? icsFeedInput.value : '';
      if (icsUrl && !icsUrl.includes('No feed')) {
        const webcalUrl = icsUrl.replace(/^https?:\/\//i, 'webcal://');
        if (window.canvasDesktop?.openExternal) {
          window.canvasDesktop.openExternal(webcalUrl);
        } else {
          window.open(webcalUrl, '_blank');
        }
      }
    });
  }

  // Copy Email
  if (copyEmailBtn) {
    copyEmailBtn.addEventListener('click', () => {
      const email = userEmail ? userEmail.textContent : '';
      if (email) {
        navigator.clipboard.writeText(email);
        showToast('Email address copied!');
      }
    });
  }

  // JSON Viewer
  if (copyJsonBtn) {
    copyJsonBtn.addEventListener('click', () => {
      if (appState.rawJsonString) {
        navigator.clipboard.writeText(appState.rawJsonString);
        showToast('Profile JSON copied to clipboard!');
      }
    });
  }
  if (downloadJsonBtn) {
    downloadJsonBtn.addEventListener('click', () => {
      if (!appState.rawJsonString) return;
      const blob = new Blob([appState.rawJsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `canvas_profile_${appState.profileData?.profile?.id || 'export'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Profile JSON exported');
    });
  }
  if (jsonSearchInput) {
    jsonSearchInput.addEventListener('input', (e) => {
      filterJsonDisplay(e.target.value.trim().toLowerCase());
    });
  }

  // Browser Tab Bar Events
  if (browserNewTabBtn) {
    browserNewTabBtn.addEventListener('click', () => {
      createNewTab({ type: 'home', activate: true });
    });
  }

  // Browser Navigation Controls
  if (browserNavBackBtn) {
    browserNavBackBtn.addEventListener('click', () => tabGoBack());
  }
  if (browserNavForwardBtn) {
    browserNavForwardBtn.addEventListener('click', () => tabGoForward());
  }
  if (browserNavReloadBtn) {
    browserNavReloadBtn.addEventListener('click', () => tabReload());
  }

  // Horizontal wheel scroll on tab strip
  if (browserTabScrollContainer) {
    browserTabScrollContainer.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        browserTabScrollContainer.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }

  // Keyboard Shortcuts for Tabs & Browser Navigation
  document.addEventListener('keydown', (e) => {
    if (typeof isUserAuthenticated === 'function' && !isUserAuthenticated()) return;
    if (appState.activeView === 'auth') return;
    const isEditing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);
    const isMac = (window.canvasDesktop?.platform || navigator.platform).toLowerCase().includes('mac');
    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    // Cmd+J: Navigate to Course Assistant page
    if (cmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      const activeTab = getActiveTab();
      if (activeTab && activeTab.type === 'ai') {
        const chatInput = document.getElementById('aiChatInput');
        if (chatInput) chatInput.focus();
      } else if (activeTab) {
        navigateTab(activeTab.id, { type: 'ai', title: 'Assistant' });
      } else {
        createNewTab({ type: 'ai', title: 'Assistant', activate: true });
      }
      return;
    }

    // Cmd+T: New Tab
    if (cmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      createNewTab({ type: 'home', activate: true });
      return;
    }

    // Cmd+W: Close Current Tab
    if (cmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      if (appState.activeTabId) {
        closeTab(appState.activeTabId);
      }
      return;
    }

    // Cmd+1 through Cmd+8: Switch to tab 1 to 8
    if (cmdOrCtrl && !e.shiftKey && e.key >= '1' && e.key <= '8') {
      const idx = parseInt(e.key, 10) - 1;
      if (idx < appState.tabs.length) {
        e.preventDefault();
        activateTab(appState.tabs[idx].id);
        return;
      }
    }

    // Cmd+9: Switch to last Tab
    if (cmdOrCtrl && !e.shiftKey && e.key === '9') {
      if (appState.tabs.length > 0) {
        e.preventDefault();
        activateTab(appState.tabs[appState.tabs.length - 1].id);
        return;
      }
    }

    // Next Tab: Ctrl+Tab or Cmd+Shift+] or Cmd+Alt+Right
    if ((e.ctrlKey && e.key === 'Tab' && !e.shiftKey) || (cmdOrCtrl && e.shiftKey && e.key === ']') || (cmdOrCtrl && e.altKey && e.key === 'ArrowRight')) {
      e.preventDefault();
      const currIdx = appState.tabs.findIndex(t => t.id === appState.activeTabId);
      if (currIdx !== -1 && appState.tabs.length > 1) {
        const nextIdx = (currIdx + 1) % appState.tabs.length;
        activateTab(appState.tabs[nextIdx].id);
      }
      return;
    }

    // Previous Tab: Ctrl+Shift+Tab or Cmd+Shift+[ or Cmd+Alt+Left
    if ((e.ctrlKey && e.key === 'Tab' && e.shiftKey) || (cmdOrCtrl && e.shiftKey && e.key === '[') || (cmdOrCtrl && e.altKey && e.key === 'ArrowLeft')) {
      e.preventDefault();
      const currIdx = appState.tabs.findIndex(t => t.id === appState.activeTabId);
      if (currIdx !== -1 && appState.tabs.length > 1) {
        const prevIdx = (currIdx - 1 + appState.tabs.length) % appState.tabs.length;
        activateTab(appState.tabs[prevIdx].id);
      }
      return;
    }

    // Tab History Navigation: Alt+Left / Cmd+[ and Alt+Right / Cmd+] (when not inside text editing)
    if (!isEditing) {
      if ((e.altKey && e.key === 'ArrowLeft') || (cmdOrCtrl && !e.shiftKey && e.key === '[')) {
        e.preventDefault();
        tabGoBack();
        return;
      }
      if ((e.altKey && e.key === 'ArrowRight') || (cmdOrCtrl && !e.shiftKey && e.key === ']')) {
        e.preventDefault();
        tabGoForward();
        return;
      }
    }

    // Reload Tab: Cmd+R (without shift) or F5
    if (((cmdOrCtrl && e.key.toLowerCase() === 'r' && !e.shiftKey) || e.key === 'F5') && !isEditing) {
      e.preventDefault();
      tabReload();
      return;
    }
  });

  // Electron IPC Menu Listeners
  if (window.canvasDesktop?.onNewTab) {
    window.canvasDesktop.onNewTab(() => {
      createNewTab({ type: 'home', activate: true });
    });
  }
  if (window.canvasDesktop?.onCloseTab) {
    window.canvasDesktop.onCloseTab(() => {
      if (appState.activeTabId) {
        closeTab(appState.activeTabId);
      }
    });
  }

  // Dismiss context menu on global click/resize
  document.addEventListener('click', () => closeContextMenu());
  window.addEventListener('resize', () => closeContextMenu());
  window.addEventListener('blur', () => closeContextMenu());
}

