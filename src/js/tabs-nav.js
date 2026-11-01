/**
 * Switching Global Views ('auth' | 'home' | 'course' | 'settings')
 */
function switchView(viewName) {
  if (viewName !== 'auth' && typeof isUserAuthenticated === 'function' && !isUserAuthenticated()) {
    viewName = 'auth';
  }
  appState.activeView = viewName;
  closeFilePreview();

  if (appLoadingScreen) appLoadingScreen.classList.add('hidden');
  authSection.classList.add('hidden');
  homeSection.classList.add('hidden');
  coursePageSection.classList.add('hidden');
  settingsProfileSection.classList.add('hidden');
  if (calendarPageSection) calendarPageSection.classList.add('hidden');
  if (assignmentsPageSection) assignmentsPageSection.classList.add('hidden');
  if (announcementsPageSection) announcementsPageSection.classList.add('hidden');
  if (inboxPageSection) inboxPageSection.classList.add('hidden');
  if (notesPageSection) notesPageSection.classList.add('hidden');
  if (aiPageSection) aiPageSection.classList.add('hidden');
  if (moduleReaderSection) moduleReaderSection.classList.add('hidden');

  if (navSettingsBtn) navSettingsBtn.classList.remove('active');
  if (sidebarProfileCard) sidebarProfileCard.classList.remove('active');
  if (sidebarHomeBtn) sidebarHomeBtn.classList.remove('active');
  if (sidebarCalendarBtn) sidebarCalendarBtn.classList.remove('active');
  if (sidebarAssignmentsBtn) sidebarAssignmentsBtn.classList.remove('active');
  if (sidebarAnnouncementsBtn) sidebarAnnouncementsBtn.classList.remove('active');
  if (sidebarInboxBtn) sidebarInboxBtn.classList.remove('active');
  if (sidebarNotesBtn) sidebarNotesBtn.classList.remove('active');
  if (sidebarAiBtn) sidebarAiBtn.classList.remove('active');
  if (titlebarCourseBreadcrumb) titlebarCourseBreadcrumb.classList.add('hidden');

  if (viewName === 'auth') {
    if (appSidebar) appSidebar.classList.add('hidden');
    if (sidebarExpandBtn) sidebarExpandBtn.classList.add('hidden');
    if (browserTabBar) browserTabBar.classList.add('hidden');
    if (browserNavControls) browserNavControls.classList.add('hidden');
    if (topSearchTriggerBar) topSearchTriggerBar.classList.add('hidden');
    if (connectionStatus) connectionStatus.classList.add('hidden');
    if (titlebarActions) titlebarActions.classList.add('hidden');
    if (titlebarLeft) titlebarLeft.classList.add('with-traffic-lights');
    authSection.classList.remove('hidden');
    updateStatusPill('Ready to Connect', 'normal');
    document.body.setAttribute('data-view', 'auth');
    return;
  }

  // Authenticated views: show search, tabs, controls
  document.body.removeAttribute('data-view');
  if (topSearchTriggerBar) topSearchTriggerBar.classList.remove('hidden');
  if (titlebarActions) titlebarActions.classList.remove('hidden');
  if (titlebarLeft) {
    if (appState.sidebarCollapsed) {
      titlebarLeft.classList.add('with-traffic-lights');
    } else {
      titlebarLeft.classList.remove('with-traffic-lights');
    }
  }

  if (viewName === 'home') {
    if (appSidebar) appSidebar.classList.remove('hidden');
    setSidebarCollapsed(appState.sidebarCollapsed);
    if (browserTabBar) browserTabBar.classList.remove('hidden');
    if (browserNavControls) browserNavControls.classList.remove('hidden');
    if (sidebarHomeBtn) sidebarHomeBtn.classList.add('active');
    if (sidebarCalendarBtn) sidebarCalendarBtn.classList.remove('active');
    if (sidebarInboxBtn) sidebarInboxBtn.classList.remove('active');
    if (sidebarNotesBtn) sidebarNotesBtn.classList.remove('active');
    updateSidebarActiveCourse(null);
    if (typeof updateHomeGreeting === 'function') updateHomeGreeting();
    homeSection.classList.remove('hidden');
    renderHomeDashboardWidgets();
    if (navigator.onLine && !appState.isOffline && appState.currentToken) {
      if (typeof fetchAndRenderCourses === 'function') {
        fetchAndRenderCourses(appState.currentDomain, appState.currentToken).then(() => {
          if (appState.activeView === 'home' && typeof renderHomeDashboardWidgets === 'function') {
            renderHomeDashboardWidgets();
          }
        }).catch(() => {});
      }
    }
    updateStatusPill(
      appState.isDemo ? 'Demo Sandbox' : `Connected: ${new URL(appState.currentDomain.startsWith('http') ? appState.currentDomain : 'https://' + appState.currentDomain).hostname}`,
      appState.isDemo ? 'demo' : 'connected'
    );
  } else if (viewName === 'calendar') {
    if (appSidebar) appSidebar.classList.remove('hidden');
    setSidebarCollapsed(appState.sidebarCollapsed);
    if (browserTabBar) browserTabBar.classList.remove('hidden');
    if (browserNavControls) browserNavControls.classList.remove('hidden');
    if (sidebarHomeBtn) sidebarHomeBtn.classList.remove('active');
    if (sidebarCalendarBtn) sidebarCalendarBtn.classList.add('active');
    if (sidebarInboxBtn) sidebarInboxBtn.classList.remove('active');
    if (sidebarNotesBtn) sidebarNotesBtn.classList.remove('active');
    updateSidebarActiveCourse(null);
    if (calendarPageSection) calendarPageSection.classList.remove('hidden');
    if (typeof renderDedicatedCalendarPage === 'function') {
      renderDedicatedCalendarPage();
    }
    if (navigator.onLine && !appState.isOffline && typeof syncScheduleFromUrl === 'function') {
      syncScheduleFromUrl(true).then(() => {
        if (appState.activeView === 'calendar' && typeof renderDedicatedCalendarPage === 'function') {
          renderDedicatedCalendarPage();
        }
      }).catch(() => {});
    }
    updateStatusPill(
      appState.isDemo ? 'Calendar (Demo)' : 'Calendar & Schedule',
      appState.isDemo ? 'demo' : 'connected'
    );
    checkCalendarOnboardingModal();
  } else if (viewName === 'assignments') {
    if (appSidebar) appSidebar.classList.remove('hidden');
    setSidebarCollapsed(appState.sidebarCollapsed);
    if (browserTabBar) browserTabBar.classList.remove('hidden');
    if (browserNavControls) browserNavControls.classList.remove('hidden');
    if (sidebarAssignmentsBtn) sidebarAssignmentsBtn.classList.add('active');
    updateSidebarActiveCourse(null);
    if (assignmentsPageSection) assignmentsPageSection.classList.remove('hidden');
    if (typeof renderDedicatedAssignmentsPage === 'function') {
      renderDedicatedAssignmentsPage();
    }
    if (navigator.onLine && !appState.isOffline && appState.currentToken) {
      if (typeof refreshAllCourseDetailsLive === 'function') {
        refreshAllCourseDetailsLive(true).catch(() => {});
      }
    }
    updateStatusPill(
      appState.isDemo ? 'Assignments (Demo)' : 'Assignments & Due Dates',
      appState.isDemo ? 'demo' : 'connected'
    );
  } else if (viewName === 'announcements') {
    if (appSidebar) appSidebar.classList.remove('hidden');
    setSidebarCollapsed(appState.sidebarCollapsed);
    if (browserTabBar) browserTabBar.classList.remove('hidden');
    if (browserNavControls) browserNavControls.classList.remove('hidden');
    if (sidebarAnnouncementsBtn) sidebarAnnouncementsBtn.classList.add('active');
    updateSidebarActiveCourse(null);
    if (announcementsPageSection) announcementsPageSection.classList.remove('hidden');
    if (typeof renderDedicatedAnnouncementsPage === 'function') {
      renderDedicatedAnnouncementsPage();
    }
    if (navigator.onLine && !appState.isOffline && appState.currentToken) {
      if (typeof refreshAllCourseDetailsLive === 'function') {
        refreshAllCourseDetailsLive(true).catch(() => {});
      }
    }
    updateStatusPill(
      appState.isDemo ? 'Announcements (Demo)' : 'Announcements & Updates',
      appState.isDemo ? 'demo' : 'connected'
    );
  } else if (viewName === 'inbox') {
    if (appSidebar) appSidebar.classList.remove('hidden');
    setSidebarCollapsed(appState.sidebarCollapsed);
    if (browserTabBar) browserTabBar.classList.remove('hidden');
    if (browserNavControls) browserNavControls.classList.remove('hidden');
    if (sidebarHomeBtn) sidebarHomeBtn.classList.remove('active');
    if (sidebarCalendarBtn) sidebarCalendarBtn.classList.remove('active');
    if (sidebarInboxBtn) sidebarInboxBtn.classList.add('active');
    if (sidebarNotesBtn) sidebarNotesBtn.classList.remove('active');
    updateSidebarActiveCourse(null);
    if (inboxPageSection) inboxPageSection.classList.remove('hidden');
    if (typeof loadInboxConversations === 'function') {
      loadInboxConversations();
    }
    updateStatusPill(
      appState.isDemo ? 'Inbox (Demo)' : 'Inbox & Conversations',
      appState.isDemo ? 'demo' : 'connected'
    );
  } else if (viewName === 'notes') {
    if (appSidebar) appSidebar.classList.remove('hidden');
    setSidebarCollapsed(appState.sidebarCollapsed);
    if (browserTabBar) browserTabBar.classList.remove('hidden');
    if (browserNavControls) browserNavControls.classList.remove('hidden');
    if (sidebarHomeBtn) sidebarHomeBtn.classList.remove('active');
    if (sidebarCalendarBtn) sidebarCalendarBtn.classList.remove('active');
    if (sidebarInboxBtn) sidebarInboxBtn.classList.remove('active');
    if (sidebarNotesBtn) sidebarNotesBtn.classList.add('active');
    updateSidebarActiveCourse(null);
    if (notesPageSection) notesPageSection.classList.remove('hidden');
    if (typeof loadNotes === 'function') {
      loadNotes();
    }
    updateStatusPill(
      appState.isDemo ? 'Notes (Demo)' : 'Notes & Study Journal',
      appState.isDemo ? 'demo' : 'connected'
    );
  } else if (viewName === 'ai') {
    if (appSidebar) appSidebar.classList.remove('hidden');
    setSidebarCollapsed(appState.sidebarCollapsed);
    if (browserTabBar) browserTabBar.classList.remove('hidden');
    if (browserNavControls) browserNavControls.classList.remove('hidden');
    if (sidebarHomeBtn) sidebarHomeBtn.classList.remove('active');
    if (sidebarCalendarBtn) sidebarCalendarBtn.classList.remove('active');
    if (sidebarInboxBtn) sidebarInboxBtn.classList.remove('active');
    if (sidebarNotesBtn) sidebarNotesBtn.classList.remove('active');
    if (sidebarAiBtn) sidebarAiBtn.classList.add('active');
    updateSidebarActiveCourse(null);
    if (aiPageSection) aiPageSection.classList.remove('hidden');
    if (typeof window.onAiPageActivated === 'function') {
      window.onAiPageActivated();
    }
    updateStatusPill(
      appState.isDemo ? 'Assistant (Demo)' : 'Assistant & Study Partner',
      appState.isDemo ? 'demo' : 'connected'
    );
  } else if (viewName === 'course') {
    if (appSidebar) appSidebar.classList.remove('hidden');
    setSidebarCollapsed(appState.sidebarCollapsed);
    if (browserTabBar) browserTabBar.classList.remove('hidden');
    if (browserNavControls) browserNavControls.classList.remove('hidden');
    if (sidebarHomeBtn) sidebarHomeBtn.classList.remove('active');
    if (sidebarCalendarBtn) sidebarCalendarBtn.classList.remove('active');
    if (sidebarInboxBtn) sidebarInboxBtn.classList.remove('active');
    if (sidebarNotesBtn) sidebarNotesBtn.classList.remove('active');
    updateSidebarActiveCourse(appState.activeCourse?.id);
    coursePageSection.classList.remove('hidden');
    if (titlebarCourseBreadcrumb) titlebarCourseBreadcrumb.classList.add('hidden');
    updateStatusPill(
      appState.isDemo ? 'Course (Demo)' : 'Course View',
      appState.isDemo ? 'demo' : 'connected'
    );
  } else if (viewName === 'settings') {
    if (appSidebar) appSidebar.classList.remove('hidden');
    setSidebarCollapsed(appState.sidebarCollapsed);
    if (browserTabBar) browserTabBar.classList.remove('hidden');
    if (browserNavControls) browserNavControls.classList.remove('hidden');
    if (sidebarHomeBtn) sidebarHomeBtn.classList.remove('active');
    if (sidebarCalendarBtn) sidebarCalendarBtn.classList.remove('active');
    if (sidebarAssignmentsBtn) sidebarAssignmentsBtn.classList.remove('active');
    if (sidebarAnnouncementsBtn) sidebarAnnouncementsBtn.classList.remove('active');
    if (sidebarInboxBtn) sidebarInboxBtn.classList.remove('active');
    if (sidebarNotesBtn) sidebarNotesBtn.classList.remove('active');
    if (sidebarAiBtn) sidebarAiBtn.classList.remove('active');
    if (sidebarProfileCard) sidebarProfileCard.classList.add('active');
    updateSidebarActiveCourse(null);
    settingsProfileSection.classList.remove('hidden');
    if (navSettingsBtn) navSettingsBtn.classList.add('active');
    updateStatusPill(
      appState.isDemo ? 'Settings (Demo)' : 'Settings & Profile',
      appState.isDemo ? 'demo' : 'connected'
    );
  } else if (viewName === 'reader') {
    if (appSidebar) appSidebar.classList.remove('hidden');
    setSidebarCollapsed(appState.sidebarCollapsed);
    if (browserTabBar) browserTabBar.classList.remove('hidden');
    if (browserNavControls) browserNavControls.classList.remove('hidden');
    if (sidebarHomeBtn) sidebarHomeBtn.classList.remove('active');
    if (sidebarCalendarBtn) sidebarCalendarBtn.classList.remove('active');
    if (sidebarInboxBtn) sidebarInboxBtn.classList.remove('active');
    if (sidebarNotesBtn) sidebarNotesBtn.classList.remove('active');
    if (appState.activeCourse?.id) {
      updateSidebarActiveCourse(appState.activeCourse.id);
    }
    if (moduleReaderSection) moduleReaderSection.classList.remove('hidden');
    updateStatusPill(
      appState.isDemo ? 'Document Reader (Demo)' : 'Full Page Reader',
      appState.isDemo ? 'demo' : 'connected'
    );
  }
}

