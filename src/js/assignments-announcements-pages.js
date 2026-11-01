/**
 * Dedicated Assignments & Announcements Pages Implementation
 * Comprehensive tracking across all enrolled courses
 */

const assignmentsPageState = {
  search: '',
  courseId: 'all',
  status: 'upcoming',
  sortBy: 'due-asc',
  initialized: false
};

const announcementsPageState = {
  search: '',
  courseId: 'all',
  filter: 'all',
  initialized: false
};

/**
 * Format relative deadline string
 */
function formatAssignmentDueRelative(dueAt) {
  if (!dueAt) return { label: 'No due date', statusClass: 'status-none', isPast: false };
  const dueDate = new Date(dueAt);
  if (isNaN(dueDate.getTime())) return { label: 'No due date', statusClass: 'status-none', isPast: false };

  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const timeFormatted = dueDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateFormatted = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (diffMs < 0) {
    // Past due
    const pastDays = Math.abs(diffDays);
    const label = pastDays === 0 ? `Past due today (${timeFormatted})` : `Past due ${pastDays}d ago (${dateFormatted})`;
    return { label, statusClass: 'status-overdue', isPast: true };
  } else if (diffHours <= 24) {
    const label = `Due today at ${timeFormatted}`;
    return { label, statusClass: 'status-urgent', isPast: false };
  } else if (diffDays === 1) {
    const label = `Due tomorrow at ${timeFormatted}`;
    return { label, statusClass: 'status-urgent', isPast: false };
  } else if (diffDays <= 7) {
    const label = `Due in ${diffDays} days (${dueDate.toLocaleDateString('en-US', { weekday: 'short' })} ${timeFormatted})`;
    return { label, statusClass: 'status-upcoming', isPast: false };
  } else {
    const label = `Due ${dateFormatted} at ${timeFormatted}`;
    return { label, statusClass: 'status-normal', isPast: false };
  }
}

/**
 * Populate Course Select Dropdown
 */
function populateCourseDropdown(selectEl, currentVal = 'all') {
  if (!selectEl) return;
  const courses = appState.courses || [];
  const prevVal = currentVal || selectEl.value || 'all';

  selectEl.innerHTML = '<option value="all">All Courses</option>';
  courses.forEach(course => {
    const title = getCleanCourseTitle(course);
    const opt = document.createElement('option');
    opt.value = String(course.id);
    opt.textContent = title;
    if (String(course.id) === String(prevVal)) {
      opt.selected = true;
    }
    selectEl.appendChild(opt);
  });
}

/**
 * Initialize Assignments Page Controls
 */
function initAssignmentsPageControls() {
  if (assignmentsPageState.initialized) return;
  assignmentsPageState.initialized = true;

  if (assignmentsPageSearchInput) {
    assignmentsPageSearchInput.addEventListener('input', (e) => {
      assignmentsPageState.search = e.target.value.trim().toLowerCase();
      renderDedicatedAssignmentsPage();
    });
  }

  if (assignmentsPageCourseSelect) {
    assignmentsPageCourseSelect.addEventListener('change', (e) => {
      assignmentsPageState.courseId = e.target.value;
      renderDedicatedAssignmentsPage();
    });
  }

  if (assignmentsPageSortSelect) {
    assignmentsPageSortSelect.addEventListener('change', (e) => {
      assignmentsPageState.sortBy = e.target.value;
      renderDedicatedAssignmentsPage();
    });
  }

  // Status Filter Pills
  const pills = assignmentsPageSection?.querySelectorAll('.dedicated-pills-row .dedicated-pill-btn');
  if (pills) {
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        assignmentsPageState.status = pill.getAttribute('data-status') || 'upcoming';
        renderDedicatedAssignmentsPage();
      });
    });
  }
}

/**
 * Classify an assignment into 'upcoming' | 'past-due' | 'completed'
 */
