/**
 * Authentication and Initial Data Load
 */
async function performAuthentication(domain, token, showFeedback = true) {
  clearError();
  setLoading(true);

  if (typeof isDemoCredentials === 'function' && isDemoCredentials(domain, token)) {
    await loadDemoMode(showFeedback);
    return;
  }

  try {
    let profileResult;
    if (window.canvasDesktop?.getUserProfile) {
      profileResult = await window.canvasDesktop.getUserProfile({ domain, token });
    } else {
      const cleanDomain = domain.replace(/\/+$/, '').replace(/^https?:\/\//i, '');
      const response = await fetch(`https://${cleanDomain}/api/v1/users/self/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      if (response.ok) {
        const profile = await response.json();
        profileResult = { success: true, data: { profile, meta: { instanceUrl: `https://${cleanDomain}`, fetchedAt: new Date().toISOString() } } };
      } else {
        profileResult = { success: false, error: `Canvas responded with status ${response.status}` };
      }
    }

    if (!profileResult.success) {
      console.warn('[Canvas Auth] profileResult unsuccessful:', profileResult.error || profileResult);
      // Check if error is due to network failure / unreachable instance
      if (!navigator.onLine || isNetworkError(profileResult.error)) {
        await enterOfflineMode({ useDemoFallback: true });
        showToast('Canvas is unreachable. Switched to Offline Mode.');
        return;
      }

      if (appLoadingScreen) appLoadingScreen.classList.add('hidden');
      switchView('auth');
      showError(profileResult.error || 'Failed to authenticate with Canvas.');
      updateStatusPill('Authentication Failed', 'error');
      return;
    }

    // Check if result was served from offline cache
    if (profileResult.offline) {
      appState.isOffline = true;
      appState.currentDomain = domain;
      appState.currentToken = token;
      appState.isDemo = false;
      appState.profileData = profileResult.data;

      canvasDomainInput.value = domain;
      accessTokenInput.value = token;
      settingsDomainInput.value = domain;
      settingsTokenInput.value = token;

      renderProfile(profileResult.data, false);
      await fetchAndRenderCourses(domain, token);
      initTabs();
      switchView('home');
      updateStatusPill('Offline Mode', 'offline');
      showOfflineBanner(true);
      updateOfflineSettingsStats();
      if (showFeedback) {
        showToast(`Offline Mode: Loaded ${appState.courses.length} cached courses.`);
      }
      return;
    }

    appState.isOffline = false;
    showOfflineBanner(false);
    appState.currentDomain = domain;
    appState.currentToken = token;
    appState.isDemo = false;
    appState.profileData = profileResult.data;

    canvasDomainInput.value = domain;
    accessTokenInput.value = token;
    settingsDomainInput.value = domain;
    settingsTokenInput.value = token;

    if (rememberCredentialsCheckbox.checked || settingsRemember.checked) {
      localStorage.setItem(STORAGE_KEYS.DOMAIN, domain);
      localStorage.setItem(STORAGE_KEYS.TOKEN, token);
      localStorage.setItem(STORAGE_KEYS.REMEMBER, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.setItem(STORAGE_KEYS.REMEMBER, 'false');
    }

    renderProfile(profileResult.data, false);
    await fetchAndRenderCourses(domain, token);
    initTabs();
    switchView('home');
    updateStatusPill('Connected', 'connected');
    updateOfflineSettingsStats();

    // Trigger complete local offline content sync and course details in background
    if (typeof refreshAllCourseDetailsLive === 'function') {
      refreshAllCourseDetailsLive(true);
    }
    performBackgroundSync(domain, token);

    if (showFeedback) {
      showToast(`Connected to Canvas! Loaded ${appState.courses.length} courses.`);
    }
  } catch (err) {
    console.error('[Canvas Auth] Unexpected exception during authentication:', err);
    if (!navigator.onLine || isNetworkError(err.message)) {
      await enterOfflineMode({ useDemoFallback: true });
      showToast('Network unreachable: Loaded offline content.');
      return;
    }
    if (appLoadingScreen) appLoadingScreen.classList.add('hidden');
    switchView('auth');
    showError(`Error connecting to Canvas API: ${err.message}`);
    updateStatusPill('Connection Error', 'error');
  } finally {
    setLoading(false);
  }
}

function filterActiveCoursesOnly(courses) {
  if (!Array.isArray(courses)) return [];
  return courses.filter(c => {
    if (!c || !c.id) return false;
    if (c.access_restricted_by_date) return false;
    if (c.workflow_state === 'completed' || c.workflow_state === 'deleted') return false;
    if (c.concluded) return false;
    if (Array.isArray(c.enrollments) && c.enrollments.length > 0) {
      return c.enrollments.some(e => e.enrollment_state === 'active');
    }
    return true;
  });
}
window.filterActiveCoursesOnly = filterActiveCoursesOnly;

/**
 * Fetch and Render Enrolled Courses
 */
async function fetchAndRenderCourses(domain, token) {
  if (appState.isDemo || (typeof isDemoCredentials === 'function' && isDemoCredentials(domain, token))) {
    const mock = typeof getMockAccountData === 'function' ? getMockAccountData() : null;
    if (mock && Array.isArray(mock.courses)) {
      appState.courses = mock.courses;
      renderCourses(appState.courses);
      return;
    }
  }

  try {
    let coursesResult;
    if (window.canvasDesktop?.getCourses) {
      coursesResult = await window.canvasDesktop.getCourses({
        domain,
        token,
        preferCache: Boolean(appState.isOffline || !navigator.onLine)
      });
    } else {
      coursesResult = { success: true, data: { courses: DEMO_DATA.courses } };
    }

    if (coursesResult.success && Array.isArray(coursesResult.data?.courses) && coursesResult.data.courses.length > 0) {
      appState.courses = filterActiveCoursesOnly(coursesResult.data.courses);
      if (!appState.isDemo) {
        try {
          localStorage.setItem('canvas_cached_courses', JSON.stringify(appState.courses));
        } catch { }
      }
      renderCourses(appState.courses);
    } else {
      let fallbackCourses = [];
      if (!appState.isDemo) {
        try {
          const cached = localStorage.getItem('canvas_cached_courses');
          if (cached) fallbackCourses = filterActiveCoursesOnly(JSON.parse(cached));
        } catch { }
      }
      if ((!fallbackCourses || fallbackCourses.length === 0) && appState.isDemo) {
        fallbackCourses = typeof getMockAccountData === 'function'
          ? getMockAccountData().courses
          : DEMO_DATA.courses;
      }
      appState.courses = fallbackCourses;
      renderCourses(appState.courses);
    }
  } catch (err) {
    let fallbackCourses = [];
    if (!appState.isDemo) {
      try {
        const cached = localStorage.getItem('canvas_cached_courses');
        if (cached) fallbackCourses = JSON.parse(cached);
      } catch { }
    }
    if ((!fallbackCourses || fallbackCourses.length === 0) && appState.isDemo) {
      fallbackCourses = typeof getMockAccountData === 'function'
        ? getMockAccountData().courses
        : DEMO_DATA.courses;
    }
    appState.courses = fallbackCourses;
    renderCourses(appState.courses);
  }
}

/**
 * Demo Mode
 */
async function loadDemoMode(showFeedback = true) {
  setLoading(true);
  appState.isDemo = true;
  appState.isOffline = false;
  appState.currentDomain = 'demo';
  appState.currentToken = 'demo';

  if (canvasDomainInput) canvasDomainInput.value = 'demo';
  if (accessTokenInput) accessTokenInput.value = 'demo';
  if (settingsDomainInput) settingsDomainInput.value = 'demo';
  if (settingsTokenInput) settingsTokenInput.value = 'demo';

  if (rememberCredentialsCheckbox?.checked || settingsRemember?.checked) {
    localStorage.setItem(STORAGE_KEYS.DOMAIN, 'demo');
    localStorage.setItem(STORAGE_KEYS.TOKEN, 'demo');
    localStorage.setItem(STORAGE_KEYS.REMEMBER, 'true');
  }

  // Retrieve rich dynamic mock account dataset
  let mockData = (typeof getMockAccountData === 'function') ? getMockAccountData() : null;

  // Attempt to load mock account data from disk if available
  if (window.canvasDesktop?.loadMockAccount) {
    try {
      const diskMock = await window.canvasDesktop.loadMockAccount();
      if (diskMock && diskMock.success && diskMock.data) {
        mockData = {
          ...diskMock.data,
          ...mockData,
          courseDetails: { ...(diskMock.data.courseDetails || {}), ...(mockData?.courseDetails || {}) }
        };
      }
    } catch (e) {
      console.warn('Could not load mock account from disk:', e);
    }
  }

  if (mockData) {
    appState.profileData = mockData.profileResult || { profile: mockData.profile, self: mockData.profile };
    appState.courses = mockData.courses || [];
    appState.courseDetailsCache = mockData.courseDetails || {};
    appState.scheduleEvents = mockData.scheduleEvents || [];
    appState.inboxConversations = mockData.conversations || [];
  }

  // Set notes storage path to mock directory
  appState.notesStoragePath = 'mock-account/notes';

  renderProfile(appState.profileData, true);
  renderCourses(appState.courses);
  initTabs();

  updateStatusPill('Mock Account', 'demo');
  showOfflineBanner(false);
  updateOfflineSettingsStats();

  if (typeof renderHomeDashboardWidgets === 'function') {
    renderHomeDashboardWidgets();
  }

  if (typeof loadNotes === 'function') {
    loadNotes();
  }

  if (typeof loadInboxConversations === 'function') {
    loadInboxConversations();
  }

  switchView('home');
  setLoading(false);
  if (showFeedback) {
    showToast('Loaded Mock Account (Demo Mode)');
  }
}

// Default Color Presets for Course Customization
const COURSE_CUSTOMIZATION_COLORS = [
  '#4f46e5', // Indigo
  '#6366f1', // Electric Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#ef4444', // Red
  '#ea580c', // Orange
  '#f59e0b', // Amber
  '#eab308', // Yellow
  '#84cc16', // Lime
  '#10b981', // Emerald
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#0ea5e9', // Sky
  '#2563eb', // Blue
  '#64748b'  // Slate
];

// Curated Educational & Academic Icon Categories from Lucide
const LUCIDE_CATEGORIES = {
  popular: [
    'BookOpen', 'GraduationCap', 'Book', 'School', 'Library', 'Award',
    'Trophy', 'Bookmark', 'Notebook', 'Presentation', 'Pencil', 'PenTool',
    'Lightbulb', 'Brain', 'Glasses', 'Scroll', 'Calendar', 'Clock',
    'Star', 'Flame', 'Sparkles', 'Target', 'Compass', 'HelpCircle'
  ],
  academic: [
    'GraduationCap', 'School', 'BookOpen', 'Book', 'BookText', 'BookCheck',
    'Library', 'NotebookPen', 'Backpack', 'Award', 'Medal', 'Trophy',
    'Ribbon', 'Newspaper', 'ScrollText', 'Scroll', 'FileText', 'Bookmark',
    'BookmarkCheck', 'HelpCircle', 'Search', 'Compass', 'BookMarked'
  ],
  stem: [
    'Atom', 'FlaskConical', 'FlaskRound', 'Dna', 'Calculator', 'Binary',
    'Microscope', 'Orbit', 'Pi', 'Sigma', 'Code', 'CodeXml',
    'Terminal', 'Cpu', 'Database', 'Server', 'Network', 'Wifi',
    'Laptop', 'Monitor', 'Bot', 'CircuitBoard', 'Component', 'Bug',
    'Layers', 'Boxes', 'TestTube', 'TestTubes', 'Scale', 'Compass'
  ],
  arts: [
    'Palette', 'Brush', 'Paintbrush', 'Music', 'Music2', 'Headphones',
    'Mic', 'Volume2', 'Video', 'Camera', 'Film', 'Theater',
    'Feather', 'Languages', 'Globe', 'Compass', 'Sparkles', 'Shapes',
    'Spline', 'Crop', 'Scissors', 'Wand2', 'Wand'
  ],
  business: [
    'Briefcase', 'BriefcaseBusiness', 'Building', 'Building2', 'Landmark',
    'Scale', 'Gavel', 'TrendingUp', 'LineChart', 'BarChart',
    'BarChart2', 'PieChart', 'DollarSign', 'CreditCard', 'Wallet',
    'Coins', 'Users', 'UserCheck', 'Handshake', 'Shield', 'ShieldCheck'
  ]
};

// Helpful semantic keywords to find related Lucide icons
const LUCIDE_SYNONYMS = {
  math: ['Calculator', 'Pi', 'Sigma', 'Binary', 'Compass', 'Percent', 'Divide', 'DraftingCompass'],
  mathematics: ['Calculator', 'Pi', 'Sigma', 'Binary', 'Compass', 'Percent', 'Divide'],
  science: ['Atom', 'FlaskConical', 'FlaskRound', 'Dna', 'Microscope', 'TestTube', 'TestTubes', 'Orbit'],
  physics: ['Atom', 'Orbit', 'Sparkles', 'Zap', 'Activity', 'Compass', 'Magnet'],
  chemistry: ['FlaskConical', 'FlaskRound', 'TestTube', 'TestTubes', 'Atom', 'Pipette'],
  biology: ['Dna', 'Microscope', 'Leaf', 'Sprout', 'TreePine', 'Heart', 'Activity'],
  ai: ['Bot', 'Brain', 'Sparkles', 'Cpu', 'CircuitBoard'],
  coding: ['Code', 'CodeXml', 'Terminal', 'Cpu', 'Laptop', 'FileCode'],
  programming: ['Code', 'CodeXml', 'Terminal', 'Cpu', 'Laptop', 'FileCode'],
  computer: ['Laptop', 'Monitor', 'Cpu', 'Terminal', 'HardDrive', 'Server', 'Keyboard'],
  law: ['Scale', 'Gavel', 'Landmark', 'ShieldCheck', 'FileText'],
  history: ['Scroll', 'ScrollText', 'Landmark', 'Hourglass', 'Clock', 'Compass'],
  art: ['Palette', 'Brush', 'Paintbrush', 'Theater', 'Feather', 'Camera', 'Shapes'],
  design: ['Palette', 'PenTool', 'Spline', 'Layers', 'Crop', 'Shapes'],
  literature: ['BookOpen', 'BookText', 'Feather', 'Scroll', 'Library', 'PenTool'],
  music: ['Music', 'Music2', 'Headphones', 'Mic', 'Volume2', 'Radio'],
  sports: ['Trophy', 'Medal', 'Award', 'Activity', 'Flame', 'HeartPulse'],
  finance: ['DollarSign', 'CreditCard', 'Coins', 'Wallet', 'LineChart', 'TrendingUp'],
  economics: ['TrendingUp', 'LineChart', 'DollarSign', 'Landmark', 'Coins'],
  geography: ['Globe', 'Globe2', 'Map', 'MapPin', 'Compass', 'Navigation']
};

let activeCustomizingCourse = null;
let currentCustomColor = null;
let currentCustomIcon = null;
let currentIconCategory = 'popular';
let currentIconQuery = '';
let currentIconDisplayLimit = 160;

function formatLucideIconLabel(name) {
  if (!name) return '';
  return name.replace(/([A-Z])/g, ' $1').trim();
}

function renderCourseIconHtml(iconName, { size = 16, strokeWidth = 2, color = 'currentColor', className = '' } = {}) {
  if (!iconName) return '';

  // Check if legacy emoji or non-identifier string
  if (!/^[A-Za-z0-9_-]+$/.test(iconName)) {
    const emojiMap = {
      '📚': 'BookOpen', '🎓': 'GraduationCap', '💻': 'Laptop', '📐': 'Compass',
      '🔬': 'Microscope', '🧪': 'FlaskConical', '🧬': 'Dna', '🎨': 'Palette',
      '📊': 'BarChart2', '💡': 'Lightbulb', '📝': 'NotebookPen', '🏛️': 'Landmark',
      '🌍': 'Globe', '🚀': 'Rocket', '🧠': 'Brain', '🎧': 'Headphones',
      '⚡': 'Zap', '⚙️': 'Settings', '📈': 'TrendingUp', '📜': 'Scroll',
      '🔍': 'Search', '💼': 'Briefcase', '🏆': 'Trophy', '✨': 'Sparkles'
    };
    if (emojiMap[iconName]) {
      iconName = emojiMap[iconName];
    } else {
      return `<span class="${className}" style="font-size: ${size}px; line-height: 1;">${escapeHtml(iconName)}</span>`;
    }
  }

  const icons = window.lucide?.icons;
  if (!icons) {
    return `<span class="${className}">📚</span>`;
  }

  let iconNode = icons[iconName];
  if (!iconNode) {
    const key = Object.keys(icons).find(k => k.toLowerCase() === iconName.toLowerCase());
    if (key) iconNode = icons[key];
  }

  if (!iconNode) {
    iconNode = icons['BookOpen'] || icons['Book'];
  }

  if (!iconNode || !window.lucide?.createElement) {
    return `<span class="${className}">📚</span>`;
  }

  const svgEl = window.lucide.createElement(iconNode, {
    width: size,
    height: size,
    'stroke-width': strokeWidth,
    stroke: color,
    class: `lucide-course-icon ${className}`.trim()
  });

  return svgEl.outerHTML;
}

function getAllCourseCustomizations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.COURSE_CUSTOMIZATIONS);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error('Failed to parse course customizations:', err);
    return {};
  }
}

