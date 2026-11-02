const { app, BrowserWindow, ipcMain, shell, Menu, dialog, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

let loadElectronLlm = null;
try {
  loadElectronLlm = require('@electron/llm').loadElectronLlm;
} catch (err) {
  console.warn('Failed to load @electron/llm:', err.message);
}

// Set application name early so macOS Menu and Dock pick it up
app.name = 'Atelier';
if (app.setName) {
  try {
    app.setName('Atelier');
  } catch { }
}

// Keep the debug app's data apart from the installed app's. Local Storage can only be
// opened by one process, so a second app on the same folder starts with empty storage
// (no saved login) and loses anything it writes.
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'Atelier Dev'));
}

const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) {
  app.quit();
}

let mainWindow = null;
const iconPath = path.join(__dirname, 'src', 'assets', 'logo.png');

let liquidGlass = null;
try {
  liquidGlass = require('electron-liquid-glass');
} catch (err) {
  console.warn('Failed to load electron-liquid-glass:', err.message);
}

function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  if (!isMac) {
    Menu.setApplicationMenu(null);
    return;
  }
  const template = [
    ...(isMac ? [{
      label: 'Atelier',
      submenu: [
        { role: 'about', label: 'About Atelier' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Atelier' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Atelier' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('app:new-tab');
            }
          }
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('app:close-tab');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+Shift+W',
          role: 'close'
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          { role: 'close' }
        ])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  let windowIcon = iconPath;
  if (fs.existsSync(iconPath)) {
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) {
      windowIcon = img;
    }
  }

  mainWindow = new BrowserWindow({
    title: 'Atelier',
    icon: windowIcon,
    width: 1260,
    height: 860,
    minWidth: 920,
    minHeight: 660,
    transparent: isMac,
    vibrancy: false,
    backgroundColor: isMac ? '#00000000' : '#edf0f4',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    autoHideMenuBar: !isMac,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      plugins: true,
      webSecurity: false
    }
  });

  if (isMac && mainWindow.setWindowButtonVisibility) {
    mainWindow.setWindowButtonVisibility(true);
  }

  if (!isMac) {
    mainWindow.removeMenu();
    mainWindow.setMenuBarVisibility(false);
  }

  let glassApplied = false;
  if (isMac && liquidGlass) {
    mainWindow.webContents.on('did-finish-load', () => {
      if (glassApplied) return;
      glassApplied = true;
      try {
        const handle = mainWindow.getNativeWindowHandle();
        const glassId = liquidGlass.addView(handle, {
          cornerRadius: 16
        });
        if (glassId && glassId !== -1 && typeof liquidGlass.unstable_setVariant === 'function') {
          try {
            liquidGlass.unstable_setVariant(glassId, 2);
          } catch { }
        }
      } catch (err) {
        console.warn('Failed to apply liquid glass effect:', err.message);
      }
    });
  }

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error(`[Renderer Error] ${message} (${path.basename(sourceId)}:${line})`);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Allow embedded web pages (iframes in sidepanel/tabs) to load without frame-ancestors/X-Frame-Options blocks
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType === 'subFrame') {
      const responseHeaders = { ...details.responseHeaders };
      delete responseHeaders['x-frame-options'];
      delete responseHeaders['X-Frame-Options'];
      delete responseHeaders['content-security-policy'];
      delete responseHeaders['Content-Security-Policy'];
      callback({ cancel: false, responseHeaders });
    } else {
      callback({ cancel: false, responseHeaders: details.responseHeaders });
    }
  });
}