function classifyAssignmentStatus(a, now = Date.now()) {
  const wf = a.submission?.workflow_state;
  const isGraded = wf === 'graded';
  const isSubmitted = wf === 'submitted' || Boolean(a.submission?.submitted_at);
  const rawDue = a.due_at ? new Date(a.due_at).getTime() : null;
  const dueTime = rawDue !== null && !isNaN(rawDue) ? rawDue : null;
  const rawLock = a.lock_at ? new Date(a.lock_at).getTime() : null;
  const lockTime = rawLock !== null && !isNaN(rawLock) ? rawLock : null;

  if (isGraded || isSubmitted) {
    return 'completed';
  }
  if ((dueTime !== null && dueTime < now) || (dueTime === null && lockTime !== null && lockTime < now) || Boolean(a.submission?.missing)) {
    return 'past-due';
  }
  return 'upcoming';
}

/**
 * Render Dedicated Assignments Page
 */
function renderDedicatedAssignmentsPage() {
  initAssignmentsPageControls();
  populateCourseDropdown(assignmentsPageCourseSelect, assignmentsPageState.courseId);

  const allAssignments = getAllCoursesAssignments();
  const now = new Date().getTime();

  if (!['upcoming', 'past-due', 'completed'].includes(assignmentsPageState.status)) {
    assignmentsPageState.status = 'upcoming';
  }

  // Compute category counts
  let countUpcoming = 0;
  let countPastDue = 0;
  let countCompleted = 0;

  allAssignments.forEach(a => {
    const bucket = classifyAssignmentStatus(a, now);
    if (bucket === 'completed') {
      countCompleted++;
    } else if (bucket === 'past-due') {
      countPastDue++;
    } else {
      countUpcoming++;
    }
  });

  // Update Badge Counts
  const countUpcomingEl = document.getElementById('assignPillCountUpcoming');
  const countPastDueEl = document.getElementById('assignPillCountPastDue');
  const countCompletedEl = document.getElementById('assignPillCountCompleted');

  if (countUpcomingEl) countUpcomingEl.textContent = countUpcoming;
  if (countPastDueEl) countPastDueEl.textContent = countPastDue;
  if (countCompletedEl) countCompletedEl.textContent = countCompleted;

  if (assignmentsPageCountBadge) {
    assignmentsPageCountBadge.textContent = `${allAssignments.length} total`;
  }

  // Update Sidebar Badge
  if (sidebarAssignmentsBadge) {
    if (countUpcoming > 0) {
      sidebarAssignmentsBadge.textContent = countUpcoming;
      sidebarAssignmentsBadge.classList.remove('hidden');
    } else {
      sidebarAssignmentsBadge.classList.add('hidden');
    }
  }

  // Filter List
  const filtered = allAssignments.filter(a => {
    // Course filter
    if (assignmentsPageState.courseId !== 'all') {
      if (String(a.course?.id) !== String(assignmentsPageState.courseId)) {
        return false;
      }
    }

    // Status filter
    if (classifyAssignmentStatus(a, now) !== assignmentsPageState.status) {
      return false;
    }

    // Search filter
    if (assignmentsPageState.search) {
      const q = assignmentsPageState.search;
      const name = (a.name || '').toLowerCase();
      const courseTitle = (a.courseTitle || '').toLowerCase();
      if (!name.includes(q) && !courseTitle.includes(q)) {
        return false;
      }
    }

    return true;
  });

  // Sort List
  filtered.sort((a, b) => {
    const timeA = a.due_at ? new Date(a.due_at).getTime() : null;
    const timeB = b.due_at ? new Date(b.due_at).getTime() : null;

    if (assignmentsPageState.sortBy === 'due-asc') {
      if (timeA === null) return 1;
      if (timeB === null) return -1;
      return timeA - timeB;
    } else if (assignmentsPageState.sortBy === 'due-desc') {
      if (timeA === null) return 1;
      if (timeB === null) return -1;
      return timeB - timeA;
    } else if (assignmentsPageState.sortBy === 'course') {
      return (a.courseTitle || '').localeCompare(b.courseTitle || '');
    } else if (assignmentsPageState.sortBy === 'points') {
      return (b.points_possible || 0) - (a.points_possible || 0);
    }
    return 0;
  });

  // Render Cards List
  if (!assignmentsPageGrid) return;
  assignmentsPageGrid.innerHTML = '';

  if (filtered.length === 0) {
    assignmentsPageGrid.innerHTML = `
      <div class="empty-tab-state" style="padding: 48px 16px;">
        <div class="empty-icon-wrap" style="margin: 0 auto 14px auto;">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M9 11l3 3L22 4"></path>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
          </svg>
        </div>
        <h3 style="font-size: 15px; font-weight: 600; color: var(--color-text-primary); margin-bottom: 6px;">No assignments found</h3>
        <p style="font-size: 13px; color: var(--color-text-secondary); max-width: 380px; margin: 0 auto 16px auto;">No assignments matched your current filters or search term.</p>
        <button type="button" class="secondary-button" id="resetAssignmentsFiltersBtn">Clear Filters</button>
      </div>
    `;

    const resetBtn = document.getElementById('resetAssignmentsFiltersBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        assignmentsPageState.search = '';
        assignmentsPageState.courseId = 'all';
        assignmentsPageState.status = 'upcoming';
        if (assignmentsPageSearchInput) assignmentsPageSearchInput.value = '';
        if (assignmentsPageCourseSelect) assignmentsPageCourseSelect.value = 'all';
        const pills = assignmentsPageSection?.querySelectorAll('.dedicated-pills-row .dedicated-pill-btn');
        pills?.forEach(p => {
          if (p.getAttribute('data-status') === 'upcoming') p.classList.add('active');
          else p.classList.remove('active');
        });
        renderDedicatedAssignmentsPage();
      });
    }
    return;
  }

  filtered.forEach((assign, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'home-sub-assign-item assignment-row-card';
    if (appState.activeFile?.id == assign.id && appState.activeFile?.is_assignment) {
      itemEl.classList.add('active');
    }
    itemEl.setAttribute('data-assignment-id', assign.id);

    const courseTitle = assign.courseTitle || (assign.course ? getCleanCourseTitle(assign.course) : 'Course');
    const color = assign.courseColor || 'var(--color-brand-primary)';

    let dueStr = 'No due date';
    if (assign.due_at) {
      const dueDate = new Date(assign.due_at);
      if (!isNaN(dueDate.getTime())) {
        const diffMs = dueDate.getTime() - now;
        const oneWeekMs = 7 * 24 * 3600 * 1000;
        const isWithinOneWeek = diffMs >= -24 * 3600 * 1000 && diffMs <= oneWeekMs;
        const timeStr = dueDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

        if (isWithinOneWeek) {
          const dayName = dueDate.toLocaleDateString('en-US', { weekday: 'short' });
          dueStr = `${dayName}, ${timeStr}`;
        } else {
          const dateStr = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          dueStr = `${dateStr}, ${timeStr}`;
        }
      }
    }

    // Submission status adjustment if completed/graded
    const sub = assign.submission;
    let statusPillHtml = `<span class="home-dash-due-pill">${escapeHtml(dueStr)}</span>`;
    if (sub?.workflow_state === 'graded') {
      const scoreTxt = sub.score !== null && sub.score !== undefined ? `Graded: ${sub.score}/${assign.points_possible || '?'}` : 'Graded';
      statusPillHtml = `<span class="home-dash-due-pill" style="color: var(--color-success); border-color: rgba(34, 197, 94, 0.3); background: rgba(34, 197, 94, 0.08);">${escapeHtml(scoreTxt)}</span>`;
    } else if (sub?.workflow_state === 'submitted') {
      statusPillHtml = `<span class="home-dash-due-pill" style="color: var(--color-brand-primary); border-color: rgba(99, 102, 241, 0.3); background: rgba(99, 102, 241, 0.08);">Submitted</span>`;
    } else if (assign.due_at && new Date(assign.due_at).getTime() < now) {
      statusPillHtml = `<span class="home-dash-due-pill" style="color: var(--color-danger); border-color: rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.08);">Past due (${escapeHtml(dueStr)})</span>`;
    }

    itemEl.innerHTML = `
      <div class="home-assign-tile-main">
        <div class="home-assign-tile-header">
          <span class="home-dash-tile-course-chip" title="${escapeHtml(courseTitle)}">
            <span class="home-dash-color-dot" style="background:${color};"></span>
            <span>${escapeHtml(courseTitle)}</span>
          </span>
          <div style="display:flex; align-items:center; gap:8px;">
            ${assign.points_possible !== undefined && assign.points_possible !== null ? `<span class="home-dash-pts-tag">${assign.points_possible} pts</span>` : ''}
            ${statusPillHtml}
          </div>
        </div>
        <div class="home-assign-tile-title" title="${escapeHtml(assign.name || 'Untitled Assignment')}">${escapeHtml(assign.name || 'Untitled Assignment')}</div>
      </div>
    `;

    itemEl.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.button === 1) {
        if (assign.course) {
          createNewTab({ type: 'course', course: assign.course, courseTab: 'assignments', activate: true });
        }
      } else {
        assignmentsPageGrid.querySelectorAll('.home-sub-assign-item').forEach(el => el.classList.remove('active'));
        itemEl.classList.add('active');
        openAssignmentDetails(assign);
      }
    });

    assignmentsPageGrid.appendChild(itemEl);
  });
}