function getCourseCustomization(courseId) {
  if (!courseId) return null;
  const all = getAllCourseCustomizations();
  return all[String(courseId)] || null;
}

function saveCourseCustomization(courseId, customization) {
  if (!courseId) return;
  const all = getAllCourseCustomizations();
  if (customization) {
    all[String(courseId)] = customization;
  } else {
    delete all[String(courseId)];
  }
  localStorage.setItem(STORAGE_KEYS.COURSE_CUSTOMIZATIONS, JSON.stringify(all));
}

function getCourseColor(course, fallbackIndex = 0) {
  const custom = getCourseCustomization(course?.id);
  if (custom && custom.color) return custom.color;
  return COURSE_CUSTOMIZATION_COLORS[fallbackIndex % COURSE_CUSTOMIZATION_COLORS.length];
}

function getCourseIcon(course) {
  const custom = getCourseCustomization(course?.id);
  if (custom && custom.icon) return custom.icon;
  return 'BookOpen';
}

function getFilteredLucideIcons(query = '', category = 'popular') {
  const allIcons = window.lucide?.icons ? Object.keys(window.lucide.icons) : [];
  const trimmed = query.trim().toLowerCase();

  if (!trimmed) {
    if (category === 'all') {
      return allIcons;
    }
    if (LUCIDE_CATEGORIES[category]) {
      return LUCIDE_CATEGORIES[category].filter(name => !!window.lucide?.icons?.[name]);
    }
    return LUCIDE_CATEGORIES.popular.filter(name => !!window.lucide?.icons?.[name]);
  }

  const synonymMatches = LUCIDE_SYNONYMS[trimmed] || [];
  const terms = trimmed.split(/\s+/).filter(Boolean);

  const matched = allIcons.filter(name => {
    if (synonymMatches.includes(name)) return true;
    const humanLabel = name.replace(/([A-Z])/g, ' $1').toLowerCase();
    const lower = name.toLowerCase();
    return terms.every(term => humanLabel.includes(term) || lower.includes(term));
  });

  return Array.from(new Set([...synonymMatches, ...matched]));
}