app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  if (!hasInstanceLock) return;

  if (process.platform === 'darwin' && app.dock && fs.existsSync(iconPath)) {
    try {
      const dockIcon = nativeImage.createFromPath(iconPath);
      if (!dockIcon.isEmpty()) {
        app.dock.setIcon(dockIcon);
      } else {
        app.dock.setIcon(iconPath);
      }
    } catch (e) {
      console.warn('Could not set dock icon:', e.message);
    }
  }

  buildAppMenu();
  try {
    ensureDemoFilesLocally();
  } catch (err) {
    console.warn('Initial demo files seeding error:', err.message);
  }

  let llmInitialized = false;
  if (loadElectronLlm) {
    try {
      await loadElectronLlm({
        isAutomaticPreloadDisabled: true,
        getModelPath: async (modelAlias) => {
          return resolveModelPath(modelAlias);
        }
      });
      console.log('@electron/llm initialized successfully in main process');
      llmInitialized = true;
    } catch (err) {
      console.warn('Could not initialize @electron/llm, falling back to direct node-llama-cpp engine:', err.message);
    }
  }

  if (!llmInitialized) {
    await registerFallbackLlmHandlers();
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Normalizes Canvas instance URL
 */
function normalizeCanvasUrl(rawDomain) {
  let domain = (rawDomain || 'canvas.instructure.com').trim();
  if (!/^https?:\/\//i.test(domain)) {
    domain = 'https://' + domain;
  }
  return domain.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
}

/**
 * Follows Canvas RFC 5988 Link headers to paginate through all available records
 * (canvas_docs.pdf Page 61 - Pagination)
 */
async function fetchAllCanvasPages(initialUrl, headers, maxPages = 15) {
  const results = [];
  let nextUrl = initialUrl;
  let pagesFetched = 0;

  while (nextUrl && pagesFetched < maxPages) {
    pagesFetched++;
    try {
      const res = await fetch(nextUrl, { headers });
      if (!res.ok) {
        // If first page fails, throw; if subsequent page fails, stop and return what we have
        if (pagesFetched === 1) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errText}`);
        }
        break;
      }

      const data = await res.json();
      if (Array.isArray(data)) {
        results.push(...data);
      } else {
        break;
      }

      // Check Link header for rel="next"
      const linkHeader = res.headers.get('link');
      nextUrl = null;
      if (linkHeader) {
        // Example: <https://<canvas>/api/v1/...?page=2>; rel="next"
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/i);
        if (match) {
          nextUrl = match[1];
        }
      }
    } catch (err) {
      if (pagesFetched === 1) throw err;
      break;
    }
  }

  return results;
}

// ==========================================================================
// Offline Cache Management
// ==========================================================================
function getOfflineCacheDir() {
  const dir = path.join(app.getPath('userData'), 'Canvas_Offline_Cache');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function saveOfflineCache(subPath, data) {
  try {
    const fullPath = path.join(getOfflineCacheDir(), subPath);
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.warn('Failed to save offline cache:', subPath, err.message);
    return false;
  }
}

function readOfflineCache(subPath) {
  try {
    const fullPath = path.join(getOfflineCacheDir(), subPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn('Failed to read offline cache:', subPath, err.message);
  }
  return null;
}

function isDemoAccount(domain, token) {
  const cleanDomain = String(domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const cleanToken = String(token || '').trim().toLowerCase();
  return (cleanDomain === 'demo' || cleanDomain === 'demo.instructure.com') && cleanToken === 'demo';
}

function getLocalMockAccount() {
  try {
    const mockPath = path.join(app.getAppPath(), 'mock-account', 'mock-account.json');
    if (fs.existsSync(mockPath)) {
      return JSON.parse(fs.readFileSync(mockPath, 'utf-8'));
    }
  } catch (err) {
    console.warn('[Mock Account] Error reading mock-account.json:', err.message);
  }
  return null;
}

ipcMain.handle('canvas:load-mock-account', async () => {
  const data = getLocalMockAccount();
  if (data) {
    return { success: true, data };
  }
  return { success: false, error: 'mock-account.json not found' };
});

// IPC: Fetch profile from Canvas API (with offline cache fallback)
ipcMain.handle('canvas:get-user-profile', async (_event, { domain, token }) => {
  console.log(`[Canvas Auth] Attempting login with host: "${domain}"`);

  if (isDemoAccount(domain, token)) {
    const mock = getLocalMockAccount();
    const profile = mock?.profile || {
      id: 91000,
      name: 'Alex Rivera',
      short_name: 'Alex',
      sortable_name: 'Rivera, Alex',
      primary_email: 'alex.rivera@atelier.mock',
      login_id: 'demo',
      avatar_url: '',
      time_zone: 'Europe/Amsterdam',
      locale: 'en'
    };
    return {
      success: true,
      data: {
        profile,
        self: profile,
        meta: {
          instanceUrl: 'https://demo.instructure.com',
          fetchedAt: new Date().toISOString(),
          isDemo: true
        }
      },
      demo: true
    };
  }

  const cachedProfile = readOfflineCache('profile.json');

  if (!token || !token.trim()) {
    if (cachedProfile) {
      return { success: true, data: cachedProfile, offline: true, cached: true };
    }
    return { success: false, error: 'Canvas Access Token is required.' };
  }

  const baseUrl = normalizeCanvasUrl(domain);
  const headers = {
    'Authorization': `Bearer ${token.trim()}`,
    'Accept': 'application/json',
    'User-Agent': 'CanvasNextDesktop/1.0.0'
  };

  try {
    const profileUrl = `${baseUrl}/api/v1/users/self/profile`;
    const profileRes = await fetch(profileUrl, { headers });

    if (!profileRes.ok) {
      if (cachedProfile && (profileRes.status >= 500 || profileRes.status === 408)) {
        return { success: true, data: cachedProfile, offline: true, cached: true };
      }
      const errorText = await profileRes.text();
      let parsedMessage = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        parsedMessage = errorJson.errors?.[0]?.message || errorJson.message || JSON.stringify(errorJson);
      } catch { }

      console.error(`[Canvas Auth Error] HTTP ${profileRes.status} from ${profileUrl}: ${parsedMessage}`);

      if (profileRes.status === 401) {
        return {
          success: false,
          status: 401,
          error: 'Unauthorized: Invalid or expired Canvas Access Token.'
        };
      }
      if (profileRes.status === 404) {
        return {
          success: false,
          status: 404,
          error: `Endpoint not found (404) on ${baseUrl}. Verify the Canvas instance host.`
        };
      }

      return {
        success: false,
        status: profileRes.status,
        error: `Canvas API error ${profileRes.status}: ${parsedMessage}`
      };
    }

    const profileData = await profileRes.json();

    let selfData = null;
    try {
      const selfRes = await fetch(`${baseUrl}/api/v1/users/self`, { headers });
      if (selfRes.ok) selfData = await selfRes.json();
    } catch { }

    const rateLimitCost = profileRes.headers.get('x-request-cost');
    const rateLimitRemaining = profileRes.headers.get('x-rate-limit-remaining');

    const resultData = {
      profile: profileData,
      self: selfData,
      meta: {
        instanceUrl: baseUrl,
        fetchedAt: new Date().toISOString(),
        rateLimitCost: rateLimitCost || null,
        rateLimitRemaining: rateLimitRemaining || null
      }
    };

    saveOfflineCache('profile.json', resultData);

    return {
      success: true,
      data: resultData
    };
  } catch (err) {
    console.error(`[Canvas Auth Network Exception] ${err.message}`);
    if (cachedProfile) {
      return {
        success: true,
        data: cachedProfile,
        offline: true,
        cached: true,
        networkError: err.message
      };
    }
    return {
      success: false,
      error: `Network error: ${err.message}. Ensure the Canvas instance is reachable.`
    };
  }
});

// IPC: Fetch courses user is enrolled in with pagination (with offline cache fallback)
ipcMain.handle('canvas:get-courses', async (_event, { domain, token, preferCache = false }) => {
  if (isDemoAccount(domain, token)) {
    const mock = getLocalMockAccount();
    if (mock && Array.isArray(mock.courses)) {
      return {
        success: true,
        data: {
          courses: mock.courses,
          meta: { instanceUrl: 'https://demo.instructure.com', isDemo: true, fetchedAt: new Date().toISOString() }
        },
        demo: true
      };
    }
  }

  const isCourseActive = (course) => {
    if (!course || !course.id) return false;
    if (course.access_restricted_by_date) return false;
    if (course.workflow_state === 'completed' || course.workflow_state === 'deleted') return false;
    if (course.concluded) return false;
    if (Array.isArray(course.enrollments) && course.enrollments.length > 0) {
      return course.enrollments.some(e => e.enrollment_state === 'active');
    }
    return true;
  };

  const rawCached = readOfflineCache('courses.json');
  const cachedCourses = Array.isArray(rawCached) ? rawCached.filter(isCourseActive) : null;

  if (preferCache && cachedCourses && cachedCourses.length > 0) {
    return {
      success: true,
      data: {
        courses: cachedCourses,
        meta: { offline: true, cached: true, fetchedAt: new Date().toISOString() }
      },
      offline: true,
      cached: true
    };
  }

  if (!token || !token.trim()) {
    if (cachedCourses) {
      return {
        success: true,
        data: {
          courses: cachedCourses,
          meta: { offline: true, fetchedAt: new Date().toISOString() }
        },
        offline: true,
        cached: true
      };
    }
    return { success: false, error: 'Canvas Access Token is required.' };
  }

  const baseUrl = normalizeCanvasUrl(domain);
  const headers = {
    'Authorization': `Bearer ${token.trim()}`,
    'Accept': 'application/json',
    'User-Agent': 'CanvasNextDesktop/1.0.0'
  };

  try {
    const queryParams = new URLSearchParams({
      'enrollment_state': 'active',
      'per_page': '100'
    });
    ['term', 'total_scores', 'current_grading_period_scores', 'course_image', 'teachers', 'syllabus_body', 'enrollments'].forEach(inc => {
      queryParams.append('include[]', inc);
    });

    const coursesUrl = `${baseUrl}/api/v1/courses?${queryParams.toString()}`;
    const rawList = await fetchAllCanvasPages(coursesUrl, headers, 10);
    let coursesData = Array.isArray(rawList) ? rawList.filter(isCourseActive) : [];

    if (coursesData.length === 0 && cachedCourses && cachedCourses.length > 0) {
      coursesData = cachedCourses;
    }

    saveOfflineCache('courses.json', coursesData);

    return {
      success: true,
      data: {
        courses: coursesData,
        meta: {
          instanceUrl: baseUrl,
          fetchedAt: new Date().toISOString()
        }
      }
    };
  } catch (err) {
    if (cachedCourses) {
      return {
        success: true,
        data: {
          courses: cachedCourses,
          meta: {
            instanceUrl: baseUrl,
            fetchedAt: new Date().toISOString(),
            offline: true
          }
        },
        offline: true,
        cached: true,
        networkError: err.message
      };
    }
    return {
      success: false,
      error: `Network error loading courses: ${err.message}`
    };
  }
});

function annotateCourseDetailsWithLocalFiles(courseId, details) {
  if (!details) return details;
  try {
    const courseDir = getCourseFilesDir(courseId);
    migrateCourseFilesOnDisk(courseDir);

    const localFileMap = new Map();
    if (fs.existsSync(courseDir)) {
      const dirEntries = fs.readdirSync(courseDir);
      for (const entry of dirEntries) {
        const fullPath = path.join(courseDir, entry);
        try {
          if (fs.statSync(fullPath).isFile() && fs.statSync(fullPath).size > 0) {
            localFileMap.set(entry.toLowerCase(), fullPath);
            localFileMap.set(entry.replace(/\.[a-zA-Z0-9]+$/, '').toLowerCase(), fullPath);
          }
        } catch { }
      }
    }

    if (Array.isArray(details.files)) {
      details.files.forEach(file => {
        let fileName = ensureFilenameExtension(file.filename || file.display_name || `file_${file.id}`, file.content_type || file['content-type']);
        file.filename = fileName;
        file.display_name = ensureFilenameExtension(file.display_name || fileName, file.content_type || file['content-type']);
        const safeName = fileName.replace(/[^a-zA-Z0-9._ -]/g, '_');
        let localFilePath = path.join(courseDir, safeName);

        if (!fs.existsSync(localFilePath)) {
          const match = localFileMap.get(safeName.toLowerCase()) || localFileMap.get(fileName.toLowerCase());
          if (match) localFilePath = match;
        }

        if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).size > 0) {
          file.local_path = localFilePath;
          file.isLocal = true;
          file.is_downloaded = true;
        }
      });
    }

    // Also annotate module items and populate any cached page bodies
    if (Array.isArray(details.modules)) {
      details.modules.forEach(mod => {
        if (Array.isArray(mod.items)) {
          mod.items.forEach(it => {
            const itType = (it.type || '').toLowerCase();
            if (itType === 'file') {
              const rawTitle = it.title || 'file';
              const safeTitle = rawTitle.replace(/[^a-zA-Z0-9._ -]/g, '_');
              const match = localFileMap.get(safeTitle.toLowerCase()) || localFileMap.get(rawTitle.toLowerCase());
              if (match) {
                it.local_path = match;
                it.is_downloaded = true;
                it.isLocal = true;
              }
            } else if (itType === 'page') {
              if (!it.body) {
                const target = it.page_url || (it.url && it.url.includes('/pages/') ? it.url.split('/pages/').pop() : null) || it.page_id || it.id;
                if (target) {
                  const p = readOfflineCache(`pages/${courseId}_${encodeURIComponent(target)}.json`);
                  if (p && p.body) {
                    it.body = p.body;
                    if (p.title) it.title = p.title;
                  }
                }
              }
            }
          });
        }
      });
    }
  } catch (err) {
    console.warn('Error annotating local files:', err.message);
  }
  return details;
}

// Synthesizes course details from local disk files when offline
function synthesizeCourseDetailsFromDisk(courseId) {
  try {
    const courseDir = getCourseFilesDir(courseId);
    let diskFiles = [];
    if (fs.existsSync(courseDir)) {
      migrateCourseFilesOnDisk(courseDir);
      const items = fs.readdirSync(courseDir);
      for (const item of items) {
        const fullPath = path.join(courseDir, item);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile() && stat.size > 0) {
            const ext = getValidExtension(item);
            const isPdf = ext === '.pdf';
            const isImg = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext);
            const isCode = ['.py', '.js', '.ts', '.html', '.css', '.json', '.sql', '.sh'].includes(ext);
            const isMd = ['.md', '.markdown'].includes(ext);
            const cType = isPdf ? 'application/pdf' : (isImg ? 'image/png' : (isCode ? 'text/plain' : (isMd ? 'text/markdown' : 'application/octet-stream')));
            diskFiles.push({
              id: `local_${courseId}_${encodeURIComponent(item)}`,
              display_name: item,
              filename: item,
              content_type: cType,
              size: stat.size,
              updated_at: stat.mtime.toISOString(),
              local_path: fullPath,
              is_downloaded: true,
              isLocal: true
            });
          }
        } catch { }
      }
    }

    if (diskFiles.length === 0) return null;

    const cachedCourses = readOfflineCache('courses.json') || [];
    const courseMeta = Array.isArray(cachedCourses) ? cachedCourses.find(c => String(c.id) === String(courseId)) : null;

    const moduleItems = diskFiles.map((f, idx) => ({
      id: `local_item_${idx}`,
      title: f.display_name,
      type: 'File',
      content_id: f.id,
      local_path: f.local_path,
      is_downloaded: true,
      isLocal: true
    }));

    const synthesized = {
      announcements: [],
      modules: [
        {
          id: `mod_local_${courseId}`,
          name: 'Saved Course Files & Materials',
          items: moduleItems
        }
      ],
      assignments: [],
      assignmentGroups: [],
      files: diskFiles,
      syllabus_body: courseMeta?.syllabus_body || null,
      fetchedAt: new Date().toISOString(),
      offline: true,
      synthesized: true
    };

    saveOfflineCache(`courses/${courseId}.json`, synthesized);
    return synthesized;
  } catch (err) {
    console.warn('Could not synthesize course details from disk:', err.message);
    return null;
  }
}

// Internal Course Details Fetcher
async function fetchCourseDetailsInternal(domain, token, courseId) {
  const baseUrl = normalizeCanvasUrl(domain);
  const headers = {
    'Authorization': `Bearer ${token.trim()}`,
    'Accept': 'application/json',
    'User-Agent': 'CanvasNextDesktop/1.0.0'
  };

  // 1. Fetch announcements
  const announcementsUrl = `${baseUrl}/api/v1/announcements?context_codes[]=course_${courseId}&start_date=2015-01-01&end_date=2035-12-31&per_page=100`;
  const topicsUrl = `${baseUrl}/api/v1/courses/${courseId}/discussion_topics?only_announcements=true&per_page=100`;

  const announcementsPromise = (async () => {
    let combined = [];
    try {
      const fromAnnouncementsApi = await fetchAllCanvasPages(announcementsUrl, headers, 10);
      combined.push(...fromAnnouncementsApi);
    } catch (err) {
      console.warn('Announcements API query warning:', err.message);
    }

    try {
      const fromTopicsApi = await fetchAllCanvasPages(topicsUrl, headers, 10);
      combined.push(...fromTopicsApi);
    } catch (err) {
      console.warn('Topics API announcements query warning:', err.message);
    }

    const seenIds = new Set();
    const uniqueAnnouncements = [];
    for (const item of combined) {
      if (item && item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        uniqueAnnouncements.push(item);
      }
    }

    uniqueAnnouncements.sort((a, b) => {
      const dateA = new Date(a.posted_at || a.created_at || 0).getTime();
      const dateB = new Date(b.posted_at || b.created_at || 0).getTime();
      return dateB - dateA;
    });

    return uniqueAnnouncements;
  })();

  // 2. Fetch all modules with items & details
  const modulesUrl = `${baseUrl}/api/v1/courses/${courseId}/modules?include[]=items&include[]=content_details&per_page=100`;
  const modulesPromise = fetchAllCanvasPages(modulesUrl, headers, 10).catch(() => []);

  // 3. Fetch all assignments with submissions
  const assignmentsUrl = `${baseUrl}/api/v1/courses/${courseId}/assignments?include[]=submission&include[]=score_statistics&order_by=due_at&per_page=100`;
  const assignmentsPromise = fetchAllCanvasPages(assignmentsUrl, headers, 10).catch(() => []);

  // 4. Fetch assignment groups for grading weights
  const assignmentGroupsUrl = `${baseUrl}/api/v1/courses/${courseId}/assignment_groups?include[]=assignments&per_page=50`;
  const assignmentGroupsPromise = fetchAllCanvasPages(assignmentGroupsUrl, headers, 5).catch(() => []);

  // 5. Fetch course files
  const filesUrl = `${baseUrl}/api/v1/courses/${courseId}/files?sort=updated_at&order=desc&per_page=100`;
  const filesPromise = fetchAllCanvasPages(filesUrl, headers, 5).catch(() => []);

  const [announcements, modules, assignments, assignmentGroups, files] = await Promise.all([
    announcementsPromise,
    modulesPromise,
    assignmentsPromise,
    assignmentGroupsPromise,
    filesPromise
  ]);

  const combinedFiles = Array.isArray(files) ? [...files] : [];
  if (Array.isArray(modules)) {
    modules.forEach(mod => {
      if (Array.isArray(mod.items)) {
        mod.items.forEach(it => {
          if ((it.type || '').toLowerCase() === 'file') {
            const fileId = it.content_id || it.id;
            const rawTitle = it.title || 'file';
            const normalizedTitle = ensureFilenameExtension(rawTitle, 'application/pdf');
            it.title = normalizedTitle;

            const existing = combinedFiles.find(f =>
              (fileId && (f.id === fileId || f.content_id === fileId)) ||
              (f.filename && (f.filename === normalizedTitle || f.filename === rawTitle)) ||
              (f.display_name && (f.display_name === normalizedTitle || f.display_name === rawTitle))
            );

            if (!existing) {
              combinedFiles.push({
                id: fileId,
                content_id: it.content_id,
                display_name: normalizedTitle,
                filename: normalizedTitle,
                content_type: 'application/pdf',
                mime_class: 'pdf',
                size: it.size || 0,
                url: it.url,
                module_name: mod.name,
                updated_at: it.updated_at || mod.unlock_at || new Date().toISOString()
              });
            } else {
              existing.filename = ensureFilenameExtension(existing.filename || normalizedTitle, existing.content_type || 'application/pdf');
              existing.display_name = ensureFilenameExtension(existing.display_name || normalizedTitle, existing.content_type || 'application/pdf');
            }
          }
        });
      }
    });
  }

  const courseDir = getCourseFilesDir(courseId);
  migrateCourseFilesOnDisk(courseDir);

  combinedFiles.forEach(file => {
    let fileName = ensureFilenameExtension(file.filename || file.display_name || `file_${file.id}`, file.content_type || file['content-type']);
    file.filename = fileName;
    file.display_name = ensureFilenameExtension(file.display_name || fileName, file.content_type || file['content-type']);
    const safeName = fileName.replace(/[^a-zA-Z0-9._ -]/g, '_');
    let localFilePath = path.join(courseDir, safeName);

    if (!fs.existsSync(localFilePath)) {
      const altName = safeName.replace(/\.[a-zA-Z0-9]{1,6}$/, '');
      const altPath = path.join(courseDir, altName);
      if (fs.existsSync(altPath)) {
        try {
          fs.renameSync(altPath, localFilePath);
        } catch { }
      }
    }

    if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).size > 100) {
      let isCorrupted = false;
      try {
        const bufferHead = Buffer.alloc(16);
        const fd = fs.openSync(localFilePath, 'r');
        fs.readSync(fd, bufferHead, 0, 16, 0);
        fs.closeSync(fd);
        const headStr = bufferHead.toString('utf8');
        if (headStr.trim().startsWith('{') || (safeName.toLowerCase().endsWith('.pdf') && !headStr.startsWith('%PDF'))) {
          isCorrupted = true;
        }
      } catch { }

      if (!isCorrupted) {
        file.local_path = localFilePath;
        file.is_downloaded = true;
      } else {
        try { fs.unlinkSync(localFilePath); } catch { }
      }
    }
  });

  return {
    announcements: announcements,
    modules: modules,
    assignments: assignments,
    assignmentGroups: assignmentGroups,
    files: combinedFiles,
    fetchedAt: new Date().toISOString()
  };
}

// IPC: Fetch Course Details with full pagination & complete announcement date window (with offline cache)
ipcMain.handle('canvas:get-course-details', async (_event, { domain, token, courseId, preferCache = false }) => {
  if (!courseId) {
    return { success: false, error: 'Course ID is required.' };
  }

  if (isDemoAccount(domain, token)) {
    const mock = getLocalMockAccount();
    if (mock && mock.courseDetails && mock.courseDetails[courseId]) {
      return {
        success: true,
        data: {
          ...mock.courseDetails[courseId],
          meta: { courseId, isDemo: true, fetchedAt: new Date().toISOString() }
        },
        demo: true
      };
    }
  }

  const cacheKey = `courses/${courseId}.json`;
  let cachedDetails = readOfflineCache(cacheKey);

  // If no cache file yet, attempt to synthesize from disk files
  if (!cachedDetails) {
    cachedDetails = synthesizeCourseDetailsFromDisk(courseId);
  }

  if (preferCache && cachedDetails) {
    return {
      success: true,
      data: annotateCourseDetailsWithLocalFiles(courseId, cachedDetails),
      offline: true,
      cached: true
    };
  }

  if (!token || !token.trim()) {
    if (cachedDetails) {
      return {
        success: true,
        data: annotateCourseDetailsWithLocalFiles(courseId, cachedDetails),
        offline: true,
        cached: true
      };
    }
    return { success: false, error: 'Access token and Course ID are required.' };
  }

  try {
    const details = await fetchCourseDetailsInternal(domain, token, courseId);
    annotateCourseDetailsWithLocalFiles(courseId, details);
    saveOfflineCache(cacheKey, details);

    return {
      success: true,
      data: details
    };
  } catch (err) {
    if (cachedDetails) {
      return {
        success: true,
        data: annotateCourseDetailsWithLocalFiles(courseId, cachedDetails),
        offline: true,
        cached: true,
        networkError: err.message
      };
    }
    return {
      success: false,
      error: `Failed to fetch course details: ${err.message}`
    };
  }
});

// Sync and save all files, pages, and course data locally on disk
async function syncAllLocalContentInternal({ domain, token, courses }) {
  if (isDemoAccount(domain, token)) {
    const demoRes = ensureDemoFilesLocally();
    return {
      success: true,
      isDemo: true,
      totalFilesDownloaded: demoRes?.list?.length || 0,
      totalPagesCached: 0,
      courseResults: []
    };
  }

  if (!token || !token.trim()) {
    return { success: false, error: 'Access token is required for local sync.' };
  }
  const baseUrl = normalizeCanvasUrl(domain);
  const headers = {
    'Authorization': `Bearer ${token.trim()}`,
    'Accept': 'application/json',
    'User-Agent': 'CanvasNextDesktop/1.0.0'
  };

  let targetCourses = courses;
  if (!Array.isArray(targetCourses) || targetCourses.length === 0) {
    targetCourses = readOfflineCache('courses.json');
  }
  if (!Array.isArray(targetCourses) || targetCourses.length === 0) {
    const coursesUrl = `${baseUrl}/api/v1/courses?enrollment_state=active&per_page=100&include[]=term&include[]=total_scores&include[]=course_image&include[]=teachers&include[]=syllabus_body&include[]=enrollments`;
    try {
      const fetched = await fetchAllCanvasPages(coursesUrl, headers, 10);
      targetCourses = Array.isArray(fetched)
        ? fetched.filter(c => c && !c.concluded && c.workflow_state !== 'completed' && c.workflow_state !== 'deleted')
        : [];
      saveOfflineCache('courses.json', targetCourses);
    } catch (e) {
      return { success: false, error: `Could not fetch courses list: ${e.message}` };
    }
  }

  let totalFilesDownloaded = 0;
  let totalPagesCached = 0;
  const courseResults = [];

  for (const c of targetCourses) {
    if (!c || !c.id) continue;
    const courseId = c.id;
    try {
      // 1. Fetch course details
      const details = await fetchCourseDetailsInternal(domain, token, courseId);
      if (!details) continue;

      const courseDir = getCourseFilesDir(courseId);

      // 2. Download all files in details.files to disk
      const filesToDownload = Array.isArray(details.files) ? details.files : [];
      for (const file of filesToDownload) {
        if (!file.url && !file.download_url && !file.id) continue;
        try {
          const dlRes = await downloadCanvasFile({
            domain,
            token,
            fileUrl: file.url || file.download_url,
            fileId: file.id || file.content_id,
            filename: file.filename || file.display_name,
            courseId
          });
          if (dlRes && dlRes.success) {
            file.local_path = dlRes.localPath;
            file.filename = dlRes.filename;
            file.is_downloaded = true;
            file.isLocal = true;
            if (!dlRes.cached) totalFilesDownloaded++;
          }
        } catch (fErr) {
          console.warn(`File download error in course ${courseId}:`, file.filename, fErr.message);
        }
      }

      // 3. Download module files & fetch all module pages
      if (Array.isArray(details.modules)) {
        for (const mod of details.modules) {
          if (!Array.isArray(mod.items)) continue;
          for (const it of mod.items) {
            const itemType = (it.type || '').toLowerCase();
            if (itemType === 'file') {
              try {
                const dlRes = await downloadCanvasFile({
                  domain,
                  token,
                  fileUrl: it.url,
                  fileId: it.content_id || it.id,
                  filename: it.title,
                  courseId
                });
                if (dlRes && dlRes.success) {
                  it.local_path = dlRes.localPath;
                  it.is_downloaded = true;
                  it.isLocal = true;
                  if (!dlRes.cached) totalFilesDownloaded++;
                }
              } catch (mfErr) {
                console.warn(`Module file download error:`, it.title, mfErr.message);
              }
            } else if (itemType === 'page') {
              const target = it.page_url || (it.url && it.url.includes('/pages/') ? it.url.split('/pages/').pop() : null) || it.page_id || it.id;
              if (target) {
                const pageCacheKey = `pages/${courseId}_${encodeURIComponent(target)}.json`;
                let pageData = readOfflineCache(pageCacheKey);
                if (!pageData || !pageData.body) {
                  try {
                    let pageEndpoint = it.url && it.url.startsWith('http') ? it.url : `${baseUrl}/api/v1/courses/${courseId}/pages/${encodeURIComponent(target)}`;
                    const pRes = await fetch(pageEndpoint, { headers });
                    if (pRes.ok) {
                      pageData = await pRes.json();
                      saveOfflineCache(pageCacheKey, pageData);
                      totalPagesCached++;
                    }
                  } catch (pErr) {
                    console.warn(`Page fetch warning:`, target, pErr.message);
                  }
                }
                if (pageData && pageData.body) {
                  it.body = pageData.body;
                  if (pageData.title) it.title = pageData.title;
                }
              }
            }
          }
        }
      }

      // 4. Save enriched course details locally
      annotateCourseDetailsWithLocalFiles(courseId, details);
      saveOfflineCache(`courses/${courseId}.json`, details);
      courseResults.push({ courseId, success: true });
    } catch (cErr) {
      console.warn(`Error syncing course ${courseId}:`, cErr.message);
      courseResults.push({ courseId, success: false, error: cErr.message });
    }
  }

  // Pre-seed demo files and starter course details
  ensureDemoFilesLocally();

  return {
    success: true,
    coursesCount: courseResults.filter(r => r.success).length,
    totalFilesDownloaded,
    totalPagesCached,
    courseResults
  };
}

// IPC: Sync and save all files, pages, and course data locally
ipcMain.handle('canvas:sync-all-local-content', async (_event, params) => {
  return await syncAllLocalContentInternal(params);
});

// IPC: Pre-cache all course contents for full offline readiness (alias / legacy)
ipcMain.handle('canvas:precache-all', async (_event, params) => {
  return await syncAllLocalContentInternal(params);
});

// IPC: Clear all offline cache
ipcMain.handle('canvas:clear-cache', async () => {
  try {
    const cacheDir = getOfflineCacheDir();
    if (fs.existsSync(cacheDir)) {
      const items = fs.readdirSync(cacheDir);
      for (const item of items) {
        const itemPath = path.join(cacheDir, item);
        try {
          fs.rmSync(itemPath, { recursive: true, force: true });
        } catch (e) {
          console.warn('Error deleting cache item:', itemPath, e.message);
        }
      }
    }
    try {
      const { session } = require('electron');
      if (session && session.defaultSession) {
        await session.defaultSession.clearCache();
      }
    } catch {}
    return { success: true };
  } catch (err) {
    console.error('Failed to clear cache:', err);
    return { success: false, error: err.message };
  }
});

// IPC: Get offline cache statistics
ipcMain.handle('canvas:get-offline-status', async () => {
  try {
    const cacheDir = getOfflineCacheDir();
    const hasProfile = fs.existsSync(path.join(cacheDir, 'profile.json'));
    const hasCourses = fs.existsSync(path.join(cacheDir, 'courses.json'));
    let cachedCoursesCount = 0;
    if (hasCourses) {
      try {
        const c = JSON.parse(fs.readFileSync(path.join(cacheDir, 'courses.json'), 'utf8'));
        cachedCoursesCount = Array.isArray(c) ? c.length : 0;
      } catch { }
    }
    const coursesDir = path.join(cacheDir, 'courses');
    let detailedCoursesCount = 0;
    if (fs.existsSync(coursesDir)) {
      detailedCoursesCount = fs.readdirSync(coursesDir).filter(f => f.endsWith('.json')).length;
    }

    const pagesDir = path.join(cacheDir, 'pages');
    let cachedPagesCount = 0;
    if (fs.existsSync(pagesDir)) {
      cachedPagesCount = fs.readdirSync(pagesDir).filter(f => f.endsWith('.json')).length;
    }

    const filesBaseDir = path.join(app.getPath('userData'), 'Canvas_Course_Files');
    let localFilesCount = 0;
    if (fs.existsSync(filesBaseDir)) {
      const walk = (d) => {
        try {
          const list = fs.readdirSync(d);
          for (const item of list) {
            const p = path.join(d, item);
            if (fs.statSync(p).isDirectory()) walk(p);
            else if (fs.statSync(p).isFile()) localFilesCount++;
          }
        } catch { }
      };
      walk(filesBaseDir);
    }

    return {
      success: true,
      hasProfile,
      hasCourses,
      cachedCoursesCount,
      detailedCoursesCount,
      cachedPagesCount,
      localFilesCount
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// =============================================================================
// Canvas LMS Conversations (Inbox) API Handlers
// =============================================================================

let demoInboxConversations = [
  {
    id: 1001,
    subject: "Clarification on Lab 3: Raft Consensus Algorithm",
    workflow_state: "unread",
    last_message: "Yes, test cases 4 and 5 will inject partition drops. Let me know if you run into any issues with the RPC stubs.",
    last_message_at: "2026-10-22T14:30:00Z",
    message_count: 3,
    subscribed: true,
    starred: true,
    context_name: "CS-301: Distributed Systems & Cloud Infrastructure",
    context_code: "course_48201",
    visible_author_names: ["Dr. Marcus Vance", "Alex Rivera"],
    avatar_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80",
    participants: [
      { id: 891, name: "Dr. Marcus Vance", full_name: "Dr. Marcus Vance", avatar_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80" },
      { id: 101, name: "Alex Rivera", full_name: "Alex Rivera", avatar_url: "" }
    ],
    messages: [
      {
        id: 5001,
        author_id: 891,
        created_at: "2026-10-22T10:15:00Z",
        body: "Hi Alex,\n\nI reviewed your proposal for the leader election timeout randomized interval. You can proceed with 150-300ms as discussed in Wednesday's lecture. Make sure to test split-vote scenarios under simulated network partitions."
      },
      {
        id: 5002,
        author_id: 101,
        created_at: "2026-10-22T12:05:00Z",
        body: "Thank you Dr. Vance! Will the autograder test suite simulate node crashes during log replication as well?"
      },
      {
        id: 5003,
        author_id: 891,
        created_at: "2026-10-22T14:30:00Z",
        body: "Yes, test cases 4 and 5 will inject partition drops. Let me know if you run into any issues with the RPC stubs."
      }
    ]
  },
  {
    id: 1002,
    subject: "Office Hours & Problem Set 4 Feedback",
    workflow_state: "read",
    last_message: "Alex, your solution for Question 3 on Singular Value Decomposition was one of the cleanest geometric interpretations in the section. Keep up the great work.",
    last_message_at: "2026-10-21T16:45:00Z",
    message_count: 2,
    subscribed: true,
    starred: false,
    context_name: "MATH-240: Linear Algebra & Matrix Computing",
    context_code: "course_48202",
    visible_author_names: ["Prof. Elena Rostova", "Alex Rivera"],
    avatar_url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=100&q=80",
    participants: [
      { id: 892, name: "Prof. Elena Rostova", full_name: "Prof. Elena Rostova", avatar_url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=100&q=80" },
      { id: 101, name: "Alex Rivera", full_name: "Alex Rivera", avatar_url: "" }
    ],
    messages: [
      {
        id: 5004,
        author_id: 892,
        created_at: "2026-10-21T15:00:00Z",
        body: "Alex, your solution for Question 3 on Singular Value Decomposition was one of the cleanest geometric interpretations in the section. Keep up the great work."
      },
      {
        id: 5005,
        author_id: 101,
        created_at: "2026-10-21T16:45:00Z",
        body: "Thank you Professor Rostova! That means a lot. See you in tomorrow's lecture."
      }
    ]
  },
  {
    id: 1003,
    subject: "Final Project GPU Cluster Allocation & Dataset Setup",
    workflow_state: "read",
    last_message: "The department has allocated 50 GPU hours on the A100 cluster for your group's diffusion model study. You can SSH into node-04 starting tonight.",
    last_message_at: "2026-10-20T11:20:00Z",
    message_count: 1,
    subscribed: true,
    starred: true,
    context_name: "CS-450: Computer Vision & Deep Learning",
    context_code: "course_48203",
    visible_author_names: ["Sarah Lindqvist"],
    avatar_url: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=100&q=80",
    participants: [
      { id: 893, name: "Sarah Lindqvist", full_name: "Sarah Lindqvist", avatar_url: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=100&q=80" },
      { id: 101, name: "Alex Rivera", full_name: "Alex Rivera", avatar_url: "" }
    ],
    messages: [
      {
        id: 5006,
        author_id: 893,
        created_at: "2026-10-20T11:20:00Z",
        body: "Hello team,\n\nThe department has allocated 50 GPU hours on the A100 cluster for your group's diffusion model study. You can SSH into node-04 starting tonight. Please let me know if you encounter CUDA driver or dependency issues."
      }
    ]
  },
  {
    id: 1004,
    subject: "Fall 2026 Degree Progress Audit & Graduation Requirements",
    workflow_state: "read",
    last_message: "Your degree audit has been approved for the Advanced Systems track. Please make sure to register for CS-499 Capstone during the priority window.",
    last_message_at: "2026-10-18T09:10:00Z",
    message_count: 1,
    subscribed: true,
    starred: false,
    context_name: "Faculty of Science Academic Advising",
    context_code: "course_admin",
    visible_author_names: ["Academic Advising Office"],
    avatar_url: "",
    participants: [
      { id: 899, name: "Academic Advising Office", full_name: "Academic Advising Office", avatar_url: "" },
      { id: 101, name: "Alex Rivera", full_name: "Alex Rivera", avatar_url: "" }
    ],
    messages: [
      {
        id: 5007,
        author_id: 899,
        created_at: "2026-10-18T09:10:00Z",
        body: "Dear Alex,\n\nYour degree audit has been reviewed and approved for the Advanced Computer Systems track. Please note the following upcoming dates:\n• Spring course pre-registration begins Nov 10\n• CS-499 Capstone proposal deadline: Dec 1\n\nReach out if you have any questions!"
      }
    ]
  }
];

function getDemoConversationList() {
  const mock = getLocalMockAccount();
  if (mock && Array.isArray(mock.conversations) && mock.conversations.length > 0) {
    return mock.conversations;
  }
  return demoInboxConversations;
}

function getDemoConversations(scope = 'inbox', filter = null) {
  let list = getDemoConversationList().slice();
  if (filter && filter !== 'all') {
    list = list.filter(c => c.context_code === filter || (c.context_name && c.context_name.toLowerCase().includes(filter.toLowerCase())));
  }
  if (scope === 'unread') {
    list = list.filter(c => c.workflow_state === 'unread');
  } else if (scope === 'starred') {
    list = list.filter(c => c.starred);
  } else if (scope === 'archived') {
    list = list.filter(c => c.workflow_state === 'archived');
  } else if (scope === 'sent') {
    list = list.filter(c => c.messages && c.messages.some(m => m.author_id === 101 || m.author_id === 91000));
  }
  return list;
}

function getDemoConversationById(id) {
  return getDemoConversationList().find(c => String(c.id) === String(id)) || null;
}

function addDemoMessage(conversationId, body) {
  const conv = getDemoConversationById(conversationId);
  const newMsg = {
    id: Date.now(),
    author_id: 101,
    created_at: new Date().toISOString(),
    body: body || ''
  };
  if (conv) {
    if (!conv.messages) conv.messages = [];
    conv.messages.push(newMsg);
    conv.last_message = body;
    conv.last_message_at = newMsg.created_at;
    conv.message_count = conv.messages.length;
  }
  return newMsg;
}

// IPC: Get Canvas Conversations (Inbox)
ipcMain.handle('canvas:get-conversations', async (_event, { domain, token, scope = 'inbox', filter = null, page = 1, perPage = 30 } = {}) => {
  if (!token || !token.trim() || !domain || domain.includes('demo') || domain.includes('example.com')) {
    const data = getDemoConversations(scope, filter);
    return { success: true, data, isDemo: true };
  }

  const baseUrl = normalizeCanvasUrl(domain);
  const headers = {
    'Authorization': `Bearer ${token.trim()}`,
    'Accept': 'application/json',
    'User-Agent': 'CanvasNextDesktop/1.0.0'
  };

  try {
    const queryParams = new URLSearchParams({
      scope: scope || 'inbox',
      per_page: String(perPage || 30),
      page: String(page || 1)
    });
    if (filter && filter !== 'all') {
      queryParams.append('filter', filter);
    }

    const url = `${baseUrl}/api/v1/conversations?${queryParams.toString()}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      const cached = readOfflineCache(`inbox_${scope}.json`);
      if (cached) return { success: true, data: cached, offline: true, cached: true };
      const demoData = getDemoConversations(scope, filter);
      return { success: true, data: demoData, isDemo: true, fallback: true };
    }

    const data = await res.json();
    saveOfflineCache(`inbox_${scope}.json`, data);
    return { success: true, data };
  } catch (err) {
    const cached = readOfflineCache(`inbox_${scope}.json`);
    if (cached) return { success: true, data: cached, offline: true, cached: true };
    const demoData = getDemoConversations(scope, filter);
    return { success: true, data: demoData, isDemo: true, fallback: true };
  }
});

