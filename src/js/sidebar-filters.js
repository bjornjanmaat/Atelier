/**
 * Render Courses List in Left Sidebar
 */
function renderSidebarCourses(coursesList) {
  if (!sidebarCoursesList) return;
  sidebarCoursesList.innerHTML = '';

  const activeCourses = (coursesList || []).filter(c => typeof isCourseArchived === 'function' ? !isCourseArchived(c.id) : true);

  if (sidebarCoursesCount) {
    sidebarCoursesCount.textContent = activeCourses.length;
  }

  activeCourses.forEach(course => {
    const courseItem = document.createElement('div');
    courseItem.className = 'sidebar-course-item';
    courseItem.setAttribute('data-course-id', course.id);
    courseItem.setAttribute('role', 'button');
    courseItem.setAttribute('tabindex', '0');
    courseItem.title = `${course.name} (Middle-click or ⌘-click to open in new tab)`;

    if (appState.activeCourse && String(appState.activeCourse.id) === String(course.id) && appState.activeView === 'course') {
      courseItem.classList.add('active');
    }

    const name = course.name || 'Untitled Course';
    const courseColor = getCourseColor(course);

    courseItem.innerHTML = `
      <span class="sidebar-course-indicator" style="background-color: ${escapeHtml(courseColor)};"></span>
      <div class="sidebar-course-info">
        <span class="sidebar-course-name">${escapeHtml(name)}</span>
      </div>
      <button class="sidebar-course-tab-btn" title="Open in New Tab" aria-label="Open in New Tab">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      </button>
    `;

    const tabBtn = courseItem.querySelector('.sidebar-course-tab-btn');
    if (tabBtn) {
      tabBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        createNewTab({ type: 'course', course, activate: true });
      });
    }

    courseItem.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey) {
        createNewTab({ type: 'course', course, activate: true });
      } else {
        const existingTab = appState.tabs.find(t => t.type === 'course' && t.course && String(t.course.id) === String(course.id));
        if (existingTab) {
          activateTab(existingTab.id);
        } else {
          loadCoursePage(course);
        }
      }
    });

    courseItem.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        createNewTab({ type: 'course', course, activate: true });
      }
    });

    courseItem.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showCourseContextMenu(e.clientX, e.clientY, course);
    });

    sidebarCoursesList.appendChild(courseItem);
  });
}

function updateSidebarActiveCourse(activeCourseId) {
  if (!sidebarCoursesList) return;
  const items = sidebarCoursesList.querySelectorAll('.sidebar-course-item');
  items.forEach(item => {
    const id = item.getAttribute('data-course-id');
    if (activeCourseId && String(id) === String(activeCourseId)) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

function applyCourseFilters() {
  const query = courseSearchInput ? courseSearchInput.value.trim().toLowerCase() : '';
  const selectedTerm = termFilterSelect ? termFilterSelect.value : 'all';

  const isArchivedTerm = selectedTerm === '__archived__';
  const targetCourses = (appState.courses || []).filter(c => {
    if (typeof isCourseArchived !== 'function') return true;
    return isArchivedTerm ? isCourseArchived(c.id) : !isCourseArchived(c.id);
  });

  const filtered = targetCourses.filter(course => {
    const matchesTerm = isArchivedTerm || selectedTerm === 'all' || course.term?.name === selectedTerm;
    const nameMatch = (course.name || '').toLowerCase().includes(query);
    const codeMatch = (course.course_code || '').toLowerCase().includes(query);
    const teacherMatch = (course.teachers || []).some(t => (t.display_name || '').toLowerCase().includes(query));
    return matchesTerm && (nameMatch || codeMatch || teacherMatch);
  });

  displayCoursesGrid(filtered);
}

function displayCoursesGrid(courses) {
  coursesGrid.innerHTML = '';

  if (courses.length === 0) {
    emptyCoursesState.classList.remove('hidden');
    return;
  }

  emptyCoursesState.classList.add('hidden');

  courses.forEach((course, index) => {
    const card = document.createElement('div');
    card.className = 'course-card';

    const coverImage = course.image_download_url;
    const courseColor = getCourseColor(course, index);
    const courseIcon = getCourseIcon(course);
    const bannerBg = `linear-gradient(135deg, ${courseColor} 0%, rgba(15, 23, 42, 0.95) 100%)`;

    const termName = course.term?.name || 'Current Term';
    const cleanCode = getCleanCourseCode(course);
    const teacher = course.teachers?.[0];
    const teacherName = teacher?.display_name || 'Assigned Instructor';

    card.innerHTML = `
      <div class="course-card-banner" style="background: ${bannerBg}">
        ${coverImage ? `<img src="${coverImage}" alt="${escapeHtml(course.name)}" onerror="this.remove()" />` : ''}
        <div class="course-banner-overlay"></div>
        <div class="course-banner-chips">
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="course-term-chip">${escapeHtml(termName)}</span>
          </div>
          ${cleanCode ? `<span class="course-code-pill" style="background: ${courseColor}">${escapeHtml(cleanCode)}</span>` : ''}
        </div>
      </div>

      <div class="course-card-body">
        <h3 class="course-title" title="${escapeHtml(course.name)}">${escapeHtml(course.name)}</h3>

        <div class="course-instructor-row">
          <div class="instructor-avatar">
            ${teacher?.avatar_image_url ? `<img src="${teacher.avatar_image_url}" alt="${escapeHtml(teacherName)}" />` : teacherName.charAt(0)}
          </div>
          <span class="instructor-name">${escapeHtml(teacherName)}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey) {
        createNewTab({ type: 'course', course, activate: true });
      } else {
        loadCoursePage(course);
      }
    });

    card.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        createNewTab({ type: 'course', course, activate: true });
      }
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showCourseContextMenu(e.clientX, e.clientY, course);
    });

    coursesGrid.appendChild(card);
  });

  renderHomeDashboardWidgets();
}