function renderLucideIconPalette() {
  if (!customizationIconPalette) return;
  customizationIconPalette.innerHTML = '';

  const matchedIcons = getFilteredLucideIcons(currentIconQuery, currentIconCategory);

  if (customizationIconCount) {
    const countText = currentIconQuery
      ? `${matchedIcons.length} ${matchedIcons.length === 1 ? 'match' : 'matches'}`
      : `${matchedIcons.length} icons`;
    customizationIconCount.textContent = countText;
  }

  if (matchedIcons.length === 0) {
    if (customizationIconEmpty) customizationIconEmpty.classList.remove('hidden');
    return;
  }

  if (customizationIconEmpty) customizationIconEmpty.classList.add('hidden');

  const visibleIcons = matchedIcons.slice(0, currentIconDisplayLimit);

  visibleIcons.forEach(iconName => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isSelected = (currentCustomIcon && currentCustomIcon.toLowerCase() === iconName.toLowerCase());
    btn.className = 'icon-swatch-btn' + (isSelected ? ' active' : '');
    btn.setAttribute('data-icon', iconName);
    const humanLabel = formatLucideIconLabel(iconName);
    btn.title = humanLabel;
    btn.setAttribute('aria-label', humanLabel);
    btn.innerHTML = renderCourseIconHtml(iconName, { size: 19, color: 'currentColor' });

    btn.addEventListener('click', () => {
      selectCustomIcon(iconName);
    });

    customizationIconPalette.appendChild(btn);
  });

  if (matchedIcons.length > currentIconDisplayLimit) {
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.type = 'button';
    loadMoreBtn.className = 'category-pill';
    loadMoreBtn.style.gridColumn = '1 / -1';
    loadMoreBtn.style.margin = '8px auto';
    loadMoreBtn.textContent = `Load more icons (${matchedIcons.length - currentIconDisplayLimit} remaining)...`;
    loadMoreBtn.addEventListener('click', () => {
      currentIconDisplayLimit += 160;
      renderLucideIconPalette();
    });
    customizationIconPalette.appendChild(loadMoreBtn);
  }
}