/**
 * Show schedule connection prompt the first time user opens Calendar
 */
function checkCalendarOnboardingModal() {
  const seenKey = (typeof STORAGE_KEYS !== 'undefined' && STORAGE_KEYS.CALENDAR_ONBOARDING_SEEN) || 'canvas_calendar_onboarding_seen';
  if (!localStorage.getItem(seenKey)) {
    localStorage.setItem(seenKey, 'true');
    const modal = document.getElementById('calendarConnectScheduleModal');
    if (modal) {
      modal.classList.remove('hidden');
    }
  }
}

/**
 * Collapsible Sidebar Helpers
 */
function setSidebarCollapsed(collapsed) {
  appState.sidebarCollapsed = collapsed;
  if (!appSidebar) return;

  if (collapsed) {
    appSidebar.classList.add('collapsed');
    if (sidebarExpandBtn && appState.activeView !== 'auth') {
      sidebarExpandBtn.classList.remove('hidden');
    }
  } else {
    appSidebar.classList.remove('collapsed');
    if (sidebarExpandBtn) {
      sidebarExpandBtn.classList.add('hidden');
    }
  }
}

function toggleSidebar() {
  if (appState.activeView === 'auth') return;
  setSidebarCollapsed(!appState.sidebarCollapsed);
}

/**
 * ==========================================================================
 * Browser Tab Management (Multiple Tabs: Dashboard, Courses, Settings)
 * ==========================================================================
 */

