/**
 * Handle Assignment Preview / Open in Sidepanel
 */
async function handleAssignmentPreview(item, moduleObj = null, searchQuery = '') {
  if (!filePreviewPanel) return;

  // Resolve course & matching full assignment object across active course or cache
  const resolvedCourse = item.course ||
    (item.course_id && typeof appState !== 'undefined' && Array.isArray(appState.courses)
      ? appState.courses.find(c => String(c.id) === String(item.course_id))
      : null) ||
    appState.activeCourse;
  const resolvedCourseId = resolvedCourse?.id || item.course_id || appState.activeCourse?.id;

  const candidateLists = [
    appState.courseDetails?.assignments,
    resolvedCourseId && appState.courseDetailsCache?.[resolvedCourseId]?.assignments
  ].filter(Array.isArray);
  const allAssignments = candidateLists.flat();

  let assignment = allAssignments.find(a =>
    (item.content_id && String(a.id) === String(item.content_id)) ||
    (item.id && String(a.id) === String(item.id)) ||
    (item.title && a.name && a.name.trim().toLowerCase() === item.title.trim().toLowerCase()) ||
    (item.name && a.name && a.name.trim().toLowerCase() === item.name.trim().toLowerCase())
  ) || item;

  if (resolvedCourse && !assignment.course) {
    assignment = Object.assign({}, assignment, { course: resolvedCourse });
  }

  const rawTitle = assignment.name || assignment.title || 'Assignment';
  const pts = assignment.points_possible ?? assignment.points ?? null;
  const dueStr = assignment.due_at
    ? `Due ${new Date(assignment.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}`
    : 'No Due Date';

  const pseudoFile = {
    id: assignment.id || Date.now(),
    display_name: rawTitle,
    filename: rawTitle,
    content_type: 'text/html',
    mime_class: 'assignment',
    is_assignment: true,
    url: assignment.html_url || assignment.url || null,
    raw: assignment
  };

  appState.activeFile = pseudoFile;

  // Highlight active assignment row
  document.querySelectorAll('.assignment-row-card').forEach(c => {
    c.classList.toggle('active', c.getAttribute('data-assignment-id') == assignment.id);
  });
  document.querySelectorAll('.file-row-card').forEach(c => c.classList.remove('active'));

  // Update header details
  if (previewFileIcon) previewFileIcon.textContent = '📝';
  if (previewFileName) previewFileName.textContent = rawTitle;
  if (previewFileMetaTop) {
    const metaParts = [];
    if (pts !== null && pts !== undefined) metaParts.push(`${pts} pts`);
    metaParts.push(dueStr);
    if (moduleObj?.name) metaParts.push(moduleObj.name);
    else metaParts.push('Assignment');
    previewFileMetaTop.textContent = metaParts.join(' • ');
  }

  if (previewOpenAppBtn) previewOpenAppBtn.style.display = 'none';
  if (previewExternalBtn) {
    previewExternalBtn.style.display = (assignment.html_url || assignment.url) ? '' : 'none';
    previewExternalBtn.title = 'Open in Browser';
  }

  filePreviewPanel.classList.remove('hidden');

  // If assignment description is missing and in live Canvas, fetch full assignment via IPC
  if (!assignment.description && !appState.isDemo && window.canvasDesktop?.getAssignmentContent && (assignment.id || assignment.content_id)) {
    if (previewBody) {
      previewBody.innerHTML = `
        <div class="preview-loading-wrap" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; height:100%;">
          <div class="preview-loading-spinner"></div>
          <span style="font-weight:600; font-size:14px; color:var(--color-text-primary);">Loading "${escapeHtml(rawTitle)}"...</span>
          <span style="font-size: 12px; color: var(--color-text-muted);">Fetching assignment details from Canvas</span>
        </div>
      `;
    }

    try {
      const res = await window.canvasDesktop.getAssignmentContent({
        domain: appState.currentDomain,
        token: appState.currentToken,
        courseId: resolvedCourseId,
        assignmentId: assignment.id || assignment.content_id,
        url: assignment.url
      });

      if (res && res.success && res.assignment) {
        Object.assign(assignment, res.assignment);
        if (res.assignment.html_url) pseudoFile.url = res.assignment.html_url;
      }
    } catch (err) {
      console.warn('Could not fetch Canvas assignment details:', err);
    }
  }

  renderAssignmentPreviewBody(assignment, moduleObj);
}

// ==========================================================================
// Assignment Submission Management & In-App Submissions
// ==========================================================================

let currentSubmittingAssignment = null;
let currentSubmittingCourse = null;
let modalSelectedFiles = [];
let modalActiveType = 'online_upload';
let assignmentModalHandlersInitialized = false;

function safeFormatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function isAssignmentSubmittable(assignment) {
  if (!assignment) return false;
  const types = Array.isArray(assignment.submission_types) ? assignment.submission_types : [];
  if (types.length === 0) return true;
  return types.some(t => ['online_upload', 'online_text_entry', 'online_url', 'media_recording', 'discussion_topic'].includes(t));
}

function updateAssignmentSubmissionState(assignmentId, newSubmission, courseId) {
  if (typeof DEMO_COURSE_DETAILS !== 'undefined' && Array.isArray(DEMO_COURSE_DETAILS.assignments)) {
    const demoA = DEMO_COURSE_DETAILS.assignments.find(a => String(a.id) === String(assignmentId));
    if (demoA) demoA.submission = newSubmission;
  }

  if (appState.courseDetails && Array.isArray(appState.courseDetails.assignments)) {
    const actA = appState.courseDetails.assignments.find(a => String(a.id) === String(assignmentId));
    if (actA) actA.submission = newSubmission;
  }

  if (appState.courseDetailsCache && courseId && appState.courseDetailsCache[courseId]?.assignments) {
    const cachedA = appState.courseDetailsCache[courseId].assignments.find(a => String(a.id) === String(assignmentId));
    if (cachedA) cachedA.submission = newSubmission;
  }

  if (appState.activeFile && String(appState.activeFile.id) === String(assignmentId) && appState.activeFile.raw) {
    appState.activeFile.raw.submission = newSubmission;
  }

  if (currentSubmittingAssignment && String(currentSubmittingAssignment.id) === String(assignmentId)) {
    currentSubmittingAssignment.submission = newSubmission;
  }
}