function openCourseCustomizationModal(course) {
  if (!course || !courseCustomizationModal) return;
  activeCustomizingCourse = course;

  const existing = getCourseCustomization(course.id) || {};
  currentCustomColor = existing.color || COURSE_CUSTOMIZATION_COLORS[(course.id || 0) % COURSE_CUSTOMIZATION_COLORS.length];

  const cleanCode = getCleanCourseCode(course);
  if (customizationModalTitle) {
    customizationModalTitle.textContent = `Customize ${cleanCode || course.name || 'Course'}`;
  }
  if (customizationPreviewCode) {
    customizationPreviewCode.textContent = cleanCode;
    customizationPreviewCode.style.display = cleanCode ? '' : 'none';
  }
  if (customizationPreviewName) {
    customizationPreviewName.textContent = course.name || 'Untitled Course';
  }

  // Populate color swatches
  if (customizationColorPalette) {
    customizationColorPalette.innerHTML = '';
    COURSE_CUSTOMIZATION_COLORS.forEach(color => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'color-swatch-btn' + (color.toLowerCase() === currentCustomColor.toLowerCase() ? ' active' : '');
      btn.style.backgroundColor = color;
      btn.title = color;
      btn.addEventListener('click', () => {
        selectCustomColor(color);
      });
      customizationColorPalette.appendChild(btn);
    });
  }

  // Set custom color pickers
  if (customizationCustomColorPicker) {
    customizationCustomColorPicker.value = currentCustomColor.startsWith('#') && currentCustomColor.length === 7 ? currentCustomColor : '#6366f1';
  }
  if (customizationCustomColorInput) {
    customizationCustomColorInput.value = currentCustomColor;
  }

  updateCustomizationPreview();
  courseCustomizationModal.classList.remove('hidden');
}