let draggedTabId = null;

function getActiveTab() {
  return appState.tabs.find(t => t.id === appState.activeTabId) || null;
}

function getCoursePageLabel(tabName) {
  const pageMap = {
    'announcements': 'Announcements',
    'modules': 'Modules',
    'assignments': 'Assignments',
    'files': 'Files',
    'grades': 'Grades'
  };
  return pageMap[tabName] || 'Course';
}

function getCleanCourseTitle(course) {
  if (!course) return 'Course';
  let name = (course.name || course.course_code || 'Course').trim();
  // If the title starts with a course code / ID prefix like "CS 301: ...", strip the prefix if there's a descriptive name
  if (name.includes(':')) {
    const parts = name.split(':');
    if (parts.length >= 2 && parts[1].trim().length > 0) {
      name = parts.slice(1).join(':').trim();
    }
  } else if (name.includes(' - ')) {
    const parts = name.split(' - ');
    if (parts.length >= 2 && parts[1].trim().length > 0) {
      name = parts.slice(1).join(' - ').trim();
    }
  }
  return name;
}

function formatTabTitle(tab) {
  if (tab.type === 'home') return 'Dashboard';
  if (tab.type === 'calendar') return 'Calendar';
  if (tab.type === 'assignments') return 'Assignments';
  if (tab.type === 'announcements') return 'Announcements';
  if (tab.type === 'inbox') return 'Inbox';
  if (tab.type === 'notes') return 'Notes';
  if (tab.type === 'ai') return 'Assistant';
  if (tab.type === 'settings') return 'Settings';
  if (tab.type === 'module-item' && tab.item) {
    const courseTitle = tab.course ? getCleanCourseTitle(tab.course) : '';
    const itemTitle = tab.item.title || tab.item.display_name || 'Document';
    return courseTitle ? `${courseTitle} - ${itemTitle}` : itemTitle;
  }
  if (tab.type === 'course' && tab.course) {
    const courseTitle = getCleanCourseTitle(tab.course);
    const pageLabel = getCoursePageLabel(tab.courseTab || 'announcements');
    return `${courseTitle} - ${pageLabel}`;
  }
  return tab.title || 'Tab';
}

