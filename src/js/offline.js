function isNetworkError(errStr) {
  if (!errStr || typeof errStr !== 'string') return false;
  const s = errStr.toLowerCase();
  return s.includes('network') || s.includes('fetch failed') || s.includes('enotfound') ||
    s.includes('econnrefused') || s.includes('reachable') || s.includes('timeout') ||
    s.includes('offline') || s.includes('failed to fetch');
}

function showOfflineBanner(show) {
  if (offlineNotificationBar) {
    offlineNotificationBar.classList.add('hidden');
  }
}

async function updateOfflineSettingsStats() {
  const statCourses = document.getElementById('statCachedCourses');
  const statFiles = document.getElementById('statDownloadedFiles');
  const statPages = document.getElementById('statCachedPages');
  const statSync = document.getElementById('statSyncStatus');
  const toggleBtnText = document.getElementById('btnToggleOfflineText');

  if (toggleBtnText) {
    toggleBtnText.textContent = appState.isOffline ? 'Go Online / Reconnect' : 'Switch to Offline Mode';
  }

  if (window.canvasDesktop?.getOfflineStatus) {
    try {
      const status = await window.canvasDesktop.getOfflineStatus();
      if (status && status.success) {
        if (statCourses) statCourses.textContent = String(status.detailedCoursesCount || status.cachedCoursesCount || (appState.courses?.length || 0));
        if (statFiles) statFiles.textContent = String(status.localFilesCount || 0);
        if (statPages) statPages.textContent = String(status.cachedPagesCount || 0);
        if (statSync) statSync.textContent = appState.isOffline ? 'Offline Active' : 'Online & Syncing';
        return;
      }
    } catch { }
  }

  if (statCourses) statCourses.textContent = String(appState.courses?.length || 0);
  if (statFiles) statFiles.textContent = 'Ready';
  if (statPages) statPages.textContent = 'Ready';
  if (statSync) statSync.textContent = appState.isOffline ? 'Offline Active' : 'Ready';
}
let syncInProgress = false;
async function performBackgroundSync(domain = appState.currentDomain, token = appState.currentToken) {
  if (syncInProgress) return;
  if (!navigator.onLine || appState.isOffline || appState.isDemo) return;
  if (!token) return;

  syncInProgress = true;
  try {
    const syncFn = window.canvasDesktop?.syncAllLocalContent || window.canvasDesktop?.precacheAll;
    if (syncFn) {
      await syncFn({
        domain,
        token,
        courses: appState.courses
      });
      updateOfflineSettingsStats();
    }
  } catch (e) {
    console.warn('Background offline sync note:', e.message);
  } finally {
    syncInProgress = false;
  }
}

async function enterOfflineMode({ useDemoFallback = true } = {}) {
  appState.isOffline = true;
  hideMissingCredentialsModal();
  clearError();
  if (appLoadingScreen) appLoadingScreen.classList.add('hidden');

  let cachedProfile = null;
  let cachedCourses = [];
  if (window.canvasDesktop?.getUserProfile) {
    try {
      const res = await window.canvasDesktop.getUserProfile({
        domain: appState.currentDomain || localStorage.getItem(STORAGE_KEYS.DOMAIN) || '',
        token: ''
      });
      if (res && res.success && res.data) {
        cachedProfile = res.data;
      }
    } catch { }
  }
  if (window.canvasDesktop?.getCourses) {
    try {
      const res = await window.canvasDesktop.getCourses({
        domain: appState.currentDomain || localStorage.getItem(STORAGE_KEYS.DOMAIN) || '',
        token: '',
        preferCache: true
      });
      if (res && res.success && res.data?.courses) {
        cachedCourses = res.data.courses;
      }
    } catch { }
  }

  if (cachedCourses && cachedCourses.length > 0) {
    appState.isDemo = false;
    appState.courses = cachedCourses;
    appState.profileData = cachedProfile || { profile: { name: 'Canvas Student' } };
    renderProfile(appState.profileData, false);
    renderCourses(appState.courses);
  } else {
    // If no real account was ever saved, provide full rich offline demo dataset
    appState.isDemo = true;
    appState.profileData = DEMO_DATA;
    appState.courses = DEMO_DATA.courses;
    renderProfile(DEMO_DATA, true);
    renderCourses(DEMO_DATA.courses);
    if (window.canvasDesktop?.ensureDemoFiles) {
      window.canvasDesktop.ensureDemoFiles().catch(() => { });
    }
  }

  initTabs();
  switchView('home');
  updateStatusPill('Offline Mode', 'offline');
  showOfflineBanner(true);
  updateOfflineSettingsStats();
  showToast('Entered Offline Mode. All saved files and courses are ready.');
}