function closeCourseCustomizationModal() {
  if (courseCustomizationModal) {
    courseCustomizationModal.classList.add('hidden');
  }
  activeCustomizingCourse = null;
}

function selectCustomColor(color) {
  currentCustomColor = color;
  if (customizationColorPalette) {
    customizationColorPalette.querySelectorAll('.color-swatch-btn').forEach(btn => {
      const btnColor = btn.title || '';
      btn.classList.toggle('active', btnColor.toLowerCase() === color.toLowerCase());
    });
  }
  if (customizationCustomColorPicker && color.startsWith('#') && color.length === 7) {
    customizationCustomColorPicker.value = color;
  }
  if (customizationCustomColorInput) {
    customizationCustomColorInput.value = color;
  }
  updateCustomizationPreview();
}

function updateCustomizationPreview() {
  if (customizationPreviewIcon) {
    customizationPreviewIcon.innerHTML = renderCourseLabelArrowHtml(currentCustomColor || '#6366f1', 22);
    customizationPreviewIcon.style.backgroundColor = 'transparent';
  }
  if (customizationPreviewBanner) {
    customizationPreviewBanner.style.borderColor = currentCustomColor || '#6366f1';
  }
  if (customizationPreviewCode) {
    customizationPreviewCode.style.color = currentCustomColor || '#6366f1';
  }
  if (customizationModalHeaderIconWrap) {
    customizationModalHeaderIconWrap.style.color = currentCustomColor || '#6366f1';
  }
  if (customizationModalHeaderIcon) {
    customizationModalHeaderIcon.innerHTML = renderCourseLabelArrowHtml(currentCustomColor || '#6366f1', 18);
  }
}