function openAssignmentDetails(assign) {
  if (assign.course) {
    appState.activeCourse = assign.course;
  }
  if (typeof handleAssignmentPreview === 'function') {
    handleAssignmentPreview(assign);
  }
}

/**
 * ==========================================================================
 * Dedicated Announcements Page
 * ==========================================================================
 */

function initAnnouncementsPageControls() {
  if (announcementsPageState.initialized) return;
  announcementsPageState.initialized = true;

  if (announcementsPageSearchInput) {
    announcementsPageSearchInput.addEventListener('input', (e) => {
      announcementsPageState.search = e.target.value.trim().toLowerCase();
      renderDedicatedAnnouncementsPage();
    });
  }

  if (announcementsPageCourseSelect) {
    announcementsPageCourseSelect.addEventListener('change', (e) => {
      announcementsPageState.courseId = e.target.value;
      renderDedicatedAnnouncementsPage();
    });
  }

  // Filter status pills
  const pills = announcementsPageSection?.querySelectorAll('.dedicated-pills-row .dedicated-pill-btn');
  if (pills) {
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        announcementsPageState.filter = pill.getAttribute('data-ann-filter') || 'all';
        renderDedicatedAnnouncementsPage();
      });
    });
  }

  // Set all to read button
  const markAllBtn = document.getElementById('markAllAnnouncementsReadBtn');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', () => {
      if (typeof markAllAnnouncementsAsRead === 'function') {
        markAllAnnouncementsAsRead();
      }
      showToast('All announcements set to read');
    });
  }
}

