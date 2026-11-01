/* ==========================================================================
   Home Screen Dashboard Widgets (Calendar, Assignments, Announcements)
   ========================================================================== */

// Home Dashboard Calendar Widget State (Always Day view with Vertical Timeline)
let homeCalendarViewDate = new Date();
let homeCalendarInitialized = false;
let homeCalendarSelectedDateKey = null;

// Dedicated Calendar Page State (Independent view mode & viewed date)
let calPageViewDate = new Date();
let calPageViewMode = 'month'; // 'month' | 'week' | '3day' | 'day'

/**
 * Parse standard iCal (RFC 5545) text into structured event objects
 */
function parseIcalString(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const events = [];
  const lines = rawText.split(/\r\n|\n|\r/);
  const unfolded = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else if (line.trim().length > 0) {
      unfolded.push(line);
    }
  }

  let cur = null;
  for (const line of unfolded) {
    if (line === 'BEGIN:VEVENT') {
      cur = { attendees: [] };
    } else if (line === 'END:VEVENT') {
      if (cur && cur.dtstart && cur.summary) {
        const startDate = parseIcalDateTime(cur.dtstart);
        const endDate = cur.dtend ? parseIcalDateTime(cur.dtend) : null;
        if (startDate) {
          events.push({
            id: cur.uid || `event-${startDate.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
            summary: cleanIcalText(cur.summary),
            location: cleanIcalText(cur.location || ''),
            description: cleanIcalText(cur.description || ''),
            categories: cleanIcalText(cur.categories || ''),
            organizer: cleanIcalText(cur.organizerCN || cur.organizer || ''),
            attendees: cur.attendees || [],
            start: startDate,
            end: endDate,
            isScheduleEvent: true
          });
        }
      }
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const rawKey = line.slice(0, idx);
        const val = line.slice(idx + 1);
        let key = rawKey;

        // Extract parameters like CN=
        let cnParam = '';
        if (key.includes(';')) {
          const cnMatch = key.match(/CN=([^;:]+)/i);
          if (cnMatch) {
            cnParam = cnMatch[1].replace(/^["']|["']$/g, '').trim();
          }
          key = key.split(';')[0];
        }
        key = key.trim().toUpperCase();

        if (key === 'SUMMARY') cur.summary = val;
        else if (key === 'LOCATION') cur.location = val;
        else if (key === 'DESCRIPTION') cur.description = val;
        else if (key === 'URL') cur.url = val;
        else if (key === 'DTSTART') cur.dtstart = val;
        else if (key === 'DTEND') cur.dtend = val;
        else if (key === 'UID') cur.uid = val;
        else if (key === 'CATEGORIES') cur.categories = val;
        else if (key === 'ORGANIZER') {
          cur.organizer = val;
          if (cnParam) cur.organizerCN = cnParam;
        } else if (key === 'ATTENDEE') {
          const attendeeName = cnParam || val;
          if (attendeeName && !cur.attendees.includes(attendeeName)) {
            cur.attendees.push(attendeeName);
          }
        }
      }
    }
  }

  return events;
}

/**
 * Derive structured class details (location, teacher(s), type) from event data
 */
function deriveScheduleClassDetails(ev) {
  const summary = ev.summary || '';
  const desc = ev.description || '';
  const loc = ev.location || '';
  const cat = ev.categories || '';
  const org = ev.organizer || '';

  // 1. Location
  let location = loc.trim();
  if (!location) {
    const locMatch = desc.match(/(?:Location|Locatie|Room|Lokaal|Building|Gebouw|Place|Zaal)\s*[:=-]\s*([^\r\n;,]+)/i);
    if (locMatch) {
      location = locMatch[1].trim();
    }
  }

  // 2. Teacher(s)
  const teachers = [];
  if (org) {
    const cleanOrg = org.replace(/^mailto:/i, '').trim();
    if (cleanOrg.includes('@') && !cleanOrg.includes(' ')) {
      const emailUser = cleanOrg.split('@')[0].replace(/[._-]/g, ' ');
      if (emailUser.length > 2 && !/canvas|admin|system|notification/i.test(emailUser)) {
        teachers.push(emailUser.replace(/\b\w/g, l => l.toUpperCase()));
      }
    } else if (cleanOrg.length > 1 && !/canvas|admin|system|notification/i.test(cleanOrg)) {
      teachers.push(cleanOrg);
    }
  }

  if (Array.isArray(ev.attendees)) {
    ev.attendees.forEach(att => {
      let cleanAtt = String(att || '').replace(/^mailto:/i, '').trim();
      if (cleanAtt.includes('@') && !cleanAtt.includes(' ')) {
        const user = cleanAtt.split('@')[0].replace(/[._-]/g, ' ');
        cleanAtt = user.replace(/\b\w/g, l => l.toUpperCase());
      }
      if (cleanAtt && !/canvas|admin|system/i.test(cleanAtt) && !teachers.includes(cleanAtt)) {
        teachers.push(cleanAtt);
      }
    });
  }

  // Also parse teacher / docent from description or summary
  const teacherMatches = desc.matchAll(/(?:Teacher\(?s?\)?|Docent(?:en)?|Instructor\(?s?\)?|Lecturer\(?s?\)?|Staff|Professor|Prof\.|Taught\s*by|Begeleider(?:s)?)\s*[:=-]\s*([^\r\n;]+)/gi);
  for (const m of teacherMatches) {
    const rawVal = m[1].trim();
    rawVal.split(/[,&/]/).forEach(t => {
      const trimmed = t.trim();
      if (trimmed && trimmed.length > 1 && !teachers.includes(trimmed) && !/^(?:tbd|n\/?a|none|unknown)$/i.test(trimmed)) {
        teachers.push(trimmed);
      }
    });
  }

  // 3. Type
  let type = '';
  if (cat) {
    type = cat.split(',')[0].trim();
  }
  if (!type) {
    const typeMatch = desc.match(/(?:Type|Activity|Session\s*type|Event\s*type|Soort(?:\s*activiteit)?)\s*[:=-]\s*([^\r\n;,]+)/i);
    if (typeMatch) {
      type = typeMatch[1].trim();
    }
  }
  if (!type) {
    const textToScan = `${summary} ${desc}`;
    if (/\b(hoorcollege|lecture|colloquium|webinar)\b/i.test(textToScan)) type = 'Lecture';
    else if (/\b(werkcollege|tutorial|seminar|recitation|exercise)\b/i.test(textToScan)) type = 'Tutorial';
    else if (/\b(practicum|practical|lab|laboratory|workshop)\b/i.test(textToScan)) type = 'Lab';
    else if (/\b(tentamen|toets|exam|midterm|final\s*exam|quiz|assessment)\b/i.test(textToScan)) type = 'Exam';
    else if (/\b(presentatie|presentation)\b/i.test(textToScan)) type = 'Presentation';
    else if (/\b(spreekuur|office\s*hour|begeleiding|consultation)\b/i.test(textToScan)) type = 'Consultation';
    else if (/\b(project|groepswerk|group\s*work)\b/i.test(textToScan)) type = 'Project';
    else type = 'Class';
  }

  type = type.charAt(0).toUpperCase() + type.slice(1);

  return {
    location: location || null,
    teachers: teachers.filter(Boolean),
    type: type || 'Class'
  };
}

/**
 * Parse iCal timestamp: YYYYMMDDTHHMMSSZ or YYYYMMDD
 */
function parseIcalDateTime(dtStr) {
  if (!dtStr) return null;
  const clean = dtStr.trim();
  const m = clean.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  const hour = m[4] ? parseInt(m[4], 10) : 0;
  const min = m[5] ? parseInt(m[5], 10) : 0;
  const sec = m[6] ? parseInt(m[6], 10) : 0;

  if (clean.endsWith('Z')) {
    // UTC
    return new Date(Date.UTC(year, month, day, hour, min, sec));
  }
  return new Date(year, month, day, hour, min, sec);
}

function cleanIcalText(text) {
  if (!text) return '';
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/**
 * Fetch and sync schedule events from configured iCal URL
 */
async function syncScheduleFromUrl(forceFetch = false) {
  if (appState.isDemo) {
    if ((!appState.scheduleEvents || appState.scheduleEvents.length === 0) && typeof getMockAccountData === 'function') {
      const mock = getMockAccountData();
      appState.scheduleEvents = mock.scheduleEvents || [];
    }
    if (scheduleSyncStatusLabel) {
      scheduleSyncStatusLabel.textContent = `Demo Schedule (${appState.scheduleEvents ? appState.scheduleEvents.length : 0} events)`;
    }
    if (scheduleSyncStatusText) {
      scheduleSyncStatusText.className = 'schedule-status-indicator synced';
    }
    return;
  }

  const url = appState.scheduleIcalUrl || localStorage.getItem(STORAGE_KEYS.SCHEDULE_ICAL);
  if (!url) {
    if (scheduleSyncStatusLabel) {
      scheduleSyncStatusLabel.textContent = 'No schedule URL configured';
    }
    if (scheduleSyncStatusText) {
      scheduleSyncStatusText.className = 'schedule-status-indicator';
    }
    return;
  }

  appState.scheduleIcalUrl = url;
  if (settingsScheduleIcalInput) {
    settingsScheduleIcalInput.value = url;
  }

  // Check cache first if not forced
  if (!forceFetch) {
    const cached = localStorage.getItem(STORAGE_KEYS.SCHEDULE_CACHE);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.events)) {
          // Re-hydrate Date objects
          appState.scheduleEvents = parsed.events.map(ev => ({
            ...ev,
            start: new Date(ev.start),
            end: ev.end ? new Date(ev.end) : null,
            isScheduleEvent: true
          }));
          if (scheduleSyncStatusLabel) {
            scheduleSyncStatusLabel.textContent = `Synced (${appState.scheduleEvents.length} events)`;
          }
          if (scheduleSyncStatusText) {
            scheduleSyncStatusText.className = 'schedule-status-indicator synced';
          }
        }
      } catch (e) {
        console.warn('Could not parse cached schedule:', e);
      }
    }
  }

  // Fetch live iCal
  try {
    if (scheduleSyncStatusLabel) {
      scheduleSyncStatusLabel.textContent = 'Syncing schedule...';
    }
    if (scheduleSyncStatusText) {
      scheduleSyncStatusText.className = 'schedule-status-indicator syncing';
    }

    let icalText;
    if (window.canvasDesktop?.fetchUrl) {
      const fetchRes = await window.canvasDesktop.fetchUrl(url);
      if (!fetchRes.success) throw new Error(fetchRes.error || 'Failed to fetch calendar');
      icalText = fetchRes.text;
    } else {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      icalText = await res.text();
    }
    const events = parseIcalString(icalText);

    appState.scheduleEvents = events;

    // Cache serializable version
    const serializable = events.map(e => ({
      ...e,
      start: e.start.toISOString(),
      end: e.end ? e.end.toISOString() : null
    }));
    localStorage.setItem(STORAGE_KEYS.SCHEDULE_CACHE, JSON.stringify({
      url,
      timestamp: Date.now(),
      events: serializable
    }));

    if (scheduleSyncStatusLabel) {
      scheduleSyncStatusLabel.textContent = `Live Synced (${events.length} classes & events)`;
    }
    if (scheduleSyncStatusText) {
      scheduleSyncStatusText.className = 'schedule-status-indicator synced';
    }

    renderHomeCalendarWidget();
    return events;
  } catch (err) {
    console.error('Failed to sync schedule from iCal URL:', err);
    if (scheduleSyncStatusLabel) {
      scheduleSyncStatusLabel.textContent = `Sync failed: ${err.message || 'Network error'}`;
    }
    if (scheduleSyncStatusText) {
      scheduleSyncStatusText.className = 'schedule-status-indicator error';
    }
  }
}

/**
 * Gather all schedule events
 */
function getAllScheduleEvents() {
  return appState.scheduleEvents || [];
}

/**
 * Gather all assignments from all courses in cache or demo
 */
function getAllCoursesAssignments() {
  const all = [];
  const coursesList = appState.courses || [];

  for (const course of coursesList) {
    let details = appState.courseDetailsCache[course.id];
    if (!details && appState.isDemo && typeof getMockAccountData === 'function') {
      const mock = getMockAccountData();
      details = mock.courseDetails?.[course.id];
    }
    if (!details && String(course.id).startsWith('4820')) {
      details = DEMO_COURSE_DETAILS;
    }
    if (!details || !Array.isArray(details.assignments)) continue;

    for (const assign of details.assignments) {
      all.push({
        ...assign,
        course,
        courseColor: getCourseColor(course),
        courseTitle: getCleanCourseTitle(course)
      });
    }
  }

  return all;
}

/**
 * Gather all announcements from all courses in cache or demo
 */
function getAllCoursesAnnouncements() {
  const all = [];
  const coursesList = appState.courses || [];

  for (const course of coursesList) {
    let details = appState.courseDetailsCache[course.id];
    if (!details && appState.isDemo && typeof getMockAccountData === 'function') {
      const mock = getMockAccountData();
      details = mock.courseDetails?.[course.id];
    }
    if (!details && String(course.id).startsWith('4820')) {
      details = DEMO_COURSE_DETAILS;
    }
    if (!details || !Array.isArray(details.announcements)) continue;

    for (const ann of details.announcements) {
      all.push({
        ...ann,
        course,
        courseColor: getCourseColor(course),
        courseTitle: getCleanCourseTitle(course)
      });
    }
  }

  // Sort newest first
  all.sort((a, b) => {
    const dateA = new Date(a.posted_at || a.created_at || 0).getTime();
    const dateB = new Date(b.posted_at || b.created_at || 0).getTime();
    return dateB - dateA;
  });

  return all;
}

/**
 * Close calendar slide-in day detail card
 */
function closeHomeCalendarDetailPanel() {
  homeCalendarSelectedDateKey = null;
  document.querySelectorAll('.home-cal-day.selected, .home-cal-slot.selected').forEach(el => el.classList.remove('selected'));
  if (homeCalendarDetailPanel) {
    homeCalendarDetailPanel.classList.remove('is-open');
  }
}

/**
 * Open calendar slide-in card displaying assignments and schedule timetable for clicked day
 */
function openHomeCalendarDetailPanel(dateKey, year, month, date, dayAssignments = [], daySchedule = []) {
  if (!homeCalendarDetailPanel || !homeCalDetailList) return;

  homeCalendarSelectedDateKey = dateKey;
  const dateObj = new Date(year, month, date);
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  if (homeCalDetailTitle) {
    homeCalDetailTitle.textContent = formattedDate;
  }
  const totalItems = dayAssignments.length + daySchedule.length;
  if (homeCalDetailBadge) {
    homeCalDetailBadge.textContent = totalItems;
  }

  homeCalDetailList.innerHTML = '';

  if (totalItems === 0) {
    homeCalDetailList.innerHTML = `
      <div class="home-widget-empty">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 14 14"></polyline>
        </svg>
        <span>No classes or assignments due on this date</span>
      </div>
    `;
  } else {
    // 1. Render Timetable Schedule Events first (if any)
    if (daySchedule.length > 0) {
      const scheduleHeader = document.createElement('div');
      scheduleHeader.className = 'home-cal-detail-section-title';
      scheduleHeader.innerHTML = `<span>Classes & Lectures (${daySchedule.length})</span>`;
      homeCalDetailList.appendChild(scheduleHeader);

      // Sort chronological
      daySchedule.sort((a, b) => (a.start?.getTime() || 0) - (b.start?.getTime() || 0));

      daySchedule.forEach(ev => {
        const itemEl = document.createElement('button');
        itemEl.type = 'button';
        itemEl.className = 'home-cal-detail-item schedule-type-item';
        const startStr = ev.start ? ev.start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
        const endStr = ev.end ? ev.end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
        const timeRange = endStr ? `${startStr} – ${endStr}` : startStr;

        itemEl.innerHTML = `
          <div class="home-cal-detail-left">
            <span class="home-cal-detail-dot schedule-dot"></span>
            <div style="min-width:0; flex:1;">
              <div class="home-cal-detail-title" title="${escapeHtml(ev.summary)}">${escapeHtml(ev.summary)}</div>
              <div class="home-cal-detail-due">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 15 14"></polyline>
                </svg>
                <span>${escapeHtml(timeRange)}</span>
                ${ev.location ? `<span class="home-cal-detail-loc">${escapeHtml(ev.location)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="home-cal-detail-right">
            <span class="home-cal-schedule-tag">Schedule</span>
          </div>
        `;

        itemEl.addEventListener('click', (e) => {
          openCalendarItemInCalendarPage(new Date(year, month, date), {
            type: 'class',
            id: ev.id,
            summary: ev.summary,
            startMs: ev.start ? new Date(ev.start).getTime() : null
          }, e);
        });

        homeCalDetailList.appendChild(itemEl);
      });
    }

    // 2. Render Canvas Assignments due (if any)
    if (dayAssignments.length > 0) {
      if (daySchedule.length > 0) {
        const assignHeader = document.createElement('div');
        assignHeader.className = 'home-cal-detail-section-title';
        assignHeader.style.marginTop = '8px';
        assignHeader.innerHTML = `<span>Assignments Due (${dayAssignments.length})</span>`;
        homeCalDetailList.appendChild(assignHeader);
      }

      dayAssignments.forEach(assign => {
        const itemEl = document.createElement('button');
        itemEl.type = 'button';
        itemEl.className = 'home-cal-detail-item';
        const courseTitle = assign.courseTitle || (assign.course ? getCleanCourseTitle(assign.course) : 'Course');
        const color = assign.courseColor || 'var(--color-brand-primary)';
        const dueStr = assign.due_at
          ? new Date(assign.due_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
          : 'No time specified';

        itemEl.innerHTML = `
          <div class="home-cal-detail-left">
            <span class="home-cal-detail-dot" style="background: ${color};"></span>
            <div style="min-width:0; flex:1;">
              <div class="home-cal-detail-title" title="${escapeHtml(assign.name)}">${escapeHtml(assign.name)}</div>
              <div class="home-cal-detail-due">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 15 14"></polyline>
                </svg>
                <span>Due ${escapeHtml(dueStr)}</span>
                ${assign.points_possible ? `<span style="opacity:0.6;">• ${assign.points_possible} pts</span>` : ''}
              </div>
            </div>
          </div>
          <div class="home-cal-detail-right">
            <span class="home-cal-detail-course" title="${escapeHtml(courseTitle)}">${escapeHtml(courseTitle)}</span>
          </div>
        `;

        itemEl.addEventListener('click', (e) => {
          openCalendarItemInCalendarPage(new Date(year, month, date), {
            type: 'assignment',
            id: assign.id
          }, e);
        });

        homeCalDetailList.appendChild(itemEl);
      });
    }
  }

  if (homeCalendarDetailPanel) {
    homeCalendarDetailPanel.classList.add('is-open');
  }
}

/**
 * Navigate Home Calendar Widget back/forward (always by 1 day)
 */
function navigateHomeCalendarWidget(direction) {
  closeHomeCalendarDetailPanel();
  const d = new Date(homeCalendarViewDate);
  d.setDate(d.getDate() + (direction * 1));
  homeCalendarViewDate = d;
  renderHomeCalendarWidget();
}

/**
 * Initialize calendar navigation listeners for the home widget
 */
function initHomeCalendarControls() {
  if (homeCalendarInitialized) return;
  homeCalendarInitialized = true;

  if (homeCalPrevBtn) {
    homeCalPrevBtn.addEventListener('click', () => navigateHomeCalendarWidget(-1));
  }

  if (homeCalNextBtn) {
    homeCalNextBtn.addEventListener('click', () => navigateHomeCalendarWidget(1));
  }

  if (homeCalTodayBtn) {
    homeCalTodayBtn.addEventListener('click', () => {
      closeHomeCalendarDetailPanel();
      homeCalendarViewDate = new Date();
      renderHomeCalendarWidget();
    });
  }

  if (homeCalDetailCloseBtn) {
    homeCalDetailCloseBtn.addEventListener('click', () => {
      closeHomeCalendarDetailPanel();
    });
  }
}

/**
 * Helper to get heat class from assignment count
 */
function getHeatClass(count) {
  if (count === 1) return 'heat-1'; // Green
  if (count === 2) return 'heat-2'; // Yellow
  if (count >= 3) return 'heat-3plus'; // Orange
  return 'heat-0'; // Clean
}

/**
 * Render the Home Calendar widget (Permanently Day view with vertical hourly timeline)
 */
function renderHomeCalendarWidget() {
  if (!homeCalendarGrid) return;
  initHomeCalendarControls();
  initHomeWidgetScrollFades();

  const allAssignments = getAllCoursesAssignments();
  const allScheduleEvents = getAllScheduleEvents();

  // Map "YYYY-M-D" to list of assignments
  const assignmentsByDateKey = {};
  allAssignments.forEach(a => {
    if (!a.due_at) return;
    const d = new Date(a.due_at);
    if (isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!assignmentsByDateKey[key]) {
      assignmentsByDateKey[key] = [];
    }
    assignmentsByDateKey[key].push(a);
  });

  // Map "YYYY-M-D" to list of schedule events
  const scheduleByDateKey = {};
  allScheduleEvents.forEach(ev => {
    if (!ev.start) return;
    const d = new Date(ev.start);
    if (isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!scheduleByDateKey[key]) {
      scheduleByDateKey[key] = [];
    }
    scheduleByDateKey[key].push(ev);
  });

  if (homeCalendarWeekdays) {
    homeCalendarWeekdays.style.display = 'none';
  }

  // The home calendar widget is permanently locked to Day view (vertical hourly timeline)
  renderCalendarDayView(assignmentsByDateKey, scheduleByDateKey);
}

/**
 * Month View: Full month grid
 */
function renderCalendarMonthView(assignmentsByDateKey, scheduleByDateKey = {}) {
  const year = homeCalendarViewDate.getFullYear();
  const month = homeCalendarViewDate.getMonth();

  if (homeCalendarMonthLabel) {
    homeCalendarMonthLabel.textContent = new Date(year, month, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });
  }

  if (homeCalendarWeekdays) {
    homeCalendarWeekdays.style.display = 'grid';
    homeCalendarWeekdays.innerHTML = '<span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>';
  }

  homeCalendarGrid.innerHTML = '';

  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
  const lastDateCurrentMonth = new Date(year, month + 1, 0).getDate();
  const lastDatePrevMonth = new Date(year, month, 0).getDate();

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDate = today.getDate();

  // Previous month trailing days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = lastDatePrevMonth - i;
    const cell = document.createElement('div');
    cell.className = 'home-cal-day other-month';
    cell.textContent = dayNum;
    homeCalendarGrid.appendChild(cell);
  }

  // Current month days
  for (let date = 1; date <= lastDateCurrentMonth; date++) {
    const dateKey = `${year}-${month}-${date}`;
    const dayAssignments = assignmentsByDateKey[dateKey] || [];
    const daySchedule = scheduleByDateKey[dateKey] || [];
    const count = dayAssignments.length;
    const hasSchedule = daySchedule.length > 0;

    const cell = document.createElement('div');
    const heatClass = getHeatClass(count);

    cell.className = `home-cal-day ${heatClass} ${hasSchedule ? 'has-schedule' : ''}`;
    if (isCurrentMonth && date === todayDate) {
      cell.classList.add('is-today');
    }

    cell.innerHTML = `
      <span class="home-cal-day-num">${date}</span>
      ${hasSchedule ? `<span class="home-cal-schedule-dot" title="${daySchedule.length} class${daySchedule.length > 1 ? 'es' : ''}"></span>` : ''}
    `;

    if (homeCalendarSelectedDateKey === dateKey) {
      cell.classList.add('selected');
    }

    const tipLines = [];
    if (hasSchedule) {
      tipLines.push(`📅 ${daySchedule.length} class/lecture event${daySchedule.length > 1 ? 's' : ''}:`);
      daySchedule.forEach(s => tipLines.push(`  • ${s.summary}${s.location ? ` (${s.location})` : ''}`));
    }
    if (count > 0) {
      tipLines.push(`📝 ${count} assignment${count > 1 ? 's' : ''} due:`);
      dayAssignments.forEach(a => tipLines.push(`  • [${a.courseTitle || 'Course'}] ${a.name}`));
    }
    if (tipLines.length === 0) {
      tipLines.push('No events or assignments due');
    }

    cell.title = `${date} ${new Date(year, month, 1).toLocaleString('en-US', { month: 'short' })}:\n${tipLines.join('\n')}\n(Click to view details)`;

    cell.addEventListener('click', () => {
      if (homeCalendarSelectedDateKey === dateKey) {
        closeHomeCalendarDetailPanel();
      } else {
        document.querySelectorAll('.home-cal-day.selected').forEach(el => el.classList.remove('selected'));
        cell.classList.add('selected');
        openHomeCalendarDetailPanel(dateKey, year, month, date, dayAssignments, daySchedule);
      }
    });

    homeCalendarGrid.appendChild(cell);
  }

  // Next month leading days to complete full 7-col grid (up to 35 or 42 cells)
  const totalCells = firstDayIndex + lastDateCurrentMonth;
  const nextMonthDays = (7 - (totalCells % 7)) % 7;
  for (let d = 1; d <= nextMonthDays; d++) {
    const cell = document.createElement('div');
    cell.className = 'home-cal-day other-month';
    cell.textContent = d;
    homeCalendarGrid.appendChild(cell);
  }
}

/**
 * Week View: 7 columns for the current week starting from Sunday
 */
function renderCalendarWeekView(assignmentsByDateKey, scheduleByDateKey = {}) {
  const current = new Date(homeCalendarViewDate);
  const dayOfWeek = current.getDay(); // 0 = Sun
  const sunday = new Date(current);
  sunday.setDate(current.getDate() - dayOfWeek);

  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);

  if (homeCalendarMonthLabel) {
    const startStr = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = saturday.toLocaleDateString('en-US', {
      month: sunday.getMonth() === saturday.getMonth() ? undefined : 'short',
      day: 'numeric',
      year: 'numeric'
    });
    homeCalendarMonthLabel.textContent = `${startStr} – ${endStr}`;
  }

  if (homeCalendarWeekdays) {
    homeCalendarWeekdays.style.display = 'grid';
    homeCalendarWeekdays.innerHTML = '<span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>';
  }

  homeCalendarGrid.innerHTML = '';

  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(sunday);
    dayDate.setDate(sunday.getDate() + i);

    const year = dayDate.getFullYear();
    const month = dayDate.getMonth();
    const date = dayDate.getDate();
    const dateKey = `${year}-${month}-${date}`;
    const dayAssignments = assignmentsByDateKey[dateKey] || [];
    const daySchedule = scheduleByDateKey[dateKey] || [];
    const count = dayAssignments.length;
    const hasSchedule = daySchedule.length > 0;

    const col = document.createElement('div');
    const heatClass = getHeatClass(count);
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === date;

    col.className = `home-cal-slot week-slot ${heatClass} ${isToday ? 'is-today' : ''}`;
    if (homeCalendarSelectedDateKey === dateKey) {
      col.classList.add('selected');
    }

    // Top date header
    col.innerHTML = `
      <div class="home-cal-slot-header">
        <span class="home-cal-slot-date">${date}</span>
        <div class="home-cal-slot-badges">
          ${hasSchedule ? `<span class="home-cal-slot-badge schedule-badge" title="${daySchedule.length} classes">${daySchedule.length}c</span>` : ''}
          ${count > 0 ? `<span class="home-cal-slot-badge" title="${count} assignments">${count}</span>` : ''}
        </div>
      </div>
      <div class="home-cal-slot-items">
        ${daySchedule.map(s => {
      const time = s.start ? s.start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
      return `
            <div class="home-cal-slot-chip schedule-chip" title="${escapeHtml(s.summary)}${s.location ? ` @ ${escapeHtml(s.location)}` : ''}">
              <span class="home-cal-chip-title">🏛️ ${escapeHtml(s.summary)}</span>
              ${time ? `<span class="home-cal-chip-time">${escapeHtml(time)}</span>` : ''}
            </div>
          `;
    }).join('')}
        ${dayAssignments.map(a => `
          <div class="home-cal-slot-chip" style="border-left-color: ${a.courseColor || 'var(--color-brand-primary)'};" title="${escapeHtml(a.name)}">
            <span class="home-cal-chip-title">${escapeHtml(a.name)}</span>
          </div>
        `).join('')}
        ${daySchedule.length === 0 && dayAssignments.length === 0 ? `<div class="home-cal-slot-empty">No events</div>` : ''}
      </div>
    `;

    col.addEventListener('click', () => {
      if (homeCalendarSelectedDateKey === dateKey) {
        closeHomeCalendarDetailPanel();
      } else {
        document.querySelectorAll('.home-cal-slot.selected').forEach(el => el.classList.remove('selected'));
        col.classList.add('selected');
        openHomeCalendarDetailPanel(dateKey, year, month, date, dayAssignments, daySchedule);
      }
    });

    homeCalendarGrid.appendChild(col);
  }
}

