/**
 * Render Grades Tab
 */
function renderGradesTab(course, assignments) {
  const enrollment = course.enrollments?.[0];
  const score = enrollment?.computed_current_score ?? 96.4;
  const letter = enrollment?.computed_current_grade ?? 'A';

  gradeBigPct.textContent = `${score}%`;
  gradeBigLetter.textContent = letter;

  // Compute points summary
  let totalPossible = 0;
  let totalEarned = 0;
  let gradedCount = 0;

  assignments.forEach(a => {
    if (a.submission?.score !== null && a.submission?.score !== undefined) {
      gradedCount++;
      totalEarned += Number(a.submission.score);
      totalPossible += Number(a.points_possible || 0);
    }
  });

  gradedItemsCountVal.textContent = `${gradedCount} / ${assignments.length}`;
  totalPointsEarnedVal.textContent = `${totalEarned} / ${totalPossible} pts`;

  // Itemized Table Rows
  gradesTableBody.innerHTML = '';
  if (assignments.length === 0) {
    gradesTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--color-text-muted);">No assignments listed in gradebook.</td></tr>';
    return;
  }

  assignments.forEach(a => {
    const row = document.createElement('tr');
    const dueStr = a.due_at
      ? new Date(a.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '-';

    const sub = a.submission;
    let statusText = 'Not Submitted';
    let statusPillClass = 'neutral';
    let scoreText = '-';
    let pctText = '-';

    if (sub?.workflow_state === 'graded') {
      statusText = 'Graded';
      statusPillClass = 'success';
      scoreText = `${sub.score}`;
      if (a.points_possible > 0 && sub.score !== null) {
        pctText = `${Math.round((sub.score / a.points_possible) * 100)}%`;
      }
    } else if (sub?.workflow_state === 'submitted') {
      statusText = 'Submitted';
      statusPillClass = 'warning';
    }

    row.innerHTML = `
      <td><strong>${escapeHtml(a.name)}</strong></td>
      <td>${dueStr}</td>
      <td><span class="grade-badge ${statusPillClass}">${statusText}</span></td>
      <td class="score-cell">${scoreText}</td>
      <td class="score-cell">${a.points_possible || 0}</td>
      <td class="score-cell">${pctText}</td>
    `;

    row.style.cursor = 'pointer';
    row.title = 'Click to open assignment in sidepanel';
    row.addEventListener('click', () => {
      handleAssignmentPreview(a);
    });

    gradesTableBody.appendChild(row);
  });
}

function getStudentFirstName(profileData) {
  const data = profileData || appState.profileData || {};
  const p = data.profile || {};
  const self = data.self || {};

  if (p.first_name && typeof p.first_name === 'string' && p.first_name.trim()) {
    return p.first_name.trim();
  }
  const rawName = p.short_name || p.name || self.name || '';
  if (rawName && typeof rawName === 'string') {
    const first = rawName.trim().split(/\s+/)[0];
    if (first && !first.startsWith('http') && !first.includes('.')) {
      return first;
    }
  }
  return 'Student';
}

function getTimeOfDayGreeting() {
  const hr = new Date().getHours();
  if (hr < 12) return 'Good morning';
  if (hr < 18) return 'Good afternoon';
  return 'Good evening';
}

function updateHomeGreeting(data) {
  const el = document.getElementById('homeGreetingName');
  if (el) {
    const firstName = getStudentFirstName(data);
    el.textContent = `${getTimeOfDayGreeting()}, ${firstName || 'Student'}`;
  }
}

/**
 * Render Profile in Settings View
 */