function createTabModel({ type = 'home', course = null, courseDetails = null, courseTab = 'announcements', title = null, item = null, module = null } = {}) {
  const id = 'tab-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36);
  const tab = {
    id,
    type,
    title: '',
    course,
    courseDetails,
    courseTab: courseTab || 'announcements',
    assignmentFilter: 'all',
    scrollPosition: 0,
    activeFile: null,
    item: item || null,
    module: module || null,
    history: [],
    historyIndex: 0,
    isLoading: false
  };

  tab.title = title || formatTabTitle(tab);
  tab.history = [{ type, course, courseTab: tab.courseTab, title: tab.title, item: tab.item, module: tab.module }];
  return tab;
}

function initTabs() {
  if (typeof isUserAuthenticated === 'function' && !isUserAuthenticated()) return;
  if (appState.tabs.length === 0) {
    const defaultTab = createTabModel({ type: 'home', title: 'Dashboard' });
    appState.tabs.push(defaultTab);
    appState.activeTabId = defaultTab.id;
  }
  renderTabBar();
  updateBrowserNavControls();
}

function createNewTab({ type = 'home', course = null, courseDetails = null, item = null, module = null, title = null, activate = true, background = false } = {}) {
  if (typeof isUserAuthenticated === 'function' && !isUserAuthenticated()) {
    switchView('auth');
    return null;
  }
  const newTab = createTabModel({ type, course, courseDetails, item, module, title });
  appState.tabs.push(newTab);

  if (activate && !background) {
    activateTab(newTab.id);
  } else {
    renderTabBar();
    if (type === 'course' && course && !courseDetails) {
      loadCoursePageForTab(newTab);
    }
  }
  return newTab;
}