function saveCurrentCourseCustomization() {
  if (!activeCustomizingCourse) return;
  saveCourseCustomization(activeCustomizingCourse.id, {
    color: currentCustomColor
  });
  showToast(`Color saved for "${activeCustomizingCourse.name}"`);
  closeCourseCustomizationModal();
  refreshCourseCustomizationDisplays();
}

function resetCurrentCourseCustomization() {
  if (!activeCustomizingCourse) return;
  saveCourseCustomization(activeCustomizingCourse.id, null);
  showToast(`Reset "${activeCustomizingCourse.name}" color to default`);
  closeCourseCustomizationModal();
  refreshCourseCustomizationDisplays();
}

function refreshCourseCustomizationDisplays() {
  if (appState.courses && appState.courses.length > 0) {
    renderSidebarCourses(appState.courses);
    displayCoursesGrid(appState.courses);
  }
  if (appState.activeCourse && appState.activeView === 'course') {
    applyCourseHeaderCustomization(appState.activeCourse);
  }
  renderTabBar();
}

function applyCourseHeaderCustomization(course) {
  if (!course) return;
  const color = getCourseColor(course);

  if (courseHeroAccent) {
    courseHeroAccent.style.background = `linear-gradient(135deg, ${color} 0%, rgba(99, 102, 241, 0.4) 100%)`;
  }
}

/**
 * Render Courses Grid on Home Screen
 */
function renderCourses(coursesList) {
  const activeCourses = (coursesList || []).filter(c => !isCourseArchived(c.id));
  if (coursesCountVal) coursesCountVal.textContent = activeCourses.length;

  const termsSet = new Set();
  coursesList.forEach(c => {
    if (c.term?.name) termsSet.add(c.term.name);
  });

  if (termFilterSelect) {
    termFilterSelect.innerHTML = '<option value="all">All Terms</option>';
    termsSet.forEach(term => {
      const opt = document.createElement('option');
      opt.value = term;
      opt.textContent = term;
      termFilterSelect.appendChild(opt);
    });
    if (appState.archivedCourseIds && appState.archivedCourseIds.size > 0) {
      const archivedOpt = document.createElement('option');
      archivedOpt.value = '__archived__';
      archivedOpt.textContent = `Archived (${appState.archivedCourseIds.size})`;
      termFilterSelect.appendChild(archivedOpt);
    }
  }

  if (activeTermVal) activeTermVal.textContent = termsSet.size > 0 ? Array.from(termsSet)[0] : 'Active Term';
  renderSidebarCourses(coursesList);
  displayCoursesGrid(activeCourses);
  renderSettingsCoursesCardList();
  populateGlobalSearchCourses(coursesList);
  preloadAllCourseDetailsForSearch(coursesList);
  if (typeof populateNotesCourseFilterOptions === 'function') {
    populateNotesCourseFilterOptions();
  }
  if (typeof updateAiCourseSelector === 'function') {
    updateAiCourseSelector();
  }
}