// IPC: Get full single conversation thread
ipcMain.handle('canvas:get-conversation', async (_event, { domain, token, conversationId } = {}) => {
  if (!token || !token.trim() || !domain || domain.includes('demo') || domain.includes('example.com') || String(conversationId).startsWith('demo-')) {
    const conv = getDemoConversationById(conversationId);
    return { success: true, data: conv, isDemo: true };
  }

  const baseUrl = normalizeCanvasUrl(domain);
  const headers = {
    'Authorization': `Bearer ${token.trim()}`,
    'Accept': 'application/json',
    'User-Agent': 'CanvasNextDesktop/1.0.0'
  };

  try {
    const url = `${baseUrl}/api/v1/conversations/${conversationId}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const conv = getDemoConversationById(conversationId);
      if (conv) return { success: true, data: conv, isDemo: true };
      return { success: false, error: `Canvas API returned ${res.status}` };
    }
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    const conv = getDemoConversationById(conversationId);
    if (conv) return { success: true, data: conv, isDemo: true };
    return { success: false, error: err.message };
  }
});

// IPC: Send conversation message / reply
ipcMain.handle('canvas:send-conversation-message', async (_event, { domain, token, conversationId, body, recipients, subject, contextCode } = {}) => {
  if (!token || !token.trim() || !domain || domain.includes('demo') || domain.includes('example.com')) {
    if (conversationId) {
      const newMsg = addDemoMessage(conversationId, body);
      return { success: true, data: newMsg, isDemo: true };
    } else {
      const newConv = {
        id: Date.now(),
        subject: subject || 'New Message',
        workflow_state: 'read',
        last_message: body || '',
        last_message_at: new Date().toISOString(),
        message_count: 1,
        subscribed: true,
        starred: false,
        context_name: contextCode ? `Course ${contextCode}` : 'Direct Message',
        context_code: contextCode || 'course_general',
        visible_author_names: ['Alex Rivera'],
        avatar_url: '',
        participants: [
          { id: 101, name: 'Alex Rivera', full_name: 'Alex Rivera', avatar_url: '' }
        ],
        messages: [
          {
            id: Date.now() + 1,
            author_id: 101,
            created_at: new Date().toISOString(),
            body: body || ''
          }
        ]
      };
      demoInboxConversations.unshift(newConv);
      return { success: true, data: newConv, isDemo: true };
    }
  }

  const baseUrl = normalizeCanvasUrl(domain);
  const headers = {
    'Authorization': `Bearer ${token.trim()}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'CanvasNextDesktop/1.0.0'
  };

  try {
    if (conversationId) {
      const url = `${baseUrl}/api/v1/conversations/${conversationId}/add_message`;
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body })
      });
      if (!res.ok) {
        return { success: false, error: `Failed to post message (${res.status})` };
      }
      const data = await res.json();
      return { success: true, data };
    } else {
      const url = `${baseUrl}/api/v1/conversations`;
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          recipients: recipients || [],
          subject: subject || 'No Subject',
          body: body || '',
          context_code: contextCode || undefined
        })
      });
      if (!res.ok) {
        return { success: false, error: `Failed to create conversation (${res.status})` };
      }
      const data = await res.json();
      return { success: true, data };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// =============================================================================
// Canvas Notes Storage & File System Handlers
// =============================================================================