function activateTab(tabId) {
  if (typeof isUserAuthenticated === 'function' && !isUserAuthenticated()) {
    switchView('auth');
    return;
  }
  const prevTab = getActiveTab();
  if (prevTab && prevTab.id !== tabId) {
    const container = document.querySelector('.app-container');
    prevTab.scrollPosition = container ? container.scrollTop : 0;
    prevTab.courseTab = appState.activeCourseTab;
    prevTab.assignmentFilter = appState.assignmentFilter;
    prevTab.activeFile = appState.activeFile;
  }

  const tab = appState.tabs.find(t => t.id === tabId);
  if (!tab) return;

  appState.activeTabId = tab.id;
  renderTabBar();
  updateBrowserNavControls();

  const tabEl = browserTabList?.querySelector(`[data-tab-id="${tab.id}"]`);
  if (tabEl) {
    tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }

  if (tab.type === 'home') {
    switchView('home');
    updateSidebarActiveCourse(null);
    if (sidebarHomeBtn) sidebarHomeBtn.classList.add('active');
    const container = document.querySelector('.app-container');
    if (container) container.scrollTop = tab.scrollPosition || 0;
  } else if (tab.type === 'calendar') {
    switchView('calendar');
    updateSidebarActiveCourse(null);
    if (sidebarCalendarBtn) sidebarCalendarBtn.classList.add('active');
    const container = document.querySelector('.app-container');
    if (container) container.scrollTop = tab.scrollPosition || 0;
  } else if (tab.type === 'assignments') {
    switchView('assignments');
    updateSidebarActiveCourse(null);
    if (sidebarAssignmentsBtn) sidebarAssignmentsBtn.classList.add('active');
    const container = document.querySelector('.app-container');
    if (container) container.scrollTop = tab.scrollPosition || 0;
  } else if (tab.type === 'announcements') {
    switchView('announcements');
    updateSidebarActiveCourse(null);
    if (sidebarAnnouncementsBtn) sidebarAnnouncementsBtn.classList.add('active');
    const container = document.querySelector('.app-container');
    if (container) container.scrollTop = tab.scrollPosition || 0;
  } else if (tab.type === 'inbox') {
    switchView('inbox');
    updateSidebarActiveCourse(null);
    if (sidebarInboxBtn) sidebarInboxBtn.classList.add('active');
    const container = document.querySelector('.app-container');
    if (container) container.scrollTop = tab.scrollPosition || 0;
  } else if (tab.type === 'notes') {
    switchView('notes');
    updateSidebarActiveCourse(null);
    if (sidebarNotesBtn) sidebarNotesBtn.classList.add('active');
    const container = document.querySelector('.app-container');
    if (container) container.scrollTop = tab.scrollPosition || 0;
  } else if (tab.type === 'ai') {
    switchView('ai');
    updateSidebarActiveCourse(null);
    if (sidebarAiBtn) sidebarAiBtn.classList.add('active');
    const container = document.querySelector('.app-container');
    if (container) container.scrollTop = tab.scrollPosition || 0;
  } else if (tab.type === 'settings') {
    switchView('settings');
    updateSidebarActiveCourse(null);
    const container = document.querySelector('.app-container');
    if (container) container.scrollTop = tab.scrollPosition || 0;
  } else if (tab.type === 'course' && tab.course) {
    appState.activeCourse = tab.course;
    appState.activeCourseTab = tab.courseTab || 'announcements';
    appState.assignmentFilter = tab.assignmentFilter || 'all';

    switchView('course');
    updateSidebarActiveCourse(tab.course.id);
    syncGlobalSearchCourse(tab.course.id);

    const matchesCourse = tab.courseDetails &&
      (String(tab.courseDetails.courseId || tab.courseDetails.id) === String(tab.course.id));

    if (matchesCourse) {
      appState.courseDetails = tab.courseDetails;
      closeFilePreview();
      renderCourseViewWithDetails(tab.course, tab.courseDetails);
      switchCourseTab(tab.courseTab || 'announcements');
      if (tab.scrollPosition) {
        const container = document.querySelector('.app-container');
        if (container) container.scrollTop = tab.scrollPosition;
      }
    } else {
      tab.courseDetails = null;
      loadCoursePageForTab(tab);
    }
  } else if (tab.type === 'module-item' && tab.item) {
    if (tab.course) {
      appState.activeCourse = tab.course;
      if (tab.courseDetails) {
        appState.courseDetails = tab.courseDetails;
      }
    }
    switchView('reader');
    renderFullPageModuleItem(tab);
    if (tab.scrollPosition) {
      const container = document.querySelector('.app-container');
      if (container) container.scrollTop = tab.scrollPosition;
    }
  }
}

function closeTab(tabId) {
  const index = appState.tabs.findIndex(t => t.id === tabId);
  if (index === -1) return;

  const wasActive = appState.activeTabId === tabId;
  appState.tabs.splice(index, 1);

  if (appState.tabs.length === 0) {
    const freshTab = createTabModel({ type: 'home', title: 'Dashboard' });
    appState.tabs.push(freshTab);
    activateTab(freshTab.id);
    return;
  }

  if (wasActive) {
    const nextIndex = Math.min(index, appState.tabs.length - 1);
    activateTab(appState.tabs[nextIndex].id);
  } else {
    renderTabBar();
  }
}

function closeOtherTabs(tabId) {
  const tab = appState.tabs.find(t => t.id === tabId);
  if (!tab) return;
  appState.tabs = [tab];
  activateTab(tab.id);
}

function closeTabsToRight(tabId) {
  const index = appState.tabs.findIndex(t => t.id === tabId);
  if (index === -1) return;
  const keepTabs = appState.tabs.slice(0, index + 1);
  const hadActive = keepTabs.some(t => t.id === appState.activeTabId);
  appState.tabs = keepTabs;
  if (!hadActive) {
    activateTab(tabId);
  } else {
    renderTabBar();
  }
}

function duplicateTab(tabId) {
  if (typeof isUserAuthenticated === 'function' && !isUserAuthenticated()) {
    switchView('auth');
    return;
  }
  const tab = appState.tabs.find(t => t.id === tabId);
  if (!tab) return;
  const index = appState.tabs.findIndex(t => t.id === tabId);
  const dup = createTabModel({
    type: tab.type,
    course: tab.course,
    courseDetails: tab.courseDetails,
    title: tab.title
  });
  dup.courseTab = tab.courseTab;
  dup.assignmentFilter = tab.assignmentFilter;
  dup.history = [...tab.history];
  dup.historyIndex = tab.historyIndex;
  appState.tabs.splice(index + 1, 0, dup);
  activateTab(dup.id);
}

function navigateTab(tabId, destination) {
  if (typeof isUserAuthenticated === 'function' && !isUserAuthenticated()) {
    switchView('auth');
    return;
  }
  const tab = appState.tabs.find(t => t.id === tabId);
  if (!tab) return;

  // Save current state into current history entry before navigating
  if (tab.history && tab.history[tab.historyIndex]) {
    tab.history[tab.historyIndex].courseDetails = tab.courseDetails || null;
    tab.history[tab.historyIndex].activeFile = tab.activeFile || null;
  }

  const targetTab = {
    type: destination.type,
    course: destination.course || null,
    courseTab: destination.courseTab || 'announcements'
  };

  const formattedTitle = destination.title || formatTabTitle(targetTab);

  tab.history = tab.history.slice(0, tab.historyIndex + 1);
  tab.history.push({
    type: destination.type,
    course: destination.course || null,
    courseDetails: destination.courseDetails || null,
    courseTab: destination.courseTab || 'announcements',
    title: formattedTitle
  });
  tab.historyIndex = tab.history.length - 1;

  applyTabDestination(tab, destination);
}