/**
 * 3-Days View: 3 columns showing consecutive days
 */
function renderCalendarMultiDayView(assignmentsByDateKey, scheduleByDateKey = {}, daysCount = 3) {
  const startDate = new Date(homeCalendarViewDate);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + daysCount - 1);

  if (homeCalendarMonthLabel) {
    const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = endDate.toLocaleDateString('en-US', {
      month: startDate.getMonth() === endDate.getMonth() ? undefined : 'short',
      day: 'numeric',
      year: 'numeric'
    });
    homeCalendarMonthLabel.textContent = `${startStr} – ${endStr}`;
  }

  // Hide the 7-day weekday row in 3-day view, headers are inside each day column
  if (homeCalendarWeekdays) {
    homeCalendarWeekdays.style.display = 'none';
  }

  homeCalendarGrid.innerHTML = '';
  const today = new Date();

  for (let i = 0; i < daysCount; i++) {
    const dayDate = new Date(startDate);
    dayDate.setDate(startDate.getDate() + i);

    const year = dayDate.getFullYear();
    const month = dayDate.getMonth();
    const date = dayDate.getDate();
    const dateKey = `${year}-${month}-${date}`;
    const dayAssignments = assignmentsByDateKey[dateKey] || [];
    const daySchedule = scheduleByDateKey[dateKey] || [];
    const count = dayAssignments.length;
    const hasSchedule = daySchedule.length > 0;

    const col = document.createElement('div');
    const heatClass = getHeatClass(count);
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === date;
    const weekdayStr = dayDate.toLocaleDateString('en-US', { weekday: 'short' });

    col.className = `home-cal-slot multiday-slot ${heatClass} ${isToday ? 'is-today' : ''}`;
    if (homeCalendarSelectedDateKey === dateKey) {
      col.classList.add('selected');
    }

    col.innerHTML = `
      <div class="home-cal-slot-header">
        <div class="home-cal-slot-title-group">
          <span class="home-cal-slot-weekday">${weekdayStr}</span>
          <span class="home-cal-slot-date">${date}</span>
        </div>
        <div class="home-cal-slot-badges">
          ${hasSchedule ? `<span class="home-cal-slot-badge schedule-badge">${daySchedule.length} class${daySchedule.length > 1 ? 'es' : ''}</span>` : ''}
          ${count > 0 ? `<span class="home-cal-slot-badge">${count} due</span>` : ''}
        </div>
      </div>
      <div class="home-cal-slot-items">
        ${daySchedule.map(s => {
      const startStr = s.start ? s.start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
      const endStr = s.end ? s.end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
      const time = endStr ? `${startStr}–${endStr}` : startStr;
      return `
            <div class="home-cal-slot-chip schedule-chip" title="${escapeHtml(s.summary)}${s.location ? ` @ ${escapeHtml(s.location)}` : ''}">
              <div class="home-cal-chip-title">🏛️ ${escapeHtml(s.summary)}</div>
              <div class="home-cal-chip-sub">
                ${time ? `<span>${escapeHtml(time)}</span>` : ''}
                ${s.location ? `<span>📍 ${escapeHtml(s.location)}</span>` : ''}
              </div>
            </div>
          `;
    }).join('')}
        ${dayAssignments.map(a => `
          <div class="home-cal-slot-chip" style="border-left-color: ${a.courseColor || 'var(--color-brand-primary)'};" title="${escapeHtml(a.name)}">
            <span class="home-cal-chip-title">${escapeHtml(a.name)}</span>
            <span class="home-cal-chip-course">${escapeHtml(a.courseTitle || 'Course')}</span>
          </div>
        `).join('')}
        ${daySchedule.length === 0 && dayAssignments.length === 0 ? `<div class="home-cal-slot-empty">No events or dues</div>` : ''}
      </div>
    `;

    col.addEventListener('click', () => {
      if (homeCalendarSelectedDateKey === dateKey) {
        closeHomeCalendarDetailPanel();
      } else {
        document.querySelectorAll('.home-cal-slot.selected').forEach(el => el.classList.remove('selected'));
        col.classList.add('selected');
        openHomeCalendarDetailPanel(dateKey, year, month, date, dayAssignments, daySchedule);
      }
    });

    homeCalendarGrid.appendChild(col);
  }
}