function openAssignmentSubmitModal(assignment, course = null, initialFiles = null) {
  if (!assignment) {
    if (typeof showToast === 'function') showToast('Please select an assignment first.');
    return;
  }
  const modalEl = document.getElementById('assignmentSubmitModal');
  if (!modalEl) {
    console.error('Assignment submission modal element not found in DOM.');
    return;
  }
  initAssignmentSubmissionHandlers();

  currentSubmittingAssignment = assignment;
  
  // Resolve course safely
  let resolvedCourse = null;
  if (course && (course.course_code || course.name)) {
    resolvedCourse = course;
  } else if (assignment.course && (assignment.course.course_code || assignment.course.name)) {
    resolvedCourse = assignment.course;
  } else if (assignment.course_id && typeof getAllCourses === 'function') {
    const allC = getAllCourses();
    resolvedCourse = allC.find(c => String(c.id) === String(assignment.course_id));
  } else if (appState.activeCourse) {
    resolvedCourse = appState.activeCourse;
  }
  currentSubmittingCourse = resolvedCourse || appState.activeCourse;
  modalSelectedFiles = [];

  const rawTitle = assignment.name || assignment.title || 'Assignment';
  const pts = assignment.points_possible ?? assignment.points ?? 0;
  const dueStr = assignment.due_at
    ? new Date(assignment.due_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    : 'No Due Date';

  const sub = assignment.submission;
  const isResubmission = Boolean(sub && (sub.workflow_state === 'submitted' || sub.workflow_state === 'graded'));
  const nextAttemptNum = (sub?.attempt || (isResubmission ? 1 : 0)) + 1;

  if (assignmentSubmitModalTitle) {
    assignmentSubmitModalTitle.textContent = isResubmission ? `Re-submit: ${rawTitle}` : `Submit: ${rawTitle}`;
  }
  if (assignmentSubmitAttemptBadge) {
    assignmentSubmitAttemptBadge.textContent = `Attempt ${nextAttemptNum}`;
  }
  if (assignmentSubmitModalSubtitle) {
    const cleanCourseName = (typeof getCleanCourseTitle === 'function' && currentSubmittingCourse)
      ? getCleanCourseTitle(currentSubmittingCourse)
      : (currentSubmittingCourse?.name || assignment.courseTitle || 'Course');
    assignmentSubmitModalSubtitle.textContent = cleanCourseName;
  }
  if (assignmentSubmitDueText) {
    assignmentSubmitDueText.textContent = dueStr;
  }
  if (assignmentSubmitPtsText) {
    assignmentSubmitPtsText.textContent = `${pts} pts`;
  }

  const types = Array.isArray(assignment.submission_types) && assignment.submission_types.length > 0
    ? assignment.submission_types
    : ['online_upload', 'online_text_entry', 'online_url'];

  // Default to allowing upload if types are generic or empty
  const allowsUpload = types.includes('online_upload') || (!types.includes('online_text_entry') && !types.includes('online_url'));
  const allowsText = types.includes('online_text_entry');
  const allowsUrl = types.includes('online_url');
  const enabledTypesCount = [allowsUpload, allowsText, allowsUrl].filter(Boolean).length;

  if (submitTabUploadBtn) submitTabUploadBtn.style.display = allowsUpload ? '' : 'none';
  if (submitTabTextBtn) submitTabTextBtn.style.display = allowsText ? '' : 'none';
  if (submitTabUrlBtn) submitTabUrlBtn.style.display = allowsUrl ? '' : 'none';
  if (assignmentSubmitTabs) {
    assignmentSubmitTabs.classList.toggle('hidden', enabledTypesCount <= 1);
  }

  if (allowsUpload) modalActiveType = 'online_upload';
  else if (allowsText) modalActiveType = 'online_text_entry';
  else if (allowsUrl) modalActiveType = 'online_url';
  else modalActiveType = 'online_upload';

  switchModalSubmitTab(modalActiveType);

  if (assignmentSubmitFormatsText) {
    const labels = [];
    if (allowsUpload) labels.push('File Upload');
    if (allowsText) labels.push('Text Entry');
    if (allowsUrl) labels.push('Website URL');
    assignmentSubmitFormatsText.textContent = labels.length ? labels.join(', ') : 'Online Submission';
  }

  if (assignmentModalAcceptedHint) {
    if (Array.isArray(assignment.allowed_extensions) && assignment.allowed_extensions.length > 0) {
      assignmentModalAcceptedHint.textContent = `Accepted formats: ${assignment.allowed_extensions.map(e => '.' + e.replace(/^\./, '')).join(', ')}`;
    } else {
      assignmentModalAcceptedHint.textContent = 'Supported: PDF, Word documents, Zip archives, source code, images';
    }
  }

  if (assignmentModalTextarea) {
    assignmentModalTextarea.value = '';
    if (assignmentModalTextStats) assignmentModalTextStats.textContent = '0 words • 0 chars';
  }
  if (assignmentModalUrlInput) assignmentModalUrlInput.value = '';
  if (assignmentModalCommentInput) assignmentModalCommentInput.value = '';
  if (assignmentModalAlert) {
    assignmentModalAlert.className = 'assignment-submit-alert hidden';
    assignmentModalAlert.style.display = 'none';
    assignmentModalAlert.textContent = '';
  }

  renderModalSelectedFiles();

  if (assignmentModalSubmitBtn) {
    assignmentModalSubmitBtn.disabled = false;
    assignmentModalSubmitBtn.classList.remove('loading');
  }
  if (assignmentModalSubmitBtnText) {
    assignmentModalSubmitBtnText.textContent = isResubmission ? 'Submit New Attempt' : 'Submit Assignment';
  }

  if (assignmentSubmitForm) {
    assignmentSubmitForm.classList.remove('hidden');
    assignmentSubmitForm.style.display = 'flex';
  }
  if (assignmentSubmitSuccessView) {
    assignmentSubmitSuccessView.classList.add('hidden');
    assignmentSubmitSuccessView.style.display = 'none';
  }

  modalEl.classList.remove('hidden');

  if (initialFiles && initialFiles.length) {
    addFilesToSubmissionQueue(initialFiles);
  }
}

function closeAssignmentSubmitModal() {
  const modalEl = document.getElementById('assignmentSubmitModal');
  if (modalEl) {
    modalEl.classList.add('hidden');
  }
  modalSelectedFiles = [];
}

function switchModalSubmitTab(type) {
  modalActiveType = type;
  [submitTabUploadBtn, submitTabTextBtn, submitTabUrlBtn].forEach(btn => {
    if (btn) btn.classList.toggle('active', btn.getAttribute('data-type') === type);
  });
  if (submitPaneUpload) {
    submitPaneUpload.classList.toggle('hidden', type !== 'online_upload');
    submitPaneUpload.style.display = type === 'online_upload' ? 'flex' : 'none';
  }
  if (submitPaneText) {
    submitPaneText.classList.toggle('hidden', type !== 'online_text_entry');
    submitPaneText.style.display = type === 'online_text_entry' ? 'flex' : 'none';
  }
  if (submitPaneUrl) {
    submitPaneUrl.classList.toggle('hidden', type !== 'online_url');
    submitPaneUrl.style.display = type === 'online_url' ? 'flex' : 'none';
  }
}

function renderModalSelectedFiles() {
  if (!assignmentModalFilesList) return;
  if (!modalSelectedFiles.length) {
    assignmentModalFilesList.innerHTML = '';
    assignmentModalFilesList.classList.add('hidden');
    return;
  }
  assignmentModalFilesList.classList.remove('hidden');
  assignmentModalFilesList.innerHTML = modalSelectedFiles.map((file, idx) => `
    <div class="assignment-file-item" data-idx="${idx}">
      <div class="assignment-file-item-left">
        <div class="assignment-file-item-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
        </div>
        <div class="assignment-file-item-info">
          <span class="assignment-file-item-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
          <span class="assignment-file-item-size">${safeFormatBytes(file.size)}</span>
        </div>
      </div>
      <button type="button" class="assignment-file-item-remove-btn" data-idx="${idx}" title="Remove file">✕</button>
    </div>
  `).join('');

  assignmentModalFilesList.querySelectorAll('.assignment-file-item-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      if (!isNaN(idx) && idx >= 0 && idx < modalSelectedFiles.length) {
        modalSelectedFiles.splice(idx, 1);
        renderModalSelectedFiles();
      }
    });
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file || !(file instanceof Blob || file instanceof File)) {
      return resolve(null);
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function addFilesToSubmissionQueue(fileList) {
  if (!fileList || !fileList.length) return;
  const allowed = currentSubmittingAssignment?.allowed_extensions;
  let hasInvalidExt = false;

  for (let i = 0; i < fileList.length; i++) {
    const f = fileList[i];
    const fileName = f.name || 'document';
    const ext = fileName.split('.').pop().toLowerCase();

    if (Array.isArray(allowed) && allowed.length > 0) {
      const cleanAllowed = allowed.map(e => e.replace(/^\./, '').toLowerCase().trim());
      if (!cleanAllowed.includes(ext)) {
        hasInvalidExt = true;
        continue;
      }
    }

    // Determine path and base64
    let filePath = f.path || null;
    if (!filePath && (f instanceof Blob || f instanceof File) && window.canvasDesktop?.getPathForFile) {
      try {
        filePath = window.canvasDesktop.getPathForFile(f);
      } catch (_) {}
    }

    let fileBase64 = f.base64 || null;
    if (!fileBase64 && (f instanceof Blob || f instanceof File)) {
      try {
        fileBase64 = await readFileAsDataUrl(f);
      } catch (_) {}
    }

    const exists = modalSelectedFiles.some(existing => existing.name === fileName && existing.size === f.size);
    if (!exists) {
      modalSelectedFiles.push({
        name: fileName,
        size: f.size || 0,
        type: f.type || 'application/octet-stream',
        path: filePath,
        base64: fileBase64
      });
    }
  }

  if (hasInvalidExt && assignmentModalAlert) {
    assignmentModalAlert.className = 'assignment-submit-alert error';
    assignmentModalAlert.textContent = `Some files were skipped because only ${allowed.join(', ')} formats are allowed.`;
    assignmentModalAlert.classList.remove('hidden');
  }

  renderModalSelectedFiles();
}

let isSubmittingAssignment = false;

async function handleModalSubmissionSubmit(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (isSubmittingAssignment) return;

  if (!currentSubmittingAssignment) {
    if (typeof showToast === 'function') showToast('No active assignment selected.');
    return;
  }

  const assignment = currentSubmittingAssignment;
  const course = currentSubmittingCourse || appState.activeCourse;
  const courseId = course?.id || 'demo';
  const assignmentId = assignment.id || assignment.content_id;

  if (modalActiveType === 'online_upload') {
    if (!modalSelectedFiles.length) {
      if (assignmentModalAlert) {
        assignmentModalAlert.className = 'assignment-submit-alert error';
        assignmentModalAlert.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>Please choose or drag & drop at least one file to submit.</span>
        `;
        assignmentModalAlert.classList.remove('hidden');
        assignmentModalAlert.style.display = 'flex';
        assignmentModalAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      if (typeof showToast === 'function') {
        showToast('Please select or drop at least one file to submit.');
      }
      if (assignmentModalDropzone) {
        assignmentModalDropzone.classList.add('pulse-error');
        setTimeout(() => assignmentModalDropzone.classList.remove('pulse-error'), 1000);
      }
      return;
    }
  } else if (modalActiveType === 'online_text_entry') {
    const txt = assignmentModalTextarea ? assignmentModalTextarea.value.trim() : '';
    if (!txt) {
      if (assignmentModalAlert) {
        assignmentModalAlert.className = 'assignment-submit-alert error';
        assignmentModalAlert.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>Please enter your submission text before submitting.</span>
        `;
        assignmentModalAlert.classList.remove('hidden');
        assignmentModalAlert.style.display = 'flex';
      }
      if (typeof showToast === 'function') {
        showToast('Please enter your submission text before submitting.');
      }
      return;
    }
  } else if (modalActiveType === 'online_url') {
    const url = assignmentModalUrlInput ? assignmentModalUrlInput.value.trim() : '';
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      if (assignmentModalAlert) {
        assignmentModalAlert.className = 'assignment-submit-alert error';
        assignmentModalAlert.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>Please enter a valid website URL starting with https:// or http://</span>
        `;
        assignmentModalAlert.classList.remove('hidden');
        assignmentModalAlert.style.display = 'flex';
      }
      if (typeof showToast === 'function') {
        showToast('Please enter a valid website URL starting with https://');
      }
      return;
    }
  }

  isSubmittingAssignment = true;
  if (assignmentModalSubmitBtn) {
    assignmentModalSubmitBtn.disabled = true;
    assignmentModalSubmitBtn.classList.add('loading');
  }
  if (assignmentModalSubmitBtnText) {
    assignmentModalSubmitBtnText.textContent = 'Submitting to Canvas...';
  }
  if (assignmentModalAlert) {
    assignmentModalAlert.className = 'assignment-submit-alert hidden';
    assignmentModalAlert.style.display = 'none';
    assignmentModalAlert.textContent = '';
  }

  try {
    const payload = {
      domain: appState.currentDomain,
      token: appState.currentToken,
      courseId: courseId,
      assignmentId: assignmentId,
      submissionType: modalActiveType,
      body: assignmentModalTextarea ? assignmentModalTextarea.value : '',
      url: assignmentModalUrlInput ? assignmentModalUrlInput.value.trim() : '',
      files: modalSelectedFiles,
      comment: assignmentModalCommentInput ? assignmentModalCommentInput.value.trim() : '',
      isDemo: Boolean(appState.isDemo || String(courseId).startsWith('4820'))
    };

    let res = null;
    if (window.canvasDesktop?.submitAssignment) {
      res = await window.canvasDesktop.submitAssignment(payload);
    } else {
      res = {
        success: true,
        submission: {
          id: Date.now(),
          workflow_state: 'submitted',
          submitted_at: new Date().toISOString(),
          attempt: (assignment.submission?.attempt || 0) + 1,
          body: payload.body || payload.url || (modalSelectedFiles.map(f => f.name).join(', ')),
          url: payload.url || null,
          attachments: modalSelectedFiles.map((f, i) => ({ id: 8000 + i, display_name: f.name, filename: f.name, size: f.size }))
        }
      };
    }

    if (!res || !res.success) {
      throw new Error(res?.error || 'Submission failed');
    }

    const newSub = res.submission;
    updateAssignmentSubmissionState(assignmentId, newSub, courseId);

    if (filePreviewPanel && !filePreviewPanel.classList.contains('hidden') && appState.activeFile?.id == assignment.id) {
      renderAssignmentPreviewBody(assignment);
    }
    if (typeof renderAssignmentsTab === 'function' && appState.courseDetails?.assignments) {
      renderAssignmentsTab(appState.courseDetails.assignments);
    }
    if (typeof renderDedicatedAssignmentsPage === 'function') {
      renderDedicatedAssignmentsPage();
    }
    if (typeof renderDashboard === 'function') {
      renderDashboard();
    }

    if (assignmentSubmitForm) {
      assignmentSubmitForm.classList.add('hidden');
      assignmentSubmitForm.style.display = 'none';
    }
    if (assignmentSubmitSuccessView) {
      assignmentSubmitSuccessView.classList.remove('hidden');
      assignmentSubmitSuccessView.style.display = 'flex';
      if (assignmentSubmitSuccessDesc) {
        assignmentSubmitSuccessDesc.textContent = `Attempt ${newSub.attempt || 1} has been recorded for "${assignment.name || 'Assignment'}".`;
      }
      if (assignmentSubmitSuccessDetails) {
        const timeStr = new Date(newSub.submitted_at || Date.now()).toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
        });
        let summaryHtml = `<div style="display:flex; justify-content:space-between; font-size:12.5px;"><span style="color:var(--color-text-muted);">Timestamp</span><strong style="color:var(--color-text-primary);">${timeStr}</strong></div>`;
        summaryHtml += `<div style="display:flex; justify-content:space-between; font-size:12.5px;"><span style="color:var(--color-text-muted);">Status</span><span style="color:var(--color-brand-primary); font-weight:700;">Submitted for Grading</span></div>`;
        if (newSub.attachments && newSub.attachments.length) {
          summaryHtml += `<div style="font-size:12px; margin-top:4px; color:var(--color-text-secondary);"><strong style="color:var(--color-text-primary);">${newSub.attachments.length} file(s)</strong> attached.</div>`;
        }
        if (newSub.url) {
          summaryHtml += `<div style="font-size:12px; margin-top:4px; color:var(--color-brand-primary); overflow:hidden; text-overflow:ellipsis;">${escapeHtml(newSub.url)}</div>`;
        }
        assignmentSubmitSuccessDetails.innerHTML = summaryHtml;
      }
    }

    if (typeof showToast === 'function') {
      showToast('Assignment submitted successfully!');
    }
  } catch (err) {
    console.error('Submission error:', err);
    if (assignmentModalAlert) {
      assignmentModalAlert.className = 'assignment-submit-alert error';
      assignmentModalAlert.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        <span>${escapeHtml(err.message || 'Submission error occurred. Please try again.')}</span>
      `;
      assignmentModalAlert.classList.remove('hidden');
      assignmentModalAlert.style.display = 'flex';
      assignmentModalAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (typeof showToast === 'function') {
      showToast(`Submission failed: ${err.message || 'Error occurred'}`);
    }
    if (assignmentModalSubmitBtn) {
      assignmentModalSubmitBtn.disabled = false;
      assignmentModalSubmitBtn.classList.remove('loading');
    }
    if (assignmentModalSubmitBtnText) {
      const isResubmission = Boolean(assignment.submission && (assignment.submission.workflow_state === 'submitted' || assignment.submission.workflow_state === 'graded'));
      assignmentModalSubmitBtnText.textContent = isResubmission ? 'Submit New Attempt' : 'Submit Assignment';
    }
  } finally {
    isSubmittingAssignment = false;
  }
}

function initAssignmentSubmissionHandlers() {
  if (assignmentModalHandlersInitialized) return;
  const modalEl = document.getElementById('assignmentSubmitModal');
  if (!modalEl) return;
  assignmentModalHandlersInitialized = true;

  if (closeAssignmentSubmitModalBtn) {
    closeAssignmentSubmitModalBtn.addEventListener('click', closeAssignmentSubmitModal);
  }
  if (assignmentModalCancelBtn) {
    assignmentModalCancelBtn.addEventListener('click', closeAssignmentSubmitModal);
  }
  if (assignmentSubmitSuccessCloseBtn) {
    assignmentSubmitSuccessCloseBtn.addEventListener('click', closeAssignmentSubmitModal);
  }
  assignmentSubmitModal.addEventListener('click', (e) => {
    if (e.target === assignmentSubmitModal) {
      closeAssignmentSubmitModal();
    }
  });

  if (submitTabUploadBtn) {
    submitTabUploadBtn.addEventListener('click', () => switchModalSubmitTab('online_upload'));
  }
  if (submitTabTextBtn) {
    submitTabTextBtn.addEventListener('click', () => switchModalSubmitTab('online_text_entry'));
  }
  if (submitTabUrlBtn) {
    submitTabUrlBtn.addEventListener('click', () => switchModalSubmitTab('online_url'));
  }

  async function triggerAssignmentFileSelect() {
    const allowed = currentSubmittingAssignment?.allowed_extensions;
    if (window.canvasDesktop?.selectFilesForSubmission) {
      try {
        const res = await window.canvasDesktop.selectFilesForSubmission({
          allowedExtensions: allowed,
          multiple: true
        });
        if (res && res.success && Array.isArray(res.files) && res.files.length > 0) {
          await addFilesToSubmissionQueue(res.files);
          return;
        }
        if (res && res.canceled) {
          return;
        }
      } catch (pickerErr) {
        console.warn('Native file picker error, falling back to input:', pickerErr);
      }
    }
    if (assignmentModalFileInput) {
      assignmentModalFileInput.click();
    }
  }

  if (assignmentModalBrowseBtn) {
    assignmentModalBrowseBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await triggerAssignmentFileSelect();
    });
  }

  if (assignmentModalFileInput) {
    assignmentModalFileInput.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files.length) {
        await addFilesToSubmissionQueue(Array.from(e.target.files));
        e.target.value = '';
      }
    });
  }

  if (assignmentModalDropzone) {
    assignmentModalDropzone.addEventListener('click', async (e) => {
      if (e.target && (e.target.closest('.assignment-file-item-remove-btn') || e.target.closest('#assignmentModalFileInput'))) {
        return;
      }
      await triggerAssignmentFileSelect();
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      assignmentModalDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        assignmentModalDropzone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      assignmentModalDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        assignmentModalDropzone.classList.remove('dragover');
      }, false);
    });

    assignmentModalDropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      assignmentModalDropzone.classList.remove('dragover');
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) {
        await addFilesToSubmissionQueue(Array.from(dt.files));
      }
    });
  }

  // Prevent browser window from navigating away when dropping files over the window
  window.addEventListener('dragover', (e) => {
    if (assignmentSubmitModal && !assignmentSubmitModal.classList.contains('hidden')) {
      e.preventDefault();
    }
  }, false);
  window.addEventListener('drop', (e) => {
    if (assignmentSubmitModal && !assignmentSubmitModal.classList.contains('hidden')) {
      e.preventDefault();
    }
  }, false);

  if (assignmentModalTextarea) {
    assignmentModalTextarea.addEventListener('input', () => {
      const val = assignmentModalTextarea.value.trim();
      const words = val ? val.split(/\s+/).length : 0;
      const chars = assignmentModalTextarea.value.length;
      if (assignmentModalTextStats) {
        assignmentModalTextStats.textContent = `${words} word${words === 1 ? '' : 's'} • ${chars} char${chars === 1 ? '' : 's'}`;
      }
    });
  }

  if (assignmentSubmitForm) {
    assignmentSubmitForm.addEventListener('submit', handleModalSubmissionSubmit);
  }
  if (assignmentModalSubmitBtn) {
    assignmentModalSubmitBtn.addEventListener('click', handleModalSubmissionSubmit);
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAssignmentSubmissionHandlers);
  } else {
    initAssignmentSubmissionHandlers();
  }
}