function applyTabDestination(tab, destination) {
  const isDifferentCourse = destination.type === 'course' && destination.course &&
    (!tab.course || String(tab.course.id) !== String(destination.course.id));
  const isDifferentType = tab.type !== destination.type;

  tab.type = destination.type;
  tab.course = destination.course || null;

  if (isDifferentCourse || isDifferentType) {
    tab.courseDetails = destination.courseDetails || null;
    tab.activeFile = null;
    tab.scrollPosition = 0;
  } else if (destination.courseDetails) {
    tab.courseDetails = destination.courseDetails;
  }

  if (destination.courseTab) {
    tab.courseTab = destination.courseTab;
  }
  tab.title = destination.title || formatTabTitle(tab);

  renderTabBar();
  updateBrowserNavControls();

  if (appState.activeTabId === tab.id) {
    if (tab.type === 'home') {
      switchView('home');
      updateSidebarActiveCourse(null);
      if (sidebarHomeBtn) sidebarHomeBtn.classList.add('active');
      syncGlobalSearchCourse('all');
    } else if (tab.type === 'calendar') {
      switchView('calendar');
      updateSidebarActiveCourse(null);
      if (sidebarCalendarBtn) sidebarCalendarBtn.classList.add('active');
      syncGlobalSearchCourse('all');
    } else if (tab.type === 'assignments') {
      switchView('assignments');
      updateSidebarActiveCourse(null);
      if (sidebarAssignmentsBtn) sidebarAssignmentsBtn.classList.add('active');
      syncGlobalSearchCourse('all');
    } else if (tab.type === 'announcements') {
      switchView('announcements');
      updateSidebarActiveCourse(null);
      if (sidebarAnnouncementsBtn) sidebarAnnouncementsBtn.classList.add('active');
      syncGlobalSearchCourse('all');
    } else if (tab.type === 'inbox') {
      switchView('inbox');
      updateSidebarActiveCourse(null);
      if (sidebarInboxBtn) sidebarInboxBtn.classList.add('active');
      syncGlobalSearchCourse('all');
    } else if (tab.type === 'notes') {
      switchView('notes');
      updateSidebarActiveCourse(null);
      if (sidebarNotesBtn) sidebarNotesBtn.classList.add('active');
      syncGlobalSearchCourse('all');
    } else if (tab.type === 'ai') {
      switchView('ai');
      updateSidebarActiveCourse(null);
      if (sidebarAiBtn) sidebarAiBtn.classList.add('active');
      syncGlobalSearchCourse('all');
    } else if (tab.type === 'settings') {
      switchView('settings');
      updateSidebarActiveCourse(null);
    } else if (tab.type === 'course' && tab.course) {
      appState.activeCourse = tab.course;
      switchView('course');
      updateSidebarActiveCourse(tab.course.id);
      syncGlobalSearchCourse(tab.course.id);
      loadCoursePageForTab(tab);
    } else if (tab.type === 'module-item' && tab.item) {
      if (tab.course) {
        appState.activeCourse = tab.course;
        syncGlobalSearchCourse(tab.course.id);
      }
      switchView('reader');
      renderFullPageModuleItem(tab);
    }
  }
}

function tabGoBack() {
  const tab = getActiveTab();
  if (!tab || tab.historyIndex <= 0) return;
  tab.historyIndex--;
  const prevDest = tab.history[tab.historyIndex];
  applyTabDestination(tab, prevDest);
}

function tabGoForward() {
  const tab = getActiveTab();
  if (!tab || tab.historyIndex >= tab.history.length - 1) return;
  tab.historyIndex++;
  const nextDest = tab.history[tab.historyIndex];
  applyTabDestination(tab, nextDest);
}

async function tabReload() {
  const tab = getActiveTab();
  if (!tab) return;

  if (browserNavReloadBtn) {
    browserNavReloadBtn.classList.add('loading');
    setTimeout(() => browserNavReloadBtn.classList.remove('loading'), 800);
  }

  if (typeof showToast === 'function') {
    showToast('Refreshing Canvas data...');
  }

  if (tab.type === 'course' && tab.course) {
    await loadCoursePageForTab(tab, true);
  } else if (tab.type === 'module-item') {
    renderFullPageModuleItem(tab);
  } else if (tab.type === 'home') {
    if (navigator.onLine && !appState.isOffline && appState.currentToken) {
      if (typeof fetchAndRenderCourses === 'function') {
        await fetchAndRenderCourses(appState.currentDomain, appState.currentToken);
      }
      if (typeof refreshAllCourseDetailsLive === 'function') {
        await refreshAllCourseDetailsLive(true);
      }
    }
    if (typeof renderHomeDashboardWidgets === 'function') {
      renderHomeDashboardWidgets();
    }
  } else if (tab.type === 'assignments') {
    if (navigator.onLine && !appState.isOffline && appState.currentToken) {
      if (typeof refreshAllCourseDetailsLive === 'function') {
        await refreshAllCourseDetailsLive(true);
      }
    }
    if (typeof renderDedicatedAssignmentsPage === 'function') {
      renderDedicatedAssignmentsPage();
    }
  } else if (tab.type === 'announcements') {
    if (navigator.onLine && !appState.isOffline && appState.currentToken) {
      if (typeof refreshAllCourseDetailsLive === 'function') {
        await refreshAllCourseDetailsLive(true);
      }
    }
    if (typeof renderDedicatedAnnouncementsPage === 'function') {
      renderDedicatedAnnouncementsPage();
    }
  } else if (tab.type === 'calendar') {
    if (navigator.onLine && !appState.isOffline && typeof syncScheduleFromUrl === 'function') {
      await syncScheduleFromUrl(true);
    }
    if (typeof renderDedicatedCalendarPage === 'function') {
      renderDedicatedCalendarPage();
    }
  } else if (tab.type === 'inbox') {
    if (typeof loadInboxConversations === 'function') {
      loadInboxConversations();
    }
  } else if (tab.type === 'notes') {
    if (typeof loadNotes === 'function') {
      loadNotes();
    }
  }
}