/**
 * Course Archiving State & Operations
 */
function getArchivedCourseIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ARCHIVED_COURSES || 'canvas_archived_courses');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.map(String));
    }
  } catch { }
  return new Set();
}

function saveArchivedCourseIds(idSet) {
  try {
    localStorage.setItem(STORAGE_KEYS.ARCHIVED_COURSES || 'canvas_archived_courses', JSON.stringify(Array.from(idSet)));
  } catch { }
}

function isCourseArchived(courseId) {
  if (!courseId) return false;
  if (!appState.archivedCourseIds || !(appState.archivedCourseIds instanceof Set)) {
    appState.archivedCourseIds = getArchivedCourseIds();
  }
  return appState.archivedCourseIds.has(String(courseId));
}
window.isCourseArchived = isCourseArchived;

function archiveCourse(courseId) {
  if (!courseId) return;
  if (!appState.archivedCourseIds) appState.archivedCourseIds = getArchivedCourseIds();
  appState.archivedCourseIds.add(String(courseId));
  saveArchivedCourseIds(appState.archivedCourseIds);
  refreshAllCourseLists();

  const course = (appState.courses || []).find(c => String(c.id) === String(courseId));
  const name = course?.name || 'Course';
  showToast(`Archived "${name}"`);
}
window.archiveCourse = archiveCourse;

function unarchiveCourse(courseId) {
  if (!courseId) return;
  if (!appState.archivedCourseIds) appState.archivedCourseIds = getArchivedCourseIds();
  appState.archivedCourseIds.delete(String(courseId));
  saveArchivedCourseIds(appState.archivedCourseIds);
  refreshAllCourseLists();

  const course = (appState.courses || []).find(c => String(c.id) === String(courseId));
  const name = course?.name || 'Course';
  showToast(`Restored "${name}" to active courses`);
}
window.unarchiveCourse = unarchiveCourse;

function toggleCourseArchive(courseId) {
  if (isCourseArchived(courseId)) {
    unarchiveCourse(courseId);
  } else {
    archiveCourse(courseId);
  }
}
window.toggleCourseArchive = toggleCourseArchive;

function refreshAllCourseLists() {
  if (appState.courses && typeof renderSidebarCourses === 'function') {
    renderSidebarCourses(appState.courses);
  }
  if (appState.courses && typeof applyCourseFilters === 'function') {
    applyCourseFilters();
  }
  if (coursesCountVal && appState.courses) {
    const activeCount = appState.courses.filter(c => !isCourseArchived(c.id)).length;
    coursesCountVal.textContent = activeCount;
  }
  if (courseArchiveModal && !courseArchiveModal.classList.contains('hidden')) {
    renderCourseArchiveModalList();
  }
  renderSettingsCoursesCardList();
}
window.refreshAllCourseLists = refreshAllCourseLists;

function openCourseArchiveModal() {
  if (!courseArchiveModal) return;
  courseArchiveFilter = 'all';
  courseArchiveSearchQuery = '';
  if (courseArchiveSearchInput) courseArchiveSearchInput.value = '';

  const pills = courseArchiveModal.querySelectorAll('[data-archive-filter]');
  pills.forEach(p => {
    p.classList.toggle('active', p.getAttribute('data-archive-filter') === 'all');
  });

  renderCourseArchiveModalList();
  courseArchiveModal.classList.remove('hidden');
}
window.openCourseArchiveModal = openCourseArchiveModal;

function closeCourseArchiveModal() {
  if (courseArchiveModal) {
    courseArchiveModal.classList.add('hidden');
  }
}
window.closeCourseArchiveModal = closeCourseArchiveModal;