async function reconnectCanvas() {
  const domain = canvasDomainInput.value.trim() || appState.currentDomain;
  const token = accessTokenInput.value.trim() || appState.currentToken;
  if (!token) {
    switchView('auth');
    showToast('Enter your Canvas Access Token to connect.');
    return;
  }
  showToast('Connecting to Canvas LMS...');
  await performAuthentication(domain, token, true);
}

function toggleOfflineMode() {
  if (appState.isOffline) {
    reconnectCanvas();
  } else {
    enterOfflineMode();
  }
}

async function precacheAllForOffline() {
  if (appState.isOffline || appState.isDemo) {
    showToast('Currently offline. Reconnect to sync fresh course updates.');
    return;
  }
  if (!appState.currentToken) {
    showToast('Connect to a Canvas account to save courses locally.');
    return;
  }
  showToast('Saving all files, pages, and course content locally...');
  const syncBtn = document.getElementById('btnPrecacheAllCourses');
  if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.innerHTML = `
      <span class="codicon codicon-loading codicon-modifier-spin"></span>
      <span>Saving All Content Locally...</span>
    `;
  }
  try {
    const syncFn = window.canvasDesktop?.syncAllLocalContent || window.canvasDesktop?.precacheAll;
    const res = await syncFn({
      domain: appState.currentDomain,
      token: appState.currentToken,
      courses: appState.courses
    });
    if (res && res.success) {
      showToast(`Saved all content locally! (${res.coursesCount || res.count} courses, ${res.totalFilesDownloaded || 0} files, ${res.totalPagesCached || 0} pages)`);
      updateOfflineSettingsStats();
    } else {
      showToast('Sync note: ' + (res?.error || 'Completed'));
    }
  } catch (err) {
    showToast('Sync error: ' + err.message);
  } finally {
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.innerHTML = `
        <span class="codicon codicon-cloud-download"></span>
        <span>Save All Content Locally Now</span>
      `;
    }
  }
}

function showMissingCredentialsModal({ missingDomain = false, missingToken = false } = {}) {
  if (!credentialsModal) return;

  const titleEl = credentialsModalTitle;
  const descEl = credentialsModalDesc;
  const badgesEl = credentialsMissingBadges;
  const subtitleEl = document.getElementById('credentialsModalSubtitle');

  if (titleEl) {
    if (missingDomain && missingToken) {
      titleEl.textContent = 'Connect Canvas Account';
    } else if (missingDomain) {
      titleEl.textContent = 'Missing Instance Host';
    } else {
      titleEl.textContent = 'Missing Access Token';
    }
  }

  if (subtitleEl) {
    subtitleEl.textContent = 'Connect your Canvas instance, or continue browsing offline';
  }

  if (descEl) {
    if (missingDomain && missingToken) {
      descEl.innerHTML = 'Welcome to <strong>Atelier</strong>! Provide your <strong>Canvas Instance Host</strong> and <strong>Access Token</strong> to connect live, or choose <strong>Continue Offline</strong> to access saved content.';
    } else if (missingDomain) {
      descEl.innerHTML = 'A Canvas Access Token is present, but no <strong>Canvas Instance Host</strong> (e.g. <code>canvas.instructure.com</code>) is specified.';
    } else {
      descEl.innerHTML = 'A Canvas Instance Host is selected, but no <strong>Access Token</strong> was found. Please paste your Canvas Personal Access Token to continue.';
    }
  }

  if (badgesEl) {
    badgesEl.innerHTML = `
      <div class="credentials-badge-item ${missingDomain ? 'missing' : 'valid'}">
        <span class="badge-dot"></span>
        <span class="credentials-badge-title">Instance Host</span>
        <span class="credentials-badge-status">${missingDomain ? 'Not Configured' : 'Configured'}</span>
      </div>
      <div class="credentials-badge-item ${missingToken ? 'missing' : 'valid'}">
        <span class="badge-dot"></span>
        <span class="credentials-badge-title">Access Token</span>
        <span class="credentials-badge-status">${missingToken ? 'Missing Token' : 'Provided'}</span>
      </div>
    `;
  }

  // Prepopulate modal inputs from current state
  if (modalDomainInput) {
    const currentDomainVal = canvasDomainInput.value.trim() || localStorage.getItem(STORAGE_KEYS.DOMAIN) || 'canvas.instructure.com';
    modalDomainInput.value = currentDomainVal;
  }
  if (modalTokenInput) {
    const currentTokenVal = accessTokenInput.value.trim() || localStorage.getItem(STORAGE_KEYS.TOKEN) || '';
    modalTokenInput.value = currentTokenVal;
  }

  credentialsModal.classList.remove('hidden');
}

function hideMissingCredentialsModal() {
  if (credentialsModal) {
    credentialsModal.classList.add('hidden');
  }
}