/**
 * Render Dedicated Announcements Page
 */
function renderDedicatedAnnouncementsPage() {
  initAnnouncementsPageControls();
  populateCourseDropdown(announcementsPageCourseSelect, announcementsPageState.courseId);

  const allAnnouncements = getAllCoursesAnnouncements();
  const now = new Date().getTime();
  const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;

  // Compute counts
  let countUnread = 0;

  allAnnouncements.forEach(ann => {
    if (isAnnouncementUnread(ann)) countUnread++;
  });

  // Update Badges
  const countAllEl = document.getElementById('annPillCountAll');
  const countUnreadEl = document.getElementById('annPillCountUnread');

  if (countAllEl) countAllEl.textContent = allAnnouncements.length;
  if (countUnreadEl) countUnreadEl.textContent = countUnread;

  if (announcementsPageCountBadge) {
    announcementsPageCountBadge.textContent = `${allAnnouncements.length} total`;
  }

  const markAllBtn = document.getElementById('markAllAnnouncementsReadBtn');
  if (markAllBtn) {
    if (countUnread === 0) {
      markAllBtn.style.opacity = '0.6';
      markAllBtn.title = 'All announcements are read';
    } else {
      markAllBtn.style.opacity = '1';
      markAllBtn.title = 'Set all announcements to read';
    }
  }

  // Update Sidebar Announcements Badge
  if (sidebarAnnouncementsBadge) {
    if (countUnread > 0) {
      sidebarAnnouncementsBadge.textContent = countUnread;
      sidebarAnnouncementsBadge.classList.remove('hidden');
    } else {
      sidebarAnnouncementsBadge.classList.add('hidden');
    }
  }

  // Filter
  const filtered = allAnnouncements.filter(ann => {
    // Course filter
    if (announcementsPageState.courseId !== 'all') {
      if (String(ann.course?.id) !== String(announcementsPageState.courseId)) {
        return false;
      }
    }

    // Status filter
    if (announcementsPageState.filter === 'unread') {
      if (!isAnnouncementUnread(ann)) return false;
    } else if (announcementsPageState.filter === 'recent') {
      const postTime = new Date(ann.posted_at || ann.created_at || 0).getTime();
      if (postTime < sevenDaysAgo) return false;
    }

    // Search filter
    if (announcementsPageState.search) {
      const q = announcementsPageState.search;
      const title = (ann.title || '').toLowerCase();
      const author = (ann.user_name || ann.author?.display_name || '').toLowerCase();
      const course = (ann.courseTitle || '').toLowerCase();
      const msg = (ann.message || '').toLowerCase();
      if (!title.includes(q) && !author.includes(q) && !course.includes(q) && !msg.includes(q)) {
        return false;
      }
    }

    return true;
  });

  if (!announcementsPageFeed) return;
  announcementsPageFeed.innerHTML = '';

  if (filtered.length === 0) {
    announcementsPageFeed.innerHTML = `
      <div class="empty-tab-state" style="padding: 48px 16px;">
        <div class="empty-icon-wrap" style="margin: 0 auto 14px auto;">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
        </div>
        <h3 style="font-size: 15px; font-weight: 600; color: var(--color-text-primary); margin-bottom: 6px;">No announcements found</h3>
        <p style="font-size: 13px; color: var(--color-text-secondary); max-width: 380px; margin: 0 auto 16px auto;">No notices or announcements match your selected filters.</p>
        <button type="button" class="secondary-button" id="resetAnnouncementsFiltersBtn">Clear Filters</button>
      </div>
    `;

    const resetBtn = document.getElementById('resetAnnouncementsFiltersBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        announcementsPageState.search = '';
        announcementsPageState.courseId = 'all';
        announcementsPageState.filter = 'all';
        if (announcementsPageSearchInput) announcementsPageSearchInput.value = '';
        if (announcementsPageCourseSelect) announcementsPageCourseSelect.value = 'all';
        const pills = announcementsPageSection?.querySelectorAll('.dedicated-pills-row .dedicated-pill-btn');
        pills?.forEach(p => {
          if (p.getAttribute('data-ann-filter') === 'all') p.classList.add('active');
          else p.classList.remove('active');
        });
        renderDedicatedAnnouncementsPage();
      });
    }
    return;
  }

  filtered.forEach(ann => {
    const itemEl = document.createElement('button');
    itemEl.type = 'button';
    const isUnread = isAnnouncementUnread(ann);
    itemEl.className = 'home-announcement-item' + (isUnread ? ' unread' : '');
    if (appState.activeFile?.is_announcement && String(appState.activeFile.id) === String(ann.id)) {
      itemEl.classList.add('active');
    }
    itemEl.setAttribute('data-announcement-id', ann.id);

    const courseTitle = ann.courseTitle || (ann.course ? getCleanCourseTitle(ann.course) : 'Course');
    const color = ann.courseColor || 'var(--color-brand-primary)';
    const dateStr = new Date(ann.posted_at || ann.created_at || Date.now()).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    itemEl.innerHTML = `
      <div class="home-announcement-tile-main">
        <div class="home-announcement-tile-header">
          <span class="home-dash-tile-course-chip" title="${escapeHtml(courseTitle)}">
            <span class="home-dash-color-dot" style="background: ${color};"></span>
            <span>${escapeHtml(courseTitle)}</span>
          </span>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="home-dash-date-tag">${escapeHtml(dateStr)}</span>
            ${isUnread ? `<span class="home-dash-unread-badge">New</span>` : ''}
          </div>
        </div>
        <div class="home-announcement-tile-title" title="${escapeHtml(ann.title || 'Untitled Announcement')}">${escapeHtml(ann.title || 'Untitled Announcement')}</div>
      </div>
    `;

    itemEl.addEventListener('click', () => {
      handleAnnouncementPreview(ann, itemEl);
    });

    announcementsPageFeed.appendChild(itemEl);
  });
}