window.openAssignmentSubmitModal = openAssignmentSubmitModal;
window.closeAssignmentSubmitModal = closeAssignmentSubmitModal;
window.isAssignmentSubmittable = isAssignmentSubmittable;

/**
 * Format human-readable submission types list
 */
function formatAssignmentSubmissionTypes(types) {
  if (!Array.isArray(types) || types.length === 0) return 'Online Submission';
  return types.map(t => {
    switch (t) {
      case 'online_upload': return 'File Upload';
      case 'online_text_entry': return 'Text Entry';
      case 'online_url': return 'Website URL';
      case 'online_quiz': return 'Quiz';
      case 'media_recording': return 'Media Recording';
      case 'discussion_topic': return 'Discussion';
      case 'on_paper': return 'On Paper';
      case 'none': return 'No Submission';
      default: return String(t).replace(/_/g, ' ');
    }
  }).join(', ');
}

/**
 * Shared Assignment Detail Renderer (Sidepanel & Full-Page Reader)
 */
function populateAssignmentDetailContainer(container, assignment, options = {}) {
  const { moduleObj = null, course = null, idPrefix = 'preview' } = options;
  const resolvedCourse = course || assignment.course || appState.activeCourse;

  const rawTitle = assignment.name || assignment.title || 'Assignment';
  const pts = assignment.points_possible ?? assignment.points ?? 0;
  const dueStr = assignment.due_at
    ? new Date(assignment.due_at).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
    : 'No Due Date';

  const sub = assignment.submission;
  const isSubmittedOrGraded = Boolean(sub && (sub.workflow_state === 'graded' || sub.workflow_state === 'submitted'));
  let statusText = 'Not Submitted';
  let pillClass = 'upcoming';

  if (sub?.workflow_state === 'graded') {
    statusText = `Graded • ${sub.score ?? 0} / ${pts} pts`;
    if (sub.grade) statusText += ` (${sub.grade})`;
    pillClass = 'graded';
  } else if (sub?.workflow_state === 'submitted') {
    statusText = 'Submitted';
    pillClass = 'submitted';
  } else if (assignment.due_at && new Date(assignment.due_at) < new Date()) {
    statusText = 'Past Due';
    pillClass = 'missing';
  }

  const types = Array.isArray(assignment.submission_types) ? assignment.submission_types : [];
  const subTypesStr = formatAssignmentSubmissionTypes(types);
  const allowedExtsStr = Array.isArray(assignment.allowed_extensions) && assignment.allowed_extensions.length > 0
    ? assignment.allowed_extensions.map(e => '.' + String(e).replace(/^\./, '')).join(', ')
    : '';

  const canSubmit = isAssignmentSubmittable(assignment);
  const allowsUpload = canSubmit && (
    types.length === 0 ||
    types.includes('online_upload') ||
    (!types.includes('online_text_entry') && !types.includes('online_url'))
  );

  const courseLabel = moduleObj?.name ||
    assignment.courseTitle ||
    (resolvedCourse && typeof getCleanCourseTitle === 'function' ? getCleanCourseTitle(resolvedCourse) : resolvedCourse?.name) ||
    'Assignment';

  const descHtml = assignment.description && assignment.description.trim()
    ? sanitizeHtml(assignment.description)
    : `<p class="preview-assignment-empty-desc">No instructions provided for this assignment.</p>`;

  const directUrl = assignment.html_url || (assignment.url && assignment.url.startsWith('http') ? assignment.url : null);

  container.innerHTML = `
    <!-- Assignment Header & Metadata -->
    <header class="preview-assignment-header-card">
      <div class="preview-assignment-badge-row">
        <span class="preview-assignment-module-tag" title="${escapeHtml(courseLabel)}">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <span>${escapeHtml(courseLabel)}</span>
        </span>
        <span class="submission-pill ${pillClass}">${escapeHtml(statusText)}</span>
      </div>

      <h2 class="preview-assignment-title">${escapeHtml(rawTitle)}</h2>

      <div class="preview-assignment-stats-bar">
        <div class="preview-assignment-stat-item">
          <span class="preview-assignment-stat-label">Due Date</span>
          <span class="preview-assignment-stat-value">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <span>${escapeHtml(dueStr)}</span>
          </span>
        </div>

        <div class="preview-assignment-stat-item">
          <span class="preview-assignment-stat-label">Points</span>
          <span class="preview-assignment-stat-value">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 14 14"></polyline>
            </svg>
            <span>${pts} pts</span>
          </span>
        </div>

        <div class="preview-assignment-stat-item stat-item-wide">
          <span class="preview-assignment-stat-label">Submission Format</span>
          <span class="preview-assignment-stat-value">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span>${escapeHtml(subTypesStr)}${allowedExtsStr ? ` <span class="preview-assignment-ext-hint">(${escapeHtml(allowedExtsStr)})</span>` : ''}</span>
          </span>
        </div>
      </div>

      ${(canSubmit || directUrl) ? `
        <div class="preview-assignment-primary-actions">
          ${canSubmit ? `
            <button type="button" class="primary-button preview-assignment-action-btn" id="${idPrefix}AssignmentSubmitBtn">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <span>${isSubmittedOrGraded ? 'Submit New Attempt' : 'Submit Assignment'}</span>
            </button>
          ` : ''}
          ${directUrl ? `
            <button type="button" class="secondary-button preview-assignment-action-btn" id="${idPrefix}AssignmentOpenCanvasBtn">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              <span>Open in Canvas</span>
            </button>
          ` : ''}
        </div>
      ` : ''}
    </header>

    <!-- Submission Status Card (if submitted or graded) -->
    ${isSubmittedOrGraded ? `
      <section class="preview-assignment-submission-card ${sub.workflow_state}">
        <div class="preview-assignment-submission-top">
          <div class="preview-assignment-submission-status">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" class="submission-status-icon">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span class="submission-status-headline">
              ${sub.workflow_state === 'graded'
                ? `Score: ${sub.score ?? 0} / ${pts} pts${pts > 0 || sub.grade ? ` (${sub.grade || Math.round(((sub.score ?? 0) / pts) * 100) + '%'})` : ''}`
                : 'Submitted for Grading'}
            </span>
            ${sub.attempt ? `<span class="assignment-submit-attempt-badge">Attempt ${sub.attempt}</span>` : ''}
          </div>
          ${sub.submitted_at ? `
            <span class="submission-status-timestamp">
              Submitted ${new Date(sub.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
          ` : ''}
        </div>
        ${sub.body ? `
          <div class="preview-assignment-submission-detail">
            ${escapeHtml(sub.body)}
          </div>
        ` : ''}
        ${sub.url ? `
          <div class="preview-assignment-submission-detail">
            <a href="${escapeHtml(sub.url)}" target="_blank" rel="noopener noreferrer" class="preview-assignment-submission-link">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
              <span>${escapeHtml(sub.url)}</span>
            </a>
          </div>
        ` : ''}
        ${Array.isArray(sub.attachments) && sub.attachments.length > 0 ? `
          <div class="preview-assignment-submission-section">
            <span class="preview-assignment-sub-heading">Submitted Files</span>
            <div class="preview-assignment-attachments-list">
              ${sub.attachments.map(att => `
                <div class="preview-assignment-attachment-row">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                  <span class="attachment-row-name">${escapeHtml(att.display_name || att.filename)}</span>
                  ${att.size ? `<span class="attachment-row-size">${safeFormatBytes(att.size)}</span>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        ${Array.isArray(sub.submission_comments) && sub.submission_comments.length > 0 ? `
          <div class="preview-assignment-submission-section">
            <span class="preview-assignment-sub-heading">Comments & Feedback</span>
            <div class="preview-assignment-comments-list">
              ${sub.submission_comments.map(c => `
                <div class="preview-assignment-comment-item">
                  <div class="comment-item-author">${escapeHtml(c.author_name || 'Note')}</div>
                  <div class="comment-item-body">${escapeHtml(c.comment)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </section>
    ` : ''}

    <!-- Instructions / Description Section -->
    <section class="preview-assignment-content-card">
      <div class="preview-assignment-section-title">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="8" y1="6" x2="21" y2="6"></line>
          <line x1="8" y1="12" x2="21" y2="12"></line>
          <line x1="8" y1="18" x2="21" y2="18"></line>
          <line x1="3" y1="6" x2="3.01" y2="6"></line>
          <line x1="3" y1="12" x2="3.01" y2="12"></line>
          <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>
        <span>Instructions</span>
      </div>
      <div class="preview-assignment-html-body">
        ${descHtml}
      </div>
    </section>

    <!-- Inline Quick-Submit Dropzone (shown when file uploads are accepted) -->
    ${allowsUpload ? `
      <section class="preview-assignment-dropzone-card" id="${idPrefix}InlineDropzoneCard">
        <div class="inline-dropzone-header">
          <span class="inline-dropzone-label">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span>File Upload</span>
          </span>
        </div>
        <div class="assignment-dropzone preview-inline-dropzone" id="${idPrefix}InlineDropzone" title="Drag & drop files or click to submit">
          <div class="dropzone-icon">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
              <path d="M12 12v9"></path>
              <path d="m16 16-4-4-4 4"></path>
            </svg>
          </div>
          <div class="dropzone-text">
            <span class="dropzone-headline">Drop submission files here</span>
            <span class="dropzone-sub">or click to open submission window</span>
          </div>
          <div class="dropzone-accepted-hint">
            ${allowedExtsStr
              ? `Accepted formats: ${escapeHtml(allowedExtsStr)}`
              : 'Supports PDF, Word docs, archives, code, and images'}
          </div>
        </div>
      </section>
    ` : ''}
  `;

  // Remove duplicate leading heading inside Canvas HTML if it matches the assignment title
  const htmlBodyEl = container.querySelector('.preview-assignment-html-body');
  if (htmlBodyEl) {
    const firstEl = htmlBodyEl.firstElementChild;
    if (firstEl && /^H[1-4]$/.test(firstEl.tagName)) {
      const headingNorm = (firstEl.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const titleNorm = rawTitle.trim().replace(/\s+/g, ' ').toLowerCase();
      if (headingNorm && headingNorm === titleNorm) {
        firstEl.remove();
      }
    }
  }

  // Post-process images, tables & external links for clean responsive display
  container.querySelectorAll('.preview-assignment-html-body img').forEach(img => {
    img.removeAttribute('width');
    img.removeAttribute('height');
    img.style.setProperty('max-width', '100%', 'important');
    img.style.setProperty('width', 'auto', 'important');
    img.style.setProperty('height', 'auto', 'important');
    img.style.setProperty('display', 'block', 'important');
    img.style.setProperty('object-fit', 'contain', 'important');
    img.style.setProperty('box-sizing', 'border-box', 'important');
    img.loading = 'lazy';

    let parent = img.parentElement;
    while (parent && parent !== htmlBodyEl && parent !== container) {
      if (parent.style.width && (parseInt(parent.style.width, 10) > 300 || parent.style.width.includes('px'))) {
        parent.style.width = '100%';
        parent.style.maxWidth = '100%';
      }
      if (parent.style.minWidth) {
        parent.style.minWidth = '0px';
      }
      if (parent.getAttribute('width')) {
        parent.removeAttribute('width');
      }
      parent = parent.parentElement;
    }
  });

  container.querySelectorAll('.preview-assignment-html-body table, .preview-assignment-html-body figure, .preview-assignment-html-body iframe').forEach(el => {
    if (el.getAttribute('width')) el.removeAttribute('width');
    if (el.style.width && (parseInt(el.style.width, 10) > 300 || el.style.width.includes('px'))) {
      el.style.width = '100%';
      el.style.maxWidth = '100%';
    }
    el.style.minWidth = '0';
  });

  container.querySelectorAll('a[href]').forEach(a => {
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

  // Wire action buttons
  const submitBtn = container.querySelector(`#${idPrefix}AssignmentSubmitBtn`);
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      openAssignmentSubmitModal(assignment, resolvedCourse);
    });
  }

  // Wire inline dropzone
  const inlineDropzone = container.querySelector(`#${idPrefix}InlineDropzone`);
  const inlineBrowseBtn = container.querySelector(`#${idPrefix}InlineBrowseBtn`);
  if (inlineDropzone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      inlineDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        inlineDropzone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      inlineDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        inlineDropzone.classList.remove('dragover');
      }, false);
    });

    inlineDropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      inlineDropzone.classList.remove('dragover');
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) {
        openAssignmentSubmitModal(assignment, resolvedCourse, Array.from(dt.files));
      }
    });

    inlineDropzone.addEventListener('click', (e) => {
      if (e.target && e.target.id === `${idPrefix}InlineBrowseBtn`) return;
      openAssignmentSubmitModal(assignment, resolvedCourse);
    });
  }
  if (inlineBrowseBtn) {
    inlineBrowseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openAssignmentSubmitModal(assignment, resolvedCourse);
    });
  }

  if (directUrl) {
    const openCanvasBtn = container.querySelector(`#${idPrefix}AssignmentOpenCanvasBtn`);
    if (openCanvasBtn) {
      openCanvasBtn.addEventListener('click', () => {
        if (window.canvasDesktop?.openExternal) {
          window.canvasDesktop.openExternal(directUrl);
        } else {
          window.open(directUrl, '_blank');
        }
      });
    }
  }
}