/**
/**
 * Day View: Single focused day displaying scheduled events and deadlines in cards (no timeline)
 */
function renderCalendarDayView(assignmentsByDateKey, scheduleByDateKey = {}) {
  const current = new Date(homeCalendarViewDate);
  const year = current.getFullYear();
  const month = current.getMonth();
  const date = current.getDate();
  const dateKey = `${year}-${month}-${date}`;
  const dayAssignments = assignmentsByDateKey[dateKey] || [];
  const daySchedule = scheduleByDateKey[dateKey] || [];
  const totalItems = dayAssignments.length + daySchedule.length;

  const today = new Date();
  const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === date;

  if (homeCalendarMonthLabel) {
    const monthDay = current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    homeCalendarMonthLabel.textContent = isToday ? `Today, ${monthDay}` : current.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  if (homeCalendarWeekdays) {
    homeCalendarWeekdays.style.display = 'none';
  }

  if (!homeCalendarGrid) return;
  homeCalendarGrid.innerHTML = '';
  homeCalendarGrid.className = 'home-calendar-events-list';

  // Empty state if no events on this day
  if (totalItems === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'home-widget-empty';
    emptyEl.style.cssText = 'padding: 24px 0;';
    emptyEl.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>
      <span>${isToday ? 'No events scheduled for today' : 'No events scheduled for this day'}</span>
    `;
    homeCalendarGrid.appendChild(emptyEl);
    return;
  }

  // Combine schedule events and assignments, sorted chronologically
  const items = [];

  daySchedule.forEach(s => {
    items.push({
      itemType: 'class',
      time: s.start ? new Date(s.start) : new Date(year, month, date, 9, 0),
      endTime: s.end ? new Date(s.end) : null,
      raw: s
    });
  });

  dayAssignments.forEach(a => {
    items.push({
      itemType: 'assignment',
      time: a.due_at ? new Date(a.due_at) : new Date(year, month, date, 23, 59),
      endTime: null,
      raw: a
    });
  });

  items.sort((a, b) => a.time.getTime() - b.time.getTime());

  items.forEach((item, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'home-sub-assign-item' + (index === 0 ? ' first-upcoming' : '');

    if (item.itemType === 'class') {
      const ev = item.raw;
      const details = deriveScheduleClassDetails(ev);
      const matchedCourse = matchCourseForScheduleEvent(ev);

      const typeLower = details.type.toLowerCase();
      const typeColor = typeLower.includes('exam') ? '#ef4444' :
                        typeLower.includes('lab') ? '#10b981' :
                        (typeLower.includes('tutorial') || typeLower.includes('seminar') || typeLower.includes('workshop')) ? '#a855f7' :
                        '#38bdf8';

      const courseTitle = matchedCourse ? getCleanCourseTitle(matchedCourse) : (details.type || 'Class');
      const chipColor = matchedCourse ? getCourseColor(matchedCourse) : typeColor;

      const startStr = ev.start ? ev.start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
      const endStr = ev.end ? ev.end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
      const timeRange = endStr ? `${startStr} – ${endStr}` : startStr;

      // Clean snippet matching the other widgets (no emoji badges)
      const metaParts = [];
      if (matchedCourse && details.type && details.type.toLowerCase() !== courseTitle.toLowerCase()) {
        metaParts.push(details.type);
      }
      if (details.location) metaParts.push(details.location);
      if (details.teachers.length > 0) metaParts.push(details.teachers.join(', '));
      const snippetText = metaParts.join(' • ');

      card.innerHTML = `
        <div class="home-assign-tile-main">
          <div class="home-assign-tile-header">
            <span class="home-dash-tile-course-chip" title="${escapeHtml(courseTitle)}">
              <span class="home-dash-color-dot" style="background:${chipColor};"></span>
              <span>${escapeHtml(courseTitle)}</span>
            </span>
            <span class="home-dash-due-pill">${escapeHtml(timeRange)}</span>
          </div>
          <div class="home-assign-tile-title" title="${escapeHtml(ev.summary || 'Scheduled Class')}">${escapeHtml(ev.summary || 'Scheduled Class')}</div>
          ${snippetText ? `<div class="home-announcement-tile-snippet">${escapeHtml(snippetText)}</div>` : ''}
        </div>
      `;

      card.addEventListener('click', (e) => {
        openCalendarItemInCalendarPage(current, {
          type: 'class',
          id: ev.id,
          summary: ev.summary,
          startMs: ev.start ? new Date(ev.start).getTime() : null
        }, e);
      });

      homeCalendarGrid.appendChild(card);
    } else {
      const a = item.raw;
      const courseTitle = a.courseTitle || (a.course ? getCleanCourseTitle(a.course) : 'Course');
      const color = a.courseColor || 'var(--color-brand-primary)';
      const dueTime = a.due_at ? new Date(a.due_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : 'Due';
      const snippetText = a.points_possible != null ? `${a.points_possible} pts` : '';

      card.innerHTML = `
        <div class="home-assign-tile-main">
          <div class="home-assign-tile-header">
            <span class="home-dash-tile-course-chip" title="${escapeHtml(courseTitle)}">
              <span class="home-dash-color-dot" style="background:${color};"></span>
              <span>${escapeHtml(courseTitle)}</span>
            </span>
            <span class="home-dash-due-pill">Due ${escapeHtml(dueTime)}</span>
          </div>
          <div class="home-assign-tile-title" title="${escapeHtml(a.name || 'Assignment')}">${escapeHtml(a.name || 'Assignment')}</div>
          ${snippetText ? `<div class="home-announcement-tile-snippet">${escapeHtml(snippetText)}</div>` : ''}
        </div>
      `;

      card.addEventListener('click', (e) => {
        openCalendarItemInCalendarPage(current, {
          type: 'assignment',
          id: a.id
        }, e);
      });

      homeCalendarGrid.appendChild(card);
    }
  });
}

/**
 * Render horizontal progress dots inspired by reference design
 */
function renderDashStatDots(containerEl, filledCount, totalDots = 10, theme = 'black') {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  const safeFilled = Math.max(0, Math.min(totalDots, Math.round(filledCount)));
  for (let i = 0; i < totalDots; i++) {
    const dot = document.createElement('span');
    dot.className = `dash-stat-dot ${theme} ${i < safeFilled ? 'filled' : 'empty'}`;
    containerEl.appendChild(dot);
  }
}

/**
 * Navigate tab to dedicated page (Calendar, Assignments, or Announcements)
 */
function navigateToDedicatedTab(tabType, tabTitle, event = null) {
  const openInNewTab = Boolean(event && (event.metaKey || event.ctrlKey || event.button === 1));
  if (typeof createNewTab === 'function' && typeof getActiveTab === 'function' && typeof navigateTab === 'function') {
    if (openInNewTab) {
      createNewTab({ type: tabType, title: tabTitle, activate: true });
      return;
    }
    const activeTab = getActiveTab();
    if (activeTab && activeTab.type !== tabType) {
      navigateTab(activeTab.id, { type: tabType, title: tabTitle });
    } else if (activeTab && activeTab.type === tabType) {
      if (typeof switchView === 'function') switchView(tabType);
    } else if (!activeTab) {
      createNewTab({ type: tabType, title: tabTitle, activate: true });
    }
  } else if (typeof switchView === 'function') {
    switchView(tabType);
  }
}

/**
 * Render the Assignments Widget
 * - Image-inspired stat cards (Lime sticker tilted card + companion completed card)
 * - Modern dashed tile list of upcoming assignments across all courses
 */
function renderHomeAssignmentsWidget() {
  if (!homeAssignmentsScrollList) return;
  initHomeWidgetScrollFades();

  const allAssignments = getAllCoursesAssignments();
  const now = new Date().getTime();

  // Filter assignments with and without due dates
  const withDue = allAssignments.filter(a => a.due_at && !isNaN(new Date(a.due_at).getTime()));
  const withoutDue = allAssignments.filter(a => !a.due_at || isNaN(new Date(a.due_at).getTime()));

  // 1. Pending upcoming assignments (due in future or due in last 24h, not graded)
  const pendingUpcoming = withDue.filter(a => {
    const t = new Date(a.due_at).getTime();
    return t >= (now - 24 * 3600 * 1000) && a.submission?.workflow_state !== 'graded';
  }).sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());

  // 2. Other unsubmitted or ungraded assignments (regardless of past due date)
  const pendingAny = withDue.filter(a => a.submission?.workflow_state !== 'graded')
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());

  // 3. Fallback: all assignments with due dates sorted by closeness to now
  const allByCloseness = [...withDue].sort((a, b) => {
    const diffA = Math.abs(new Date(a.due_at).getTime() - now);
    const diffB = Math.abs(new Date(b.due_at).getTime() - now);
    return diffA - diffB;
  });

  let sortedList = [];
  if (pendingUpcoming.length > 0) {
    const seen = new Set();
    pendingUpcoming.forEach(a => { seen.add(a.id); sortedList.push(a); });
    pendingAny.forEach(a => { if (!seen.has(a.id)) { seen.add(a.id); sortedList.push(a); } });
    allByCloseness.forEach(a => { if (!seen.has(a.id)) { seen.add(a.id); sortedList.push(a); } });
  } else if (pendingAny.length > 0) {
    const seen = new Set();
    pendingAny.forEach(a => { seen.add(a.id); sortedList.push(a); });
    allByCloseness.forEach(a => { if (!seen.has(a.id)) { seen.add(a.id); sortedList.push(a); } });
  } else if (allByCloseness.length > 0) {
    sortedList = allByCloseness;
  } else {
    sortedList = withoutDue;
  }

  // Calculate high-level metrics for stat cards
  const completedList = allAssignments.filter(a => a.submission?.workflow_state === 'graded' || a.submission?.workflow_state === 'submitted');
  const pendingList = allAssignments.filter(a => a.submission?.workflow_state !== 'graded');
  const pendingCount = pendingList.length;
  const completedCount = completedList.length;
  const totalCount = allAssignments.length || 1;

  // Pending this week count
  const next7Days = now + 7 * 24 * 3600 * 1000;
  const dueThisWeekCount = pendingList.filter(a => {
    if (!a.due_at) return false;
    const t = new Date(a.due_at).getTime();
    return t >= (now - 24 * 3600 * 1000) && t <= next7Days;
  }).length;

  // Closest upcoming relative due text
  let nextDueRelative = 'All caught up';
  if (pendingUpcoming.length > 0) {
    const nextAssign = pendingUpcoming[0];
    const diffMs = new Date(nextAssign.due_at).getTime() - now;
    const diffHours = Math.round(diffMs / (3600 * 1000));
    if (diffHours < 0 && diffHours > -24) {
      nextDueRelative = 'Due today';
    } else if (diffHours <= 0) {
      nextDueRelative = 'Past due';
    } else if (diffHours < 24) {
      nextDueRelative = `Due in ${diffHours}h`;
    } else {
      const days = Math.ceil(diffHours / 24);
      nextDueRelative = `Next in ${days}d`;
    }
  }

  // Populate Green Card (Not Tilted): Shows ONLY number of assignments for this week
  if (dashAssignHeroPending) dashAssignHeroPending.textContent = dueThisWeekCount;

  // Dots represent the 7 upcoming days starting from TODAY (day 0 = today, day 1 = tomorrow, etc.)
  // The day for which there is an assignment has a black dot. No letters/text are displayed.
  if (dashAssignDotsPending) {
    dashAssignDotsPending.innerHTML = '';
    dashAssignDotsPending.className = 'dash-stat-dots';

    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const dayTarget = new Date(todayDate);
      dayTarget.setDate(todayDate.getDate() + i);

      // Check if any assignment is due on this day
      const hasDue = allAssignments.some(a => {
        if (!a.due_at) return false;
        const d = new Date(a.due_at);
        return d.getFullYear() === dayTarget.getFullYear() &&
          d.getMonth() === dayTarget.getMonth() &&
          d.getDate() === dayTarget.getDate();
      });

      const dayName = i === 0 ? 'Today' : (i === 1 ? 'Tomorrow' : dayTarget.toLocaleDateString('en-US', { weekday: 'short' }));
      const dotEl = document.createElement('span');
      dotEl.className = `dash-stat-dot black ${hasDue ? 'filled' : 'empty'}`;
      dotEl.title = `${dayName}: ${hasDue ? 'Assignment due' : 'No assignments'}`;
      dotEl.setAttribute('aria-label', `${dayName}: ${hasDue ? 'Assignment due' : 'No assignments'}`);

      dashAssignDotsPending.appendChild(dotEl);
    }
  }

  if (dashAssignPillPendingText) {
    dashAssignPillPendingText.textContent = dueThisWeekCount > 0 ? nextDueRelative : 'All clear this week';
  }

  // Badge count for section header
  if (homeAssignmentsBadge) {
    homeAssignmentsBadge.textContent = sortedList.length;
  }

  // Empty state handling
  if (sortedList.length === 0) {
    homeAssignmentsScrollList.innerHTML = `
      <div class="home-widget-empty">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 14 14"></polyline>
        </svg>
        <span>No upcoming assignments found</span>
      </div>
    `;
    return;
  }

  // Render all assignments in modern dashed tile cards
  homeAssignmentsScrollList.innerHTML = '';

  sortedList.forEach((assign, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'home-sub-assign-item' + (index === 0 ? ' first-upcoming' : '');
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
          // Within one week: only show day and time (e.g. "Wed, 11:59 PM")
          const dayName = dueDate.toLocaleDateString('en-US', { weekday: 'short' });
          dueStr = `${dayName}, ${timeStr}`;
        } else {
          // Not within one week: only show date and time (e.g. "Nov 12, 11:59 PM")
          const dateStr = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          dueStr = `${dateStr}, ${timeStr}`;
        }
      }
    }

    itemEl.innerHTML = `
      <div class="home-assign-tile-main">
        <div class="home-assign-tile-header">
          <span class="home-dash-tile-course-chip" title="${escapeHtml(courseTitle)}">
            <span class="home-dash-color-dot" style="background:${color};"></span>
            <span>${escapeHtml(courseTitle)}</span>
          </span>
          <span class="home-dash-due-pill">${escapeHtml(dueStr)}</span>
        </div>
        <div class="home-assign-tile-title" title="${escapeHtml(assign.name)}">${escapeHtml(assign.name)}</div>
      </div>
    `;

    itemEl.addEventListener('click', () => {
      if (assign.course) {
        loadCoursePage(assign.course);
        switchCourseTab('assignments');
        setTimeout(() => {
          handleAssignmentPreview(assign);
        }, 250);
      }
    });

    homeAssignmentsScrollList.appendChild(itemEl);
  });

  // Action button listener
  if (homeViewAllAssignmentsBtn && !homeViewAllAssignmentsBtn._hasListener) {
    homeViewAllAssignmentsBtn._hasListener = true;
    homeViewAllAssignmentsBtn.addEventListener('click', () => navigateToDedicatedTab('assignments', 'Assignments'));
  }
}

/**
 * Render Announcements Widget
 * - Image-inspired stat cards (Unread updates + Course channels)
 * - Modern dashed tile list of announcements
 */
function renderHomeAnnouncementsWidget() {
  if (!homeAnnouncementsScrollList) return;
  initHomeWidgetScrollFades();

  const allAnnouncements = getAllCoursesAnnouncements();
  const now = new Date().getTime();

  // Find latest announcement
  const latestAnn = allAnnouncements.length > 0 ? allAnnouncements[0] : null;

  if (latestAnn) {
    const courseTitle = latestAnn.courseTitle || (latestAnn.course ? getCleanCourseTitle(latestAnn.course) : 'Course');
    const color = latestAnn.courseColor || 'var(--color-brand-primary)';
    const dateStr = new Date(latestAnn.posted_at || latestAnn.created_at || Date.now()).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    const plainSnippet = (typeof stripHtmlToText === 'function' ? stripHtmlToText(latestAnn.message) : (latestAnn.message || '')).trim() || 'No preview text.';

    if (dashAnnounceHeroDate) dashAnnounceHeroDate.textContent = dateStr;
    if (dashAnnounceHeroDot) dashAnnounceHeroDot.style.background = color;
    if (dashAnnounceHeroCourse) dashAnnounceHeroCourse.textContent = courseTitle;
    if (dashAnnounceHeroTitle) dashAnnounceHeroTitle.textContent = latestAnn.title || 'Untitled announcement';
    if (dashAnnounceHeroSnippet) dashAnnounceHeroSnippet.textContent = plainSnippet;
    if (dashAnnounceHeroPillText) {
      dashAnnounceHeroPillText.textContent = isAnnouncementUnread(latestAnn) ? 'Unread • View announcement' : 'View announcement';
    }

    if (dashAnnounceCardHero) {
      dashAnnounceCardHero.disabled = false;
      dashAnnounceCardHero.style.cursor = 'pointer';
      dashAnnounceCardHero.onclick = (e) => {
        if (typeof openAnnouncementInAnnouncementsPage === 'function') {
          openAnnouncementInAnnouncementsPage(latestAnn, e);
        }
      };
    }
  } else {
    if (dashAnnounceHeroDate) dashAnnounceHeroDate.textContent = 'None';
    if (dashAnnounceHeroCourse) dashAnnounceHeroCourse.textContent = 'All Courses';
    if (dashAnnounceHeroTitle) dashAnnounceHeroTitle.textContent = 'No announcements yet';
    if (dashAnnounceHeroSnippet) dashAnnounceHeroSnippet.textContent = 'Recent announcements from your courses will appear here.';
    if (dashAnnounceHeroPillText) dashAnnounceHeroPillText.textContent = 'All caught up';
    if (dashAnnounceCardHero) {
      dashAnnounceCardHero.onclick = null;
      dashAnnounceCardHero.disabled = true;
      dashAnnounceCardHero.style.cursor = 'default';
    }
  }

  // Badge count for section header
  if (homeAnnouncementsBadge) {
    homeAnnouncementsBadge.textContent = allAnnouncements.length;
  }

  homeAnnouncementsScrollList.innerHTML = '';

  if (allAnnouncements.length <= 1) {
    homeAnnouncementsScrollList.innerHTML = `
      <div class="home-widget-empty">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 14 14"></polyline>
        </svg>
        <span>${allAnnouncements.length === 1 ? 'No older announcements' : 'No announcements found'}</span>
      </div>
    `;
    return;
  }

  // Render remaining announcements in list
  const remainingAnnouncements = allAnnouncements.slice(1);
  remainingAnnouncements.forEach(ann => {
    const itemEl = document.createElement('button');
    itemEl.type = 'button';
    const isUnread = isAnnouncementUnread(ann);
    itemEl.className = 'home-announcement-item' + (isUnread ? ' unread' : '');

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
          <span class="home-dash-date-tag">${escapeHtml(dateStr)}</span>
          ${isUnread ? `<span class="home-dash-unread-badge">New</span>` : ''}
        </div>
        <div class="home-announcement-tile-title" title="${escapeHtml(ann.title)}">${escapeHtml(ann.title)}</div>
      </div>
    `;

    itemEl.addEventListener('click', (e) => {
      if (typeof openAnnouncementInAnnouncementsPage === 'function') {
        openAnnouncementInAnnouncementsPage(ann, e);
      }
    });

    homeAnnouncementsScrollList.appendChild(itemEl);
  });

  // Action button listener
  if (homeViewAllAnnouncementsBtn && !homeViewAllAnnouncementsBtn._hasListener) {
    homeViewAllAnnouncementsBtn._hasListener = true;
    homeViewAllAnnouncementsBtn.addEventListener('click', () => navigateToDedicatedTab('announcements', 'Announcements'));
  }
}