function renderProfile(data, isDemo = false) {
  try {
    appState.profileData = data;
    const p = data.profile || {};
    const self = data.self || {};
    const meta = data.meta || {};

    const userAvatarUrl = p.avatar_url || self.avatar_url || '';

    const DEFAULT_USER_AVATAR_SVG = `<svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

    if (homeGreetingName) {
      const firstName = getStudentFirstName(data);
      homeGreetingName.textContent = `${getTimeOfDayGreeting()}, ${firstName || 'Student'}`;
    }
    if (homeUserAvatar && homeAvatarFallback) {
      if (userAvatarUrl) {
        homeUserAvatar.src = userAvatarUrl;
        homeUserAvatar.classList.remove('hidden');
        homeAvatarFallback.classList.add('hidden');
      } else {
        homeUserAvatar.classList.add('hidden');
        homeAvatarFallback.classList.remove('hidden');
        homeAvatarFallback.innerHTML = DEFAULT_USER_AVATAR_SVG;
      }
    }

    if (userAvatar && avatarFallback) {
      if (userAvatarUrl) {
        userAvatar.src = userAvatarUrl;
        userAvatar.classList.remove('hidden');
        avatarFallback.classList.add('hidden');
        userAvatar.onerror = () => {
          userAvatar.classList.add('hidden');
          avatarFallback.classList.remove('hidden');
          avatarFallback.innerHTML = DEFAULT_USER_AVATAR_SVG;
        };
      } else {
        userAvatar.classList.add('hidden');
        avatarFallback.classList.remove('hidden');
        avatarFallback.innerHTML = DEFAULT_USER_AVATAR_SVG;
      }
    }

    if (userName) userName.textContent = p.name || 'Anonymous User';
    if (userHandle) userHandle.textContent = p.login_id ? `@${p.login_id}` : (p.id ? `User ID #${p.id}` : '@user');
    if (userBio) userBio.textContent = p.bio || (p.title ? `${p.title}` : 'No biography provided in Canvas profile.');
    if (userRoleBadge) userRoleBadge.textContent = p.title || (isDemo ? 'Scholar / Student' : 'Canvas Member');

  // Update Sidebar Profile Card
  if (sidebarUserName) {
    sidebarUserName.textContent = p.short_name || p.name || 'Canvas User';
  }
  if (sidebarUserRole) {
    sidebarUserRole.textContent = p.title || (isDemo ? 'Student' : (meta?.instanceUrl ? new URL(meta.instanceUrl).hostname : 'Connected'));
  }
  const studentEl = sidebarUserStudentId || sidebarUserInstitution;
  if (studentEl) {
    let studentId = p.student_id || self?.student_id || p.sis_user_id || self?.sis_user_id || p.integration_id || self?.integration_id || p.login_id || self?.login_id || (p.id ? String(p.id) : '');
    if (studentId) {
      let idStr = String(studentId).trim();
      if (idStr.includes('@')) {
        idStr = idStr.split('@')[0];
      }
      studentEl.textContent = idStr;
      studentEl.title = `Student ID: ${idStr}`;
    } else {
      studentEl.textContent = isDemo ? 'SIS-STU-884102' : 'Student';
      studentEl.title = 'Student ID';
    }
  }
  if (sidebarUserAvatar && sidebarAvatarFallback) {
    if (userAvatarUrl) {
      sidebarUserAvatar.src = userAvatarUrl;
      sidebarUserAvatar.classList.remove('hidden');
      sidebarAvatarFallback.classList.add('hidden');
      sidebarUserAvatar.onerror = () => {
        sidebarUserAvatar.classList.add('hidden');
        sidebarAvatarFallback.classList.remove('hidden');
        sidebarAvatarFallback.innerHTML = DEFAULT_USER_AVATAR_SVG;
      };
    } else {
      sidebarUserAvatar.classList.add('hidden');
      sidebarAvatarFallback.classList.remove('hidden');
      sidebarAvatarFallback.innerHTML = DEFAULT_USER_AVATAR_SVG;
    }
  }

  const email = p.primary_email || self.email || 'No public email';
  userEmail.textContent = email;

  const tz = p.time_zone || 'UTC';
  if (userTimezone) userTimezone.textContent = tz;
  if (userLocalTime) {
    try {
      const timeFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      userLocalTime.textContent = timeFormatter.format(new Date());
    } catch {
      userLocalTime.textContent = '';
    }
  }

  if (userLocale) userLocale.textContent = p.locale || p.effective_locale || 'en (Default)';

  // Identity Rows (if present)
  if (identityProps) {
    identityProps.innerHTML = '';
    const identityList = [
      { key: 'Canvas User ID', val: p.id || 'N/A' },
      { key: 'Full Name', val: p.name || 'N/A' },
      { key: 'Short / Display Name', val: p.short_name || 'N/A' },
      { key: 'Sortable Name', val: p.sortable_name || 'N/A' },
      { key: 'Login ID', val: p.login_id || self.login_id || 'N/A' },
      { key: 'SIS User ID', val: p.sis_user_id || self.sis_user_id || 'None' },
      { key: 'Integration ID', val: p.integration_id || self.integration_id || 'None' },
      { key: 'LTI User ID', val: p.lti_user_id || 'None' }
    ];

    identityList.forEach(item => {
      const row = document.createElement('div');
      row.className = 'property-row';
      row.innerHTML = `
        <span class="prop-key">${escapeHtml(item.key)}</span>
        <div class="prop-val-wrap">
          <span class="prop-val">${escapeHtml(String(item.val))}</span>
        </div>
      `;
      identityProps.appendChild(row);
    });
  }

  // System Rows (if present)
  if (systemProps) {
    systemProps.innerHTML = '';
    const systemList = [
      { key: 'Instance Host', val: meta.instanceUrl || 'https://canvas.instructure.com' },
      { key: 'User Time Zone', val: p.time_zone || 'UTC' },
      { key: 'Locale Preference', val: p.locale || 'Standard' },
      { key: 'Effective Locale', val: p.effective_locale || 'Standard' },
      { key: 'Profile Fetched At', val: new Date(meta.fetchedAt || Date.now()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) },
      { key: 'API Rate Limit Remaining', val: meta.rateLimitRemaining || '700.0' },
      { key: 'Request Cost', val: meta.rateLimitCost || '0.01' }
    ];

    systemList.forEach(item => {
      const row = document.createElement('div');
      row.className = 'property-row';
      row.innerHTML = `
        <span class="prop-key">${escapeHtml(item.key)}</span>
        <div class="prop-val-wrap">
          <span class="prop-val">${escapeHtml(String(item.val))}</span>
        </div>
      `;
      systemProps.appendChild(row);
    });
  }

  // Calendar Feed (if present)
  if (icsFeedInput) {
    const icsUrl = p.calendar?.ics;
    if (icsUrl) {
      icsFeedInput.value = icsUrl;
      if (copyIcsBtn) copyIcsBtn.disabled = false;
      if (openIcsBtn) openIcsBtn.disabled = false;
    } else {
      icsFeedInput.value = 'No calendar subscription feed linked to this account.';
      if (copyIcsBtn) copyIcsBtn.disabled = true;
      if (openIcsBtn) openIcsBtn.disabled = true;
    }
  }

  // Print raw JSON (if present)
  appState.rawJsonString = JSON.stringify(data, null, 2);
  if (rawJsonBlock) {
    displaySyntaxHighlightedJson(appState.rawJsonString);
  }
  if (typeof renderSettingsCoursesCardList === 'function') {
    renderSettingsCoursesCardList();
  }
  } catch (err) {
    console.error('Error rendering profile:', err);
  }
}