/**
 * Render Assignment Body in Sidepanel
 */
function renderAssignmentPreviewBody(assignment, moduleObj) {
  if (!previewBody) return;
  previewBody.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'preview-assignment-container';

  populateAssignmentDetailContainer(container, assignment, {
    moduleObj,
    course: assignment.course || appState.activeCourse,
    idPrefix: 'preview'
  });

  if (
    appState.activeView === 'calendar' &&
    typeof calPageSelectedDateKey === 'string' &&
    calPageSelectedDateKey &&
    typeof reopenSelectedCalendarDaySidepanel === 'function'
  ) {
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'cal-sidepanel-back-btn';
    backBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
      <span>Back to day overview</span>
    `;
    backBtn.addEventListener('click', () => {
      reopenSelectedCalendarDaySidepanel();
    });
    container.insertBefore(backBtn, container.firstChild);
  }

  previewBody.appendChild(container);
}

/**
 * Render Full-Page Assignment in Reader Tab
 */
async function renderFullPageAssignment(item, moduleObj, tab) {
  if (!moduleReaderContent) return;

  const allAssignments = (tab.courseDetails || appState.courseDetails)?.assignments || [];
  let assignment = allAssignments.find(a =>
    (item.content_id && String(a.id) === String(item.content_id)) ||
    (item.id && String(a.id) === String(item.id)) ||
    (item.title && a.name && a.name.trim().toLowerCase() === item.title.trim().toLowerCase()) ||
    (item.name && a.name && a.name.trim().toLowerCase() === item.name.trim().toLowerCase())
  ) || item;

  const rawTitle = assignment.name || assignment.title || 'Assignment';
  if (readerItemTitle) readerItemTitle.textContent = rawTitle;

  moduleReaderContent.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'preview-assignment-container is-full-page-reader';
  container.style.cssText = 'max-width: 860px; margin: 0 auto; width: 100%;';

  populateAssignmentDetailContainer(container, assignment, {
    moduleObj,
    course: tab.course || assignment.course || appState.activeCourse,
    idPrefix: 'reader'
  });

  moduleReaderContent.appendChild(container);
}

/**
 * Render Assignments Tab
 */
function renderAssignmentsTab(assignments) {
  if (badgeAssignmentsCount) badgeAssignmentsCount.textContent = assignments.length;
  if (!assignmentsList) return;
  assignmentsList.innerHTML = '';

  const now = new Date().getTime();
  let countUpcoming = 0;
  let countSubmitted = 0;

  assignments.forEach(a => {
    const isGraded = a.submission?.workflow_state === 'graded';
    const isSubmitted = a.submission?.workflow_state === 'submitted' || Boolean(a.submission?.submitted_at);
    const rawDue = a.due_at ? new Date(a.due_at).getTime() : null;
    const dueTime = rawDue !== null && !isNaN(rawDue) ? rawDue : null;
    const isPastDue = (dueTime !== null && dueTime < now) || Boolean(a.submission?.missing);

    if (isGraded || isSubmitted) {
      countSubmitted++;
    } else if (!isPastDue) {
      countUpcoming++;
    }
  });

  const countAllEl = document.getElementById('courseAssignCountAll');
  const countUpcomingEl = document.getElementById('courseAssignCountUpcoming');
  const countSubmittedEl = document.getElementById('courseAssignCountSubmitted');
  if (countAllEl) countAllEl.textContent = assignments.length;
  if (countUpcomingEl) countUpcomingEl.textContent = countUpcoming;
  if (countSubmittedEl) countSubmittedEl.textContent = countSubmitted;

  const filter = appState.assignmentFilter;
  const filtered = assignments.filter(a => {
    const isGraded = a.submission?.workflow_state === 'graded';
    const isSubmitted = a.submission?.workflow_state === 'submitted' || Boolean(a.submission?.submitted_at);
    const rawDue = a.due_at ? new Date(a.due_at).getTime() : null;
    const dueTime = rawDue !== null && !isNaN(rawDue) ? rawDue : null;
    const isPastDue = (dueTime !== null && dueTime < now) || Boolean(a.submission?.missing);

    if (filter === 'upcoming') {
      return !isGraded && !isSubmitted && !isPastDue;
    }
    if (filter === 'submitted') {
      return isGraded || isSubmitted;
    }
    return true;
  });

  if (filtered.length === 0) {
    emptyAssignmentsState.classList.remove('hidden');
    return;
  }

  emptyAssignmentsState.classList.add('hidden');

  filtered.forEach((assign, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'home-sub-assign-item assignment-row-card';
    itemEl.setAttribute('data-assignment-id', assign.id);
    itemEl.title = 'Click to open assignment in sidepanel';

    if (appState.activeFile?.id == assign.id && appState.activeFile?.is_assignment) {
      itemEl.classList.add('active');
    }

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
          ${assign.points_possible !== undefined && assign.points_possible !== null ? `<span class="home-dash-pts-tag" style="margin-left:0;">${assign.points_possible} pts</span>` : '<span></span>'}
          <div style="display:flex; align-items:center; gap:8px;">
            ${statusPillHtml}
          </div>
        </div>
        <div class="home-assign-tile-title" title="${escapeHtml(assign.name || 'Untitled Assignment')}">${escapeHtml(assign.name || 'Untitled Assignment')}</div>
      </div>
    `;

    itemEl.addEventListener('click', () => {
      assignmentsList.querySelectorAll('.home-sub-assign-item').forEach(el => el.classList.remove('active'));
      itemEl.classList.add('active');
      handleAssignmentPreview(assign);
    });

    assignmentsList.appendChild(itemEl);
  });
}