/**
 * Track overflow & scroll state on dashboard widget lists to toggle bottom edge fade
 */
function updateHomeWidgetScrollFade(scrollEl) {
  if (!scrollEl) return;
  const bodyEl = scrollEl.parentElement;
  if (!bodyEl) return;
  const remaining = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
  const canScrollDown = scrollEl.clientHeight > 0 && remaining > 2;
  bodyEl.classList.toggle('has-bottom-overflow', canScrollDown);
}

function scheduleHomeWidgetScrollFadeUpdate(scrollEl) {
  if (!scrollEl || scrollEl._scrollFadeRafPending) return;
  scrollEl._scrollFadeRafPending = true;
  requestAnimationFrame(() => {
    scrollEl._scrollFadeRafPending = false;
    updateHomeWidgetScrollFade(scrollEl);
  });
}

function initHomeWidgetScrollFades() {
  const scrollLists = [
    homeCalendarGrid,
    homeAssignmentsScrollList,
    homeAnnouncementsScrollList
  ];

  scrollLists.forEach((scrollEl) => {
    if (!scrollEl || scrollEl._hasScrollFadeObserver) return;
    scrollEl._hasScrollFadeObserver = true;

    scrollEl.addEventListener('scroll', () => {
      scheduleHomeWidgetScrollFadeUpdate(scrollEl);
    }, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => {
        updateHomeWidgetScrollFade(scrollEl);
      });
      resizeObserver.observe(scrollEl);
      scrollEl._scrollFadeResizeObserver = resizeObserver;
    }

    if (typeof MutationObserver !== 'undefined') {
      const mutationObserver = new MutationObserver(() => {
        scheduleHomeWidgetScrollFadeUpdate(scrollEl);
      });
      mutationObserver.observe(scrollEl, { childList: true });
      scrollEl._scrollFadeMutationObserver = mutationObserver;
    }

    scheduleHomeWidgetScrollFadeUpdate(scrollEl);
  });
}

