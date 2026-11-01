function initTheme() {
  const migrated = localStorage.getItem('canvas_theme_light_migrated_v1');
  if (!migrated) {
    localStorage.setItem('canvas_theme_light_migrated_v1', 'true');
    setTheme('light');
    return;
  }
  const saved = localStorage.getItem(STORAGE_KEYS.THEME);
  if (saved) {
    setTheme(saved);
  } else {
    setTheme('light');
  }
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  setTheme(cur === 'dark' ? 'light' : 'dark');
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
  if (themeIconSun && themeIconMoon) {
    if (theme === 'dark') {
      themeIconSun.classList.remove('hidden');
      themeIconMoon.classList.add('hidden');
    } else {
      themeIconSun.classList.add('hidden');
      themeIconMoon.classList.remove('hidden');
    }
  }
  const currentThemeLabel = document.getElementById('currentThemeLabel');
  const themeToggleText = document.getElementById('themeToggleText');
  if (currentThemeLabel) {
    currentThemeLabel.textContent = theme === 'dark' ? 'Dark Mode' : 'Light Mode';
  }
  if (themeToggleText) {
    themeToggleText.textContent = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
}

function setLoading(loading) {
  if (submitAuthBtn) submitAuthBtn.disabled = loading;
  if (loadDemoBtn) loadDemoBtn.disabled = loading;
  if (loadOfflineBtn) loadOfflineBtn.disabled = loading;
  if (loading) {
    if (authSpinner) authSpinner.classList.remove('hidden');
    const label = submitAuthBtn ? submitAuthBtn.querySelector('.btn-label') : null;
    if (label) label.textContent = 'Connecting to Canvas...';
  } else {
    if (authSpinner) authSpinner.classList.add('hidden');
    const label = submitAuthBtn ? submitAuthBtn.querySelector('.btn-label') : null;
    if (label) label.textContent = 'Connect';
  }
}

function showError(msg) {
  authErrorMsg.textContent = msg;
  authError.classList.remove('hidden');
}

function clearError() {
  authError.classList.add('hidden');
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    <span>${escapeHtml(message)}</span>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function getInitials(name) {
  if (!name) return 'CU';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hasValidFileExtension(filename) {
  if (!filename || typeof filename !== 'string') return false;
  return /\.([a-zA-Z0-9]{1,6})$/.test(filename.trim());
}

function ensureFilenameExtension(name, mimeType) {
  if (!name) return 'file.pdf';
  let cleanName = name.trim();
  // Strip trailing descriptors like (PDF), [PDF], etc.
  cleanName = cleanName.replace(/\s*[\(\[](pdf|docx|doc|pptx|ppt|xlsx|xls|png|jpg|jpeg|markdown|md|python|py|txt)[\)\]]\s*$/i, '');

  if (hasValidFileExtension(cleanName)) {
    return cleanName;
  }

  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('pdf')) return `${cleanName}.pdf`;
  if (mime.includes('png')) return `${cleanName}.png`;
  if (mime.includes('jpeg') || mime.includes('jpg')) return `${cleanName}.jpg`;
  if (mime.includes('markdown')) return `${cleanName}.md`;
  if (mime.includes('python')) return `${cleanName}.py`;
  if (mime.includes('javascript')) return `${cleanName}.js`;
  if (mime.includes('typescript')) return `${cleanName}.ts`;
  if (mime.includes('wordprocessingml') || mime.includes('docx')) return `${cleanName}.docx`;
  if (mime.includes('presentationml') || mime.includes('pptx')) return `${cleanName}.pptx`;
  if (mime.includes('text/plain')) return `${cleanName}.txt`;

  // Infer from original name hints
  const lower = (name || '').toLowerCase();
  if (lower.includes('(markdown)') || lower.includes('markdown') || lower.includes('(md)')) return `${cleanName}.md`;
  if (lower.includes('(python)') || lower.includes('(py)')) return `${cleanName}.py`;
  if (lower.includes('(png)')) return `${cleanName}.png`;
  if (lower.includes('(jpg)') || lower.includes('(jpeg)')) return `${cleanName}.jpg`;

  // Default for Canvas LMS course files (slides, readings, syllabus, book chapters, etc.): .pdf
  return `${cleanName}.pdf`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getCleanCourseCode(course) {
  if (!course) return '';
  const rawCode = (course.course_code || '').trim();
  const idStr = String(course.id || '').trim();

  if (!rawCode) return '';
  if (idStr && rawCode === idStr) return '';
  if (/^\d+$/.test(rawCode)) return '';
  if (/^(course|id)[\s_#]*\d+$/i.test(rawCode)) return '';

  return rawCode;
}

function renderCourseRoundedSquareHtml(color = '#6d3cd0', size = 12) {
  const safeColor = color || '#6d3cd0';
  return `<svg class="course-rounded-square" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${escapeHtml(safeColor)}" style="display:inline-block; vertical-align:middle; flex-shrink:0;">
    <rect x="2" y="2" width="20" height="20" rx="6" ry="6" />
  </svg>`;
}

function renderCourseLabelArrowHtml(color = '#6d3cd0', size = 15) {
  return renderCourseRoundedSquareHtml(color, size);
}

/**
 * Local Application-Managed Read/Unread Announcement Tracking
 */
function getReadAnnouncementIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.READ_ANNOUNCEMENTS);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveReadAnnouncementIds(set) {
  try {
    localStorage.setItem(STORAGE_KEYS.READ_ANNOUNCEMENTS, JSON.stringify(Array.from(set)));
  } catch { }
}

function isAnnouncementUnread(ann) {
  if (!ann || !ann.id) return false;
  const readSet = getReadAnnouncementIds();
  if (readSet.has(String(ann.id))) return false;
  return ann.read_state !== 'read';
}

function markAnnouncementAsRead(annId) {
  if (!annId) return;
  const readSet = getReadAnnouncementIds();
  readSet.add(String(annId));
  saveReadAnnouncementIds(readSet);

  if (appState.courseDetailsCache) {
    Object.values(appState.courseDetailsCache).forEach(details => {
      if (details && Array.isArray(details.announcements)) {
        const found = details.announcements.find(a => String(a.id) === String(annId));
        if (found) found.read_state = 'read';
      }
    });
  }
  if (appState.courseDetails && Array.isArray(appState.courseDetails.announcements)) {
    const found = appState.courseDetails.announcements.find(a => String(a.id) === String(annId));
    if (found) found.read_state = 'read';
  }

  updateAllAnnouncementsUI();
  if (typeof updateSidebarNavBadges === 'function') {
    updateSidebarNavBadges();
  }
}

function markAnnouncementAsUnread(annId) {
  if (!annId) return;
  const readSet = getReadAnnouncementIds();
  readSet.delete(String(annId));
  saveReadAnnouncementIds(readSet);

  if (appState.courseDetailsCache) {
    Object.values(appState.courseDetailsCache).forEach(details => {
      if (details && Array.isArray(details.announcements)) {
        const found = details.announcements.find(a => String(a.id) === String(annId));
        if (found) found.read_state = 'unread';
      }
    });
  }
  if (appState.courseDetails && Array.isArray(appState.courseDetails.announcements)) {
    const found = appState.courseDetails.announcements.find(a => String(a.id) === String(annId));
    if (found) found.read_state = 'unread';
  }

  updateAllAnnouncementsUI();
  if (typeof updateSidebarNavBadges === 'function') {
    updateSidebarNavBadges();
  }
}

function markAllAnnouncementsAsRead(announcementsList) {
  const readSet = getReadAnnouncementIds();
  const list = announcementsList || (typeof getAllCoursesAnnouncements === 'function' ? getAllCoursesAnnouncements() : []);
  list.forEach(a => {
    if (a && a.id) {
      readSet.add(String(a.id));
      a.read_state = 'read';
    }
  });

  if (appState.courseDetailsCache) {
    Object.values(appState.courseDetailsCache).forEach(details => {
      if (details && Array.isArray(details.announcements)) {
        details.announcements.forEach(a => {
          if (a && a.id) {
            readSet.add(String(a.id));
            a.read_state = 'read';
          }
        });
      }
    });
  }
  if (appState.courseDetails && Array.isArray(appState.courseDetails.announcements)) {
    appState.courseDetails.announcements.forEach(a => {
      if (a && a.id) {
        readSet.add(String(a.id));
        a.read_state = 'read';
      }
    });
  }

  saveReadAnnouncementIds(readSet);
  updateAllAnnouncementsUI();
  if (typeof updateSidebarNavBadges === 'function') {
    updateSidebarNavBadges();
  }
}

function updateAllAnnouncementsUI() {
  if (sidebarAnnouncementsBadge) {
    let unreadCount = 0;
    if (typeof getAllCoursesAnnouncements === 'function') {
      const all = getAllCoursesAnnouncements();
      unreadCount = all.filter(a => isAnnouncementUnread(a)).length;
    }
    if (unreadCount > 0) {
      sidebarAnnouncementsBadge.textContent = unreadCount;
      sidebarAnnouncementsBadge.classList.remove('hidden');
    } else {
      sidebarAnnouncementsBadge.classList.add('hidden');
    }
  }

  if (appState.activeView === 'home' && typeof renderHomeAnnouncementsWidget === 'function') {
    renderHomeAnnouncementsWidget();
  } else if (appState.activeView === 'announcements' && typeof renderDedicatedAnnouncementsPage === 'function') {
    renderDedicatedAnnouncementsPage();
  } else if (appState.activeView === 'course' && appState.courseDetails?.announcements && typeof renderAnnouncementsTab === 'function') {
    renderAnnouncementsTab(appState.courseDetails.announcements);
  }
}

/**
 * Sanitize untrusted HTML from Canvas (announcements, discussions, syllabus, module pages)
 * to prevent XSS attacks while preserving formatting.
 */
function sanitizeHtml(dirty) {
  if (!dirty || typeof dirty !== 'string') return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(dirty, 'text/html');

  const ALLOWED_TAGS = new Set([
    'a', 'b', 'blockquote', 'br', 'code', 'dd', 'del', 'div', 'dl', 'dt', 'em',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'li', 'ol',
    'p', 'pre', 'q', 's', 'small', 'span', 'strong', 'sub', 'sup', 'table',
    'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'mark', 'figure', 'figcaption'
  ]);

  const ALLOWED_ATTRS = new Set([
    'href', 'src', 'alt', 'title', 'class', 'style', 'width', 'height', 'align', 'colspan', 'rowspan', 'target'
  ]);

  const SAFE_URL_PATTERN = /^(?:(?:https?|mailto|tel):|\/|#)/i;

  function cleanNode(node) {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tagName = child.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tagName)) {
          if (['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'meta', 'link', 'base'].includes(tagName)) {
            child.remove();
          } else {
            while (child.firstChild) {
              node.insertBefore(child.firstChild, child);
            }
            child.remove();
          }
          continue;
        }

        const attrs = Array.from(child.attributes);
        for (const attr of attrs) {
          const attrName = attr.name.toLowerCase();
          const attrValue = attr.value;

          if (attrName.startsWith('on')) {
            child.removeAttribute(attr.name);
            continue;
          }

          if (!ALLOWED_ATTRS.has(attrName)) {
            child.removeAttribute(attr.name);
            continue;
          }

          if (['href', 'src'].includes(attrName)) {
            const cleanVal = attrValue.trim().toLowerCase();
            if (cleanVal.startsWith('javascript:') || cleanVal.startsWith('data:') || cleanVal.startsWith('vbscript:')) {
              child.removeAttribute(attr.name);
              continue;
            }
            if (!SAFE_URL_PATTERN.test(cleanVal)) {
              child.removeAttribute(attr.name);
              continue;
            }
          }

          if (tagName === 'a') {
            child.setAttribute('target', '_blank');
            child.setAttribute('rel', 'noopener noreferrer');
          }
        }

        cleanNode(child);
      } else if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
      }
    }
  }

  cleanNode(doc.body);
  return doc.body.innerHTML;
}

function stripHtmlToText(html) {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body.textContent || '').trim();
  } catch {
    return String(html).replace(/<[^>]*>/g, '').trim();
  }
}

window.sanitizeHtml = sanitizeHtml;
window.stripHtmlToText = stripHtmlToText;