/**
 * Local File Operations & Disk Synchronization
/**
 * Find matching demo file helper
 */
function findMatchingDemoFile(demoList, file) {
  if (!file || !Array.isArray(demoList)) return null;
  const rawName = file.filename || file.display_name || '';
  const fileBaseName = rawName.toLowerCase();
  const fileExtName = ensureFilenameExtension(rawName, file.content_type || file['content-type'] || (file.localPdfPath ? 'application/pdf' : '')).toLowerCase();
  const fileNoExt = fileBaseName.replace(/\.[^/.]+$/, '').trim();

  return demoList.find(df => {
    if (!df) return false;
    if (file.id && df.id && String(df.id) === String(file.id)) return true;
    const dfName = (df.filename || '').toLowerCase();
    const dfNoExt = dfName.replace(/\.[^/.]+$/, '').trim();
    if (dfName === fileBaseName || dfName === fileExtName) return true;
    if (dfNoExt === fileNoExt && fileNoExt.length > 0) return true;
    if (fileNoExt.length > 4 && (dfNoExt.includes(fileNoExt) || fileNoExt.includes(dfNoExt))) return true;
    return false;
  });
}

/**
 * Downloads a file to the user's local disk if not already downloaded.
 * Returns the local file path on disk or null.
 */
async function ensureFileDownloaded(file) {
  if (!file) return null;
  if (file.local_path) return file.local_path;

  // 1. If in demo mode or local asset, ensure copied to user directory
  if (appState.isDemo || file.isLocal) {
    if (window.canvasDesktop?.ensureDemoFiles) {
      const res = await window.canvasDesktop.ensureDemoFiles();
      const demoList = res?.list || (Array.isArray(res?.files) ? res.files : Object.entries(res?.files || {}).map(([filename, localPath]) => ({ filename, localPath })));
      if (res?.success && Array.isArray(demoList)) {
        const match = findMatchingDemoFile(demoList, file);
        if (match && match.localPath) {
          file.local_path = match.localPath;
          file.isLocal = true;
          return file.local_path;
        }
      }
    }
    // In demo mode, if not yet matched, try downloadFile IPC which resolves from mock files safely
    if (window.canvasDesktop?.downloadFile) {
      try {
        const properName = ensureFilenameExtension(
          file.filename || file.display_name || 'Document',
          file.content_type || file['content-type'] || 'application/pdf'
        );
        const res = await window.canvasDesktop.downloadFile({
          courseId: appState.activeCourse?.id || 'default',
          fileId: file.id,
          url: file.url,
          filename: properName,
          domain: 'demo',
          token: 'demo'
        });
        if (res?.success && res.localPath) {
          file.local_path = res.localPath;
          file.isLocal = true;
          return file.local_path;
        }
      } catch (_) { }
    }
    return null;
  }

  // 2. If Canvas remote file, download via IPC
  if (window.canvasDesktop?.downloadFile) {
    try {
      const properName = ensureFilenameExtension(
        file.filename || file.display_name || 'Document',
        file.content_type || file['content-type'] || (file.localPdfPath ? 'application/pdf' : '')
      );
      const res = await window.canvasDesktop.downloadFile({
        courseId: appState.activeCourse?.id || 'default',
        fileId: file.id,
        url: file.url,
        filename: properName,
        domain: appState.currentDomain,
        token: appState.currentToken
      });
      if (res?.success && res.localPath) {
        file.local_path = res.localPath;
        file.isLocal = true;
        return file.local_path;
      }
    } catch (err) {
      console.error('Error downloading file to local disk:', err);
    }
  }

  return file.local_path || null;
}