function updateBrowserNavControls() {
  const tab = getActiveTab();
  if (!browserNavBackBtn || !browserNavForwardBtn) return;
  if (!tab) {
    browserNavBackBtn.disabled = true;
    browserNavForwardBtn.disabled = true;
    return;
  }
  browserNavBackBtn.disabled = tab.historyIndex <= 0;
  browserNavForwardBtn.disabled = tab.historyIndex >= tab.history.length - 1;
}

function renderTabBar() {
  if (!browserTabList) return;
  browserTabList.innerHTML = '';

  if (appState.activeView === 'auth' || appState.tabs.length === 0) {
    if (browserTabBar) browserTabBar.classList.add('hidden');
    if (browserNavControls) browserNavControls.classList.add('hidden');
    return;
  }

  if (browserTabBar) browserTabBar.classList.remove('hidden');
  if (browserNavControls) browserNavControls.classList.remove('hidden');

  appState.tabs.forEach((tab, index) => {
    const tabEl = document.createElement('div');
    tabEl.className = 'browser-tab' + (tab.id === appState.activeTabId ? ' active' : '');
    tabEl.setAttribute('data-tab-id', tab.id);
    tabEl.setAttribute('draggable', 'true');
    tabEl.title = `${tab.title}${index < 9 ? ` (⌘${index + 1})` : ''} — Middle-click to close`;

    let iconHtml = '';
    if (tab.isLoading) {
      iconHtml = '<span class="browser-tab-spinner"></span>';
    } else if (tab.type === 'home') {
      iconHtml = `
        <span class="browser-tab-icon">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </span>
      `;
    } else if (tab.type === 'calendar') {
      iconHtml = `
        <span class="browser-tab-icon">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </span>
      `;
    } else if (tab.type === 'assignments') {
      iconHtml = `
        <span class="browser-tab-icon">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 11l3 3L22 4"></path>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
          </svg>
        </span>
      `;
    } else if (tab.type === 'announcements') {
      iconHtml = `
        <span class="browser-tab-icon">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
        </span>
      `;
    } else if (tab.type === 'inbox') {
      iconHtml = `
        <span class="browser-tab-icon">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
            <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
          </svg>
        </span>
      `;
    } else if (tab.type === 'notes') {
      iconHtml = `
        <span class="browser-tab-icon">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        </span>
      `;
    } else if (tab.type === 'ai') {
      iconHtml = `
        <span class="browser-tab-icon">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"></path>
          </svg>
        </span>
      `;
    } else if (tab.type === 'settings') {
      iconHtml = `
        <span class="browser-tab-icon">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </span>
      `;
    } else if (tab.type === 'module-item') {
      const itemType = (tab.item?.type || '').toLowerCase();
      const icon = itemType === 'page' ? '📖' : (itemType === 'file' ? '📄' : '📑');
      iconHtml = `<span style="font-size:12px; margin-right:4px;">${icon}</span>`;
    } else if (tab.course) {
      const courseColor = getCourseColor(tab.course, index);
      iconHtml = `<span class="browser-tab-course-icon" style="color: ${courseColor};">${renderCourseRoundedSquareHtml(courseColor, 12)}</span>`;
    } else {
      const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#8b5cf6'];
      const color = colors[index % colors.length];
      iconHtml = `<span class="browser-tab-dot" style="background: ${color};"></span>`;
    }

    let titleContentHtml = '';
    if (tab.type === 'module-item' && tab.item) {
      const courseName = tab.course ? getCleanCourseTitle(tab.course) : '';
      const itemTitle = tab.item.title || tab.item.display_name || 'Document';
      titleContentHtml = `
        ${courseName ? `<span class="browser-tab-course-name">${escapeHtml(courseName)}</span>` : ''}
        <span class="browser-tab-page-badge" style="background:var(--color-bg-card); max-width:130px; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(itemTitle)}</span>
      `;
    } else if (tab.type === 'course' && tab.course) {
      const courseName = getCleanCourseTitle(tab.course);
      const pageLabel = getCoursePageLabel(tab.courseTab || 'announcements');
      titleContentHtml = `
        <span class="browser-tab-course-name">${escapeHtml(courseName)}</span>
        <span class="browser-tab-page-badge">${escapeHtml(pageLabel)}</span>
      `;
    } else {
      titleContentHtml = `<span>${escapeHtml(tab.title || 'Dashboard')}</span>`;
    }

    tabEl.innerHTML = `
      ${iconHtml}
      <span class="browser-tab-title">
        ${titleContentHtml}
      </span>
      <button class="browser-tab-close-btn" title="Close Tab (⌘W)" aria-label="Close Tab">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;

    tabEl.addEventListener('click', (e) => {
      if (e.target.closest('.browser-tab-close-btn')) return;
      activateTab(tab.id);
    });

    tabEl.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(tab.id);
      }
    });

    const closeBtn = tabEl.querySelector('.browser-tab-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tab.id);
      });
    }

    tabEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showTabContextMenu(e.clientX, e.clientY, tab.id);
    });

    tabEl.addEventListener('dragstart', (e) => {
      draggedTabId = tab.id;
      tabEl.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tab.id);
    });

    tabEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggedTabId && draggedTabId !== tab.id) {
        tabEl.classList.add('drag-over');
      }
    });

    tabEl.addEventListener('dragleave', () => {
      tabEl.classList.remove('drag-over');
    });

    tabEl.addEventListener('drop', (e) => {
      e.preventDefault();
      tabEl.classList.remove('drag-over');
      if (draggedTabId && draggedTabId !== tab.id) {
        const fromIdx = appState.tabs.findIndex(t => t.id === draggedTabId);
        const toIdx = appState.tabs.findIndex(t => t.id === tab.id);
        if (fromIdx !== -1 && toIdx !== -1) {
          const [moved] = appState.tabs.splice(fromIdx, 1);
          appState.tabs.splice(toIdx, 0, moved);
          renderTabBar();
        }
      }
    });

    tabEl.addEventListener('dragend', () => {
      draggedTabId = null;
      tabEl.classList.remove('dragging');
      document.querySelectorAll('.browser-tab').forEach(el => el.classList.remove('drag-over'));
    });

    browserTabList.appendChild(tabEl);
  });
}

function closeContextMenu() {
  if (customContextMenu) {
    customContextMenu.classList.add('hidden');
    customContextMenu.innerHTML = '';
  }
}

function showContextMenu(x, y, items) {
  if (!customContextMenu) return;
  customContextMenu.innerHTML = '';

  items.forEach(item => {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      customContextMenu.appendChild(sep);
      return;
    }

    const btn = document.createElement('button');
    btn.className = 'context-menu-item' + (item.danger ? ' danger' : '');
    btn.innerHTML = `
      ${item.icon || ''}
      <span>${escapeHtml(item.label)}</span>
      ${item.shortcut ? `<span class="context-menu-shortcut">${item.shortcut}</span>` : ''}
    `;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      if (item.action) item.action();
    });
    customContextMenu.appendChild(btn);
  });

  customContextMenu.classList.remove('hidden');
  const menuWidth = 190;
  const menuHeight = customContextMenu.offsetHeight || 150;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 10);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 10);
  customContextMenu.style.left = `${Math.max(10, clampedX)}px`;
  customContextMenu.style.top = `${Math.max(10, clampedY)}px`;
}

function showTabContextMenu(x, y, tabId) {
  const tab = appState.tabs.find(t => t.id === tabId);
  if (!tab) return;

  const items = [
    {
      label: 'Reload Tab',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>',
      shortcut: '⌘R',
      action: () => {
        activateTab(tabId);
        tabReload();
      }
    },
    {
      label: 'Duplicate Tab',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
      action: () => duplicateTab(tabId)
    },
    { separator: true },
    {
      label: 'Close Tab',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
      shortcut: '⌘W',
      danger: true,
      action: () => closeTab(tabId)
    },
    {
      label: 'Close Other Tabs',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>',
      action: () => closeOtherTabs(tabId)
    },
    {
      label: 'Close Tabs to Right',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>',
      action: () => closeTabsToRight(tabId)
    }
  ];

  showContextMenu(x, y, items);
}

function showCourseContextMenu(x, y, course) {
  const items = [
    {
      label: 'Open',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>',
      action: () => loadCoursePage(course)
    },
    {
      label: 'Open in New Tab',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>',
      shortcut: '⌘+Click',
      action: () => createNewTab({ type: 'course', course, activate: true })
    },
    {
      label: 'Open in Background Tab',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line></svg>',
      action: () => createNewTab({ type: 'course', course, activate: false, background: true })
    },
    { separator: true },
    {
      label: 'Customize Color & Icon',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>',
      action: () => openCourseCustomizationModal(course)
    },
    {
      label: (typeof isCourseArchived === 'function' && isCourseArchived(course.id)) ? 'Restore (Unarchive) Course' : 'Archive Course',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>',
      action: () => {
        if (typeof toggleCourseArchive === 'function') {
          toggleCourseArchive(course.id);
        }
      }
    },
    {
      label: 'Copy Course Code',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
      action: () => {
        navigator.clipboard.writeText(course.course_code || course.name);
        showToast(`Copied "${course.course_code || course.name}" to clipboard`);
      }
    }
  ];

  showContextMenu(x, y, items);
}

/**
 * Switch Tab within Course Page ('announcements' | 'modules' | 'assignments' | 'grades')
 */
function switchCourseTab(tabName) {
  appState.activeCourseTab = tabName;

  const activeTab = getActiveTab();
  if (activeTab && activeTab.type === 'course') {
    activeTab.courseTab = tabName;
    activeTab.title = formatTabTitle(activeTab);
    renderTabBar();
  }

  document.querySelectorAll('.course-tab-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
  });

  paneAnnouncements.classList.toggle('hidden', tabName !== 'announcements');
  paneModules.classList.toggle('hidden', tabName !== 'modules');
  paneAssignments.classList.toggle('hidden', tabName !== 'assignments');
  if (paneFiles) paneFiles.classList.toggle('hidden', tabName !== 'files');
  paneGrades.classList.toggle('hidden', tabName !== 'grades');
}