/**
 * Navigate to the Dedicated Announcements Page and open a specific announcement
 */
function openAnnouncementInAnnouncementsPage(ann, event = null) {
  if (!ann) return;

  // Ensure active filters on the Announcements page won't hide the selected announcement
  // (especially 'unread', since opening an announcement marks it as read)
  const wouldHideByCourse = announcementsPageState.courseId !== 'all' &&
    String(ann.course?.id) !== String(announcementsPageState.courseId);
  const wouldHideByFilter = announcementsPageState.filter !== 'all';
  const wouldHideBySearch = Boolean(announcementsPageState.search);

  if (wouldHideByCourse || wouldHideByFilter || wouldHideBySearch) {
    announcementsPageState.courseId = 'all';
    announcementsPageState.filter = 'all';
    announcementsPageState.search = '';
    if (announcementsPageSearchInput) announcementsPageSearchInput.value = '';
    if (announcementsPageCourseSelect) announcementsPageCourseSelect.value = 'all';
    const pills = announcementsPageSection?.querySelectorAll('.dedicated-pills-row .dedicated-pill-btn');
    pills?.forEach(p => {
      p.classList.toggle('active', p.getAttribute('data-ann-filter') === 'all');
    });
  }

  if (typeof navigateToDedicatedTab === 'function') {
    navigateToDedicatedTab('announcements', 'Announcements', event);
  } else if (typeof switchView === 'function') {
    switchView('announcements');
  }

  const findCardEl = () => {
    if (!announcementsPageFeed || ann.id == null) return null;
    const escapedId = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
      ? CSS.escape(String(ann.id))
      : String(ann.id).replace(/"/g, '\\"');
    return announcementsPageFeed.querySelector(`.home-announcement-item[data-announcement-id="${escapedId}"]`);
  };

  handleAnnouncementPreview(ann, findCardEl());

  const liveEl = findCardEl();
  if (liveEl) {
    liveEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/**
 * Handle Announcement Preview in Sidepanel
 */
function handleAnnouncementPreview(ann, itemEl = null) {
  if (!filePreviewPanel) return;

  const rawTitle = ann.title || 'Announcement';
  const authorName = ann.user_name || ann.author?.display_name || 'Course Instructor';
  const postDate = new Date(ann.posted_at || ann.created_at || Date.now()).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const currentCourse = ann.course || appState.activeCourse;
  const courseTitle = ann.courseTitle || (currentCourse ? getCleanCourseTitle(currentCourse) : 'Course');

  const pseudoFile = {
    id: ann.id || Date.now(),
    display_name: rawTitle,
    filename: rawTitle,
    content_type: 'text/html',
    mime_class: 'announcement',
    is_announcement: true,
    url: ann.url || ann.html_url || null,
    raw: ann
  };

  // Set activeFile before markAnnouncementAsRead so any synchronous feed re-render preserves .active
  appState.activeFile = pseudoFile;
  markAnnouncementAsRead(ann.id);

  // Update active state on the live DOM element in feed or course page
  let liveEl = (itemEl && itemEl.isConnected) ? itemEl : null;
  if (!liveEl && ann.id != null) {
    const escapedId = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
      ? CSS.escape(String(ann.id))
      : String(ann.id).replace(/"/g, '\\"');
    if (announcementsPageFeed) {
      liveEl = announcementsPageFeed.querySelector(`.home-announcement-item[data-announcement-id="${escapedId}"]`);
    }
    if (!liveEl) {
      liveEl = document.querySelector(`.announcement-card[data-announcement-id="${escapedId}"]`);
    }
  }

  document.querySelectorAll('.home-announcement-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.announcement-card').forEach(el => el.classList.remove('active'));
  if (liveEl) {
    liveEl.classList.add('active');
    liveEl.classList.remove('unread');
    const badge = liveEl.querySelector('.home-dash-unread-badge, .announcement-badge.unread');
    if (badge) badge.remove();
  }

  // Header Details
  if (previewFileIcon) previewFileIcon.textContent = '📢';
  if (previewFileName) previewFileName.textContent = rawTitle;
  if (previewFileMetaTop) previewFileMetaTop.textContent = `${courseTitle} • ${authorName} • ${postDate}`;

  if (previewOpenAppBtn) previewOpenAppBtn.style.display = 'none';
  if (previewExternalBtn) {
    previewExternalBtn.style.display = (ann.html_url || ann.url) ? '' : 'none';
    previewExternalBtn.title = 'Open in Browser';
  }

  filePreviewPanel.classList.remove('hidden');

  if (previewBody) {
    previewBody.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'preview-scroll-content';
    wrap.style.cssText = 'flex: 1; height: 100%; overflow-y: auto; overflow-x: hidden; padding: 24px; max-width: 100%; box-sizing: border-box;';

    wrap.innerHTML = `
      <div class="announcement-sidepanel-view" style="display: flex; flex-direction: column; gap: 16px;">
        <div class="announcement-sidepanel-meta" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid var(--color-border-subtle);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="author-avatar" style="width: 32px; height: 32px; border-radius: 50%; background: var(--color-brand-gradient); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 13px;">
              ${escapeHtml(authorName.charAt(0))}
            </div>
            <div>
              <div style="font-weight: 600; font-size: 13px; color: var(--color-text-primary);">${escapeHtml(authorName)}</div>
              <div style="font-size: 11.5px; color: var(--color-text-muted);">${escapeHtml(courseTitle)}</div>
            </div>
          </div>
          <span style="font-size: 12px; color: var(--color-text-muted);">${escapeHtml(postDate)}</span>
        </div>
        <div class="announcement-sidepanel-body preview-page-content" style="font-size: 13.5px; line-height: 1.6; color: var(--color-text-primary); user-select: text;">
          ${sanitizeHtml(ann.message || '<p style="color: var(--color-text-muted);">No announcement content.</p>')}
        </div>
      </div>
    `;

    // Make any external links inside the message open via default browser
    wrap.querySelectorAll('a').forEach(a => {
      a.setAttribute('target', '_blank');
      a.addEventListener('click', (e) => {
        const href = a.getAttribute('href');
        if (href && !href.startsWith('#')) {
          e.preventDefault();
          if (window.canvasDesktop?.openExternal) window.canvasDesktop.openExternal(href);
          else window.open(href, '_blank');
        }
      });
    });

    previewBody.appendChild(wrap);
  }
}

/**
 * Lightweight helper to sync badge counts in left navigation
 */
function updateSidebarNavBadges() {
  const allAssignments = getAllCoursesAssignments();
  const now = new Date().getTime();
  let countUpcoming = 0;
  allAssignments.forEach(a => {
    if (classifyAssignmentStatus(a, now) === 'upcoming') {
      countUpcoming++;
    }
  });

  if (sidebarAssignmentsBadge) {
    if (countUpcoming > 0) {
      sidebarAssignmentsBadge.textContent = countUpcoming;
      sidebarAssignmentsBadge.classList.remove('hidden');
    } else {
      sidebarAssignmentsBadge.classList.add('hidden');
    }
  }

  const allAnnouncements = getAllCoursesAnnouncements();
  let countUnread = 0;
  allAnnouncements.forEach(ann => {
    if (typeof isAnnouncementUnread === 'function' ? isAnnouncementUnread(ann) : ann.read_state === 'unread') {
      countUnread++;
    }
  });

  if (sidebarAnnouncementsBadge) {
    if (countUnread > 0) {
      sidebarAnnouncementsBadge.textContent = countUnread;
      sidebarAnnouncementsBadge.classList.remove('hidden');
    } else {
      sidebarAnnouncementsBadge.classList.add('hidden');
    }
  }
}

// Global exports
window.handleAnnouncementPreview = handleAnnouncementPreview;
window.openAnnouncementInAnnouncementsPage = openAnnouncementInAnnouncementsPage;