/**
 * Render all home dashboard widgets and sync overview greeting
 */
function renderHomeDashboardWidgets() {
  initHomeWidgetScrollFades();
  renderHomeCalendarWidget();
  renderHomeAssignmentsWidget();
  renderHomeAnnouncementsWidget();

  if (typeof updateSidebarNavBadges === 'function') {
    updateSidebarNavBadges();
  }
}

/**
 * ==========================================================================
 * Dedicated Calendar & Timetable Page Functions
 * ==========================================================================
 */
let calPageInitialized = false;
let calPageSelectedDateKey = null;
let calPageSelectedFocusItem = null;

/**
 * Match a schedule iCal event to a Canvas course if possible
 */
function matchCourseForScheduleEvent(ev) {
  if (!ev || !appState.courses || !Array.isArray(appState.courses)) return null;
  const textToScan = `${ev.summary || ''} ${ev.description || ''} ${ev.categories || ''}`.toLowerCase();
  for (const c of appState.courses) {
    const code = (c.course_code || '').toLowerCase();
    const name = (c.name || '').toLowerCase();
    if (code && textToScan.includes(code)) return c;
    if (name && textToScan.includes(name)) return c;
  }
  const directUrl = (ev.url && /^https?:\/\//i.test(ev.url.trim())) ? ev.url.trim() :
    (ev.description && ev.description.match(/https?:\/\/[^\s<>"')]+/i) ? ev.description.match(/https?:\/\/[^\s<>"')]+/i)[0] : null);
  const courseIdMatch = directUrl?.match(/\/courses\/(\d+)/) || ev.description?.match(/\/courses\/(\d+)/);
  if (courseIdMatch) {
    return appState.courses.find(c => String(c.id) === String(courseIdMatch[1])) || null;
  }
  return null;
}

/**
 * Group all assignments and schedule events by local "YYYY-M-D" key
 */
function buildCalendarEventsMaps() {
  const allAssignments = getAllCoursesAssignments();
  const allScheduleEvents = getAllScheduleEvents();

  const assignmentsByDateKey = {};
  allAssignments.forEach(a => {
    if (!a.due_at) return;
    const d = new Date(a.due_at);
    if (isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!assignmentsByDateKey[key]) assignmentsByDateKey[key] = [];
    assignmentsByDateKey[key].push(a);
  });

  const scheduleByDateKey = {};
  allScheduleEvents.forEach(ev => {
    if (!ev.start) return;
    const d = new Date(ev.start);
    if (isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!scheduleByDateKey[key]) scheduleByDateKey[key] = [];
    scheduleByDateKey[key].push(ev);
  });

  return { assignmentsByDateKey, scheduleByDateKey };
}

/**
 * Clear selected calendar day cell when sidepanel is closed
 */
function clearCalendarPageSelection() {
  calPageSelectedDateKey = null;
  calPageSelectedFocusItem = null;
  if (calPageGrid) {
    calPageGrid.querySelectorAll('.home-cal-day.selected, .home-cal-slot.selected').forEach(el => {
      el.classList.remove('selected');
    });
  }
}

/**
 * Re-open the currently selected calendar day sidepanel (e.g. when returning from assignment preview)
 */
function reopenSelectedCalendarDaySidepanel() {
  if (!calPageSelectedDateKey) return;
  const { assignmentsByDateKey, scheduleByDateKey } = buildCalendarEventsMaps();
  openCalendarDaySidepanel(calPageSelectedDateKey, assignmentsByDateKey, scheduleByDateKey, calPageSelectedFocusItem);
}

/**
 * Navigate from the Dashboard Calendar Widget to the Calendar Page and open that day/item
 */
function openCalendarItemInCalendarPage(targetDate, focusItem = null, event = null) {
  const d = targetDate instanceof Date && !isNaN(targetDate.getTime()) ? new Date(targetDate) : new Date();
  const year = d.getFullYear();
  const month = d.getMonth();
  const date = d.getDate();
  const dateKey = `${year}-${month}-${date}`;

  calPageViewDate = new Date(year, month, date);
  navigateToDedicatedTab('calendar', 'Calendar', event);

  const { assignmentsByDateKey, scheduleByDateKey } = buildCalendarEventsMaps();
  openCalendarDaySidepanel(dateKey, assignmentsByDateKey, scheduleByDateKey, focusItem);

  if (calPageGrid) {
    const selectedCell = calPageGrid.querySelector(`[data-date-key="${dateKey}"]`);
    if (selectedCell) {
      selectedCell.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

function navigateCalendarPage(direction) {
  const d = new Date(calPageViewDate);
  if (calPageViewMode === 'day') {
    d.setDate(d.getDate() + (direction * 1));
  } else if (calPageViewMode === '3day') {
    d.setDate(d.getDate() + (direction * 3));
  } else if (calPageViewMode === 'week') {
    d.setDate(d.getDate() + (direction * 7));
  } else {
    d.setMonth(d.getMonth() + direction);
  }
  calPageViewDate = d;
}

function initDedicatedCalendarControls() {
  if (calPageInitialized) return;
  calPageInitialized = true;

  if (calPagePrevBtn) {
    calPagePrevBtn.addEventListener('click', () => {
      navigateCalendarPage(-1);
      renderDedicatedCalendarPage();
    });
  }
  if (calPageNextBtn) {
    calPageNextBtn.addEventListener('click', () => {
      navigateCalendarPage(1);
      renderDedicatedCalendarPage();
    });
  }
  if (calPageTodayBtn) {
    calPageTodayBtn.addEventListener('click', () => {
      calPageViewDate = new Date();
      renderDedicatedCalendarPage();
    });
  }

  // Single button view dropdown toggle
  if (calPageViewDropdownBtn) {
    calPageViewDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wrap = document.getElementById('calPageViewDropdownContainer');
      const menu = document.getElementById('calPageViewMenu');
      if (menu) {
        menu.classList.toggle('hidden');
        if (wrap) wrap.classList.toggle('open');
      }
    });
  }

  // View menu option selection
  if (calPageViewMenu) {
    calPageViewMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.calendar-view-menu-item');
      if (!item) return;
      const targetMode = item.getAttribute('data-view');
      if (!targetMode) return;

      calPageViewMode = targetMode;

      // Close menu
      calPageViewMenu.classList.add('hidden');
      const wrap = document.getElementById('calPageViewDropdownContainer');
      if (wrap) wrap.classList.remove('open');

      renderDedicatedCalendarPage();
    });
  }

  // Close view dropdown when clicking anywhere outside
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('calPageViewDropdownContainer');
    const menu = document.getElementById('calPageViewMenu');
    if (wrap && menu && !wrap.contains(e.target)) {
      menu.classList.add('hidden');
      wrap.classList.remove('open');
    }
  });
}

function renderDedicatedCalendarPage() {
  if (!calPageGrid) return;
  initDedicatedCalendarControls();

  // 1. Sync View Dropdown Button Label & Active states
  const modeLabels = {
    month: 'Month',
    week: 'Week',
    '3day': '3 Days',
    day: 'Day'
  };

  const selectedLabelEl = document.getElementById('calPageViewSelectedLabel');
  if (selectedLabelEl) {
    selectedLabelEl.textContent = modeLabels[calPageViewMode] || 'Month';
  }

  const menuEl = document.getElementById('calPageViewMenu');
  if (menuEl) {
    menuEl.querySelectorAll('.calendar-view-menu-item').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === calPageViewMode);
    });
  }

  // 2. Fetch and group all assignments & schedule events
  const { assignmentsByDateKey, scheduleByDateKey } = buildCalendarEventsMaps();

  // 3. Update top title label according to current view mode
  const year = calPageViewDate.getFullYear();
  const month = calPageViewDate.getMonth();

  if (calPageMonthLabel) {
    if (calPageViewMode === 'day') {
      calPageMonthLabel.textContent = calPageViewDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } else if (calPageViewMode === '3day') {
      const startDate = new Date(calPageViewDate);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 2);
      const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endStr = endDate.toLocaleDateString('en-US', {
        month: startDate.getMonth() === endDate.getMonth() ? undefined : 'short',
        day: 'numeric',
        year: 'numeric'
      });
      calPageMonthLabel.textContent = `${startStr} – ${endStr}`;
    } else if (calPageViewMode === 'week') {
      const current = new Date(calPageViewDate);
      const sunday = new Date(current);
      sunday.setDate(current.getDate() - current.getDay());
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);
      const startStr = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endStr = saturday.toLocaleDateString('en-US', {
        month: sunday.getMonth() === saturday.getMonth() ? undefined : 'short',
        day: 'numeric',
        year: 'numeric'
      });
      calPageMonthLabel.textContent = `${startStr} – ${endStr}`;
    } else {
      calPageMonthLabel.textContent = new Date(year, month, 1).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      });
    }
  }

  // 4. Update weekdays row (synchronized across all views: month, week, 3day, day)
  if (calPageWeekdays) {
    calPageWeekdays.style.display = 'grid';
    calPageWeekdays.className = `home-calendar-weekdays view-${calPageViewMode}`;

    if (calPageViewMode === 'day') {
      const d = new Date(calPageViewDate);
      calPageWeekdays.innerHTML = `<span>${d.toLocaleDateString('en-US', { weekday: 'long' })}</span>`;
    } else if (calPageViewMode === '3day') {
      const start = new Date(calPageViewDate);
      let spans = '';
      for (let i = 0; i < 3; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        spans += `<span>${d.toLocaleDateString('en-US', { weekday: 'short' })}</span>`;
      }
      calPageWeekdays.innerHTML = spans;
    } else {
      // Month & Week (7 columns)
      calPageWeekdays.innerHTML = '<span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>';
    }
  }

  calPageGrid.className = `home-calendar-grid view-${calPageViewMode}`;

  // 5. Render view-specific grid
  if (calPageViewMode === 'day') {
    renderDedicatedDayGrid(assignmentsByDateKey, scheduleByDateKey);
  } else if (calPageViewMode === '3day') {
    renderDedicatedMultiDayGrid(assignmentsByDateKey, scheduleByDateKey, 3);
  } else if (calPageViewMode === 'week') {
    renderDedicatedWeekGrid(assignmentsByDateKey, scheduleByDateKey);
  } else {
    renderDedicatedMonthGrid(assignmentsByDateKey, scheduleByDateKey);
  }

  // Keep open day sidepanel synchronized if live schedule sync refreshes the page
  if (
    calPageSelectedDateKey &&
    filePreviewPanel &&
    !filePreviewPanel.classList.contains('hidden') &&
    appState.activeFile?.is_calendar_day &&
    appState.activeFile?.id === calPageSelectedDateKey
  ) {
    openCalendarDaySidepanel(calPageSelectedDateKey, assignmentsByDateKey, scheduleByDateKey, calPageSelectedFocusItem, { skipScroll: true });
  }
}