async function openFileLocally(file) {
  if (!file) return;
  const fileName = ensureFilenameExtension(
    file.display_name || file.filename || 'File',
    file.content_type || file['content-type'] || (file.localPdfPath ? 'application/pdf' : '')
  );
  showToast(`Opening "${fileName}" with default macOS application...`);

  const localPath = await ensureFileDownloaded(file);
  if (localPath && window.canvasDesktop?.openLocalFile) {
    const res = await window.canvasDesktop.openLocalFile(localPath);
    if (!res?.success) {
      showToast(`Could not open file: ${res?.error || 'Unknown error'}`);
    }
  } else {
    showToast(`File "${fileName}" could not be opened locally.`);
  }
}

async function revealFileInFinder(file) {
  if (!file) return;
  const fileName = ensureFilenameExtension(
    file.display_name || file.filename || 'File',
    file.content_type || file['content-type'] || (file.localPdfPath ? 'application/pdf' : '')
  );
  const localPath = await ensureFileDownloaded(file);
  if (localPath && window.canvasDesktop?.showInFolder) {
    await window.canvasDesktop.showInFolder(localPath);
    showToast(`Revealed "${fileName}" in Finder`);
  } else {
    showToast(`File "${fileName}" has not been downloaded locally yet.`);
  }
}

