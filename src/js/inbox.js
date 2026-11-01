/**
 * Canvas Next - Inbox & Conversations Controller
 * Provides seamless integration with Canvas LMS Conversations API (/api/v1/conversations),
 * offline caching, thread viewing, replying, and composing new messages.
 */

(function () {
  'use strict';

  let hasPopulatedCourses = false;

  /**
   * Initialize Inbox module event listeners
   */
  function initInbox() {
    // Refresh button
    if (inboxRefreshBtn) {
      inboxRefreshBtn.addEventListener('click', async () => {
        inboxRefreshBtn.disabled = true;
        inboxRefreshBtn.classList.add('loading');
        await loadInboxConversations(true);
        inboxRefreshBtn.disabled = false;
        inboxRefreshBtn.classList.remove('loading');
        if (typeof showToast === 'function') {
          showToast('Inbox updated', 'info');
        }
      });
    }

    // Compose buttons
    if (inboxComposeBtn) {
      inboxComposeBtn.addEventListener('click', () => openInboxComposeModal());
    }
    if (inboxEmptyComposeBtn) {
      inboxEmptyComposeBtn.addEventListener('click', () => openInboxComposeModal());
    }
    if (closeInboxComposeModalBtn) {
      closeInboxComposeModalBtn.addEventListener('click', () => closeInboxComposeModal());
    }
    if (inboxComposeCancelBtn) {
      inboxComposeCancelBtn.addEventListener('click', () => closeInboxComposeModal());
    }
    if (inboxComposeModal) {
      inboxComposeModal.addEventListener('click', (e) => {
        if (e.target === inboxComposeModal) {
          closeInboxComposeModal();
        }
      });
    }

    // Filter button & Popover in inbox sidebar
    if (inboxFilterBtn) {
      inboxFilterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleInboxFilterMenu();
      });
    }

    // Close filter menu when clicking outside
    document.addEventListener('click', (e) => {
      if (inboxFilterMenu && !inboxFilterMenu.classList.contains('hidden')) {
        if (!inboxFilterMenu.contains(e.target) && e.target !== inboxFilterBtn) {
          inboxFilterMenu.classList.add('hidden');
        }
      }
    });

    updateInboxFilterBtnIndicator();

    // Search input
    if (inboxSearchInput) {
      inboxSearchInput.addEventListener('input', () => {
        appState.inboxSearchQuery = inboxSearchInput.value.trim().toLowerCase();
        if (inboxSearchClearBtn) {
          inboxSearchClearBtn.classList.toggle('hidden', !appState.inboxSearchQuery);
        }
        renderInboxConversations();
      });
    }

    // Search clear button
    if (inboxSearchClearBtn) {
      inboxSearchClearBtn.addEventListener('click', () => {
        if (inboxSearchInput) {
          inboxSearchInput.value = '';
          inboxSearchInput.focus();
        }
        appState.inboxSearchQuery = '';
        inboxSearchClearBtn.classList.add('hidden');
        renderInboxConversations();
      });
    }

    // Reply Form
    if (inboxReplyForm) {
      inboxReplyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendInboxReply();
      });
    }

    // Keyboard shortcut in Reply Textarea (Cmd/Ctrl + Enter)
    if (inboxReplyText) {
      inboxReplyText.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          sendInboxReply();
        }
      });
    }

    // Thread Star toggle button
    if (inboxThreadStarBtn) {
      inboxThreadStarBtn.addEventListener('click', () => {
        toggleActiveConversationStar();
      });
    }

    // Compose form submission
    if (inboxComposeForm) {
      inboxComposeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendNewInboxConversation();
      });
    }
  }

  /**
   * Toggle Inbox Filter Menu popover
   */
  function toggleInboxFilterMenu() {
    if (!inboxFilterMenu) return;
    const isHidden = inboxFilterMenu.classList.contains('hidden');
    if (isHidden) {
      populateInboxFilterMenuOptions();
      inboxFilterMenu.classList.remove('hidden');
    } else {
      inboxFilterMenu.classList.add('hidden');
    }
  }

  /**
   * Populate Filter Menu Popover (Mailbox/Scope + Courses)
   */
  function populateInboxFilterMenuOptions() {
    const activeScope = appState.inboxScope || 'inbox';
    const activeCourse = appState.inboxCourseFilter || 'all';

    // Scopes (Inbox, Unread, Starred, Sent, Archived)
    if (inboxScopeFilterOptions) {
      const scopes = [
        { id: 'inbox', label: 'Inbox' },
        { id: 'unread', label: 'Unread' },
        { id: 'starred', label: 'Starred' },
        { id: 'sent', label: 'Sent' },
        { id: 'archived', label: 'Archived' }
      ];
      let scopesHtml = '';
      scopes.forEach(s => {
        const isSelected = activeScope === s.id;
        scopesHtml += `
          <div class="inbox-filter-opt ${isSelected ? 'active' : ''}" onclick="window.selectInboxScopeFilter('${s.id}')">
            <span class="inbox-filter-opt-name">${s.label}</span>
            ${isSelected ? '<span class="inbox-filter-check">✓</span>' : ''}
          </div>
        `;
      });
      inboxScopeFilterOptions.innerHTML = scopesHtml;
    }

    // Courses
    if (inboxCourseFilterOptions) {
      const courses = appState.courses || [];
      let coursesHtml = `
        <div class="inbox-filter-opt ${activeCourse === 'all' ? 'active' : ''}" onclick="window.selectInboxCourseFilterOpt('all')">
          <span class="inbox-filter-opt-name">All Courses</span>
          ${activeCourse === 'all' ? '<span class="inbox-filter-check">✓</span>' : ''}
        </div>
      `;
      if (courses.length > 0) {
        courses.forEach(c => {
          const courseVal = `course_${c.id}`;
          const isSelected = activeCourse === courseVal;
          const name = c.course_code || c.name || `Course ${c.id}`;
          coursesHtml += `
            <div class="inbox-filter-opt ${isSelected ? 'active' : ''}" onclick="window.selectInboxCourseFilterOpt('${courseVal}')">
              <span class="inbox-filter-opt-name">${escapeHtml(name)}</span>
              ${isSelected ? '<span class="inbox-filter-check">✓</span>' : ''}
            </div>
          `;
        });
      }
      inboxCourseFilterOptions.innerHTML = coursesHtml;
    }
  }

  /**
   * Handle selecting scope filter (e.g. unread, starred, etc.)
   */
  function selectInboxScopeFilter(scope) {
    appState.inboxScope = scope;
    if (inboxFilterMenu) {
      inboxFilterMenu.classList.add('hidden');
    }
    updateInboxFilterBtnIndicator();
    loadInboxConversations();
  }
  window.selectInboxScopeFilter = selectInboxScopeFilter;

  /**
   * Handle selecting course filter
   */
  function selectInboxCourseFilterOpt(courseVal) {
    appState.inboxCourseFilter = courseVal;
    if (inboxFilterMenu) {
      inboxFilterMenu.classList.add('hidden');
    }
    updateInboxFilterBtnIndicator();
    loadInboxConversations();
  }
  window.selectInboxCourseFilterOpt = selectInboxCourseFilterOpt;

  /**
   * Update filter button visual indicator if any filter is active
   */
  function updateInboxFilterBtnIndicator() {
    if (!inboxFilterBtn) return;
    const isFiltered = (appState.inboxScope && appState.inboxScope !== 'inbox') || (appState.inboxCourseFilter && appState.inboxCourseFilter !== 'all');
    if (isFiltered) {
      inboxFilterBtn.classList.add('filter-active');
      inboxFilterBtn.title = `Filtered (${appState.inboxScope || 'inbox'})`;
    } else {
      inboxFilterBtn.classList.remove('filter-active');
      inboxFilterBtn.title = 'Filter conversations';
    }
  }

  /**
   * Populate course dropdowns for filter and composer
   */
  function populateInboxCourseDropdowns() {
    if (!appState.courses || !appState.courses.length) return;

    if (inboxCourseFilter && inboxCourseFilter.options.length <= 1) {
      const currentVal = inboxCourseFilter.value;
      inboxCourseFilter.innerHTML = '<option value="all">All Courses</option>';
      appState.courses.forEach(c => {
        const opt = document.createElement('option');
        opt.value = `course_${c.id}`;
        opt.textContent = c.course_code || c.name || `Course ${c.id}`;
        inboxCourseFilter.appendChild(opt);
      });
      inboxCourseFilter.value = currentVal || 'all';
    }

    if (inboxComposeCourseSelect && inboxComposeCourseSelect.options.length <= 1) {
      inboxComposeCourseSelect.innerHTML = '<option value="">Select a Course...</option>';
      appState.courses.forEach(c => {
        const opt = document.createElement('option');
        opt.value = `course_${c.id}`;
        opt.textContent = `${c.course_code ? c.course_code + ': ' : ''}${c.name || 'Course ' + c.id}`;
        inboxComposeCourseSelect.appendChild(opt);
      });
    }

    hasPopulatedCourses = true;
  }

  /**
   * Load Conversations from Canvas API (or Demo data)
   */
  async function loadInboxConversations(forceRefresh = false) {
    populateInboxCourseDropdowns();

    if (!appState.inboxConversations || !appState.inboxConversations.length || forceRefresh) {
      if (inboxConversationsList) {
        inboxConversationsList.innerHTML = `
          <div class="inbox-list-loading">
            <div class="inbox-loading-spinner"></div>
            <span>Loading conversations...</span>
          </div>
        `;
      }
    }

    try {
      if (!window.canvasDesktop || !window.canvasDesktop.getConversations) {
        throw new Error('Canvas desktop conversations API unavailable');
      }

      const res = await window.canvasDesktop.getConversations({
        domain: appState.currentDomain,
        token: appState.currentToken,
        scope: appState.inboxScope || 'inbox',
        filter: appState.inboxCourseFilter !== 'all' ? appState.inboxCourseFilter : null
      });

      if (res && res.success && Array.isArray(res.data)) {
        appState.inboxConversations = res.data;
      } else if (res && Array.isArray(res)) {
        appState.inboxConversations = res;
      } else {
        appState.inboxConversations = [];
      }

      updateInboxBadges();
      renderInboxConversations();

      // If active conversation is set, select it; otherwise select first if available on larger screen
      if (appState.activeConversationId) {
        const exists = appState.inboxConversations.some(c => String(c.id) === String(appState.activeConversationId));
        if (exists) {
          openInboxConversation(appState.activeConversationId);
        } else {
          deselectActiveConversation();
        }
      } else if (appState.inboxConversations.length > 0 && window.innerWidth > 768) {
        openInboxConversation(appState.inboxConversations[0].id);
      } else {
        deselectActiveConversation();
      }
    } catch (err) {
      console.error('Failed to load Canvas conversations:', err);
      if (inboxConversationsList) {
        inboxConversationsList.innerHTML = `
          <div class="inbox-empty-state">
            <p>Could not load conversations.</p>
            <button type="button" class="secondary-button small-btn" onclick="loadInboxConversations(true)">Try Again</button>
          </div>
        `;
      }
    }
  }

  /**
   * Update badge counts in sidebar and scope tabs
   */
  function updateInboxBadges() {
    const allConversations = appState.inboxConversations || [];
    const unreadCount = allConversations.filter(c => c.workflow_state === 'unread').length;

    // Sidebar badge
    if (sidebarInboxBadge) {
      if (unreadCount > 0) {
        sidebarInboxBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        sidebarInboxBadge.classList.remove('hidden');
      } else {
        sidebarInboxBadge.classList.add('hidden');
      }
    }

    // Scope count pills
    if (scopeCountInbox) {
      if (allConversations.length > 0) {
        scopeCountInbox.textContent = allConversations.length;
        scopeCountInbox.classList.remove('hidden');
      } else {
        scopeCountInbox.classList.add('hidden');
      }
    }

    if (scopeCountUnread) {
      if (unreadCount > 0) {
        scopeCountUnread.textContent = unreadCount;
        scopeCountUnread.classList.remove('hidden');
      } else {
        scopeCountUnread.classList.add('hidden');
      }
    }
  }

  /**
   * Helper: format message timestamp
   */
  function formatInboxTime(isoDateStr) {
    if (!isoDateStr) return '';
    try {
      const date = new Date(isoDateStr);
      const now = new Date();
      const diffMs = now - date;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      } else if (diffDays === 1) {
        return 'Yesterday';
      } else if (diffDays < 7) {
        return date.toLocaleDateString([], { weekday: 'short' });
      } else if (date.getFullYear() === now.getFullYear()) {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      } else {
        return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
      }
    } catch {
      return '';
    }
  }

  /**
   * Helper: get initials from author / name
   */
  function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  /**
   * Helper: extract clean context tag from context_name or context_code
   */
  function formatContextLabel(conv) {
    if (conv.context_name) {
      const parts = conv.context_name.split(':');
      if (parts.length > 1) return parts[0].trim();
      return conv.context_name.length > 18 ? conv.context_name.substring(0, 16) + '…' : conv.context_name;
    }
    if (conv.context_code) {
      return conv.context_code.replace('course_', 'Course ');
    }
    return 'Canvas';
  }

  /**
   * Render conversation list on the left pane
   */
  function renderInboxConversations() {
    if (!inboxConversationsList) return;

    let items = appState.inboxConversations || [];

    // Filter by search query if any
    if (appState.inboxSearchQuery) {
      const q = appState.inboxSearchQuery;
      items = items.filter(c => {
        const sub = (c.subject || '').toLowerCase();
        const msg = (c.last_message || '').toLowerCase();
        const ctx = (c.context_name || '').toLowerCase();
        const authors = Array.isArray(c.visible_author_names) ? c.visible_author_names.join(' ').toLowerCase() : '';
        return sub.includes(q) || msg.includes(q) || ctx.includes(q) || authors.includes(q);
      });
    }

    if (!items.length) {
      inboxConversationsList.innerHTML = `
        <div class="inbox-empty-state">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
            <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
          </svg>
          <p class="inbox-empty-title">No conversations found</p>
          <p class="inbox-empty-desc">${appState.inboxSearchQuery ? 'No messages match your search term.' : 'Your ' + appState.inboxScope + ' box is currently empty.'}</p>
        </div>
      `;
      return;
    }

    const html = items.map(c => {
      const isUnread = c.workflow_state === 'unread';
      const isActive = String(c.id) === String(appState.activeConversationId);
      const isStarred = Boolean(c.starred);
      const authors = (c.visible_author_names && c.visible_author_names.length)
        ? c.visible_author_names.join(', ')
        : (c.participants && c.participants.length ? c.participants.map(p => p.name).join(', ') : 'Conversation');
      const timeStr = formatInboxTime(c.last_message_at || c.updated_at);
      const contextTag = formatContextLabel(c);
      const initials = getInitials(authors);
      const avatarUrl = c.avatar_url;

      return `
        <div class="inbox-conversation-item ${isUnread ? 'unread' : ''} ${isActive ? 'active' : ''}" data-conv-id="${c.id}" role="button" tabindex="0">
          <div class="inbox-conv-avatar-col">
            ${avatarUrl
              ? `<img class="inbox-conv-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(authors)}" onerror="this.outerHTML='<div class=\\'inbox-conv-fallback\\'>${initials}</div>'" />`
              : `<div class="inbox-conv-fallback">${initials}</div>`
            }
          </div>
          <div class="inbox-conv-content-col">
            <div class="inbox-conv-top-row">
              <span class="inbox-conv-author" title="${escapeHtml(authors)}">${escapeHtml(authors)}</span>
              <span class="inbox-conv-time">${timeStr}</span>
            </div>
            <div class="inbox-conv-subject-row">
              <span class="inbox-conv-subject">${escapeHtml(c.subject || '(No Subject)')}</span>
              ${isStarred ? `
                <svg class="inbox-star-icon starred" viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
              ` : ''}
            </div>
            <div class="inbox-conv-snippet">${escapeHtml(c.last_message || '')}</div>
            <div class="inbox-conv-meta-row">
              <span class="inbox-conv-tag">${escapeHtml(contextTag)}</span>
              ${c.message_count > 1 ? `<span class="inbox-conv-count">${c.message_count} msgs</span>` : ''}
              ${isUnread ? `<span class="inbox-conv-unread-dot" title="Unread"></span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    inboxConversationsList.innerHTML = html;

    // Attach click listeners to list items
    inboxConversationsList.querySelectorAll('.inbox-conversation-item').forEach(item => {
      item.addEventListener('click', () => {
        const convId = item.getAttribute('data-conv-id');
        if (convId) {
          openInboxConversation(convId);
        }
      });
    });
  }

  /**
   * Deselect active conversation and show empty placeholder
   */
  function deselectActiveConversation() {
    appState.activeConversationId = null;
    if (inboxThreadCard) inboxThreadCard.classList.add('hidden');
    if (inboxThreadEmptyState) inboxThreadEmptyState.classList.remove('hidden');
    if (inboxConversationsList) {
      inboxConversationsList.querySelectorAll('.inbox-conversation-item').forEach(el => el.classList.remove('active'));
    }
  }

  /**
   * Open and display a specific conversation thread
   */
  async function openInboxConversation(conversationId) {
    appState.activeConversationId = conversationId;

    // Highlight active in list
    if (inboxConversationsList) {
      inboxConversationsList.querySelectorAll('.inbox-conversation-item').forEach(el => {
        const isCurrent = String(el.getAttribute('data-conv-id')) === String(conversationId);
        el.classList.toggle('active', isCurrent);
      });
    }

    // Switch view panes
    if (inboxThreadEmptyState) inboxThreadEmptyState.classList.add('hidden');
    if (inboxThreadCard) inboxThreadCard.classList.remove('hidden');

    // Show loading state in message stream
    if (inboxMessagesList) {
      inboxMessagesList.innerHTML = `
        <div class="inbox-thread-loading">
          <div class="inbox-loading-spinner"></div>
          <span>Loading messages...</span>
        </div>
      `;
    }

    try {
      const res = await window.canvasDesktop.getConversation({
        domain: appState.currentDomain,
        token: appState.currentToken,
        conversationId
      });

      const conv = res && res.success && res.data ? res.data : (res && res.id ? res : null);
      if (!conv) {
        throw new Error('Conversation not found');
      }

      // Mark locally as read
      const foundInList = (appState.inboxConversations || []).find(c => String(c.id) === String(conversationId));
      if (foundInList && foundInList.workflow_state === 'unread') {
        foundInList.workflow_state = 'read';
        updateInboxBadges();
        // Update DOM unread dot
        const itemEl = inboxConversationsList ? inboxConversationsList.querySelector(`[data-conv-id="${conversationId}"]`) : null;
        if (itemEl) {
          itemEl.classList.remove('unread');
          const dot = itemEl.querySelector('.inbox-conv-unread-dot');
          if (dot) dot.remove();
        }
      }

      // Populate header
      if (inboxThreadSubject) {
        inboxThreadSubject.textContent = conv.subject || '(No Subject)';
      }
      if (inboxThreadContextBadge) {
        inboxThreadContextBadge.textContent = conv.context_name || conv.context_code || 'Course Thread';
      }
      if (inboxThreadMessageCount) {
        const msgCount = (conv.messages && conv.messages.length) || conv.message_count || 1;
        inboxThreadMessageCount.textContent = `${msgCount} message${msgCount === 1 ? '' : 's'}`;
      }

      // Populate participant avatars & names
      if (inboxThreadParticipants) {
        const participants = conv.participants || [];
        inboxThreadParticipants.innerHTML = participants.map(p => `
          <div class="inbox-participant-pill" title="${escapeHtml(p.full_name || p.name || 'Participant')}">
            <span class="inbox-participant-avatar">${getInitials(p.name || p.full_name)}</span>
            <span class="inbox-participant-name">${escapeHtml(p.name || p.full_name || 'Participant')}</span>
          </div>
        `).join('');
      }

      // Star button
      if (inboxThreadStarBtn) {
        inboxThreadStarBtn.classList.toggle('active', Boolean(conv.starred));
      }

      // Populate message stream
      const messages = Array.isArray(conv.messages) && conv.messages.length ? conv.messages : [
        {
          id: conv.id,
          author_id: conv.participants?.[0]?.id || 0,
          created_at: conv.last_message_at || new Date().toISOString(),
          body: conv.last_message || '(No message content)'
        }
      ];

      renderMessagesStream(messages, conv.participants || []);

      // Focus reply textarea on desktop
      if (inboxReplyText && window.innerWidth > 900) {
        inboxReplyText.focus();
      }
    } catch (err) {
      console.error('Failed to open conversation:', err);
      if (inboxMessagesList) {
        inboxMessagesList.innerHTML = `
          <div class="inbox-empty-state">
            <p>Could not load thread messages.</p>
          </div>
        `;
      }
    }
  }

  /**
   * Render chronological messages stream
   */
  function renderMessagesStream(messages, participants) {
    if (!inboxMessagesList) return;

    const participantMap = new Map();
    participants.forEach(p => participantMap.set(p.id, p));

    const html = messages.map(m => {
      const author = participantMap.get(m.author_id) || {
        name: 'Alex Rivera',
        avatar_url: ''
      };
      const authorName = author.name || author.full_name || 'Participant';
      const initials = getInitials(authorName);
      const timeStr = formatInboxTime(m.created_at);
      const isSelf = author.id === 101 || (appState.profileData && author.id === appState.profileData.id);

      // Safe multi-line body with paragraph and link formatting
      const cleanBody = escapeHtml(m.body || '').replace(/\n/g, '<br/>');

      return `
        <div class="inbox-message-row ${isSelf ? 'is-self' : ''}">
          <div class="inbox-message-avatar">
            ${author.avatar_url
              ? `<img src="${escapeHtml(author.avatar_url)}" alt="${escapeHtml(authorName)}" onerror="this.outerHTML='<div class=\\'inbox-avatar-fallback\\'>${initials}</div>'" />`
              : `<div class="inbox-avatar-fallback">${initials}</div>`
            }
          </div>
          <div class="inbox-message-card">
            <div class="inbox-message-meta">
              <span class="inbox-message-sender">${escapeHtml(authorName)}${isSelf ? ' (You)' : ''}</span>
              <span class="inbox-message-time">${timeStr}</span>
            </div>
            <div class="inbox-message-body">${cleanBody}</div>
          </div>
        </div>
      `;
    }).join('');

    inboxMessagesList.innerHTML = html;

    // Scroll to bottom so latest message is immediately visible
    setTimeout(() => {
      if (inboxMessagesList) {
        inboxMessagesList.scrollTop = inboxMessagesList.scrollHeight;
      }
    }, 40);
  }

  /**
   * Toggle star on active conversation
   */
  function toggleActiveConversationStar() {
    if (!appState.activeConversationId) return;
    const conv = (appState.inboxConversations || []).find(c => String(c.id) === String(appState.activeConversationId));
    if (conv) {
      conv.starred = !conv.starred;
      if (inboxThreadStarBtn) {
        inboxThreadStarBtn.classList.toggle('active', conv.starred);
      }
      renderInboxConversations();
    }
  }

  /**
   * Send Reply to active conversation
   */
  async function sendInboxReply() {
    if (!inboxReplyText || !appState.activeConversationId) return;
    const text = inboxReplyText.value.trim();
    if (!text) return;

    if (inboxReplySendBtn) {
      inboxReplySendBtn.disabled = true;
      inboxReplySendBtn.classList.add('loading');
    }

    try {
      const res = await window.canvasDesktop.sendConversationMessage({
        domain: appState.currentDomain,
        token: appState.currentToken,
        conversationId: appState.activeConversationId,
        body: text
      });

      if (!res || !res.success) {
        throw new Error(res?.error || 'Failed to send reply');
      }

      // Append message bubble immediately to stream
      const myName = appState.profileData?.name || 'Alex Rivera';
      const newMsg = {
        id: Date.now(),
        author_id: 101,
        created_at: new Date().toISOString(),
        body: text
      };

      if (inboxMessagesList) {
        const bubbleHtml = `
          <div class="inbox-message-row is-self animate-in">
            <div class="inbox-message-avatar">
              <div class="inbox-avatar-fallback">${getInitials(myName)}</div>
            </div>
            <div class="inbox-message-card">
              <div class="inbox-message-meta">
                <span class="inbox-message-sender">${escapeHtml(myName)} (You)</span>
                <span class="inbox-message-time">Just now</span>
              </div>
              <div class="inbox-message-body">${escapeHtml(text).replace(/\n/g, '<br/>')}</div>
            </div>
          </div>
        `;
        inboxMessagesList.insertAdjacentHTML('beforeend', bubbleHtml);
        inboxMessagesList.scrollTop = inboxMessagesList.scrollHeight;
      }

      // Clear input
      inboxReplyText.value = '';

      // Update in local conversations list
      const conv = (appState.inboxConversations || []).find(c => String(c.id) === String(appState.activeConversationId));
      if (conv) {
        conv.last_message = text;
        conv.last_message_at = new Date().toISOString();
        conv.message_count = (conv.message_count || 1) + 1;
        renderInboxConversations();
      }

      if (typeof showToast === 'function') {
        showToast('Reply sent successfully', 'success');
      }
    } catch (err) {
      console.error('Failed to send reply:', err);
      if (typeof showToast === 'function') {
        showToast('Failed to send reply: ' + err.message, 'error');
      }
    } finally {
      if (inboxReplySendBtn) {
        inboxReplySendBtn.disabled = false;
        inboxReplySendBtn.classList.remove('loading');
      }
    }
  }

  /**
   * Open the Compose New Message Modal
   */
  function openInboxComposeModal() {
    populateInboxCourseDropdowns();
    if (inboxComposeModal) {
      inboxComposeModal.classList.remove('hidden');
      if (inboxComposeCourseSelect) {
        inboxComposeCourseSelect.focus();
      }
    }
  }

  /**
   * Close Compose Modal
   */
  function closeInboxComposeModal() {
    if (inboxComposeModal) {
      inboxComposeModal.classList.add('hidden');
    }
  }

  /**
   * Send New Conversation from Compose Form
   */
  async function sendNewInboxConversation() {
    const courseCode = inboxComposeCourseSelect ? inboxComposeCourseSelect.value : '';
    const recipient = inboxComposeRecipientsInput ? inboxComposeRecipientsInput.value.trim() : '';
    const subject = inboxComposeSubjectInput ? inboxComposeSubjectInput.value.trim() : '';
    const body = inboxComposeBodyText ? inboxComposeBodyText.value.trim() : '';

    if (!courseCode || !recipient || !subject || !body) {
      if (typeof showToast === 'function') {
        showToast('Please fill out all fields', 'warning');
      }
      return;
    }

    if (inboxComposeSubmitBtn) {
      inboxComposeSubmitBtn.disabled = true;
      inboxComposeSubmitBtn.classList.add('loading');
    }

    try {
      const res = await window.canvasDesktop.sendConversationMessage({
        domain: appState.currentDomain,
        token: appState.currentToken,
        contextCode: courseCode,
        recipients: [recipient],
        subject,
        body
      });

      if (!res || !res.success) {
        throw new Error(res?.error || 'Failed to create conversation');
      }

      closeInboxComposeModal();
      if (inboxComposeForm) inboxComposeForm.reset();

      if (typeof showToast === 'function') {
        showToast('Conversation started', 'success');
      }

      // Reload inbox and select newly created conversation
      await loadInboxConversations(true);
      if (res.data && res.data.id) {
        openInboxConversation(res.data.id);
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
      if (typeof showToast === 'function') {
        showToast('Failed to start conversation: ' + err.message, 'error');
      }
    } finally {
      if (inboxComposeSubmitBtn) {
        inboxComposeSubmitBtn.disabled = false;
        inboxComposeSubmitBtn.classList.remove('loading');
      }
    }
  }

  /**
   * Helper: Escape HTML string safely
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Export functions to window
  window.initInbox = initInbox;
  window.loadInboxConversations = loadInboxConversations;
  window.openInboxConversation = openInboxConversation;
  window.openInboxComposeModal = openInboxComposeModal;
  window.closeInboxComposeModal = closeInboxComposeModal;

  // Auto-init on DOMContentLoaded or immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInbox);
  } else {
    initInbox();
  }
})();