/**
 * Open calendar day details inside the application right-side preview panel
 */
function openCalendarDaySidepanel(dateKey, assignmentsByDateKey, scheduleByDateKey, focusItem = null, options = {}) {
  if (!filePreviewPanel || !previewBody) return;
  const { skipScroll = false } = options;

  let dateObj = new Date();
  if (dateKey) {
    const parts = dateKey.split('-').map(Number);
    if (parts.length === 3) {
      dateObj = new Date(parts[0], parts[1], parts[2]);
    }
  }

  const now = Date.now();
  const nowDate = new Date(now);
  const isToday = (
    dateObj.getFullYear() === nowDate.getFullYear() &&
    dateObj.getMonth() === nowDate.getMonth() &&
    dateObj.getDate() === nowDate.getDate()
  );

  const formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const weekdayLabel = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDayYearLabel = dateObj.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const dayAssignments = assignmentsByDateKey[dateKey] || [];
  const daySchedule = scheduleByDateKey[dateKey] || [];
  const totalItems = dayAssignments.length + daySchedule.length;

  calPageSelectedDateKey = dateKey;
  calPageSelectedFocusItem = focusItem || null;

  if (calPageGrid) {
    calPageGrid.querySelectorAll('.home-cal-day, .home-cal-slot').forEach(el => {
      el.classList.toggle('selected', el.getAttribute('data-date-key') === dateKey);
    });
  }

  // Set sidepanel headers
  if (previewFileIcon) previewFileIcon.textContent = '';
  if (previewFileName) previewFileName.textContent = formattedDate;
  if (previewFileMetaTop) {
    previewFileMetaTop.textContent = isToday
      ? `Today • ${totalItems} scheduled ${totalItems === 1 ? 'item' : 'items'}`
      : `${totalItems} scheduled ${totalItems === 1 ? 'item' : 'items'}`;
  }
  if (previewOpenAppBtn) previewOpenAppBtn.style.display = 'none';
  if (previewExternalBtn) previewExternalBtn.style.display = 'none';

  appState.activeFile = {
    id: dateKey,
    display_name: formattedDate,
    is_calendar_day: true
  };

  previewBody.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'calendar-day-sidepanel-wrap';

  // Header Overview (consistent with .preview-assignment-header-card)
  const headerEl = document.createElement('header');
  headerEl.className = 'preview-assignment-header-card cal-sidepanel-header';
  const summaryPillLabel = isToday
    ? 'Today'
    : (totalItems === 0 ? 'No Events' : `${totalItems} ${totalItems === 1 ? 'Item' : 'Items'}`);
  const summaryPillClass = isToday ? 'submitted' : 'upcoming';
  const classesStatLabel = daySchedule.length === 0
    ? 'None scheduled'
    : `${daySchedule.length} ${daySchedule.length === 1 ? 'class' : 'classes'}`;
  const dueStatLabel = dayAssignments.length === 0
    ? 'None due'
    : `${dayAssignments.length} ${dayAssignments.length === 1 ? 'assignment' : 'assignments'}`;

  let focusedCardEl = null;

  // Empty State
  if (totalItems === 0) {
    const emptyCard = document.createElement('div');
    emptyCard.className = 'cal-sidepanel-empty-card';
    emptyCard.innerHTML = `
      <div class="cal-sidepanel-empty-icon">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </div>
      <div class="cal-sidepanel-empty-title">No Events</div>
      <div class="cal-sidepanel-empty-sub">Nothing is scheduled on your calendar for this date.</div>
    `;
    container.appendChild(emptyCard);
  }

  // 1. Classes & Lectures Section
  if (daySchedule.length > 0) {
    const classSection = document.createElement('section');
    classSection.className = 'cal-sidepanel-section';
    classSection.innerHTML = `
      <div class="preview-assignment-section-title cal-sidepanel-section-heading">
        <span>Schedule</span>
      </div>
    `;

    const listEl = document.createElement('div');
    listEl.className = 'cal-sidepanel-list';

    const sortedClasses = daySchedule.slice().sort((a, b) => (a.start?.getTime() || 0) - (b.start?.getTime() || 0));
    sortedClasses.forEach(ev => {
      const details = deriveScheduleClassDetails(ev);
      const matchedCourse = matchCourseForScheduleEvent(ev);
      const directUrl = (ev.url && /^https?:\/\//i.test(ev.url.trim())) ? ev.url.trim() :
        (ev.description && ev.description.match(/https?:\/\/[^\s<>"')]+/i) ? ev.description.match(/https?:\/\/[^\s<>"')]+/i)[0] : null);

      const typeLower = details.type.toLowerCase();
      const typeColor = typeLower.includes('exam') ? '#ef4444' :
                        typeLower.includes('lab') ? '#10b981' :
                        (typeLower.includes('tutorial') || typeLower.includes('seminar') || typeLower.includes('workshop')) ? '#a855f7' :
                        '#38bdf8';

      const courseTitle = matchedCourse ? getCleanCourseTitle(matchedCourse) : (details.type || 'Class');
      const chipColor = matchedCourse ? getCourseColor(matchedCourse) : typeColor;
      const showActivityTypeTag = Boolean(matchedCourse && details.type && details.type.toLowerCase() !== courseTitle.toLowerCase());

      const startStr = ev.start ? ev.start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
      const endStr = ev.end ? ev.end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
      const timeRange = (endStr ? `${startStr} – ${endStr}` : startStr) || 'Scheduled';

      const card = document.createElement('div');
      card.className = 'home-sub-assign-item cal-sidepanel-card';

      const evStartMs = ev.start ? new Date(ev.start).getTime() : null;
      const isFocused = Boolean(
        focusItem &&
        focusItem.type === 'class' &&
        (
          (focusItem.id && ev.id && String(focusItem.id) === String(ev.id)) ||
          (focusItem.summary && ev.summary === focusItem.summary && (!focusItem.startMs || focusItem.startMs === evStartMs))
        )
      );
      if (isFocused) {
        card.classList.add('active');
        focusedCardEl = card;
      }

      let metaRowsHtml = '';
      if (details.location || details.teachers.length > 0) {
        metaRowsHtml += '<div class="cal-sidepanel-meta-list">';
        if (details.location) {
          metaRowsHtml += `
            <div class="cal-sidepanel-meta-row">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              <span>${escapeHtml(details.location)}</span>
            </div>
          `;
        }
        if (details.teachers.length > 0) {
          metaRowsHtml += `
            <div class="cal-sidepanel-meta-row">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span>${escapeHtml(details.teachers.join(', '))}</span>
            </div>
          `;
        }
        metaRowsHtml += '</div>';
      }

      let notesHtml = '';
      if (ev.description) {
        const cleanedLines = ev.description
          .split('\n')
          .filter(l => !/^(?:location|locatie|teacher|docent|instructor|lecturer|room|lokaal|type|activity)\s*[:=-]/i.test(l.trim()))
          .join('\n')
          .trim();
        if (cleanedLines) {
          notesHtml = `<div class="cal-sidepanel-notes">${escapeHtml(cleanedLines)}</div>`;
        }
      }

      card.innerHTML = `
        <div class="home-assign-tile-main cal-sidepanel-card-main">
          <div class="home-assign-tile-header">
            <span class="home-dash-tile-course-chip" title="${escapeHtml(courseTitle)}">
              <span class="home-dash-color-dot" style="background: ${chipColor};"></span>
              <span>${escapeHtml(courseTitle)}</span>
            </span>
            <div class="cal-sidepanel-pills-group">
              ${showActivityTypeTag ? `<span class="home-dash-pts-tag">${escapeHtml(details.type)}</span>` : ''}
              <span class="home-dash-due-pill">${escapeHtml(timeRange)}</span>
            </div>
          </div>
          <div class="cal-sidepanel-card-title">${escapeHtml(ev.summary || 'Scheduled Class')}</div>
          ${metaRowsHtml}
          ${notesHtml}

        </div>
      `;

      const openCourseBtn = card.querySelector('[data-cal-action="open-course"]');
      if (openCourseBtn && matchedCourse) {
        openCourseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          loadCoursePage(matchedCourse);
        });
      }

      const openLinkBtn = card.querySelector('[data-cal-action="open-link"]');
      if (openLinkBtn && directUrl) {
        openLinkBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.canvasDesktop?.openExternal) window.canvasDesktop.openExternal(directUrl);
          else window.open(directUrl, '_blank');
        });
      }

      card.addEventListener('click', () => {
        container.querySelectorAll('.cal-sidepanel-card').forEach(el => el.classList.remove('active'));
        card.classList.add('active');
        calPageSelectedFocusItem = {
          type: 'class',
          id: ev.id,
          summary: ev.summary,
          startMs: evStartMs
        };
      });

      listEl.appendChild(card);
    });

    classSection.appendChild(listEl);
    container.appendChild(classSection);
  }

  // 2. Deadlines & Assignments Section
  if (dayAssignments.length > 0) {
    const assignSection = document.createElement('section');
    assignSection.className = 'cal-sidepanel-section';
    assignSection.innerHTML = `
      <div class="preview-assignment-section-title cal-sidepanel-section-heading">
        <span>Assignments</span>
      </div>
    `;

    const listEl = document.createElement('div');
    listEl.className = 'cal-sidepanel-list';

    dayAssignments.forEach(a => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'home-sub-assign-item cal-sidepanel-card is-interactive';

      const isFocused = Boolean(
        focusItem &&
        focusItem.type === 'assignment' &&
        focusItem.id != null &&
        String(focusItem.id) === String(a.id)
      );
      if (isFocused) {
        card.classList.add('active');
        focusedCardEl = card;
      }

      const courseTitle = a.courseTitle || (a.course ? getCleanCourseTitle(a.course) : 'Course');
      const color = a.courseColor || 'var(--color-brand-primary)';
      const dueTime = a.due_at
        ? new Date(a.due_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        : null;

      const sub = a.submission;
      let statusPillHtml = `<span class="home-dash-due-pill">${dueTime ? `Due ${escapeHtml(dueTime)}` : 'Due'}</span>`;
      if (sub?.workflow_state === 'graded') {
        const scoreTxt = sub.score !== null && sub.score !== undefined
          ? `Graded: ${sub.score}/${a.points_possible ?? '?'}`
          : 'Graded';
        statusPillHtml = `<span class="home-dash-due-pill status-graded">${escapeHtml(scoreTxt)}</span>`;
      } else if (sub?.workflow_state === 'submitted') {
        statusPillHtml = `<span class="home-dash-due-pill status-submitted">Submitted</span>`;
      } else if (a.due_at && new Date(a.due_at).getTime() < now) {
        statusPillHtml = `<span class="home-dash-due-pill status-past-due">${dueTime ? `Past due (${escapeHtml(dueTime)})` : 'Past due'}</span>`;
      }

      card.innerHTML = `
        <div class="home-assign-tile-main cal-sidepanel-card-main">
          <div class="home-assign-tile-header">
            <span class="home-dash-tile-course-chip" title="${escapeHtml(courseTitle)}">
              <span class="home-dash-color-dot" style="background: ${color};"></span>
              <span>${escapeHtml(courseTitle)}</span>
            </span>
            <div class="cal-sidepanel-pills-group">
              ${a.points_possible != null ? `<span class="home-dash-pts-tag">${a.points_possible} pts</span>` : ''}
              ${statusPillHtml}
            </div>
          </div>
          <div class="cal-sidepanel-card-title">${escapeHtml(a.name || 'Assignment')}</div>
          <div class="cal-sidepanel-card-footer">
            <span>View assignment details</span>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        calPageSelectedFocusItem = { type: 'assignment', id: a.id };
        if (a.course) {
          appState.activeCourse = a.course;
        }
        if (typeof handleAssignmentPreview === 'function') {
          handleAssignmentPreview(a);
        }
      });

      listEl.appendChild(card);
    });

    assignSection.appendChild(listEl);
    container.appendChild(assignSection);
  }

  previewBody.appendChild(container);
  filePreviewPanel.classList.remove('hidden');

  if (focusedCardEl && !skipScroll) {
    requestAnimationFrame(() => {
      focusedCardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
}

/**
 * Shared Day Cell Creator for Dedicated Calendar Page
 * Used across Month, Week, 3-Days, and Day views to ensure 100% unified UI design
 */
function createDedicatedDayCell(dayDate, assignmentsByDateKey, scheduleByDateKey, options = {}) {
  const { maxVisible = null, isOtherMonth = false } = options;
  const year = dayDate.getFullYear();
  const month = dayDate.getMonth();
  const date = dayDate.getDate();
  const dateKey = `${year}-${month}-${date}`;

  const today = new Date();
  const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === date;

  if (isOtherMonth) {
    const cell = document.createElement('div');
    cell.className = 'home-cal-day other-month';
    cell.innerHTML = `
      <div class="home-cal-day-top">
        <span class="home-cal-day-num">${date}</span>
      </div>
    `;
    return cell;
  }

  const dayAssignments = assignmentsByDateKey[dateKey] || [];
  const daySchedule = scheduleByDateKey[dateKey] || [];
  const count = dayAssignments.length;
  const hasSchedule = daySchedule.length > 0;

  const cell = document.createElement('div');
  const heatClass = getHeatClass(count);

  cell.className = `home-cal-day ${heatClass} ${hasSchedule ? 'has-schedule' : ''}`;
  cell.setAttribute('data-date-key', dateKey);

  if (isToday) {
    cell.classList.add('is-today');
  }
  if (calPageSelectedDateKey === dateKey) {
    cell.classList.add('selected');
  }

  // Unified day events sorted chronologically
  const allDayEvents = [];
  daySchedule.forEach(ev => {
    const timeStr = ev.start ? ev.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }) : '';
    allDayEvents.push({
      type: 'schedule',
      id: ev.id || '',
      title: ev.summary || 'Class',
      location: ev.location || '',
      time: timeStr,
      timestamp: ev.start ? new Date(ev.start).getTime() : 0,
      raw: ev
    });
  });

  dayAssignments.forEach(a => {
    const dueTime = a.due_at ? new Date(a.due_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }) : '';
    allDayEvents.push({
      type: 'assignment',
      id: a.id || '',
      title: a.name || 'Assignment',
      course: a.courseTitle || 'Course',
      time: dueTime,
      timestamp: a.due_at ? new Date(a.due_at).getTime() : 0,
      raw: a
    });
  });

  allDayEvents.sort((a, b) => a.timestamp - b.timestamp);

  const displayCount = (maxVisible && allDayEvents.length > maxVisible) ? maxVisible - 1 : allDayEvents.length;
  let eventsHtml = '';

  for (let k = 0; k < displayCount; k++) {
    const ev = allDayEvents[k];
    if (ev.type === 'schedule') {
      eventsHtml += `
        <div class="cal-cell-event is-schedule" data-cal-event-type="class" data-cal-event-id="${escapeHtml(String(ev.id))}" data-cal-event-start="${ev.timestamp}" data-cal-event-summary="${escapeHtml(ev.title)}" title="${escapeHtml(ev.title)}${ev.location ? ' @ ' + escapeHtml(ev.location) : ''}">
          ${ev.time ? `<span class="cal-cell-time">${escapeHtml(ev.time)}</span>` : ''}
          <span class="cal-cell-title">${escapeHtml(ev.title)}</span>
        </div>
      `;
    } else {
      eventsHtml += `
        <div class="cal-cell-event is-assignment" data-cal-event-type="assignment" data-cal-event-id="${escapeHtml(String(ev.id))}" title="${escapeHtml(ev.title)}${ev.course ? ' (' + escapeHtml(ev.course) + ')' : ''}">
          <span class="cal-cell-badge">Due</span>
          ${ev.time ? `<span class="cal-cell-time">${escapeHtml(ev.time)}</span>` : ''}
          <span class="cal-cell-title">${escapeHtml(ev.title)}</span>
        </div>
      `;
    }
  }

  if (maxVisible && allDayEvents.length > maxVisible) {
    const moreCount = allDayEvents.length - displayCount;
    eventsHtml += `<div class="cal-cell-more">+${moreCount} more</div>`;
  }

  cell.innerHTML = `
    <div class="home-cal-day-top">
      <span class="home-cal-day-num">${date}</span>
    </div>
    <div class="cal-cell-events-list">
      ${eventsHtml}
    </div>
  `;

  cell.addEventListener('click', (e) => {
    const chipEl = e.target.closest('.cal-cell-event');
    let focusItem = null;
    if (chipEl) {
      const evType = chipEl.getAttribute('data-cal-event-type');
      const evId = chipEl.getAttribute('data-cal-event-id');
      if (evType === 'assignment') {
        focusItem = { type: 'assignment', id: evId };
      } else if (evType === 'class') {
        const startRaw = Number(chipEl.getAttribute('data-cal-event-start'));
        focusItem = {
          type: 'class',
          id: evId,
          summary: chipEl.getAttribute('data-cal-event-summary') || '',
          startMs: !isNaN(startRaw) && startRaw > 0 ? startRaw : null
        };
      }
    }
    openCalendarDaySidepanel(dateKey, assignmentsByDateKey, scheduleByDateKey, focusItem);
  });

  return cell;
}

/**
 * Month View: Full month grid
 * Ensures only ONE line is shown for an event on a day
 */
function renderDedicatedMonthGrid(assignmentsByDateKey, scheduleByDateKey) {
  if (!calPageGrid) return;

  const year = calPageViewDate.getFullYear();
  const month = calPageViewDate.getMonth();

  calPageGrid.innerHTML = '';

  const firstDayIndex = new Date(year, month, 1).getDay();
  const lastDateCurrentMonth = new Date(year, month + 1, 0).getDate();
  const lastDatePrevMonth = new Date(year, month, 0).getDate();

  // Previous month trailing
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = lastDatePrevMonth - i;
    const prevDate = new Date(year, month - 1, dayNum);
    const cell = createDedicatedDayCell(prevDate, assignmentsByDateKey, scheduleByDateKey, { isOtherMonth: true });
    calPageGrid.appendChild(cell);
  }

  // Current month
  for (let date = 1; date <= lastDateCurrentMonth; date++) {
    const dayDate = new Date(year, month, date);
    const cell = createDedicatedDayCell(dayDate, assignmentsByDateKey, scheduleByDateKey, { maxVisible: 4 });
    calPageGrid.appendChild(cell);
  }

  // Next month leading
  const totalCells = firstDayIndex + lastDateCurrentMonth;
  const nextMonthDays = (7 - (totalCells % 7)) % 7;
  for (let d = 1; d <= nextMonthDays; d++) {
    const nextDate = new Date(year, month + 1, d);
    const cell = createDedicatedDayCell(nextDate, assignmentsByDateKey, scheduleByDateKey, { isOtherMonth: true });
    calPageGrid.appendChild(cell);
  }
}

/**
 * Week View: 7 columns spanning the full width
 * Uses exact same .home-cal-day design as Month view
 */
function renderDedicatedWeekGrid(assignmentsByDateKey, scheduleByDateKey) {
  if (!calPageGrid) return;
  calPageGrid.innerHTML = '';

  const current = new Date(calPageViewDate);
  const sunday = new Date(current);
  sunday.setDate(current.getDate() - current.getDay());

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(sunday);
    dayDate.setDate(sunday.getDate() + i);
    const cell = createDedicatedDayCell(dayDate, assignmentsByDateKey, scheduleByDateKey);
    calPageGrid.appendChild(cell);
  }
}

/**
 * 3-Days View: 3 wide columns
 * Uses exact same .home-cal-day design as Month view
 */
function renderDedicatedMultiDayGrid(assignmentsByDateKey, scheduleByDateKey, daysCount = 3) {
  if (!calPageGrid) return;
  calPageGrid.innerHTML = '';

  const startDate = new Date(calPageViewDate);

  for (let i = 0; i < daysCount; i++) {
    const dayDate = new Date(startDate);
    dayDate.setDate(startDate.getDate() + i);
    const cell = createDedicatedDayCell(dayDate, assignmentsByDateKey, scheduleByDateKey);
    calPageGrid.appendChild(cell);
  }
}

/**
 * 1-Day View: Comprehensive schedule for a single day
 * Uses exact same .home-cal-day design as Month view
 */
function renderDedicatedDayGrid(assignmentsByDateKey, scheduleByDateKey) {
  if (!calPageGrid) return;
  calPageGrid.innerHTML = '';

  const dayDate = new Date(calPageViewDate);
  const cell = createDedicatedDayCell(dayDate, assignmentsByDateKey, scheduleByDateKey);
  calPageGrid.appendChild(cell);
}