/**
 * Filter JSON display
 */
function filterJsonDisplay(query) {
  if (!appState.profileData) return;
  if (!query) {
    displaySyntaxHighlightedJson(appState.rawJsonString);
    return;
  }

  const filtered = {};
  const searchObj = (src, dest) => {
    for (const [k, v] of Object.entries(src)) {
      if (k.toLowerCase().includes(query) || String(v).toLowerCase().includes(query)) {
        dest[k] = v;
      } else if (typeof v === 'object' && v !== null) {
        const sub = {};
        searchObj(v, sub);
        if (Object.keys(sub).length > 0) dest[k] = sub;
      }
    }
  };

  searchObj(appState.profileData, filtered);
  const filteredStr = JSON.stringify(filtered, null, 2);
  displaySyntaxHighlightedJson(filteredStr);
}

function displaySyntaxHighlightedJson(jsonStr) {
  rawJsonBlock.innerHTML = syntaxHighlight(jsonStr);
}

function syntaxHighlight(json) {
  if (!json) return '';
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
    let cls = 'json-number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'json-key';
      } else {
        cls = 'json-string';
      }
    } else if (/true|false/.test(match)) {
      cls = 'json-boolean';
    } else if (/null/.test(match)) {
      cls = 'json-null';
    }
    return '<span class="' + cls + '">' + match + '</span>';
  });
}

function disconnectAccount() {
  appState.profileData = null;
  appState.courses = [];
  appState.activeCourse = null;
  appState.rawJsonString = '';
  appState.tabs = [];
  appState.activeTabId = null;
  appState.currentToken = '';
  appState.isDemo = false;
  appState.isOffline = false;
  renderTabBar();
  localStorage.removeItem(STORAGE_KEYS.TOKEN);

  if (sidebarUserName) sidebarUserName.textContent = 'Canvas User';
  if (sidebarUserRole) sidebarUserRole.textContent = 'Student';
  const studentEl = sidebarUserStudentId || sidebarUserInstitution;
  if (studentEl) {
    studentEl.textContent = 'Student ID';
    studentEl.title = 'Student ID';
  }
  if (sidebarUserAvatar) {
    sidebarUserAvatar.src = '';
    sidebarUserAvatar.classList.add('hidden');
  }
  if (sidebarAvatarFallback) {
    sidebarAvatarFallback.innerHTML = `<svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
    sidebarAvatarFallback.classList.remove('hidden');
  }

  switchView('auth');
  showToast('Disconnected from Canvas');
}

function updateStatusPill(text, mode = 'normal') {
  const connectionStatus = document.getElementById('connectionStatus');
  if (!connectionStatus) return;

  const isOfflineMode = mode === 'offline' || appState.isOffline;
  if (isOfflineMode) {
    connectionStatus.className = 'connection-status-pill offline';
    const statusText = connectionStatus.querySelector('.status-text');
    if (statusText) statusText.textContent = 'Offline';
    connectionStatus.classList.remove('hidden');
  } else {
    // Only display the yellow 'Offline' label in the top right corner; hide when connected or normal
    connectionStatus.classList.add('hidden');
  }
}