async function syncCourseFilesLocally(course, details, notify = false) {
  if (!details || !Array.isArray(details.files) || details.files.length === 0) return;

  if (downloadAllFilesBtn) {
    downloadAllFilesBtn.disabled = true;
    downloadAllFilesBtn.innerHTML = `
      <div class="button-spinner small-spinner"></div>
      <span>Syncing Local Files...</span>
    `;
  }

  try {
    if (appState.isDemo) {
      if (window.canvasDesktop?.ensureDemoFiles) {
        const res = await window.canvasDesktop.ensureDemoFiles();
        const demoList = res?.list || (Array.isArray(res?.files) ? res.files : Object.entries(res?.files || {}).map(([filename, localPath]) => ({ filename, localPath })));
        if (res?.success && Array.isArray(demoList)) {
          details.files.forEach(f => {
            const match = findMatchingDemoFile(demoList, f);
            if (match) {
              f.local_path = match.localPath;
              f.isLocal = true;
            }
          });
        }
      }
    } else {
      if (window.canvasDesktop?.downloadAllCourseFiles) {
        const res = await window.canvasDesktop.downloadAllCourseFiles({
          courseId: course.id,
          files: details.files,
          domain: appState.currentDomain,
          token: appState.currentToken
        });
        if (res?.success && Array.isArray(res.results)) {
          res.results.forEach(r => {
            if (r.success && r.localPath) {
              const match = details.files.find(f => f.id === r.id || (f.display_name || f.filename) === r.filename);
              if (match) {
                match.local_path = r.localPath;
                match.isLocal = true;
              }
            }
          });
        }
      }
    }

    renderFilesTab(details.files);

    if (appState.activeFile && previewDetailLocal) {
      previewDetailLocal.textContent = appState.activeFile.local_path ? 'Saved Locally (on disk)' : 'Cloud Storage';
    }

    if (notify) {
      const savedCount = details.files.filter(f => f.local_path).length;
      showToast(`Successfully saved ${savedCount} of ${details.files.length} files to local disk!`);
    }
  } catch (err) {
    console.error('Error syncing files locally:', err);
    if (notify) showToast('Failed to download some files locally');
  } finally {
    if (downloadAllFilesBtn) {
      downloadAllFilesBtn.disabled = false;
      downloadAllFilesBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>Download All Locally</span>
      `;
    }
  }
}

/**
 * Render Files Tab
 */
function renderFilesTab(files) {
  if (!badgeFilesCount || !courseFilesList) return;
  badgeFilesCount.textContent = files.length;
  courseFilesList.innerHTML = '';

  const query = (filesSearchInput?.value || '').trim().toLowerCase();
  const filtered = files.filter(f => {
    const name = (f.display_name || f.filename || '').toLowerCase();
    return !query || name.includes(query);
  });

  if (filtered.length === 0) {
    if (emptyFilesState) emptyFilesState.classList.remove('hidden');
    return;
  }

  if (emptyFilesState) emptyFilesState.classList.add('hidden');

  filtered.forEach(file => {
    const card = document.createElement('div');
    card.className = 'file-row-card';
    if (appState.activeFile && appState.activeFile.id === file.id) {
      card.classList.add('active');
    }

    const typeInfo = getFileTypeInfo(file);
    const rawDisplayName = file.display_name || file.filename || 'Document';
    const cleanFileName = ensureFilenameExtension(rawDisplayName, file.content_type || file['content-type'] || (typeInfo.type === 'pdf' ? 'application/pdf' : ''));
    file.display_name = cleanFileName;
    file.filename = cleanFileName;

    const sizeStr = formatFileSize(file.size);
    const dateStr = file.updated_at ? new Date(file.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
    const isDownloaded = Boolean(file.local_path);

    card.innerHTML = `
      <div class="file-row-left">
        <div class="file-type-icon ${typeInfo.className}">${typeInfo.icon}</div>
        <div class="file-details">
          <div class="file-title-row" style="display:flex; align-items:center; gap:8px;">
            <span class="file-title" title="${escapeHtml(cleanFileName)}">${escapeHtml(cleanFileName)}</span>
            <span class="file-local-chip ${isDownloaded ? '' : 'remote'}">
              ${isDownloaded ? '✓ Saved Locally' : '☁️ Cloud'}
            </span>
          </div>
          <div class="file-meta-row">
            <span>${escapeHtml(typeInfo.label)}</span>
            <span>&bull;</span>
            <span>${sizeStr}</span>
            <span>&bull;</span>
            <span>Updated ${dateStr}</span>
          </div>
        </div>
      </div>
      <div class="file-row-actions">
        <button class="icon-button small-btn file-open-external-btn" title="Open with default macOS app" style="margin-right: 4px; padding: 4px 6px;">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </button>
        <span class="file-preview-pill">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          View
        </span>
      </div>
    `;

    const extBtn = card.querySelector('.file-open-external-btn');
    if (extBtn) {
      extBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openFileLocally(file);
      });
    }

    card.addEventListener('click', () => {
      openFilePreview(file);
      document.querySelectorAll('.file-row-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
    });

    card.addEventListener('dblclick', () => {
      openFileLocally(file);
    });

    courseFilesList.appendChild(card);
  });
}