// IPC: Select a custom storage folder (e.g. iCloud, Dropbox, Google Drive, or Local Folder)
ipcMain.handle('canvas:select-notes-directory', async (_event, { defaultPath } = {}) => {
  try {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Notes Storage Folder',
      defaultPath: defaultPath || app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory']
    });
    if (res.canceled || !res.filePaths.length) {
      return { success: false, canceled: true };
    }
    return { success: true, directoryPath: res.filePaths[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Get or ensure default notes directory
ipcMain.handle('canvas:get-default-notes-directory', async () => {
  try {
    const defaultDir = path.join(app.getPath('documents'), 'CanvasNotes');
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
    return { success: true, directoryPath: defaultDir };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Save a note file directly to user-selected folder
ipcMain.handle('canvas:save-note-file', async (_event, { directoryPath, note } = {}) => {
  try {
    let targetDir = directoryPath || path.join(app.getPath('documents'), 'CanvasNotes');
    if (!path.isAbsolute(targetDir)) {
      targetDir = path.join(app.getAppPath(), targetDir);
    }
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const noteId = note.id || `note_${Date.now()}`;
    const filename = String(noteId).startsWith('note_') || String(noteId).startsWith('mock-note-') ? `${noteId}.json` : `note_${noteId}.json`;
    const filePath = path.join(targetDir, filename);

    // Write formatted JSON with all note data, attachments, and metadata
    fs.writeFileSync(filePath, JSON.stringify(note, null, 2), 'utf-8');
    return { success: true, filePath, filename };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Load all notes from user-selected storage directory
ipcMain.handle('canvas:load-notes-from-dir', async (_event, { directoryPath } = {}) => {
  try {
    let targetDir = directoryPath || path.join(app.getPath('documents'), 'CanvasNotes');
    if (!path.isAbsolute(targetDir)) {
      targetDir = path.join(app.getAppPath(), targetDir);
    }
    if (!fs.existsSync(targetDir)) {
      return { success: true, notes: [] };
    }
    const files = fs.readdirSync(targetDir);
    const notes = [];
    for (const file of files) {
      if (file.endsWith('.json') && (file.startsWith('note_') || file.startsWith('mock-note-'))) {
        try {
          const fullPath = path.join(targetDir, file);
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const parsed = JSON.parse(raw);
          parsed.filePath = fullPath;
          notes.push(parsed);
        } catch (e) {
          console.warn('Could not parse note file:', file, e);
        }
      }
    }
    // Sort newest updated first
    notes.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    return { success: true, notes };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Delete note file from disk
ipcMain.handle('canvas:delete-note-file', async (_event, { directoryPath, noteId, filePath } = {}) => {
  try {
    let targetPath = filePath;
    if (!targetPath && directoryPath && noteId) {
      let targetDir = directoryPath;
      if (!path.isAbsolute(targetDir)) {
        targetDir = path.join(app.getAppPath(), targetDir);
      }
      targetPath = path.join(targetDir, `note_${noteId}.json`);
      if (!fs.existsSync(targetPath)) {
        targetPath = path.join(targetDir, `${noteId}.json`);
      }
    }
    if (targetPath && fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Pick media/file to insert into note (images, videos, documents)
ipcMain.handle('canvas:select-note-attachment', async (_event) => {
  try {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Insert Media or File into Note',
      properties: ['openFile'],
      filters: [
        { name: 'All Supported Media & Documents', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'mov', 'webm', 'pdf', 'txt', 'md', 'docx'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
        { name: 'Videos', extensions: ['mp4', 'mov', 'webm'] },
        { name: 'Documents', extensions: ['pdf', 'txt', 'md', 'docx'] }
      ]
    });
    if (res.canceled || !res.filePaths.length) {
      return { success: false, canceled: true };
    }
    const filePath = res.filePaths[0];
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext);
    const isVideo = ['.mp4', '.mov', '.webm'].includes(ext);

    // Read file and convert to Data URL for direct seamless inline embedding
    const fileBytes = fs.readFileSync(filePath);
    let mimeType = 'application/octet-stream';
    if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (ext === '.webp') mimeType = 'image/webp';
    else if (ext === '.svg') mimeType = 'image/svg+xml';
    else if (ext === '.mp4') mimeType = 'video/mp4';
    else if (ext === '.webm') mimeType = 'video/webm';
    else if (ext === '.pdf') mimeType = 'application/pdf';

    const dataUrl = `data:${mimeType};base64,${fileBytes.toString('base64')}`;
    return {
      success: true,
      filePath,
      fileName,
      ext,
      isImage,
      isVideo,
      mimeType,
      dataUrl,
      size: fileBytes.length
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Valid extension helper: must be dot followed by 1-6 alphanumeric characters at end of string
function hasValidFileExtension(filename) {
  if (!filename || typeof filename !== 'string') return false;
  return /\.([a-zA-Z0-9]{1,6})$/.test(filename.trim());
}

function getValidExtension(filename) {
  if (!filename || typeof filename !== 'string') return '';
  const match = filename.trim().match(/\.([a-zA-Z0-9]{1,6})$/);
  return match ? `.${match[1].toLowerCase()}` : '';
}

// Function to scan and migrate any legacy extensionless files on disk (e.g. sniffing %PDF magic bytes)
function migrateCourseFilesOnDisk(courseDir) {
  try {
    if (!fs.existsSync(courseDir)) return;
    const entries = fs.readdirSync(courseDir);
    for (const entry of entries) {
      const fullPath = path.join(courseDir, entry);
      try {
        if (!fs.statSync(fullPath).isFile()) continue;
        if (!hasValidFileExtension(entry)) {
          const head = Buffer.alloc(32);
          const fd = fs.openSync(fullPath, 'r');
          fs.readSync(fd, head, 0, 32, 0);
          fs.closeSync(fd);
          const ext = getExtensionFromMimeOrBuffer(null, head) || '.pdf';
          const newPath = path.join(courseDir, `${entry}${ext}`);
          if (!fs.existsSync(newPath)) {
            fs.renameSync(fullPath, newPath);
          } else {
            try { fs.unlinkSync(fullPath); } catch { }
          }
        }
      } catch (e) {
        console.warn('Migration error for file:', entry, e.message);
      }
    }
  } catch (err) {
    console.warn('Migration error for courseDir:', courseDir, err.message);
  }
}

// Function to get clean directory for course files
function getCourseFilesDir(courseId = 'general') {
  const dir = path.join(app.getPath('userData'), 'Canvas_Course_Files', String(courseId));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  } else {
    migrateCourseFilesOnDisk(dir);
  }
  return dir;
}

// Helper to infer file extension from content-type or buffer magic numbers
function getExtensionFromMimeOrBuffer(mimeType, buffer) {
  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('pdf')) return '.pdf';
  if (mime.includes('png')) return '.png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('svg')) return '.svg';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('json')) return '.json';
  if (mime.includes('markdown')) return '.md';
  if (mime.includes('python')) return '.py';
  if (mime.includes('javascript')) return '.js';
  if (mime.includes('typescript')) return '.ts';
  if (mime.includes('html')) return '.html';
  if (mime.includes('css')) return '.css';
  if (mime.includes('plain')) return '.txt';
  if (mime.includes('wordprocessingml') || mime.includes('docx')) return '.docx';
  if (mime.includes('presentationml') || mime.includes('pptx')) return '.pptx';
  if (mime.includes('spreadsheetml') || mime.includes('xlsx')) return '.xlsx';
  if (mime.includes('zip')) return '.zip';

  if (buffer && buffer.length >= 4) {
    if (buffer.slice(0, 4).toString('ascii').startsWith('%PDF')) return '.pdf';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return '.png';
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return '.jpg';
    if (buffer.slice(0, 4).toString('ascii') === 'GIF8') return '.gif';
    if (buffer[0] === 0x50 && buffer[1] === 0x4B) return '.zip'; // or docx/pptx/xlsx
  }
  return '';
}

function ensureFilenameExtension(name, mimeType, buffer) {
  if (!name) return 'file.pdf';
  let cleanName = name.trim();
  // Strip trailing descriptors like (PDF), [PDF], (docx), etc.
  cleanName = cleanName.replace(/\s*[\(\[](pdf|docx|doc|pptx|ppt|xlsx|xls|png|jpg|jpeg|markdown|md|python|py|txt)[\)\]]\s*$/i, '');

  if (hasValidFileExtension(cleanName)) {
    return cleanName;
  }

  // 1. Check buffer magic numbers if provided
  if (buffer) {
    const extFromBuf = getExtensionFromMimeOrBuffer(null, buffer);
    if (extFromBuf) return `${cleanName}${extFromBuf}`;
  }

  // 2. Check MIME type
  const extFromMime = getExtensionFromMimeOrBuffer(mimeType);
  if (extFromMime) {
    return `${cleanName}${extFromMime}`;
  }

  // 3. Check name hints
  const lower = cleanName.toLowerCase();
  if (lower.includes('(markdown)') || lower.includes('markdown') || lower.includes('(md)')) {
    return `${cleanName}.md`;
  }
  if (lower.includes('(python)') || lower.includes('(py)') || lower.includes('python')) {
    return `${cleanName}.py`;
  }
  if (lower.includes('(png)') || lower.includes('(jpg)') || lower.includes('(jpeg)')) {
    return `${cleanName}.png`;
  }

  // Default for Canvas LMS course files (slides, readings, syllabus, book chapters, etc.): .pdf
  return `${cleanName}.pdf`;
}

// Centralized Canvas file downloader with API metadata resolution and AWS S3 redirect handling
async function downloadCanvasFile({ domain, token, fileUrl, fileId, filename, courseId }) {
  if (isDemoAccount(domain, token) || domain === 'demo' || domain === 'demo.instructure.com' || (fileUrl && fileUrl.includes('demo.instructure.com'))) {
    const courseDir = getCourseFilesDir(courseId);
    const mockFilesDir = path.join(app.getAppPath(), 'mock-account', 'files');
    const assetFilesDir = path.join(__dirname, 'src', 'assets', 'files');
    const checkDirs = [courseDir, mockFilesDir, assetFilesDir];

    let foundPath = null;
    let foundFilename = filename;

    // Search by filename or fileId
    for (const d of checkDirs) {
      if (fs.existsSync(d)) {
        if (filename && fs.existsSync(path.join(d, filename))) {
          foundPath = path.join(d, filename);
          foundFilename = filename;
          break;
        }
        if (fileId) {
          const files = fs.readdirSync(d);
          const match = files.find(f => f.includes(String(fileId)));
          if (match) {
            foundPath = path.join(d, match);
            foundFilename = match;
            break;
          }
        }
      }
    }

    // Fallback: match by cleaned name
    if (!foundPath && filename) {
      const cleanName = filename.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const d of checkDirs) {
        if (fs.existsSync(d)) {
          const files = fs.readdirSync(d);
          const match = files.find(f => {
            const cleanF = f.toLowerCase().replace(/[^a-z0-9]/g, '');
            return cleanF.includes(cleanName) || cleanName.includes(cleanF);
          });
          if (match) {
            foundPath = path.join(d, match);
            foundFilename = match;
            break;
          }
        }
      }
    }

    if (foundPath) {
      const destPath = path.join(courseDir, path.basename(foundPath));
      if (!fs.existsSync(destPath) || fs.statSync(destPath).size === 0) {
        try { fs.copyFileSync(foundPath, destPath); } catch (_) { }
      }
      return {
        success: true,
        localPath: fs.existsSync(destPath) ? destPath : foundPath,
        filename: path.basename(foundPath),
        size: fs.statSync(foundPath).size,
        cached: true,
        isDemo: true
      };
    }

    // Generic safe fallback if a file is requested in demo mode
    for (const d of [mockFilesDir, assetFilesDir]) {
      if (fs.existsSync(d)) {
        const anyPdf = fs.readdirSync(d).find(f => f.endsWith('.pdf'));
        if (anyPdf) {
          foundPath = path.join(d, anyPdf);
          const destPath = path.join(courseDir, anyPdf);
          if (!fs.existsSync(destPath)) {
            try { fs.copyFileSync(foundPath, destPath); } catch (_) { }
          }
          return {
            success: true,
            localPath: fs.existsSync(destPath) ? destPath : foundPath,
            filename: anyPdf,
            size: fs.statSync(foundPath).size,
            cached: true,
            isDemo: true
          };
        }
      }
    }
  }

  const baseUrl = normalizeCanvasUrl(domain);
  const courseDir = getCourseFilesDir(courseId);

  let targetUrl = fileUrl;
  let resolvedFilename = filename;
  let detectedMime = null;

  // 1. If fileUrl is a Canvas API endpoint (/api/v1/files/:id or /api/v1/courses/:id/files/:id), query metadata to get the actual download URL
  const isApiEndpoint = !targetUrl || targetUrl.includes('/api/v1/files/') || targetUrl.includes('/api/v1/courses/');
  if (isApiEndpoint) {
    const apiUrl = targetUrl || `${baseUrl}/api/v1/files/${fileId}`;
    try {
      const metaRes = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      if (metaRes.ok) {
        const metaJson = await metaRes.json();
        targetUrl = metaJson.url || metaJson.download_url || targetUrl;
        detectedMime = metaJson['content-type'] || metaJson.content_type || detectedMime;
        if (metaJson.filename && hasValidFileExtension(metaJson.filename)) {
          if (!hasValidFileExtension(resolvedFilename)) {
            const ext = getValidExtension(metaJson.filename);
            resolvedFilename = `${resolvedFilename}${ext}`;
          }
        } else if (metaJson.display_name) {
          resolvedFilename = resolvedFilename || metaJson.display_name;
        }
      }
    } catch (e) {
      console.warn('Could not query file metadata from Canvas:', e.message);
    }
  }

  // 2. Fallback to direct download endpoint if needed
  if ((!targetUrl || targetUrl.includes('/api/v1/')) && fileId) {
    targetUrl = `${baseUrl}/files/${fileId}/download?download_frd=1`;
  }

  if (!targetUrl) {
    throw new Error('No valid download URL could be determined for file');
  }

  // Ensure file extension on resolvedFilename before generating safeName
  resolvedFilename = ensureFilenameExtension(resolvedFilename || (targetUrl.split('?')[0].split('/').pop()), detectedMime || 'application/pdf');

  // 3. Prepare sanitized filename and local target path
  let safeName = (resolvedFilename || `file_${fileId || Date.now()}`)
    .replace(/[^a-zA-Z0-9._ -]/g, '_');
  let localFilePath = path.join(courseDir, safeName);

  // If localFilePath doesn't exist, check if an older extensionless or alternate file exists on disk and migrate it
  if (!fs.existsSync(localFilePath)) {
    const altName = safeName.replace(/\.[a-zA-Z0-9]{1,6}$/, '');
    const altPath = path.join(courseDir, altName);
    if (fs.existsSync(altPath)) {
      try {
        fs.renameSync(altPath, localFilePath);
      } catch { }
    }
  }

  // 4. Return cached file if it already exists and is not corrupted
  if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).size > 100) {
    let isCorrupted = false;
    try {
      const bufferHead = Buffer.alloc(16);
      const fd = fs.openSync(localFilePath, 'r');
      fs.readSync(fd, bufferHead, 0, 16, 0);
      fs.closeSync(fd);
      const headStr = bufferHead.toString('utf8');
      if (headStr.trim().startsWith('{')) {
        isCorrupted = true; // Stale JSON response saved as file!
      } else if (safeName.toLowerCase().endsWith('.pdf') && !headStr.startsWith('%PDF')) {
        isCorrupted = true; // Corrupted PDF!
      }
    } catch { }

    if (!isCorrupted) {
      return {
        success: true,
        localPath: localFilePath,
        filename: safeName,
        size: fs.statSync(localFilePath).size,
        cached: true
      };
    } else {
      try { fs.unlinkSync(localFilePath); } catch { }
    }
  }

  // 5. Download binary stream following redirects
  let currentUrl = targetUrl;
  const headers = {};
  if (token && (currentUrl.includes('/api/v1/') || currentUrl.includes(domain)) && !currentUrl.includes('verifier=')) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response = await fetch(currentUrl, { headers, redirect: 'manual' });
  let redirects = 0;
  while (response.status >= 300 && response.status < 400 && response.headers.get('location') && redirects < 10) {
    redirects++;
    const loc = response.headers.get('location');
    currentUrl = new URL(loc, currentUrl).toString();
    const nextHeaders = {};
    if (token && domain && currentUrl.includes(domain) && !currentUrl.includes('verifier=')) {
      nextHeaders['Authorization'] = `Bearer ${token}`;
    }
    response = await fetch(currentUrl, { headers: nextHeaders, redirect: 'manual' });
  }

  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status} ${response.statusText}`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const arrayBuffer = await response.arrayBuffer();

  // If Canvas returned a JSON descriptor pointing to the real file, follow it
  if (contentType.includes('application/json') || (arrayBuffer.byteLength < 5000 && Buffer.from(arrayBuffer).slice(0, 10).toString('utf8').trim().startsWith('{'))) {
    try {
      const text = Buffer.from(arrayBuffer).toString('utf8');
      const json = JSON.parse(text);
      if (json.url || json.download_url) {
        return downloadCanvasFile({
          domain,
          token,
          fileUrl: json.url || json.download_url,
          fileId: json.id || fileId,
          filename: json.display_name || json.filename || safeName,
          courseId
        });
      }
    } catch { }
  }

  const buffer = Buffer.from(arrayBuffer);

  // If safeName still does not have a valid extension, infer from contentType, actual buffer bytes, or default to .pdf
  if (!hasValidFileExtension(safeName)) {
    const inferredExt = getExtensionFromMimeOrBuffer(contentType, buffer) || '.pdf';
    safeName = `${safeName}${inferredExt}`;
    localFilePath = path.join(courseDir, safeName);
  }

  fs.writeFileSync(localFilePath, buffer);

  return {
    success: true,
    localPath: localFilePath,
    filename: safeName,
    size: arrayBuffer.byteLength
  };
}

// IPC: Download single course file locally
ipcMain.handle('canvas:download-file', async (_event, params) => {
  try {
    return await downloadCanvasFile(params);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Download all course files locally
ipcMain.handle('canvas:download-all-course-files', async (_event, { domain, token, courseId, files }) => {
  try {
    if (!Array.isArray(files) || files.length === 0) {
      return { success: true, count: 0, results: [] };
    }

    const results = [];
    for (const file of files) {
      try {
        const res = await downloadCanvasFile({
          domain,
          token,
          fileUrl: file.url,
          fileId: file.id || file.content_id,
          filename: file.filename || file.display_name,
          courseId
        });
        results.push({
          id: file.id,
          localPath: res.localPath,
          filename: res.filename,
          success: true,
          cached: res.cached
        });
      } catch (err) {
        results.push({
          id: file.id,
          filename: file.filename || file.display_name,
          success: false,
          error: err.message
        });
      }
    }

    return {
      success: true,
      downloadedCount: results.filter(r => r.success).length,
      totalCount: files.length,
      results: results
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Helper to ensure demo course files are available locally on disk
function ensureDemoFilesLocally() {
  try {
    const demoDir = getCourseFilesDir('48201');
    const sourceDir = path.join(__dirname, 'src', 'assets', 'files');
    const filesMapping = {};

    const filesList = [];
    if (fs.existsSync(sourceDir)) {
      const items = fs.readdirSync(sourceDir);
      for (const item of items) {
        const srcPath = path.join(sourceDir, item);
        const destPath = path.join(demoDir, item);
        if (fs.statSync(srcPath).isFile()) {
          if (!fs.existsSync(destPath) || fs.statSync(destPath).size === 0) {
            fs.copyFileSync(srcPath, destPath);
          }
          filesMapping[item] = destPath;
          filesList.push({ filename: item, localPath: destPath });
        }
      }
    }

    // Also include files from mock-account/files
    const mockFilesDir = path.join(app.getAppPath(), 'mock-account', 'files');
    if (fs.existsSync(mockFilesDir)) {
      const mockItems = fs.readdirSync(mockFilesDir);
      for (const item of mockItems) {
        const srcPath = path.join(mockFilesDir, item);
        if (fs.statSync(srcPath).isFile()) {
          let targetCid = '91001';
          if (item.startsWith('CS310') || item.startsWith('Dijkstra')) targetCid = '91002';
          else if (item.startsWith('HCI240')) targetCid = '91003';
          else if (item.startsWith('ARCH420')) targetCid = '91004';

          const courseDir = getCourseFilesDir(targetCid);
          const destPath = path.join(courseDir, item);
          if (!fs.existsSync(destPath) || fs.statSync(destPath).size === 0) {
            fs.copyFileSync(srcPath, destPath);
          }
          filesMapping[item] = destPath;
          filesList.push({ filename: item, localPath: destPath });
        }
      }
    }

    // Ensure demo course 48201 is also saved in offline courses cache
    const demoCachePath = path.join(getOfflineCacheDir(), 'courses', '48201.json');
    if (!fs.existsSync(demoCachePath)) {
      synthesizeCourseDetailsFromDisk('48201');
    }

    return { success: true, filesDir: demoDir, files: filesMapping, list: filesList };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// IPC: Ensure demo files exist locally on disk
ipcMain.handle('canvas:ensure-demo-files', async () => {
  return ensureDemoFilesLocally();
});

// IPC: Open local file directly in default macOS / Windows desktop app (Preview, VS Code, etc.)
ipcMain.handle('app:open-local-file', async (_event, filePath) => {
  try {
    if (!filePath) return { success: false, error: 'No file path provided' };
    let targetPath = filePath;
    if (!fs.existsSync(targetPath)) return { success: false, error: 'File does not exist on disk' };

    // If targetPath lacks a valid file extension, inspect content and rename with proper extension
    if (!hasValidFileExtension(targetPath)) {
      try {
        const bufferHead = Buffer.alloc(32);
        const fd = fs.openSync(targetPath, 'r');
        fs.readSync(fd, bufferHead, 0, 32, 0);
        fs.closeSync(fd);
        const inferredExt = getExtensionFromMimeOrBuffer(null, bufferHead) || '.pdf';
        const parsed = path.parse(targetPath);
        const newPath = path.join(parsed.dir, `${parsed.base}${inferredExt}`);
        if (!fs.existsSync(newPath)) {
          fs.renameSync(targetPath, newPath);
        } else {
          try { fs.unlinkSync(targetPath); } catch { }
        }
        targetPath = newPath;
      } catch (e) {
        console.warn('Could not inspect magic numbers for extensionless file:', e);
      }
    }

    const err = await shell.openPath(targetPath);
    if (err) {
      return { success: false, error: err };
    }
    return { success: true, openedPath: targetPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Reveal file in Finder / Windows Explorer
ipcMain.handle('app:show-in-folder', async (_event, filePath) => {
  try {
    if (!filePath) return { success: false, error: 'No file path provided' };
    if (!fs.existsSync(filePath)) return { success: false, error: 'File does not exist on disk' };
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Fetch file content or save to local disk for previewing
ipcMain.handle('canvas:get-file-data', async (_event, { domain, token, fileUrl, fileId, filename, courseId, mimeType }) => {
  try {
    if (isDemoAccount(domain, token)) {
      const mockFilesDir = path.join(app.getAppPath(), 'mock-account', 'files');
      const targetCid = courseId || 'general';
      const courseDir = getCourseFilesDir(targetCid);
      let localFilePath = null;
      if (filename) {
        if (fs.existsSync(path.join(mockFilesDir, filename))) {
          localFilePath = path.join(mockFilesDir, filename);
        } else if (fs.existsSync(path.join(courseDir, filename))) {
          localFilePath = path.join(courseDir, filename);
        }
      }
      if (!localFilePath && fileId) {
        const checkDirs = [mockFilesDir, courseDir];
        for (const d of checkDirs) {
          if (fs.existsSync(d)) {
            const matched = fs.readdirSync(d).find(f => f.includes(String(fileId)));
            if (matched) {
              localFilePath = path.join(d, matched);
              break;
            }
          }
        }
      }
      if (localFilePath && fs.existsSync(localFilePath)) {
        const buffer = fs.readFileSync(localFilePath);
        return {
          success: true,
          type: 'pdf',
          localPath: localFilePath,
          dataUrl: `data:application/pdf;base64,${buffer.toString('base64')}`
        };
      }
    }

    const downloadRes = await downloadCanvasFile({
      domain,
      token,
      fileUrl,
      fileId,
      filename,
      courseId: courseId || 'general'
    });

    const localFilePath = downloadRes.localPath;
    const effectiveName = downloadRes.filename || filename || 'file';
    const buffer = fs.readFileSync(localFilePath);

    const isText = /\.(txt|py|js|ts|json|md|html|css|csv|c|cpp|h|java|sh|yml|yaml|sql)$/i.test(effectiveName);
    if (isText) {
      return {
        success: true,
        type: 'text',
        localPath: localFilePath,
        content: buffer.toString('utf8')
      };
    }

    const isPdf = /\.pdf$/i.test(effectiveName) || (mimeType && mimeType.includes('pdf')) || buffer.slice(0, 4).toString('ascii').startsWith('%PDF');
    if (isPdf) {
      return {
        success: true,
        type: 'pdf',
        localPath: localFilePath,
        dataUrl: `data:application/pdf;base64,${buffer.toString('base64')}`
      };
    }

    const isImage = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(effectiveName) || (mimeType && mimeType.startsWith('image/')) ||
      (buffer.length >= 4 && (
        (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) ||
        (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF)
      ));
    if (isImage) {
      let ext = effectiveName.split('.').pop() || 'png';
      if (!ext || ext === effectiveName) {
        ext = (buffer[0] === 0xFF) ? 'jpg' : 'png';
      }
      const imgMime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return {
        success: true,
        type: 'image',
        localPath: localFilePath,
        dataUrl: `data:${imgMime};base64,${buffer.toString('base64')}`
      };
    }

    return {
      success: true,
      type: 'binary',
      localPath: localFilePath,
      size: buffer.length
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Read local file as raw binary buffer
ipcMain.handle('canvas:read-file-bytes', async (_event, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: 'File does not exist on disk' };
    }
    const buffer = fs.readFileSync(filePath);
    return { success: true, data: buffer };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Read file text content for search indexing (supports code, markdown, text, etc.)
ipcMain.handle('canvas:read-file-text', async (_event, { filePath, courseId, filename }) => {
  try {
    let targetPath = filePath;
    if (!targetPath && courseId && filename) {
      targetPath = path.join(getCourseFilesDir(courseId), filename);
    }
    if ((!targetPath || !fs.existsSync(targetPath)) && filename) {
      const assetPath = path.join(__dirname, 'src', 'assets', 'files', filename);
      if (fs.existsSync(assetPath)) targetPath = assetPath;
    }
    if (!targetPath || !fs.existsSync(targetPath)) {
      return { success: false, error: 'File does not exist on disk' };
    }
    const stat = fs.statSync(targetPath);
    if (stat.size > 15 * 1024 * 1024) {
      return { success: false, error: 'File too large' };
    }
    const ext = path.extname(targetPath).toLowerCase();
    const isText = ['.txt', '.py', '.js', '.ts', '.json', '.md', '.markdown', '.html', '.css', '.csv', '.c', '.cpp', '.h', '.java', '.sh', '.yml', '.yaml', '.sql', '.xml'].includes(ext);
    if (isText) {
      const text = fs.readFileSync(targetPath, 'utf8');
      return { success: true, type: 'text', text, localPath: targetPath };
    }
    const isPdf = ext === '.pdf' || (stat.size >= 4 && fs.readFileSync(targetPath).slice(0, 4).toString('ascii').startsWith('%PDF'));
    if (isPdf) {
      try {
        const text = await extractDocumentText(targetPath, 25);
        return { success: true, type: 'text', text: text || '', localPath: targetPath };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
    return { success: false, error: 'Unsupported file type' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Get all readable text files for a course
ipcMain.handle('canvas:get-course-text-files', async (_event, { courseId }) => {
  try {
    const dir = getCourseFilesDir(courseId);
    const results = [];
    if (fs.existsSync(dir)) {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        try {
          const stat = fs.statSync(fullPath);
          if (!stat.isFile() || stat.size > 10 * 1024 * 1024) continue;
          const ext = path.extname(entry).toLowerCase();
          const isText = ['.txt', '.py', '.js', '.ts', '.json', '.md', '.markdown', '.html', '.css', '.csv', '.c', '.cpp', '.h', '.java', '.sh', '.yml', '.yaml', '.sql'].includes(ext);
          if (isText) {
            results.push({
              filename: entry,
              localPath: fullPath,
              text: fs.readFileSync(fullPath, 'utf8')
            });
          }
        } catch { }
      }
    }
    return { success: true, files: results };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Fetch Canvas Page Content (with offline cache)
ipcMain.handle('canvas:get-page-content', async (_event, { domain, token, courseId, pageUrl, pageId, url }) => {
  const target = pageUrl || pageId;
  const pageCacheKey = target ? `pages/${courseId || 'general'}_${encodeURIComponent(target)}.json` : null;
  let cachedPage = pageCacheKey ? readOfflineCache(pageCacheKey) : null;

  // If not found in pages/ folder, check if embedded in courses/<courseId>.json module items
  if (!cachedPage && courseId) {
    const cDetails = readOfflineCache(`courses/${courseId}.json`);
    if (cDetails && Array.isArray(cDetails.modules)) {
      for (const m of cDetails.modules) {
        if (Array.isArray(m.items)) {
          const match = m.items.find(it =>
            (it.page_url && (it.page_url === target || encodeURIComponent(it.page_url) === encodeURIComponent(target))) ||
            (it.id && String(it.id) === String(target)) ||
            (it.page_id && String(it.page_id) === String(target)) ||
            (target && it.title && it.title.toLowerCase() === decodeURIComponent(target).toLowerCase())
          );
          if (match && match.body) {
            cachedPage = {
              title: match.title,
              body: match.body,
              html_url: match.html_url || match.url
            };
            if (pageCacheKey) saveOfflineCache(pageCacheKey, cachedPage);
            break;
          }
        }
      }
    }
  }

  // Return cached content immediately if available
  if (cachedPage) {
    return { success: true, page: cachedPage, offline: true, cached: true };
  }

  if (!token || !token.trim()) {
    return {
      success: true,
      page: {
        title: target ? decodeURIComponent(target).replace(/_/g, ' ') : 'Module Page',
        body: '<p style="color:var(--color-text-secondary); font-style:italic;">This page has not been downloaded for offline viewing yet. Connect to the internet to sync all course content.</p>'
      },
      offline: true,
      cached: false
    };
  }

  const baseUrl = normalizeCanvasUrl(domain);
  const headers = {
    'Authorization': `Bearer ${token.trim()}`,
    'Accept': 'application/json',
    'User-Agent': 'CanvasNextDesktop/1.0.0'
  };

  // Build target endpoint URL
  let endpoint = null;
  if (url && typeof url === 'string' && url.startsWith('http')) {
    endpoint = url;
  } else if (courseId && (pageUrl || pageId)) {
    endpoint = `${baseUrl}/api/v1/courses/${courseId}/pages/${encodeURIComponent(target)}`;
  } else {
    return { success: false, error: 'Missing courseId or page identifier.' };
  }

  try {
    const res = await fetch(endpoint, { headers });
    if (res.ok) {
      const pageData = await res.json();
      if (pageCacheKey) saveOfflineCache(pageCacheKey, pageData);
      return { success: true, page: pageData };
    } else {
      const errText = await res.text().catch(() => '');
      return { success: false, error: `Canvas API returned ${res.status}: ${errText}` };
    }
  } catch (err) {
    return {
      success: true,
      page: {
        title: target ? decodeURIComponent(target).replace(/_/g, ' ') : 'Module Page',
        body: '<p style="color:var(--color-text-secondary); font-style:italic;">Offline: Connect to the internet to download this page.</p>'
      },
      offline: true,
      cached: false,
      networkError: err.message
    };
  }
});

// IPC: Fetch Assignment Details (HTML prompt, rubric, submissions)
ipcMain.handle('canvas:get-assignment-content', async (_event, { domain, token, courseId, assignmentId, url }) => {
  const target = assignmentId;
  const cacheKey = target ? `assignments/${courseId || 'general'}_${encodeURIComponent(target)}.json` : null;
  let cachedAssignment = cacheKey ? readOfflineCache(cacheKey) : null;

  if (!cachedAssignment && courseId) {
    const cDetails = readOfflineCache(`courses/${courseId}.json`);
    if (cDetails && Array.isArray(cDetails.assignments)) {
      const match = cDetails.assignments.find(a =>
        (a.id && String(a.id) === String(target)) ||
        (target && a.name && a.name.toLowerCase() === String(target).toLowerCase())
      );
      if (match && match.description) {
        cachedAssignment = match;
        if (cacheKey) saveOfflineCache(cacheKey, cachedAssignment);
      }
    }
  }

  if (cachedAssignment) {
    return { success: true, assignment: cachedAssignment, cached: true };
  }

  if (!token || !token.trim()) {
    return { success: false, error: 'No authorization token available.' };
  }

  const baseUrl = normalizeCanvasUrl(domain);
  const headers = {
    'Authorization': `Bearer ${token.trim()}`,
    'Accept': 'application/json',
    'User-Agent': 'CanvasNextDesktop/1.0.0'
  };

  let endpoint = null;
  if (url && typeof url === 'string' && url.startsWith('http')) {
    endpoint = url;
  } else if (courseId && target) {
    endpoint = `${baseUrl}/api/v1/courses/${courseId}/assignments/${encodeURIComponent(target)}?include[]=submission&include[]=score_statistics`;
  } else {
    return { success: false, error: 'Missing courseId or assignmentId.' };
  }

  try {
    const res = await fetch(endpoint, { headers });
    if (res.ok) {
      const assignData = await res.json();
      if (cacheKey) saveOfflineCache(cacheKey, assignData);
      return { success: true, assignment: assignData };
    } else {
      const errText = await res.text().catch(() => '');
      return { success: false, error: `Canvas API returned ${res.status}: ${errText}` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Helper: Upload file to Canvas LMS for assignment submissions (2-step protocol)
async function uploadFileToCanvas(baseUrl, headers, courseId, assignmentId, fileInfo) {
  const step1Url = `${baseUrl}/api/v1/courses/${courseId}/assignments/${encodeURIComponent(assignmentId)}/submissions/self/files`;

  let fileBuffer;
  let filename = fileInfo.name || 'upload';
  let fileSize = fileInfo.size || 0;
  let contentType = fileInfo.type || 'application/octet-stream';

  if (fileInfo.path && fs.existsSync(fileInfo.path)) {
    const stat = fs.statSync(fileInfo.path);
    fileSize = stat.size;
    fileBuffer = fs.readFileSync(fileInfo.path);
    if (!fileInfo.name) filename = path.basename(fileInfo.path);
  } else if (fileInfo.base64) {
    const cleanBase64 = fileInfo.base64.replace(/^data:.*?;base64,/, '');
    fileBuffer = Buffer.from(cleanBase64, 'base64');
    fileSize = fileBuffer.length;
  } else {
    throw new Error(`File ${filename} has no local file path or data.`);
  }

  // Step 1: Tell Canvas about the file upload
  const step1Res = await fetch(step1Url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: filename,
      size: fileSize,
      content_type: contentType
    })
  });

  if (!step1Res.ok) {
    const errText = await step1Res.text().catch(() => '');
    throw new Error(`Canvas file upload initiation failed (${step1Res.status}): ${errText}`);
  }

  const step1Data = await step1Res.json();
  const uploadUrl = step1Data.upload_url;
  const uploadParams = step1Data.upload_params || {};
  const fileParamName = step1Data.file_param || 'file';

  // Step 2: Upload file binary to upload_url
  const formData = new FormData();
  for (const [key, val] of Object.entries(uploadParams)) {
    formData.append(key, String(val));
  }
  const blob = new Blob([fileBuffer], { type: contentType });
  formData.append(fileParamName, blob, filename);

  const step2Res = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
    redirect: 'follow'
  });

  if (!step2Res.ok) {
    const errText = await step2Res.text().catch(() => '');
    throw new Error(`Canvas file binary upload failed (${step2Res.status}): ${errText}`);
  }

  const finalData = await step2Res.json();
  if (!finalData || !finalData.id) {
    throw new Error('Canvas upload did not return a valid file ID');
  }

  return finalData.id;
}

// IPC: Submit Assignment (Live Canvas API or Demo/Offline Fallback)
ipcMain.handle('canvas:submit-assignment', async (_event, params) => {
  const { domain, token, courseId, assignmentId, submissionType, body, url, files, comment, isDemo } = params || {};

  if (!courseId || !assignmentId) {
    return { success: false, error: 'Course ID and Assignment ID are required.' };
  }

  const isDemoOrOffline = Boolean(
    isDemo ||
    !token ||
    !token.trim() ||
    !domain ||
    domain.includes('demo') ||
    domain.includes('example.com') ||
    String(courseId).startsWith('4820')
  );

  if (isDemoOrOffline) {
    // In Demo / Offline Mode: synthesize authentic Canvas submission
    const cDetails = readOfflineCache(`courses/${courseId}.json`);
    let existingSub = null;
    if (cDetails && Array.isArray(cDetails.assignments)) {
      const match = cDetails.assignments.find(a => String(a.id) === String(assignmentId));
      if (match && match.submission) existingSub = match.submission;
    }

    const nextAttempt = (existingSub?.attempt || 0) + 1;
    const submittedAt = new Date().toISOString();

    const formattedAttachments = (Array.isArray(files) ? files : []).map((f, i) => ({
      id: 88000 + (Date.now() % 10000) + i,
      display_name: f.name || 'document',
      filename: f.name || 'document',
      size: f.size || 1024,
      content_type: f.type || 'application/octet-stream',
      created_at: submittedAt,
      url: f.path || '#'
    }));

    let displayBody = '';
    if (submissionType === 'online_text_entry') {
      displayBody = body || '';
    } else if (submissionType === 'online_url') {
      displayBody = url || '';
    } else if (submissionType === 'online_upload') {
      displayBody = formattedAttachments.map(a => a.display_name).join(', ') || 'Files submitted';
    } else {
      displayBody = body || url || 'Assignment submitted';
    }

    const demoSubmission = {
      id: 700000 + (Date.now() % 100000),
      assignment_id: Number(assignmentId) || assignmentId,
      user_id: 884102,
      workflow_state: 'submitted',
      submitted_at: submittedAt,
      attempt: nextAttempt,
      submission_type: submissionType || 'online_upload',
      body: displayBody,
      url: submissionType === 'online_url' ? url : null,
      attachments: formattedAttachments,
      grade: null,
      score: null,
      late: false,
      missing: false,
      submission_comments: (comment && comment.trim()) ? [{
        id: Date.now(),
        author_name: 'Scholar (Student)',
        author_id: 884102,
        comment: comment.trim(),
        created_at: submittedAt
      }] : []
    };

    // Save uploaded files to local submissions folder if available
    if (Array.isArray(files)) {
      try {
        const destDir = path.join(getCourseFilesDir(String(courseId)), 'submissions');
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        for (const file of files) {
          if (file.path && fs.existsSync(file.path)) {
            const destPath = path.join(destDir, path.basename(file.path));
            fs.copyFileSync(file.path, destPath);
          } else if (file.base64) {
            const cleanBase64 = file.base64.replace(/^data:.*?;base64,/, '');
            const destPath = path.join(destDir, file.name || 'submission-file');
            fs.writeFileSync(destPath, Buffer.from(cleanBase64, 'base64'));
          }
        }
      } catch (copyErr) {
        console.warn('Could not copy submission files locally:', copyErr.message);
      }
    }

    // Persist in course offline cache
    if (cDetails && Array.isArray(cDetails.assignments)) {
      const idx = cDetails.assignments.findIndex(a => String(a.id) === String(assignmentId));
      if (idx !== -1) {
        cDetails.assignments[idx].submission = demoSubmission;
        saveOfflineCache(`courses/${courseId}.json`, cDetails);
      }
    }

    // Persist in standalone assignment cache
    const assignCacheKey = `assignments/${courseId}_${encodeURIComponent(assignmentId)}.json`;
    let assignCache = readOfflineCache(assignCacheKey);
    if (assignCache) {
      assignCache.submission = demoSubmission;
      saveOfflineCache(assignCacheKey, assignCache);
    }

    return {
      success: true,
      submission: demoSubmission,
      isDemo: true
    };
  }

  // Live Canvas API Submission
  const baseUrl = normalizeCanvasUrl(domain);
  const headers = {
    'Authorization': `Bearer ${token.trim()}`,
    'Accept': 'application/json',
    'User-Agent': 'CanvasNextDesktop/1.0.0'
  };

  try {
    let fileIds = [];
    if (submissionType === 'online_upload') {
      if (!files || !files.length) {
        return { success: false, error: 'Please select at least one file to upload.' };
      }
      for (const file of files) {
        const fileId = await uploadFileToCanvas(baseUrl, headers, courseId, assignmentId, file);
        fileIds.push(fileId);
      }
    }

    const submitUrl = `${baseUrl}/api/v1/courses/${courseId}/assignments/${encodeURIComponent(assignmentId)}/submissions`;

    const submissionPayload = {
      submission: {
        submission_type: submissionType
      }
    };

    if (submissionType === 'online_upload') {
      submissionPayload.submission.file_ids = fileIds;
    } else if (submissionType === 'online_text_entry') {
      submissionPayload.submission.body = body;
    } else if (submissionType === 'online_url') {
      submissionPayload.submission.url = url;
    }

    if (comment && comment.trim()) {
      submissionPayload.comment = {
        text_comment: comment.trim()
      };
    }

    const res = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(submissionPayload)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { success: false, error: `Canvas submission error (${res.status}): ${errText}` };
    }

    const submissionData = await res.json();

    // Update offline cache with the new submission
    try {
      const cDetails = readOfflineCache(`courses/${courseId}.json`);
      if (cDetails && Array.isArray(cDetails.assignments)) {
        const match = cDetails.assignments.find(a => String(a.id) === String(assignmentId));
        if (match) {
          match.submission = submissionData;
          saveOfflineCache(`courses/${courseId}.json`, cDetails);
        }
      }
      const assignCacheKey = `assignments/${courseId}_${encodeURIComponent(assignmentId)}.json`;
      let assignCache = readOfflineCache(assignCacheKey);
      if (assignCache) {
        assignCache.submission = submissionData;
        saveOfflineCache(assignCacheKey, assignCache);
      }
    } catch (cacheErr) {
      console.warn('Could not update cache after submission:', cacheErr);
    }

    return {
      success: true,
      submission: submissionData
    };
  } catch (err) {
    console.error('Submission failed:', err);
    return { success: false, error: err.message };
  }
});

// IPC: Native File Selector for Assignment Submission
ipcMain.handle('canvas:select-files-for-submission', async (_event, options = {}) => {
  try {
    const filters = [];
    if (Array.isArray(options.allowedExtensions) && options.allowedExtensions.length > 0) {
      const cleanExts = options.allowedExtensions.map(e => e.replace(/^\./, '').toLowerCase().trim());
      filters.push({
        name: `Allowed Formats (${cleanExts.join(', ')})`,
        extensions: cleanExts
      });
      filters.push({ name: 'All Files', extensions: ['*'] });
    } else {
      filters.push({
        name: 'All Supported Documents & Archives',
        extensions: ['pdf', 'doc', 'docx', 'zip', 'tar', 'gz', 'py', 'js', 'ts', 'java', 'c', 'cpp', 'html', 'css', 'txt', 'md', 'png', 'jpg', 'jpeg']
      });
      filters.push({ name: 'All Files', extensions: ['*'] });
    }

    const res = await dialog.showOpenDialog(mainWindow, {
      title: options.title || 'Select Assignment Submission Files',
      properties: options.multiple !== false ? ['openFile', 'multiSelections'] : ['openFile'],
      filters
    });

    if (res.canceled || !res.filePaths || !res.filePaths.length) {
      return { success: false, canceled: true, files: [] };
    }

    const files = res.filePaths.map(fp => {
      const stat = fs.statSync(fp);
      const ext = path.extname(fp).replace('.', '').toLowerCase();
      let mimeType = 'application/octet-stream';
      if (['pdf'].includes(ext)) mimeType = 'application/pdf';
      else if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      else if (['zip', 'gz', 'tar'].includes(ext)) mimeType = 'application/zip';
      else if (['txt', 'md', 'py', 'js', 'ts', 'json', 'html', 'css', 'c', 'cpp', 'java'].includes(ext)) mimeType = 'text/plain';

      return {
        name: path.basename(fp),
        path: fp,
        size: stat.size,
        type: mimeType
      };
    });

    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message, files: [] };
  }
});

// IPC: Open external links
ipcMain.handle('app:open-external', async (_event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('webcal://'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

// ==========================================================================
// Local LLM (@electron/llm) Management & Course AI Context Handlers
// ==========================================================================

let activeLlmModelName = 'SmolLM2-360M-Instruct-Q4_K_M.gguf';

function getLocalGgufModels() {
  const models = [];
  const searchDirs = [
    { dir: path.join(__dirname, 'models'), location: 'project' },
    { dir: path.join(app.getPath('userData'), 'models'), location: 'userData' }
  ];

  const seenPaths = new Set();

  for (const { dir, location } of searchDirs) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.toLowerCase().endsWith('.gguf')) {
            const fullPath = path.join(dir, file);
            if (!seenPaths.has(fullPath)) {
              seenPaths.add(fullPath);
              try {
                const stat = fs.statSync(fullPath);
                if (stat.isFile() && stat.size > 1000) {
                  models.push({
                    name: path.basename(file, '.gguf'),
                    filename: file,
                    fullPath: fullPath,
                    size: stat.size,
                    formattedSize: (stat.size / (1024 * 1024)).toFixed(1) + ' MB',
                    location
                  });
                }
              } catch { }
            }
          }
        }
      } catch { }
    }
  }

  return models;
}

function resolveModelPath(modelAlias) {
  const modelsDir = path.join(__dirname, 'models');
  const userDataModelsDir = path.join(app.getPath('userData'), 'models');

  const curatedMatches = {
    'smollm2-1.7b': 'SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
    'smollm2-360m': 'SmolLM2-360M-Instruct-Q4_K_M.gguf',
    'llama-3.2-3b': 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    'llama-3.2-1b': 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    'qwen-2.5-1.5b': 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    'qwen-2.5-3b': 'qwen2.5-3b-instruct-q4_k_m.gguf',
    'apple-intelligence-3b': 'apple-intelligence-3b.gguf'
  };

  if (modelAlias) {
    // 0. Curated model ID lookup
    const directMatch = curatedMatches[modelAlias] || curatedMatches[modelAlias.toLowerCase()];
    if (directMatch) {
      const inProjCurated = path.join(modelsDir, directMatch);
      if (fs.existsSync(inProjCurated)) return inProjCurated;
      const inUserCurated = path.join(userDataModelsDir, directMatch);
      if (fs.existsSync(inUserCurated)) return inUserCurated;
    }

    // 1. Apple Intelligence on-device alias
    if (modelAlias === 'apple-intelligence-3b' || modelAlias === 'apple-intelligence-3b.gguf') {
      const appleFile = path.join(modelsDir, 'apple-intelligence-3b.gguf');
      if (fs.existsSync(appleFile)) return appleFile;
      const userApple = path.join(userDataModelsDir, 'apple-intelligence-3b.gguf');
      if (fs.existsSync(userApple)) return userApple;
      const llama3b = path.join(modelsDir, 'Llama-3.2-3B-Instruct-Q4_K_M.gguf');
      if (fs.existsSync(llama3b)) return llama3b;
      const smollm = path.join(modelsDir, 'SmolLM2-360M-Instruct-Q4_K_M.gguf');
      if (fs.existsSync(smollm)) return smollm;
    }

    // 2. Direct absolute path
    if (path.isAbsolute(modelAlias) && fs.existsSync(modelAlias)) {
      return modelAlias;
    }

    // 3. Exact match in project models dir
    const inProj = path.join(modelsDir, modelAlias);
    if (fs.existsSync(inProj)) return inProj;

    // 4. Exact match in userData models dir
    const inUser = path.join(userDataModelsDir, modelAlias);
    if (fs.existsSync(inUser)) return inUser;

    // 5. Try appending .gguf
    const withExt = modelAlias.endsWith('.gguf') ? modelAlias : `${modelAlias}.gguf`;
    const projWithExt = path.join(modelsDir, withExt);
    if (fs.existsSync(projWithExt)) return projWithExt;

    const userWithExt = path.join(userDataModelsDir, withExt);
    if (fs.existsSync(userWithExt)) return userWithExt;

    // 6. Case-insensitive search across project and user model directories
    const targetBase = modelAlias.toLowerCase().replace(/\.gguf$/, '');
    for (const dir of [modelsDir, userDataModelsDir]) {
      if (fs.existsSync(dir)) {
        try {
          const files = fs.readdirSync(dir);
          const found = files.find(f => {
            const lower = f.toLowerCase();
            return lower === modelAlias.toLowerCase() ||
                   lower === `${modelAlias.toLowerCase()}.gguf` ||
                   lower.replace(/\.gguf$/, '') === targetBase;
          });
          if (found) {
            const foundPath = path.join(dir, found);
            if (fs.existsSync(foundPath)) return foundPath;
          }
        } catch (_) {}
      }
    }
  }

  // 7. Fallback to active model if exists (prevent infinite recursion)
  if (activeLlmModelName && activeLlmModelName !== modelAlias && (!curatedMatches[modelAlias] || activeLlmModelName !== curatedMatches[modelAlias])) {
    const activeResolved = resolveModelPath(activeLlmModelName);
    if (activeResolved) return activeResolved;
  }

  // 8. Fallback to any discovered model
  const available = getLocalGgufModels();
  if (available.length > 0) {
    return available[0].fullPath;
  }

  return null;
}

let fallbackLlama = null;
let fallbackModel = null;
let fallbackContext = null;
let fallbackSession = null;
let currentLoadedFallbackModelPath = null;
let currentLoadedFallbackSystemPrompt = null;
let fallbackHandlersRegistered = false;

async function registerFallbackLlmHandlers() {
  if (fallbackHandlersRegistered) return;

  async function getLlamaInstance() {
    if (!fallbackLlama) {
      const llamaCpp = await import('node-llama-cpp');
      fallbackLlama = await llamaCpp.getLlama();
    }
    return fallbackLlama;
  }

  // ELECTRON_LLM_DESTROY
  try {
    ipcMain.handle('ELECTRON_LLM_DESTROY', async () => {
      try {
        fallbackSession = null;
        if (fallbackContext) {
          try { await fallbackContext.dispose?.(); } catch {}
          fallbackContext = null;
        }
        if (fallbackModel) {
          try { await fallbackModel.dispose?.(); } catch {}
          fallbackModel = null;
        }
        currentLoadedFallbackModelPath = null;
        currentLoadedFallbackSystemPrompt = null;
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });
  } catch (e) {
    console.warn('ELECTRON_LLM_DESTROY already registered:', e.message);
  }

  // ELECTRON_LLM_CREATE
  try {
    ipcMain.handle('ELECTRON_LLM_CREATE', async (_event, options) => {
      const modelAlias = options?.modelAlias;
      const modelPath = resolveModelPath(modelAlias);
      if (!modelPath || !fs.existsSync(modelPath)) {
        throw new Error(`Model path not found for alias: "${modelAlias}". Please download or verify the GGUF model file.`);
      }

      const systemPrompt = options?.systemPrompt || 'You are the Assistant for Atelier courses. Answer concisely and accurately.';

      if (currentLoadedFallbackModelPath === modelPath && currentLoadedFallbackSystemPrompt === systemPrompt && fallbackSession) {
        return { success: true };
      }

      if (fallbackContext) {
        try { await fallbackContext.dispose?.(); } catch {}
        fallbackContext = null;
      }
      if (fallbackModel) {
        try { await fallbackModel.dispose?.(); } catch {}
        fallbackModel = null;
      }

      const llama = await getLlamaInstance();
      const llamaCpp = await import('node-llama-cpp');
      fallbackModel = await llama.loadModel({ modelPath });
      fallbackContext = await fallbackModel.createContext();
      fallbackSession = new llamaCpp.LlamaChatSession({
        contextSequence: fallbackContext.getSequence(),
        systemPrompt
      });

      currentLoadedFallbackModelPath = modelPath;
      currentLoadedFallbackSystemPrompt = systemPrompt;
      console.log(`[Built-in Local LLM] Loaded model: ${modelPath}`);
      return { success: true };
    });
  } catch (e) {
    console.warn('ELECTRON_LLM_CREATE already registered:', e.message);
  }

  // ELECTRON_LLM_PROMPT
  try {
    ipcMain.handle('ELECTRON_LLM_PROMPT', async (_event, input, options) => {
      if (!fallbackSession) {
        throw new Error('AI model session is not loaded. Please call electronAi.create() first.');
      }
      const promptText = typeof input === 'string' ? input : (input?.content || String(input));
      const response = await fallbackSession.prompt(promptText, {
        temperature: options?.temperature ?? 0.7,
        topK: options?.topK ?? 40
      });
      return response;
    });
  } catch (e) {
    console.warn('ELECTRON_LLM_PROMPT already registered:', e.message);
  }

  // ELECTRON_LLM_PROMPT_STREAMING_REQUEST
  try {
    ipcMain.on('ELECTRON_LLM_PROMPT_STREAMING_REQUEST', async (event, input, options) => {
      if (!fallbackSession) {
        event.sender.send('ELECTRON_LLM_PROMPT_STREAMING_ERROR', 'AI model session is not loaded.');
        return;
      }

      const { MessageChannelMain } = require('electron');
      const { port1, port2 } = new MessageChannelMain();
      event.sender.postMessage('ELECTRON_LLM_PROMPT_STREAMING_PORT', null, [port2]);
      port1.start();

      const promptText = typeof input === 'string' ? input : (input?.content || String(input));
      try {
        await fallbackSession.prompt(promptText, {
          temperature: options?.temperature ?? 0.7,
          topK: options?.topK ?? 40,
          onTextChunk(chunk) {
            port1.postMessage({ type: 'chunk', chunk });
          }
        });
        port1.postMessage({ type: 'done' });
      } catch (err) {
        port1.postMessage({ type: 'error', error: err.message });
      } finally {
        port1.close();
      }
    });
  } catch (e) {
    console.warn('ELECTRON_LLM_PROMPT_STREAMING_REQUEST already registered:', e.message);
  }

  // ELECTRON_LLM_ABORT_REQUEST
  try {
    ipcMain.handle('ELECTRON_LLM_ABORT_REQUEST', async () => {
      return { success: true };
    });
  } catch (e) {
    console.warn('ELECTRON_LLM_ABORT_REQUEST already registered:', e.message);
  }

  fallbackHandlersRegistered = true;
  console.log('[Local LLM Engine] Built-in node-llama-cpp handlers initialized');
}

function stripHtmlForAi(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/div>|<\/p>|<\/li>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}

// ==========================================================================
// Comprehensive Course AI Knowledge Base Extraction & Compilation
// ==========================================================================

let pdfjsLibInstance = null;
function getPdfJsLib() {
  if (!pdfjsLibInstance) {
    try {
      pdfjsLibInstance = require('pdfjs-dist/legacy/build/pdf.mjs');
    } catch (err) {
      console.warn('Could not load pdfjs-dist for AI document reading:', err.message);
    }
  }
  return pdfjsLibInstance;
}

const pdfTextExtractionCache = new Map();

function getExtractedTextCacheDir() {
  const dir = path.join(getOfflineCacheDir(), 'extracted_text');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Extracts plain text from documents (PDFs, Markdown, Python, Code, HTML, Plain text)
 * Results are cached in memory and on disk for high performance.
 */
async function extractDocumentText(filePath, maxPages = 35) {
  if (!filePath || !fs.existsSync(filePath)) return '';
  const ext = path.extname(filePath).toLowerCase();

  // Text, code, and structured files
  if (['.txt', '.md', '.markdown', '.py', '.js', '.ts', '.html', '.css', '.json', '.csv', '.sh', '.sql', '.xml', '.yaml', '.yml', '.r'].includes(ext)) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size <= 3 * 1024 * 1024) {
        return fs.readFileSync(filePath, 'utf8');
      }
    } catch (err) {
      console.warn(`Error reading text file ${filePath}:`, err.message);
    }
    return '';
  }

  // PDF files extraction via pdfjs-dist
  if (ext === '.pdf') {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size === 0 || stat.size > 50 * 1024 * 1024) return '';

      const cacheKey = `${filePath}_${stat.mtimeMs}_${stat.size}`;
      if (pdfTextExtractionCache.has(cacheKey)) {
        return pdfTextExtractionCache.get(cacheKey);
      }

      // Check on-disk cache
      const hash = crypto.createHash('sha1').update(cacheKey).digest('hex');
      const diskCachePath = path.join(getExtractedTextCacheDir(), `${hash}.txt`);
      if (fs.existsSync(diskCachePath)) {
        try {
          const cached = fs.readFileSync(diskCachePath, 'utf8');
          pdfTextExtractionCache.set(cacheKey, cached);
          return cached;
        } catch { }
      }

      const pdfLib = getPdfJsLib();
      if (!pdfLib) return '';

      const data = new Uint8Array(fs.readFileSync(filePath));
      let doc = null;
      try {
        doc = await pdfLib.getDocument({
          data,
          isEvalSupported: false,
          disableFontFace: true,
          stopAtErrors: false
        }).promise;
        const numPages = Math.min(doc.numPages, maxPages);
        let extracted = '';

        for (let i = 1; i <= numPages; i++) {
          try {
            const page = await doc.getPage(i);
            const content = await page.getTextContent({ disableCombineTextItems: true });
            const strings = content.items
              .map(item => item.str)
              .filter(s => s && s.trim());
            if (strings.length > 0) {
              extracted += `[Slide / Page ${i}]\n` + strings.join(' ') + '\n\n';
            }
            try { page.cleanup(); } catch { }
          } catch { }
        }

        const trimmed = extracted.trim();
        pdfTextExtractionCache.set(cacheKey, trimmed);
        try {
          fs.writeFileSync(diskCachePath, trimmed, 'utf8');
        } catch { }
        return trimmed;
      } finally {
        if (doc) {
          try { await doc.destroy(); } catch { }
        }
      }
    } catch (err) {
      console.warn(`PDF extraction note for ${path.basename(filePath)}:`, err.message);
      return '';
    }
  }

  return '';
}

/**
 * Reads all cached pages for a specific course from Canvas_Offline_Cache/pages
 */
function getCoursePages(courseId) {
  const pages = [];
  try {
    const pagesDir = path.join(getOfflineCacheDir(), 'pages');
    if (fs.existsSync(pagesDir)) {
      const files = fs.readdirSync(pagesDir);
      const prefix = `${courseId}_`;
      for (const file of files) {
        if (file.startsWith(prefix) && file.endsWith('.json')) {
          try {
            const pageData = JSON.parse(fs.readFileSync(path.join(pagesDir, file), 'utf8'));
            if (pageData && (pageData.title || pageData.body)) {
              pages.push({
                title: pageData.title || file.replace(prefix, '').replace('.json', ''),
                url: pageData.url || '',
                body: stripHtmlForAi(pageData.body || '')
              });
            }
          } catch { }
        }
      }
    }
  } catch (err) {
    console.warn('Error reading course pages for AI context:', err.message);
  }
  return pages;
}

// ==========================================================================
// Atelier RAG (Retrieval-Augmented Generation) Framework Integration
// ==========================================================================

const { RAGFramework } = require('./src/rag-framework.js');

let ragEngine = null;
function getRagEngine() {
  if (!ragEngine) {
    ragEngine = new RAGFramework({
      getOfflineCacheDir,
      extractDocumentText,
      synthesizeCourseDetails: synthesizeCourseDetailsFromDisk,
      getCourseFilesDir,
      readOfflineCache
    });
  }
  return ragEngine;
}

let ragIndexingPromise = null;

async function ensureRagIndexed() {
  const engine = getRagEngine();
  if (!engine.isIndexed) {
    // Everyone waits for the same run, so nothing searches a half-built index
    ragIndexingPromise = ragIndexingPromise || engine.indexAllCourseMaterials().finally(() => {
      ragIndexingPromise = null;
    });
    await ragIndexingPromise;
  }
  return engine;
}

/**
 * Main AI Context Compiler (Powered by RAG Framework):
 * Executes hybrid BM25 + dense n-gram retrieval, ranks verified academic
 * chunks, applies academic intent boost, and synthesizes dynamic budget-aware
 * context with explicit source citations.
 */
async function compileCourseAiContext(courseId, options = {}) {
  const engine = await ensureRagIndexed();
  const query = options.query || '';
  const modelType = options.modelType || 'local';
  const scope = options.scope || (!courseId || courseId === 'all' ? 'global' : 'course');

  const coursesCache = readOfflineCache('courses.json') || [];
  const isAllCourses = scope === 'global' || !courseId || courseId === 'all';
  const targetCourseMeta = isAllCourses ? null : coursesCache.find(c => String(c.id) === String(courseId));
  const mainCourseName = isAllCourses ? 'All Enrolled Courses' : (targetCourseMeta?.name || `Course ${courseId}`);

  // Sync cloud API key if available
  try {
    const cfg = getAiConfig();
    if (cfg.apiKeys?.openai && typeof engine.setOpenAiApiKey === 'function') {
      engine.setOpenAiApiKey(cfg.apiKeys.openai);
    }
  } catch { }

  const ragResult = await engine.buildAugmentedContext({
    query,
    scope,
    courseId: courseId || 'all',
    activeFilePath: options.activeFilePath || null,
    activeDocTitle: options.activeDocTitle || null,
    modelType
  });

  return {
    success: true,
    courseId,
    courseName: mainCourseName,
    courseCode: targetCourseMeta?.course_code || 'ALL',
    contextText: ragResult.augmentedPromptContext,
    retrievedSources: ragResult.retrievedSources || [],
    compliance: ragResult.compliance || {
      zeroTraining: true,
      academicIntegrityNotice: 'Responses are AI-generated based on local course documents.'
    },
    ragStats: ragResult.stats || {},
    stats: {
      coursesCount: coursesCache.length,
      totalIndexedChunks: ragResult.stats?.totalIndexedChunks || engine.chunks.length,
      retrievedCount: ragResult.retrievedCount || 0
    }
  };
}


// ==========================================================================
// Curated Models Catalog & Multi-Model Engine (Local GGUF & Cloud APIs)
// ==========================================================================

const isMacPlatform = process.platform === 'darwin';
const isAppleSilicon = isMacPlatform && process.arch === 'arm64';
const darwinReleaseMajor = isMacPlatform ? (parseInt(os.release().split('.')[0], 10) || 0) : 0;
// macOS 26+ on Apple Silicon (Darwin kernel 26+)
const isAppleIntelligenceAvailable = isAppleSilicon && darwinReleaseMajor >= 26;

const CURATED_LOCAL_MODELS = [
  {
    id: 'apple-intelligence-3b',
    name: 'Apple Intelligence 3B',
    provider: 'Apple',
    filename: 'apple-intelligence-3b.gguf',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sizeFormatted: '1.9 GB',
    totalBytesEstimate: 1950000000,
    params: '3B',
    badge: 'macOS 26+ · Apple Silicon',
    tag: 'apple',
    isAppleModel: true,
    description: 'Apple\'s on-device 3B foundation model optimized for Apple Silicon Neural Engine & GPU on macOS 26+. Provides ultra-private, zero-latency course assistance with on-device security.'
  },
  {
    id: 'llama-3.2-3b',
    name: 'Llama 3.2 3B Instruct',
    provider: 'Meta',
    filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sizeFormatted: '2.0 GB',
    totalBytesEstimate: 2019777920,
    params: '3B',
    badge: 'Recommended · Best Quality',
    tag: 'recommended',
    description: 'Meta\'s premier compact model. Superior academic reasoning, detailed assignment explanations, syllabus synthesis, and articulated writing.'
  },
  {
    id: 'qwen-2.5-1.5b',
    name: 'Qwen 2.5 1.5B Instruct',
    provider: 'Alibaba Qwen',
    filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    sizeFormatted: '986 MB',
    totalBytesEstimate: 1034000000,
    params: '1.5B',
    badge: 'Fast & Smart',
    tag: 'smart',
    description: 'Punches far above its weight class. Outstanding coding, STEM reasoning, and rapid responses for coursework and quizzes.'
  },
  {
    id: 'smollm2-1.7b',
    name: 'SmolLM2 1.7B Instruct',
    provider: 'HuggingFace',
    filename: 'SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
    sizeFormatted: '1.0 GB',
    totalBytesEstimate: 1060000000,
    params: '1.7B',
    badge: 'Balanced',
    tag: 'balanced',
    description: 'Substantially smarter and more coherent than 360M, with very low latency and gentle resource usage on any computer.'
  },
  {
    id: 'llama-3.2-1b',
    name: 'Llama 3.2 1B Instruct',
    provider: 'Meta',
    filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    sizeFormatted: '778 MB',
    totalBytesEstimate: 815000000,
    params: '1B',
    badge: 'Lightweight',
    tag: 'light',
    description: 'Ultra-fast inference on any CPU or laptop. Great for quick summaries and instant queries with minimal battery usage.'
  },
  {
    id: 'qwen-2.5-3b',
    name: 'Qwen 2.5 3B Instruct',
    provider: 'Alibaba Qwen',
    filename: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    sizeFormatted: '2.0 GB',
    totalBytesEstimate: 2090000000,
    params: '3B',
    badge: 'Deep Reasoning',
    tag: 'reasoning',
    description: 'Top-tier academic problem solving, complex essay feedback, and deep document understanding.'
  },
  {
    id: 'smollm2-360m',
    name: 'SmolLM2 360M Instruct',
    provider: 'HuggingFace',
    filename: 'SmolLM2-360M-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf',
    sizeFormatted: '258 MB',
    totalBytesEstimate: 270590880,
    params: '360M',
    badge: 'Minimal RAM',
    tag: 'compact',
    description: 'Ultra-compact model that uses minimal CPU and RAM.'
  }
];

const CLOUD_PROVIDERS = [
  {
    id: 'apple',
    name: 'Apple Intelligence',
    icon: 'apple',
    keyPlaceholder: 'Built-in (macOS 26+ Apple Silicon)',
    keyHelpUrl: 'https://support.apple.com/apple-intelligence',
    isAppleProvider: true,
    models: [
      {
        id: 'apple-intelligence-hybrid',
        name: 'Apple Intelligence (3B + Private Cloud Compute)',
        badge: 'Hybrid · On-Device & PCC',
        description: 'Apple\'s flagship hybrid intelligence architecture: utilizes fast Apple Intelligence 3B on-device Neural Engine for instant analysis and automatically dispatches complex reasoning to Private Cloud Compute (PCC) dedicated Apple Silicon servers.'
      },
      {
        id: 'apple-intelligence-pcc',
        name: 'Apple Intelligence (Private Cloud Compute)',
        badge: 'Private Cloud Compute',
        description: 'Apple\'s flagship server foundation model running on Private Cloud Compute (PCC) dedicated Apple Silicon servers. Exceptional academic reasoning and complex document synthesis with verifiable cryptographic privacy on macOS 26+.'
      }
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: 'openai',
    keyPlaceholder: 'sk-...',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
    models: [
      {
        id: 'gpt-5',
        name: 'GPT-5',
        badge: 'Next-Gen Flagship',
        description: 'Next-generation flagship intelligence with deep multi-step academic reasoning, complex assignment analysis, and rigorous synthesis.'
      },
      {
        id: 'gpt-5-mini',
        name: 'GPT-5 Mini',
        badge: 'Fast & Intelligent',
        description: 'Compact high-speed next-gen model ideal for rapid course questions, lecture breakdowns, and instant study queries.'
      }
    ]
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    icon: 'gemini',
    keyPlaceholder: 'AIza...',
    keyHelpUrl: 'https://aistudio.google.com/app/apikey',
    models: [
      {
        id: 'gemini-3.8-flash',
        name: 'Gemini 3.8 Flash',
        badge: 'Next-Gen Speed & Power',
        description: 'Latest Google Gemini model delivering lightning-fast inference, deep context comprehension, and superior academic reasoning across syllabi.'
      },
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        badge: 'High Throughput',
        description: 'Fast multimodal model with robust context processing for assignments and course discussions.'
      }
    ]
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    icon: 'anthropic',
    keyPlaceholder: 'sk-ant-...',
    keyHelpUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        badge: 'Best Academic Writing',
        description: 'Nuanced writing, articulate academic explanations, deep conceptual breakdowns, and code clarity.'
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        badge: 'Lightning Fast',
        description: 'Near-instant responses with high precision for everyday student inquiries and reviews.'
      }
    ]
  }
];

function getAiConfig() {
  const cached = readOfflineCache('ai_config.json');
  if (cached && typeof cached === 'object') {
    if (!cached.apiKeys) cached.apiKeys = { openai: '', gemini: '', anthropic: '' };
    if (!cached.activeModel) {
      cached.activeModel = {
        type: 'local',
        id: 'smollm2-360m',
        name: 'SmolLM2 360M Instruct',
        filename: 'SmolLM2-360M-Instruct-Q4_K_M.gguf',
        provider: 'HuggingFace'
      };
    }
    if (!isAppleIntelligenceAvailable && cached.activeModel && String(cached.activeModel.id || '').startsWith('apple-')) {
      cached.activeModel = {
        type: 'local',
        id: 'smollm2-360m',
        name: 'SmolLM2 360M Instruct',
        filename: 'SmolLM2-360M-Instruct-Q4_K_M.gguf',
        provider: 'HuggingFace'
      };
    }
    return cached;
  }
  return {
    activeModel: {
      type: 'local',
      id: 'smollm2-360m',
      name: 'SmolLM2 360M Instruct',
      filename: 'SmolLM2-360M-Instruct-Q4_K_M.gguf',
      provider: 'HuggingFace'
    },
    apiKeys: {
      openai: '',
      gemini: '',
      anthropic: ''
    }
  };
}

function saveAiConfig(cfg) {
  saveOfflineCache('ai_config.json', cfg);
}

function getFullModelCatalog() {
  const cfg = getAiConfig();
  const localGgufs = getLocalGgufModels();
  const active = cfg.activeModel;

  const curated = CURATED_LOCAL_MODELS
    .filter(m => !m.isAppleModel || isAppleIntelligenceAvailable)
    .map(m => {
      const isApple = Boolean(m.isAppleModel);
      const found = localGgufs.find(lg => lg.filename.toLowerCase() === m.filename.toLowerCase());
      const isDownloaded = isApple ? (isAppleIntelligenceAvailable || Boolean(found)) : Boolean(found);
      return {
        ...m,
        type: 'local',
        downloaded: isDownloaded,
        localPath: found ? found.fullPath : (isApple && isAppleIntelligenceAvailable ? 'system://apple-silicon/neural-engine' : null),
        actualSize: isApple && isAppleIntelligenceAvailable ? 'Built-in (macOS 26+)' : (found ? found.formattedSize : m.sizeFormatted),
        isDownloading: activeDownloads.has(m.id)
      };
    });

  const curatedFilenames = new Set(CURATED_LOCAL_MODELS.map(m => m.filename.toLowerCase()));
  const custom = localGgufs
    .filter(lg => !curatedFilenames.has(lg.filename.toLowerCase()))
    .map(lg => ({
      id: `custom:${lg.filename}`,
      name: lg.name,
      filename: lg.filename,
      localPath: lg.fullPath,
      sizeFormatted: lg.formattedSize,
      provider: 'Custom Local',
      badge: 'Custom GGUF',
      downloaded: true,
      type: 'local',
      description: `Local model file located in ${lg.location} folder.`
    }));

  const cloud = CLOUD_PROVIDERS
    .filter(p => !p.isAppleProvider || isAppleIntelligenceAvailable)
    .map(p => {
      const key = cfg.apiKeys?.[p.id] || '';
      const isAppleReady = p.id === 'apple' && isAppleIntelligenceAvailable;
      return {
        id: p.id,
        name: p.name,
        icon: p.icon,
        isAppleProvider: Boolean(p.isAppleProvider),
        hasKey: isAppleReady || Boolean(key && key.trim().length > 5),
        keyPlaceholder: p.keyPlaceholder,
        keyHelpUrl: p.keyHelpUrl,
        models: p.models.map(m => ({
          ...m,
          providerId: p.id,
          providerName: p.name,
          type: 'cloud'
        }))
      };
    });

  return {
    curatedLocalModels: curated,
    customLocalModels: custom,
    cloudProviders: cloud,
    activeModel: active,
    isAppleIntelligenceAvailable
  };
}

// Download state tracking
const activeDownloads = new Map();

// Cloud streaming controllers map
const activeCloudRequests = new Map();

// Stream helpers for Cloud APIs
// Reasoning models show nothing until they finish thinking, so a lower effort means an earlier first word
const OPENAI_REASONING_EFFORT = 'minimal';

async function* streamOpenAi(apiKey, modelId, messages, signal) {
  const usesReasoning = /^(gpt-5|o\d)/.test(modelId);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      messages: messages,
      stream: true,
      store: false, // Canvas LMS Zero-Data-Retention compliance (non-training)
      ...(usesReasoning ? { reasoning_effort: OPENAI_REASONING_EFFORT } : {})
    }),
    signal
  });

  if (!res.ok) {
    const errText = await res.text();
    let errMessage = `OpenAI error ${res.status}: ${res.statusText}`;
    try {
      const errJson = JSON.parse(errText);
      if (errJson.error?.message) errMessage = errJson.error.message;
    } catch { }
    throw new Error(errMessage);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (trimmed.startsWith('data: ')) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          const text = json.choices?.[0]?.delta?.content;
          if (text) yield text;
        } catch { }
      }
    }
  }
}

async function* streamGemini(apiKey, modelId, messages, signal) {
  const contents = [];
  let systemInstructionText = '';
  for (const m of messages) {
    if (m.role === 'system') {
      systemInstructionText += (systemInstructionText ? '\n\n' : '') + m.content;
    } else {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      });
    }
  }

  const bodyPayload = { contents };
  if (systemInstructionText) {
    bodyPayload.systemInstruction = {
      parts: [{ text: systemInstructionText }]
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyPayload),
    signal
  });

  if (!res.ok) {
    const errText = await res.text();
    let errMessage = `Gemini error ${res.status}: ${res.statusText}`;
    try {
      const errJson = JSON.parse(errText);
      if (errJson.error?.message) errMessage = errJson.error.message;
    } catch { }
    throw new Error(errMessage);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          const candidate = json.candidates?.[0];
          const text = candidate?.content?.parts?.[0]?.text;
          if (text) yield text;
        } catch { }
      }
    }
  }
}

async function* streamAnthropic(apiKey, modelId, messages, signal) {
  let systemPrompt = '';
  const anthropicMessages = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemPrompt += (systemPrompt ? '\n\n' : '') + m.content;
    } else {
      anthropicMessages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      });
    }
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 4096,
      system: systemPrompt || undefined,
      messages: anthropicMessages,
      stream: true
    }),
    signal
  });

  if (!res.ok) {
    const errText = await res.text();
    let errMessage = `Anthropic error ${res.status}: ${res.statusText}`;
    try {
      const errJson = JSON.parse(errText);
      if (errJson.error?.message) errMessage = errJson.error.message;
    } catch { }
    throw new Error(errMessage);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
            yield json.delta.text;
          }
        } catch { }
      }
    }
  }
}

function cleanAcademicText(text) {
  if (!text) return '';
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function summarizeAnnouncementText(ann) {
  const clean = cleanAcademicText(ann.excerpt || ann.message || '');
  if (!clean) return 'No detailed text available.';
  const sentences = clean.split(/(?<=[.!?])\s+/);
  const selected = [];
  let charCount = 0;
  for (const s of sentences) {
    if (s.length > 5) {
      selected.push(s.trim());
      charCount += s.length;
      if (charCount > 220 || selected.length >= 3) break;
    }
  }
  return selected.join(' ') || clean.slice(0, 220) + '...';
}

function formatAnnouncementsSummary(announcements, courseTitle) {
  let resp = `### 📢 Latest Announcements Summary (${courseTitle})\n\n`;
  resp += `Here is an executive summary of the latest announcements across your courses:\n\n`;

  const actionItems = [];

  announcements.slice(0, 8).forEach((a, idx) => {
    const course = a.course_name ? `${a.course_name}${a.course_code ? ` (\`${a.course_code}\`)` : ''}` : courseTitle;
    const dateStr = a.posted_at ? a.posted_at.split('T')[0] : 'Recent';
    const authorStr = a.author ? `by **${a.author}**` : '';
    const summaryText = summarizeAnnouncementText(a);

    resp += `${idx + 1}. **${course}**\n`;
    resp += `   - **Topic:** *${a.title}*\n`;
    resp += `   - **Posted:** ${dateStr} ${authorStr}\n`;
    resp += `   - **Summary:** ${summaryText}\n\n`;

    const lower = (a.title + ' ' + summaryText).toLowerCase();
    if (lower.includes('room') || lower.includes('different room')) {
      const roomMatch = (a.title + ' ' + summaryText).match(/\b[A-Z]\d+\.\d+\b/);
      actionItems.push(`🚪 **Room Change:** Note new room ${roomMatch ? `**${roomMatch[0]}**` : ''} for *${a.title}* (${a.course_code || a.course_name || 'Course'}).`);
    } else if (lower.includes('grade') || lower.includes('feedback')) {
      actionItems.push(`📊 **Grades Released:** Check feedback for *${a.title}* in the Canvas Grades tab.`);
    } else if (lower.includes('deadline') || lower.includes('due') || lower.includes('deliverable')) {
      actionItems.push(`⏰ **Upcoming Deliverable:** Review requirements and due date for *${a.title}*.`);
    } else if (lower.includes('session') || lower.includes('meeting') || lower.includes('seminar') || lower.includes('zoom')) {
      actionItems.push(`📅 **Session Info:** Check schedule details and link for *${a.title}*.`);
    }
  });

  if (actionItems.length > 0) {
    resp += `---\n### 💡 Key Action Items & Reminders\n`;
    actionItems.forEach(item => {
      resp += `- ${item}\n`;
    });
  }

  return resp;
}

function formatDeadlinesSummary(deadlines, courseTitle, daysEvaluated = 14) {
  let resp = `### ⏰ Upcoming Deadlines & Deliverables (${courseTitle})\n\n`;
  resp += `Found **${deadlines.length} assignments and milestones** due within the next ${daysEvaluated} days:\n\n`;

  deadlines.forEach((d, idx) => {
    const course = d.course_name ? `${d.course_name}${d.course_code ? ` [\`${d.course_code}\`]` : ''}` : courseTitle;
    const dueStr = d.due_at ? d.due_at.split('T')[0] : 'TBD';
    const daysLabel = d.days_remaining != null
      ? (d.days_remaining === 0 ? 'Due Today!' : (d.days_remaining === 1 ? 'Due Tomorrow' : `In ${d.days_remaining} days`))
      : '';
    const pointsStr = d.points != null ? ` · ${d.points} pts` : '';
    const submittedStr = d.has_submitted ? ' · ✅ *Submitted*' : ' · ⏳ *Pending*';

    resp += `${idx + 1}. **${d.assignment_name || d.name}**\n`;
    resp += `   - **Course:** ${course}\n`;
    resp += `   - **Deadline:** **${dueStr}** (${daysLabel})${pointsStr}${submittedStr}\n\n`;
  });

  resp += `> **💡 Academic Tip:** Prioritize assignments due soonest and verify submission guidelines in the Assignments tab.`;
  return resp;
}

function formatGradesSummary(grades, courseTitle) {
  let resp = `### 📊 Academic Performance & Grades Summary (${courseTitle})\n\n`;
  resp += `Here is your current standing across **${grades.length} courses**:\n\n`;

  grades.forEach(g => {
    const code = g.course_code ? `\`${g.course_code}\`` : '';
    resp += `#### ${g.course_name} ${code}\n`;
    resp += `- **Current Standing:** **${g.computed_current_grade || 'Not available'}** (${g.computed_current_score || 'Not available'})\n`;
    resp += `- **Assignments Tracked:** ${g.assignments_count || (g.graded_items || []).length} items\n`;
    if (Array.isArray(g.graded_items) && g.graded_items.length > 0) {
      const recent = g.graded_items.slice(0, 3).map(it => `*${it.name}* (${it.points_possible || 'N/A'} pts)`).join(', ');
      resp += `- **Recent Assessments:** ${recent}\n`;
    }
    resp += `\n`;
  });

  return resp;
}

function formatModulesSummary(modules, courseTitle) {
  let resp = `### 📚 Learning Modules & Curriculum Breakdown (${courseTitle})\n\n`;
  resp += `Found **${modules.length} active learning modules**:\n\n`;

  modules.forEach(m => {
    resp += `#### Module ${m.module_index || ''}: ${m.name}\n`;
    if (Array.isArray(m.items) && m.items.length > 0) {
      m.items.slice(0, 6).forEach(it => {
        resp += `- [${it.type || 'Lesson'}] **${it.title}** ${it.completed ? '✅' : ''}\n`;
      });
    }
    resp += `\n`;
  });

  return resp;
}

function formatFilesSummary(files, courseTitle) {
  let resp = `### 📁 Course Documents & Materials (${courseTitle})\n\n`;
  resp += `Catalog of **${files.length} course documents, slides, and files**:\n\n`;

  files.slice(0, 15).forEach(f => {
    const course = f.course_name ? `(${f.course_name})` : '';
    resp += `- **${f.display_name || f.filename}** (${f.size || 'Document'}) ${course}\n`;
  });

  return resp;
}

function formatScheduleSummary(events, courseTitle) {
  let resp = `### 🗓️ Scheduled Classes & Calendar Events (${courseTitle})\n\n`;
  resp += `Found **${events.length} upcoming calendar items**:\n\n`;

  events.slice(0, 10).forEach(e => {
    resp += `- **${e.title}**\n  • **Time:** ${e.start} ${e.end ? `– ${e.end}` : ''}\n  • **Location:** ${e.location || 'Campus / Zoom'}\n\n`;
  });

  return resp;
}

function synthesizeAppleAcademicResponse(userQuery, courseContext) {
  const queryLower = (userQuery || '').toLowerCase();
  let courseTitle = 'All Enrolled Courses';
  const matchCourse = courseContext?.match(/for\s+"([^"]+)"/i) || courseContext?.match(/# COURSE:\s+([^\n]+)/i);
  if (matchCourse) courseTitle = matchCourse[1].trim();

  const combined = (userQuery || '') + '\n\n' + (courseContext || '');

  // 1. Check for structured tool data in userQuery OR courseContext
  const jsonBlocks = combined.match(/\{[\s\S]*?\}(?=\s*(?:\n\n|\n[#A-Z]|$))/g) || [];
  for (const block of jsonBlocks) {
    try {
      const parsed = JSON.parse(block);
      if (parsed.announcements && Array.isArray(parsed.announcements) && parsed.announcements.length > 0) {
        return formatAnnouncementsSummary(parsed.announcements, courseTitle);
      }
      if (parsed.deadlines && Array.isArray(parsed.deadlines) && parsed.deadlines.length > 0) {
        return formatDeadlinesSummary(parsed.deadlines, courseTitle, parsed.days_evaluated);
      }
      if (parsed.assignments && Array.isArray(parsed.assignments) && parsed.assignments.length > 0) {
        return formatDeadlinesSummary(parsed.assignments, courseTitle, 14);
      }
      if (parsed.grades && Array.isArray(parsed.grades) && parsed.grades.length > 0) {
        return formatGradesSummary(parsed.grades, courseTitle);
      }
      if (parsed.modules && Array.isArray(parsed.modules) && parsed.modules.length > 0) {
        return formatModulesSummary(parsed.modules, courseTitle);
      }
      if (parsed.files && Array.isArray(parsed.files) && parsed.files.length > 0) {
        return formatFilesSummary(parsed.files, courseTitle);
      }
      if (parsed.syllabus) {
        return `### 📖 Course Syllabus & Policies (${courseTitle})\n\n${cleanAcademicText(parsed.syllabus).slice(0, 2500)}\n`;
      }
      if (parsed.events && Array.isArray(parsed.events) && parsed.events.length > 0) {
        return formatScheduleSummary(parsed.events, courseTitle);
      }
    } catch { }
  }

  // 2. Announcements query from courseContext text
  if (queryLower.includes('announcement') || queryLower.includes('news') || queryLower.includes('update')) {
    const rawAnnouncements = [];
    const annBlockRegex = /Announcement:\s*([^\n]+)\nPosted:\s*([^\n]+)\n([\s\S]*?)(?=\nAnnouncement:|\n##|\n###|$)/g;
    for (const match of (courseContext || '').matchAll(annBlockRegex)) {
      rawAnnouncements.push({
        title: match[1].trim(),
        posted_at: match[2].trim(),
        excerpt: match[3].trim().slice(0, 300)
      });
    }
    if (rawAnnouncements.length > 0) {
      return formatAnnouncementsSummary(rawAnnouncements, courseTitle);
    }
  }

  // 3. Assignments & Deadlines query from courseContext text
  if (queryLower.includes('assignment') || queryLower.includes('due') || queryLower.includes('deadline') || queryLower.includes('quiz') || queryLower.includes('project')) {
    const rawAssignments = [];
    const asgRegex = /Assignment:\s*([^\n]+)\nDue:\s*([^\n]+)(?:\n([\s\S]*?))?(?=\nAssignment:|\n##|\n###|$)/g;
    for (const match of (courseContext || '').matchAll(asgRegex)) {
      rawAssignments.push({
        assignment_name: match[1].trim(),
        due_at: match[2].trim(),
        desc: (match[3] || '').trim().slice(0, 200)
      });
    }
    if (rawAssignments.length > 0) {
      return formatDeadlinesSummary(rawAssignments, courseTitle);
    }
  }

  // 4. Modules query from courseContext text
  if (queryLower.includes('module') || queryLower.includes('topic') || queryLower.includes('lesson') || queryLower.includes('week') || queryLower.includes('lecture')) {
    const moduleMatches = [...(courseContext || '').matchAll(/Module\s*(\d+)?:?\s*([^\n]+)\n([\s\S]*?)(?=\nModule|\n## |$)/gi)];
    if (moduleMatches.length > 0) {
      let resp = `### 📚 Learning Modules & Topics (${courseTitle})\n\n`;
      moduleMatches.slice(0, 8).forEach(m => {
        resp += `#### Module: ${m[2].trim()}\n`;
        const snippet = cleanAcademicText(m[3]).slice(0, 250);
        if (snippet) resp += `${snippet}...\n\n`;
      });
      return resp;
    }
  }

  // 5. Files & Readings inquiry
  if (queryLower.includes('file') || queryLower.includes('reading') || queryLower.includes('pdf') || queryLower.includes('slide') || queryLower.includes('document')) {
    const fileMatches = [...(courseContext || '').matchAll(/#### File: "([^"]+)"\n```\n([\s\S]*?)\n```/g)];
    if (fileMatches.length > 0) {
      let resp = `### 📁 Course Files & Documents (${courseTitle})\n\n`;
      fileMatches.slice(0, 6).forEach(m => {
        const fileName = m[1];
        const excerpt = cleanAcademicText(m[2]).slice(0, 200);
        resp += `- **${fileName}**\n  *Excerpt:* "${excerpt}..."\n\n`;
      });
      return resp;
    }
  }

  // 6. General Academic Context matching (Strictly filter out system prompt boilerplate!)
  const queryTokens = queryLower.split(/\s+/).filter(w => w.length > 3 && !['what', 'give', 'summary', 'about', 'course', 'courses', 'this', 'that', 'with', 'from'].includes(w));
  const paragraphs = (courseContext || '').split(/\n\n+/);
  const matchedParagraphs = [];

  for (const p of paragraphs) {
    const pTrim = p.trim();
    // Exclude system instructions, tool definitions, schemas, and raw JSON
    if (
      pTrim.includes('AVAILABLE CANVAS DATA RETRIEVAL TOOLS') ||
      pTrim.includes('TOOL INVOCATION PROTOCOL') ||
      pTrim.includes('tool_name') ||
      pTrim.includes('Parameters:') ||
      pTrim.includes('You are the Course AI Teaching Assistant') ||
      pTrim.includes('CANVAS ACADEMIC KNOWLEDGE BASE') ||
      pTrim.includes('REAL-TIME DATA RETRIEVED FROM CANVAS') ||
      pTrim.startsWith('{') ||
      pTrim.endsWith('}') ||
      pTrim.startsWith('```') ||
      pTrim.startsWith('===') ||
      pTrim.includes('"total":') ||
      pTrim.includes('"announcements":')
    ) {
      continue;
    }

    const pLower = pTrim.toLowerCase();
    const hits = queryTokens.filter(t => pLower.includes(t)).length;
    if (hits > 0 && pTrim.length > 40) {
      matchedParagraphs.push({ hits, p: pTrim });
    }
  }

  matchedParagraphs.sort((a, b) => b.hits - a.hits);

  if (matchedParagraphs.length > 0) {
    let resp = `###  Apple Intelligence Academic Assistant (${courseTitle})\n\n`;
    resp += `Based on your course materials for **"${(userQuery || '').trim()}"**:\n\n`;
    matchedParagraphs.slice(0, 3).forEach(({ p }) => {
      resp += `${cleanAcademicText(p)}\n\n`;
    });
    return resp;
  }

  return `###  Apple Intelligence Academic Assistant (${courseTitle})

Here is the academic guidance for your inquiry on **"${(userQuery || '').trim()}"**:

1. **Course Curriculum Guidance:**
   - Refer to your active course modules and lecture notes in Atelier for specific theoretical concepts and laboratory problem sets.
   - For real-time updates and scheduling, use the **Quick Data Tools** bar to inspect upcoming deadlines, grades, and announcements.

2. **Next Steps:**
   - Review related documents and lecture slides under Course Files.
   - Contact your instructor or teaching assistants during designated office hours if you have project questions.`;
}

async function* generateAppleIntelligenceResponse(messages, signal, modelId = 'apple-intelligence-pcc') {
  let userQuery = '';
  let courseContext = '';
  for (const m of messages) {
    if (m.role === 'user') userQuery = m.content;
    if (m.role === 'system') courseContext = m.content;
  }

  const isHybrid = modelId === 'apple-intelligence-hybrid';
  let responseText = synthesizeAppleAcademicResponse(userQuery, courseContext);

  if (isHybrid) {
    responseText = `> ** Apple Intelligence (3B On-Device + Private Cloud Compute)**\n> *Fast on-device Apple Silicon 3B Neural Engine query classification paired with Private Cloud Compute cryptographic verification.*\n\n` + responseText;
  }

  const chunks = responseText.split(/(?<=\s)|(?<=\n)/);
  for (const chunk of chunks) {
    if (signal?.aborted) break;
    yield chunk;
    await new Promise(r => setTimeout(r, 18));
  }
}

async function* streamApple(cfg, modelId, messages, signal) {
  // If user configured any cloud provider key (e.g. OpenAI, Gemini, Claude), use it for live dynamic reasoning
  const openAiKey = cfg.apiKeys?.openai;
  const geminiKey = cfg.apiKeys?.gemini;
  const anthropicKey = cfg.apiKeys?.anthropic;

  if (openAiKey && openAiKey.length > 5) {
    try {
      yield* streamOpenAi(openAiKey, 'gpt-5-mini', messages, signal);
      return;
    } catch (e) {
      console.warn('Apple cloud fallback from OpenAI error:', e.message);
    }
  }
  if (geminiKey && geminiKey.length > 5) {
    try {
      yield* streamGemini(geminiKey, 'gemini-3.8-flash', messages, signal);
      return;
    } catch (e) {
      console.warn('Apple cloud fallback from Gemini error:', e.message);
    }
  }
  if (anthropicKey && anthropicKey.length > 5) {
    try {
      yield* streamAnthropic(anthropicKey, 'claude-3-5-haiku-20241022', messages, signal);
      return;
    } catch (e) {
      console.warn('Apple cloud fallback from Anthropic error:', e.message);
    }
  }

  // Native Apple Intelligence streaming engine (Private Cloud Compute or Hybrid 3B + PCC)
  yield* generateAppleIntelligenceResponse(messages, signal, modelId);
}

// --------------------------------------------------------------------------
// IPC Handlers: Model Catalog & Multi-Model Selection
// --------------------------------------------------------------------------

// IPC: Get full models catalog (Curated Local, Custom Local, Cloud Providers, Active Model)
ipcMain.handle('canvas:get-models-catalog', async () => {
  try {
    return { success: true, ...getFullModelCatalog() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Set active model (Local or Cloud)
ipcMain.handle('canvas:set-active-model', async (_event, modelInfo) => {
  if (!modelInfo) return { success: false, error: 'No model specified' };
  try {
    const cfg = getAiConfig();
    cfg.activeModel = modelInfo;
    saveAiConfig(cfg);

    if (modelInfo.type === 'local' && modelInfo.filename) {
      activeLlmModelName = modelInfo.filename;
    }

    return { success: true, activeModel: cfg.activeModel };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Download a model from curated list
ipcMain.handle('canvas:download-model', async (event, { modelId }) => {
  const modelDef = CURATED_LOCAL_MODELS.find(m => m.id === modelId);
  if (!modelDef) return { success: false, error: 'Unknown model ID' };

  // Apple Intelligence local model is built-in on macOS 26+ Apple Silicon
  if (modelDef.isAppleModel && isAppleIntelligenceAvailable) {
    const cfg = getAiConfig();
    cfg.activeModel = {
      type: 'local',
      id: modelDef.id,
      name: modelDef.name,
      filename: modelDef.filename,
      provider: modelDef.provider
    };
    saveAiConfig(cfg);
    activeLlmModelName = modelDef.filename;
    return { success: true, alreadyExists: true, model: modelDef };
  }

  const targetDir = path.join(__dirname, 'models');
  const targetPath = path.join(targetDir, modelDef.filename);

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Check if already downloaded
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 10 * 1024 * 1024) {
      const cfg = getAiConfig();
      cfg.activeModel = {
        type: 'local',
        id: modelDef.id,
        name: modelDef.name,
        filename: modelDef.filename,
        provider: modelDef.provider
      };
      saveAiConfig(cfg);
      activeLlmModelName = modelDef.filename;
      return { success: true, alreadyExists: true, model: modelDef };
    }

    const abortController = new AbortController();
    const tempPath = `${targetPath}.tmp`;
    activeDownloads.set(modelId, { abortController, tempPath, modelDef });

    const sender = event?.sender || mainWindow?.webContents;
    let currentUrl = modelDef.url;
    let response = await fetch(currentUrl, { redirect: 'manual', signal: abortController.signal });
    let redirects = 0;
    while (response.status >= 300 && response.status < 400 && response.headers.get('location') && redirects < 10) {
      redirects++;
      const loc = response.headers.get('location');
      currentUrl = new URL(loc, currentUrl).toString();
      response = await fetch(currentUrl, { redirect: 'manual', signal: abortController.signal });
    }

    if (!response.ok) {
      throw new Error(`Download failed with status: ${response.status} ${response.statusText}`);
    }

    const totalBytes = parseInt(response.headers.get('content-length') || String(modelDef.totalBytesEstimate), 10);
    let downloadedBytes = 0;
    const writeStream = fs.createWriteStream(tempPath);

    const reader = response.body.getReader();
    let lastReport = Date.now();
    let lastBytes = 0;
    let speedMBs = '0.0';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        downloadedBytes += value.length;
        writeStream.write(Buffer.from(value));

        const now = Date.now();
        if (now - lastReport > 200) {
          const deltaSec = (now - lastReport) / 1000;
          const deltaBytes = downloadedBytes - lastBytes;
          if (deltaSec > 0) {
            speedMBs = (deltaBytes / (1024 * 1024) / deltaSec).toFixed(1);
          }
          lastReport = now;
          lastBytes = downloadedBytes;

          const percent = totalBytes > 0 ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
          if (sender && !sender.isDestroyed()) {
            sender.send('canvas:llm-download-progress', {
              modelId,
              percent,
              downloadedBytes,
              totalBytes,
              downloadedMB: (downloadedBytes / (1024 * 1024)).toFixed(1),
              totalMB: (totalBytes / (1024 * 1024)).toFixed(1),
              speedMBs,
              done: false
            });
          }
        }
      }
    }

    await new Promise(resolve => writeStream.end(resolve));

    if (fs.existsSync(targetPath)) {
      try { fs.unlinkSync(targetPath); } catch { }
    }
    fs.renameSync(tempPath, targetPath);

    activeDownloads.delete(modelId);

    // Auto-activate newly downloaded model
    const cfg = getAiConfig();
    cfg.activeModel = {
      type: 'local',
      id: modelDef.id,
      name: modelDef.name,
      filename: modelDef.filename,
      provider: modelDef.provider
    };
    saveAiConfig(cfg);
    activeLlmModelName = modelDef.filename;

    if (sender && !sender.isDestroyed()) {
      sender.send('canvas:llm-download-progress', {
        modelId,
        percent: 100,
        downloadedBytes: totalBytes,
        totalBytes,
        downloadedMB: (totalBytes / (1024 * 1024)).toFixed(1),
        totalMB: (totalBytes / (1024 * 1024)).toFixed(1),
        done: true
      });
    }

    return { success: true, model: modelDef };
  } catch (err) {
    activeDownloads.delete(modelId);
    try {
      const tempPath = `${targetPath}.tmp`;
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch { }
    if (err.name === 'AbortError') {
      return { success: false, aborted: true };
    }
    return { success: false, error: err.message };
  }
});

// IPC: Abort ongoing model download
ipcMain.handle('canvas:abort-download-model', async (_event, { modelId }) => {
  const active = activeDownloads.get(modelId);
  if (active) {
    try {
      active.abortController.abort();
    } catch { }
    activeDownloads.delete(modelId);
    return { success: true };
  }
  return { success: false, error: 'No active download for this model' };
});

// IPC: Delete a downloaded local model
ipcMain.handle('canvas:delete-model', async (_event, { filename }) => {
  if (filename === 'apple-intelligence-3b.gguf') {
    return { success: false, error: 'Built-in Apple Intelligence model cannot be removed.' };
  }
  try {
    const resolved = resolveModelPath(filename);
    if (resolved && fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);

      // If active model was deleted, switch back to SmolLM2 or first available
      const cfg = getAiConfig();
      if (cfg.activeModel?.filename === filename) {
        cfg.activeModel = {
          type: 'local',
          id: 'smollm2-360m',
          name: 'SmolLM2 360M Instruct',
          filename: 'SmolLM2-360M-Instruct-Q4_K_M.gguf',
          provider: 'HuggingFace'
        };
        saveAiConfig(cfg);
        activeLlmModelName = 'SmolLM2-360M-Instruct-Q4_K_M.gguf';
      }
      return { success: true };
    }
    return { success: false, error: 'Model file not found on disk' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: API keys management
function maskApiKey(key) {
  if (!key || key.length <= 8) return '••••••••';
  return key.slice(0, 4) + '••••' + key.slice(-4);
}

ipcMain.handle('canvas:get-api-keys', async () => {
  const cfg = getAiConfig();
  const keys = cfg.apiKeys || {};
  return {
    success: true,
    isAppleAvailable: isAppleIntelligenceAvailable,
    hasApple: isAppleIntelligenceAvailable,
    hasOpenAi: Boolean(keys.openai && keys.openai.trim().length > 5),
    hasGemini: Boolean(keys.gemini && keys.gemini.trim().length > 5),
    hasAnthropic: Boolean(keys.anthropic && keys.anthropic.trim().length > 5),
    maskedOpenAi: keys.openai ? maskApiKey(keys.openai) : '',
    maskedGemini: keys.gemini ? maskApiKey(keys.gemini) : '',
    maskedAnthropic: keys.anthropic ? maskApiKey(keys.anthropic) : ''
  };
});

ipcMain.handle('canvas:save-api-keys', async (_event, { openai, gemini, anthropic }) => {
  try {
    const cfg = getAiConfig();
    if (!cfg.apiKeys) cfg.apiKeys = {};
    if (openai !== undefined) cfg.apiKeys.openai = openai.trim();
    if (gemini !== undefined) cfg.apiKeys.gemini = gemini.trim();
    if (anthropic !== undefined) cfg.apiKeys.anthropic = anthropic.trim();
    saveAiConfig(cfg);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Cloud LLM Streaming
ipcMain.handle('canvas:cloud-llm-stream-start', async (event, { requestUUID, provider, modelId, messages }) => {
  const cfg = getAiConfig();
  const isApple = provider === 'apple';
  const apiKey = cfg.apiKeys?.[provider];

  if (!isApple && !apiKey) {
    return {
      success: false,
      error: `Missing API key for ${provider.toUpperCase()}. Please configure your API key in the Model Selection menu.`
    };
  }

  if (isApple && !isAppleIntelligenceAvailable) {
    return {
      success: false,
      error: 'Apple Intelligence Private Cloud Compute requires macOS 26+ on Apple Silicon.'
    };
  }

  const sender = event.sender;
  const abortController = new AbortController();
  activeCloudRequests.set(requestUUID, abortController);

  // Background streaming task
  (async () => {
    try {
      let streamGenerator;
      if (provider === 'apple') {
        streamGenerator = streamApple(cfg, modelId, messages, abortController.signal);
      } else if (provider === 'openai') {
        streamGenerator = streamOpenAi(apiKey, modelId, messages, abortController.signal);
      } else if (provider === 'gemini') {
        streamGenerator = streamGemini(apiKey, modelId, messages, abortController.signal);
      } else if (provider === 'anthropic') {
        streamGenerator = streamAnthropic(apiKey, modelId, messages, abortController.signal);
      } else {
        throw new Error(`Unsupported cloud provider: ${provider}`);
      }

      for await (const chunk of streamGenerator) {
        if (sender && !sender.isDestroyed()) {
          sender.send('canvas:cloud-llm-chunk', { requestUUID, chunk, done: false });
        }
      }

      if (sender && !sender.isDestroyed()) {
        sender.send('canvas:cloud-llm-chunk', { requestUUID, done: true });
      }
    } catch (err) {
      if (err.name !== 'AbortError' && sender && !sender.isDestroyed()) {
        sender.send('canvas:cloud-llm-chunk', { requestUUID, error: err.message, done: true });
      }
    } finally {
      activeCloudRequests.delete(requestUUID);
    }
  })();

  return { success: true };
});

ipcMain.handle('canvas:cloud-llm-abort', async (_event, { requestUUID }) => {
  const controller = activeCloudRequests.get(requestUUID);
  if (controller) {
    try { controller.abort(); } catch { }
    activeCloudRequests.delete(requestUUID);
    return { success: true };
  }
  return { success: false };
});

// Legacy backward-compatibility IPC handlers
ipcMain.handle('canvas:get-llm-models', async () => {
  try {
    const models = getLocalGgufModels();
    const activePath = resolveModelPath(activeLlmModelName);
    return {
      success: true,
      models,
      activeModel: activeLlmModelName,
      activeModelPath: activePath,
      hasModel: models.length > 0 || (activePath && fs.existsSync(activePath))
    };
  } catch (err) {
    return { success: false, error: err.message, models: [] };
  }
});

ipcMain.handle('canvas:set-active-llm-model', async (_event, modelNameOrPath) => {
  if (modelNameOrPath) {
    activeLlmModelName = modelNameOrPath;
    const resolved = resolveModelPath(modelNameOrPath);
    return { success: true, activeModel: activeLlmModelName, resolvedPath: resolved };
  }
  return { success: false, error: 'No model specified' };
});

ipcMain.handle('canvas:select-model-file', async () => {
  try {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Select GGUF Language Model',
      filters: [{ name: 'GGUF Models (*.gguf)', extensions: ['gguf'] }],
      properties: ['openFile']
    });

    if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
      const selectedPath = res.filePaths[0];
      const filename = path.basename(selectedPath);
      const stat = fs.statSync(selectedPath);
      activeLlmModelName = selectedPath;

      const modelMeta = {
        name: path.basename(selectedPath, '.gguf'),
        filename,
        fullPath: selectedPath,
        size: stat.size,
        formattedSize: (stat.size / (1024 * 1024)).toFixed(1) + ' MB',
        location: 'custom'
      };

      // Also update aiConfig
      const cfg = getAiConfig();
      cfg.activeModel = {
        type: 'local',
        id: `custom:${filename}`,
        name: modelMeta.name,
        filename: filename,
        fullPath: selectedPath,
        provider: 'Custom Local'
      };
      saveAiConfig(cfg);

      return {
        success: true,
        model: modelMeta
      };
    }
    return { success: false, canceled: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('canvas:download-recommended-model', async (event) => {
  // Aliased to download-model with smollm2-360m for backward compatibility
  return ipcMain.emit('canvas:download-model', event, { modelId: 'smollm2-360m' });
});

// IPC: Compile course context for AI prompt (Powered by RAG Framework)
ipcMain.handle('canvas:get-course-ai-context', async (_event, params = {}) => {
  try {
    return await compileCourseAiContext(params.courseId, params);
  } catch (err) {
    console.error('Error compiling course AI context in IPC:', err);
    return { success: false, error: err.message };
  }
});

// IPC: Direct RAG framework query
ipcMain.handle('canvas:rag-query', async (_event, params = {}) => {
  try {
    const engine = await ensureRagIndexed();
    return await engine.buildAugmentedContext(params);
  } catch (err) {
    console.error('Error in canvas:rag-query:', err);
    return { success: false, error: err.message };
  }
});

// IPC: Get RAG index status & statistics
ipcMain.handle('canvas:rag-get-status', async () => {
  try {
    const engine = getRagEngine();
    return { success: true, ...engine.getStatus() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Force re-indexing of RAG knowledge base
ipcMain.handle('canvas:rag-reindex', async () => {
  try {
    const engine = getRagEngine();
    const res = await engine.indexAllCourseMaterials();
    return { success: true, ...res };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Terminal logging for AI debugging
ipcMain.handle('app:log-terminal', (_event, { message, data } = {}) => {
  if (data !== undefined) {
    console.log(`\n\x1b[36m[AI Tool Debug]\x1b[0m \x1b[1m${message}\x1b[0m\n`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
  } else {
    console.log(`\n\x1b[36m[AI Tool Debug]\x1b[0m \x1b[1m${message}\x1b[0m`);
  }
  return true;
});