function renderCourseArchiveRow(course, isArchived) {
  const row = document.createElement('div');
  row.className = 'course-archive-row' + (isArchived ? ' is-archived' : '');
  row.setAttribute('data-course-id', course.id);

  const cleanCode = getCleanCourseCode(course);
  const color = getCourseColor(course);
  const termName = course.term?.name || 'Current Term';

  row.innerHTML = `
    <div class="course-archive-row-left">
      <span class="course-archive-indicator" style="background-color: ${color};"></span>
      <div class="course-archive-info">
        <div class="course-archive-name-wrap">
          <span class="course-archive-name" title="${escapeHtml(course.name || '')}">${escapeHtml(course.name || 'Untitled Course')}</span>
          ${cleanCode ? `<span class="course-code-pill" style="background: ${color}; font-size: 10px; padding: 1px 6px;">${escapeHtml(cleanCode)}</span>` : ''}
        </div>
        <div class="course-archive-meta">
          <span>${escapeHtml(termName)}</span>
          <span style="opacity:0.4;">•</span>
          <span class="course-archive-status-tag ${isArchived ? 'archived' : 'active'}">${isArchived ? 'Archived' : 'Active'}</span>
        </div>
      </div>
    </div>
    <div class="course-archive-row-actions">
      <button type="button" class="secondary-button small-btn archive-toggle-btn ${isArchived ? 'restored' : ''}" title="${isArchived ? 'Restore course to active sidebar' : 'Archive course from sidebar'}">
        ${isArchived ? `
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
          </svg>
          <span>Restore</span>
        ` : `
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="21 8 21 21 3 21 3 8"></polyline>
            <rect x="1" y="3" width="22" height="5"></rect>
            <line x1="10" y1="12" x2="14" y2="12"></line>
          </svg>
          <span>Archive</span>
        `}
      </button>
    </div>
  `;

  const btn = row.querySelector('.archive-toggle-btn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCourseArchive(course.id);
    });
  }

  return row;
}

function renderCourseArchiveModalList() {
  if (!courseArchiveList) return;
  courseArchiveList.innerHTML = '';

  const allCourses = appState.courses || [];
  const activeCount = allCourses.filter(c => !isCourseArchived(c.id)).length;
  const archivedCount = allCourses.filter(c => isCourseArchived(c.id)).length;

  const countAll = document.getElementById('archiveFilterCountAll');
  const countActive = document.getElementById('archiveFilterCountActive');
  const countArchived = document.getElementById('archiveFilterCountArchived');
  if (countAll) countAll.textContent = allCourses.length;
  if (countActive) countActive.textContent = activeCount;
  if (countArchived) countArchived.textContent = archivedCount;

  const q = (courseArchiveSearchQuery || '').trim().toLowerCase();
  const filtered = allCourses.filter(course => {
    const isArchived = isCourseArchived(course.id);
    if (courseArchiveFilter === 'active' && isArchived) return false;
    if (courseArchiveFilter === 'archived' && !isArchived) return false;

    if (q) {
      const name = (course.name || '').toLowerCase();
      const code = (course.course_code || '').toLowerCase();
      const term = (course.term?.name || '').toLowerCase();
      if (!name.includes(q) && !code.includes(q) && !term.includes(q)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    courseArchiveList.innerHTML = `
      <div style="text-align: center; padding: 28px 12px; color: var(--color-text-secondary); font-size: 13px;">
        No courses found matching current filter.
      </div>
    `;
    return;
  }

  filtered.forEach(course => {
    courseArchiveList.appendChild(renderCourseArchiveRow(course, isCourseArchived(course.id)));
  });
}
window.renderCourseArchiveModalList = renderCourseArchiveModalList;

function renderSettingsCoursesCardList() {
  if (!settingsCoursesArchiveList) return;
  settingsCoursesArchiveList.innerHTML = '';

  const allCourses = appState.courses || [];
  const activeCount = allCourses.filter(c => !isCourseArchived(c.id)).length;
  const archivedCount = allCourses.filter(c => isCourseArchived(c.id)).length;

  const countAll = document.getElementById('settingsArchiveFilterCountAll');
  const countActive = document.getElementById('settingsArchiveFilterCountActive');
  const countArchived = document.getElementById('settingsArchiveFilterCountArchived');
  if (countAll) countAll.textContent = allCourses.length;
  if (countActive) countActive.textContent = activeCount;
  if (countArchived) countArchived.textContent = archivedCount;

  const q = (settingsCourseArchiveSearchQuery || '').trim().toLowerCase();
  const filtered = allCourses.filter(course => {
    const isArchived = isCourseArchived(course.id);
    if (settingsCourseArchiveFilter === 'active' && isArchived) return false;
    if (settingsCourseArchiveFilter === 'archived' && !isArchived) return false;

    if (q) {
      const name = (course.name || '').toLowerCase();
      const code = (course.course_code || '').toLowerCase();
      const term = (course.term?.name || '').toLowerCase();
      if (!name.includes(q) && !code.includes(q) && !term.includes(q)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    settingsCoursesArchiveList.innerHTML = `
      <div style="text-align: center; padding: 24px 12px; color: var(--color-text-secondary); font-size: 13px;">
        No courses found matching current filter.
      </div>
    `;
    return;
  }

  filtered.forEach(course => {
    settingsCoursesArchiveList.appendChild(renderCourseArchiveRow(course, isCourseArchived(course.id)));
  });
}
window.renderSettingsCoursesCardList = renderSettingsCoursesCardList;


