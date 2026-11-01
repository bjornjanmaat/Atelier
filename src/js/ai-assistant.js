/* ==========================================================================
   Course Assistant Controller (Powered by @electron/llm)
   ========================================================================== */

function renderSimpleMarkdown(rawText) {
  if (!rawText) return '';
  let text = escapeHtml(rawText);

  // Fenced Code blocks
  text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  text = text.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  text = text.replace(/^# (.*$)/gim, '<h2>$1</h2>');

  // Bold & Italic
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Bullet list items
  text = text.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
  text = text.replace(/(<li>[\s\S]*?<\/li>)/gim, '<ul>$1</ul>');
  text = text.replace(/<\/ul>\s*<ul>/g, '');

  // Numbered list items
  text = text.replace(/^\s*\d+\.\s+(.*$)/gim, '<li>$1</li>');

  // RAG Verifiable Citations: [Source: <Doc Title>, p. <Page#>] or [Source: <Doc Title>, <Section>]
  text = text.replace(/\[Source:\s*([^,\]]+)(?:,\s*(?:p\.\s*(\d+)|([^\]]+)))?\]/gi, (_m, title, page, section) => {
    const t = (title || '').trim();
    const p = (page || '').trim();
    const s = (section || '').trim();
    const displayLabel = p ? `${t} (p. ${p})` : (s ? `${t} · ${s}` : t);
    return `<button type="button" class="ai-citation-tag" data-doc-title="${escapeHtml(t)}" data-page="${p}" data-section="${escapeHtml(s)}" title="Click to jump to ${escapeHtml(t)} in document viewer"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg><span>${escapeHtml(displayLabel)}</span></button>`;
  });

  // Numeric Source Pills: [Source 1] or [Source 1: Title]
  text = text.replace(/\[Source\s*(\d+)(?::\s*([^\]]+))?\]/gi, (_m, num, info) => {
    const label = info ? `Source ${num}: ${info.trim()}` : `Source ${num}`;
    return `<span class="ai-citation-pill" data-source-num="${num}" title="Verified Canvas LMS Source">${escapeHtml(label)}</span>`;
  });

  // Paragraphs
  const paras = text.split(/\n\n+/);
  return paras
    .map(p => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<pre')) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('');
}

function initCourseAiAssistant() {
  const overlay = document.getElementById('aiDrawerOverlay');
  const openHeroBtn = document.getElementById('courseOpenAiChatBtn');
  const openTitlebarBtn = document.getElementById('titlebarAiAssistantBtn');
  const closeBtn = document.getElementById('aiCloseDrawerBtn');
  const clearBtn = document.getElementById('aiClearChatBtn');
  const settingsToggleBtn = document.getElementById('aiModelSettingsToggleBtn');
  const activeModelTypeIcon = document.getElementById('aiActiveModelTypeIcon');
  const activeModelNameLabel = document.getElementById('aiActiveModelName');
  const settingsPanel = document.getElementById('aiModelSettingsPanel');
  const courseSelector = document.getElementById('aiCourseSelector');
  const modelSelect = document.getElementById('aiModelSelect');
  const selectFileBtn = document.getElementById('aiSelectFileBtn');
  const openCatalogBtn = document.getElementById('aiOpenCatalogBtn');
  const browseModelsModalBtn = document.getElementById('aiBrowseModelsModalBtn');
  const inputForm = document.getElementById('aiInputForm');
  const chatInput = document.getElementById('aiChatInput');
  const stopBtn = document.getElementById('aiStopBtn');
  const sendBtn = document.getElementById('aiSendBtn');
  const statusIndicator = document.getElementById('aiStatusIndicator');
  const messagesContainer = document.getElementById('aiMessagesContainer');
  const welcomeCard = document.getElementById('aiWelcomeCard');
  const downloadProgressWrap = document.getElementById('aiDownloadProgressWrap');
  const downloadStatusLabel = document.getElementById('aiDownloadStatusLabel');
  const downloadPercentLabel = document.getElementById('aiDownloadPercentLabel');
  const downloadProgressBar = document.getElementById('aiDownloadProgressBar');
  const toolsBar = document.getElementById('aiToolsBar');

  // Modal elements
  const modelModalOverlay = document.getElementById('aiModelModalOverlay');
  const modelModalCloseBtn = document.getElementById('aiModelModalCloseBtn');
  const modalActiveTitle = document.getElementById('aiModalActiveTitle');
  const modalActiveTypePill = document.getElementById('aiModalActiveTypePill');
  const modalActiveStatus = document.getElementById('aiModalActiveStatus');
  const tabBtnLocal = document.getElementById('aiTabBtnLocal');
  const tabBtnCloud = document.getElementById('aiTabBtnCloud');
  const tabPanelLocal = document.getElementById('aiTabPanelLocal');
  const tabPanelCloud = document.getElementById('aiTabPanelCloud');
  const localModelsGrid = document.getElementById('aiLocalModelsGrid');
  const localModelsCountBadge = document.getElementById('aiLocalModelsCountBadge');
  const cloudProvidersList = document.getElementById('aiCloudProvidersList');
  const modalSelectCustomFileBtn = document.getElementById('aiModalSelectCustomFileBtn');

  let currentAbortUUID = null;
  let isGenerating = false;
  let activeModelConfig = {
    type: 'local',
    id: 'smollm2-360m',
    name: 'SmolLM2 360M Instruct',
    filename: 'SmolLM2-360M-Instruct-Q4_K_M.gguf',
    provider: 'HuggingFace'
  };
  let activeModelAlias = 'SmolLM2-360M-Instruct-Q4_K_M.gguf';
  let cachedCatalog = null;
  let currentLoadedModelFilename = null;
  let currentLoadedSystemPrompt = null;

  function updateWelcomeCardStats() {
    if (!welcomeCard) return;
    const titleEl = welcomeCard.querySelector('.ai-welcome-title');
    const selectedCourseId = courseSelector ? courseSelector.value : 'all';
    if (selectedCourseId === 'active_doc') {
      const docName = appState.activeFile?.display_name || appState.activeFile?.filename || 'Active Document';
      if (titleEl) titleEl.textContent = `Ask anything about ${docName}`;
    } else if (selectedCourseId === 'all') {
      if (titleEl) titleEl.textContent = 'Ask anything across all enrolled courses';
    } else {
      const course = appState.courses?.find(c => String(c.id) === String(selectedCourseId));
      if (titleEl) titleEl.textContent = `Ask anything about ${course?.name || 'this course'}`;
    }
  }

  function updateCourseSelector(targetCourseId) {
    if (!courseSelector) return;
    const prev = targetCourseId || courseSelector.value || 'all';
    courseSelector.innerHTML = '';

    // Scope 1: Global (All Courses)
    const optGlobal = document.createElement('option');
    optGlobal.value = 'all';
    optGlobal.textContent = 'All Courses';
    courseSelector.appendChild(optGlobal);

    // Scope 2: Active Document (when currently opened in viewer/split view)
    if (appState.activeFile) {
      const optActiveDoc = document.createElement('option');
      optActiveDoc.value = 'active_doc';
      const docName = appState.activeFile.display_name || appState.activeFile.filename || 'Document';
      optActiveDoc.textContent = `📄 Active: ${docName.length > 24 ? docName.slice(0, 22) + '...' : docName}`;
      courseSelector.appendChild(optActiveDoc);
    }

    let coursesList = appState.courses;
    if (!Array.isArray(coursesList) || coursesList.length === 0) {
      try {
        const cached = localStorage.getItem('canvas_cached_courses');
        if (cached) coursesList = JSON.parse(cached);
      } catch {}
    }

    // Scope 3: Specific Courses
    if (Array.isArray(coursesList) && coursesList.length > 0) {
      coursesList.forEach(c => {
        if (!c || !c.id) return;
        const opt = document.createElement('option');
        opt.value = String(c.id);
        const cleanName = (c.name || c.course_code || 'Course')
          .replace(/\s*\(ID:?\s*\d+\)/gi, '')
          .replace(/\s*\(\d{4,}\)/g, '')
          .trim();
        opt.textContent = `${cleanName}`;
        courseSelector.appendChild(opt);
      });
    }

    if (targetCourseId && courseSelector.querySelector(`option[value="${targetCourseId}"]`)) {
      courseSelector.value = String(targetCourseId);
    } else if (prev && courseSelector.querySelector(`option[value="${prev}"]`)) {
      courseSelector.value = String(prev);
    } else {
      courseSelector.value = 'all';
    }
    if (courseSelector._customDropdown) {
      courseSelector._customDropdown.render();
      courseSelector._customDropdown.sync();
    }
    updateWelcomeCardStats();
  }
  window.updateAiCourseSelector = updateCourseSelector;

  // Multi-Model Catalog Rendering & Management
  async function refreshModelsCatalog() {
    if (!window.canvasDesktop?.getModelsCatalog) return;
    try {
      const res = await window.canvasDesktop.getModelsCatalog();
      if (res && res.success) {
        cachedCatalog = res;
        if (res.activeModel) {
          activeModelConfig = res.activeModel;
          activeModelAlias = res.activeModel.filename || res.activeModel.modelId || res.activeModel.id;
        }

        // Update header trigger chip
        if (activeModelNameLabel) {
          if (activeModelConfig.id === 'apple-intelligence-hybrid') {
            activeModelNameLabel.textContent = 'Apple Hybrid (3B + PCC)';
          } else if (activeModelConfig.id === 'apple-intelligence-pcc') {
            activeModelNameLabel.textContent = 'Apple PCC';
          } else if (activeModelConfig.id === 'apple-intelligence-3b') {
            activeModelNameLabel.textContent = 'Apple 3B (Local)';
          } else {
            const shortName = (activeModelConfig.name || 'SmolLM2-360M')
              .replace('-Instruct', '')
              .replace('-Q4_K_M', '');
            activeModelNameLabel.textContent = shortName;
          }
        }

        if (activeModelTypeIcon) {
          if (activeModelConfig.id?.includes('apple') || activeModelConfig.providerId === 'apple') {
            activeModelTypeIcon.innerHTML = `<span style="font-size:13px; font-weight:600; line-height:1;"></span>`;
          } else if (activeModelConfig.type === 'cloud') {
            activeModelTypeIcon.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>`;
          } else {
            activeModelTypeIcon.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>`;
          }
        }

        // Update modal active banner
        if (modalActiveTitle) {
          modalActiveTitle.textContent = activeModelConfig.name || 'SmolLM2 360M Instruct';
        }
        if (modalActiveTypePill) {
          if (activeModelConfig.id === 'apple-intelligence-hybrid') {
            modalActiveTypePill.textContent = 'Hybrid · On-Device 3B + Private Cloud Compute';
          } else if (activeModelConfig.id === 'apple-intelligence-pcc') {
            modalActiveTypePill.textContent = 'Apple Private Cloud Compute (PCC)';
          } else {
            modalActiveTypePill.textContent = activeModelConfig.type === 'cloud'
              ? `Cloud (${activeModelConfig.providerName || activeModelConfig.provider || 'API'})`
              : 'Local (On-Device)';
          }
        }

        // Status indicator
        if (statusIndicator) {
          let isReady = false;
          if (activeModelConfig.type === 'cloud') {
            const provider = res.cloudProviders?.find(p => p.id === activeModelConfig.providerId);
            isReady = Boolean(provider?.hasKey);
          } else {
            const exists = res.curatedLocalModels?.some(m => m.filename?.toLowerCase() === activeModelConfig.filename?.toLowerCase() && m.downloaded)
              || res.customLocalModels?.some(m => m.filename?.toLowerCase() === activeModelConfig.filename?.toLowerCase());
            isReady = Boolean(exists);
          }

          if (isReady) {
            statusIndicator.className = 'ai-status-indicator ready';
            statusIndicator.title = `${activeModelConfig.name} Ready`;
          } else {
            statusIndicator.className = 'ai-status-indicator';
            statusIndicator.title = activeModelConfig.type === 'cloud' ? 'API Key Required' : 'Model Download Required';
          }
        }

        renderQuickDropdown(res);
        renderLocalModelsGrid(res);
        renderCloudProvidersList(res);
      }
    } catch (e) {
      console.warn('Error fetching models catalog:', e);
    }
  }

  function renderQuickDropdown(catalog) {
    if (!modelSelect) return;
    modelSelect.innerHTML = '';

    const isMatchingAppleOs = Boolean(catalog.isAppleIntelligenceAvailable);

    // Group 1: Downloaded Local Models
    const downloadedLocal = (catalog.curatedLocalModels || [])
      .filter(m => m.downloaded && (!m.isAppleModel || isMatchingAppleOs))
      .concat(catalog.customLocalModels || []);

    if (downloadedLocal.length > 0) {
      const group = document.createElement('optgroup');
      group.label = 'Downloaded Local Models';
      downloadedLocal.forEach(m => {
        const opt = document.createElement('option');
        opt.value = JSON.stringify({
          type: 'local',
          id: m.id,
          name: m.name,
          filename: m.filename,
          provider: m.provider
        });
        opt.textContent = `${m.name} (${m.actualSize || m.sizeFormatted})`;
        if (activeModelConfig.type === 'local' && (activeModelConfig.filename === m.filename || activeModelConfig.id === m.id)) {
          opt.selected = true;
        }
        group.appendChild(opt);
      });
      modelSelect.appendChild(group);
    }

    // Group 2: Cloud Models
    if (Array.isArray(catalog.cloudProviders)) {
      catalog.cloudProviders
        .filter(p => !p.isAppleProvider || isMatchingAppleOs)
        .forEach(p => {
          const group = document.createElement('optgroup');
          const isApple = p.id === 'apple';
          const labelStatus = isApple
            ? (p.hasKey ? 'Private Cloud Compute' : 'macOS 26+ Required')
            : (p.hasKey ? 'Configured' : 'Needs Key');
          group.label = `${p.name} (${labelStatus})`;
          p.models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = JSON.stringify({
              type: 'cloud',
              id: m.id,
              name: m.name,
              providerId: p.id,
              providerName: p.name,
              modelId: m.id
            });
            const suffix = !p.hasKey ? (isApple ? ' [Requires macOS 26+]' : ' [Needs Key]') : '';
            opt.textContent = `${m.name}${suffix}`;
            if (activeModelConfig.type === 'cloud' && activeModelConfig.id === m.id) {
              opt.selected = true;
            }
            group.appendChild(opt);
          });
          modelSelect.appendChild(group);
        });
    }

    // Group 3: Local Models needing download
    const needDownload = (catalog.curatedLocalModels || []).filter(m => !m.downloaded && (!m.isAppleModel || isMatchingAppleOs));
    if (needDownload.length > 0) {
      const group = document.createElement('optgroup');
      group.label = 'Available Local Models (Download Required)';
      needDownload.forEach(m => {
        const opt = document.createElement('option');
        opt.value = `download:${m.id}`;
        opt.textContent = `${m.name} — Download (${m.sizeFormatted})`;
        group.appendChild(opt);
      });
      modelSelect.appendChild(group);
    }

    if (modelSelect._customDropdown) {
      modelSelect._customDropdown.render();
      modelSelect._customDropdown.sync();
    }
  }

  function renderLocalModelsGrid(catalog) {
    if (!localModelsGrid) return;
    localModelsGrid.innerHTML = '';

    const isMatchingAppleOs = Boolean(catalog.isAppleIntelligenceAvailable);
    const allLocal = (catalog.curatedLocalModels || [])
      .filter(m => !m.isAppleModel || isMatchingAppleOs)
      .concat(catalog.customLocalModels || []);

    if (localModelsCountBadge) {
      localModelsCountBadge.textContent = `${allLocal.length} Models Available`;
    }

    allLocal.forEach(m => {
      const isActive = activeModelConfig.type === 'local' && (
        activeModelConfig.filename === m.filename || activeModelConfig.id === m.id
      );

      const card = document.createElement('div');
      card.className = `ai-model-card ${isActive ? 'active' : ''}`;
      card.dataset.modelId = m.id;
      card.dataset.filename = m.filename;

      const paramsHtml = m.params ? `<span class="ai-spec-chip">${escapeHtml(m.params)}</span>` : '';
      const sizeHtml = `<span class="ai-spec-chip">${escapeHtml(m.actualSize || m.sizeFormatted || 'Local')}</span>`;
      const canDelete = Boolean(m.downloaded && m.id !== 'smollm2-360m' && m.id !== 'apple-intelligence-3b');
      const deleteBtnHtml = canDelete
        ? `<button type="button" class="ai-delete-btn" title="Delete model from disk" aria-label="Delete ${escapeHtml(m.name)} from disk" data-filename="${escapeHtml(m.filename)}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>`
        : '';

      let footerHtml = '';
      if (isActive) {
        footerHtml = `
          <div class="ai-model-status-chip active">
            <span class="ai-status-dot ready"></span> Active
          </div>
          ${deleteBtnHtml ? `<div class="ai-card-actions-wrap">${deleteBtnHtml}</div>` : ''}
        `;
      } else if (m.isDownloading) {
        footerHtml = `
          <div class="ai-card-download-box">
            <div class="ai-card-dl-row">
              <span class="ai-card-dl-text">Downloading...</span>
              <button type="button" class="ai-cancel-link" data-cancel-id="${escapeHtml(m.id)}">Cancel</button>
            </div>
            <div class="ai-card-dl-track">
              <div class="ai-card-dl-fill" style="width: 2%"></div>
            </div>
          </div>
        `;
      } else if (m.downloaded) {
        footerHtml = `
          <div class="ai-card-actions-wrap">
            <button type="button" class="secondary-button btn-sm ai-select-local-btn" data-select-id="${escapeHtml(m.id)}">Select Model</button>
            ${deleteBtnHtml}
          </div>
        `;
      } else {
        footerHtml = `
          <div class="ai-card-actions-wrap">
            <button type="button" class="primary-button btn-sm ai-dl-trigger-btn" data-download-id="${escapeHtml(m.id)}">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <span>Download (${escapeHtml(m.sizeFormatted || '')})</span>
            </button>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="ai-model-card-top">
          <div class="ai-model-card-header">
            <div class="ai-model-card-title-wrap">
              <h4 class="ai-model-card-title">${escapeHtml(m.name)}</h4>
              <span class="ai-model-card-provider">${escapeHtml(m.provider || 'Local Model')}</span>
            </div>
          </div>
          <div class="ai-model-specs-row">
            ${paramsHtml}
            ${sizeHtml}
          </div>
          <p class="ai-model-card-desc">${escapeHtml(m.description || '')}</p>
        </div>
        <div class="ai-model-card-footer">
          ${footerHtml}
        </div>
      `;

      localModelsGrid.appendChild(card);
    });
  }

  // Interactive Popover Menu for Setting & Managing Cloud API Keys
  async function openProviderKeyMenu(providerId, triggerBtn) {
    if (!cachedCatalog) return;
    const provider = (cachedCatalog.cloudProviders || []).find(p => p.id === providerId);
    if (!provider || provider.id === 'apple') return;

    // If menu is already open for this provider, close and exit
    const existing = document.querySelector(`.ai-key-popover-menu[data-provider-id="${providerId}"]`);
    if (existing) {
      existing.remove();
      triggerBtn?.classList.remove('open');
      return;
    }

    // Close any other open key menus
    document.querySelectorAll('.ai-key-popover-menu').forEach(el => el.remove());
    document.querySelectorAll('.ai-cloud-provider-key-status.open').forEach(el => el.classList.remove('open'));

    // Resolve anchor element
    const section = cloudProvidersList?.querySelector(`[data-provider-section="${providerId}"]`);
    const anchor = section?.querySelector('.ai-cloud-key-menu-anchor') || triggerBtn?.closest('.ai-cloud-key-menu-anchor') || triggerBtn;
    if (!anchor) return;

    const statusBtn = section?.querySelector('.ai-cloud-provider-key-status');
    if (statusBtn) statusBtn.classList.add('open');

    let masked = '';
    try {
      const keysRes = await window.canvasDesktop?.getApiKeys?.();
      if (keysRes) {
        if (providerId === 'openai') masked = keysRes.maskedOpenAi || '';
        else if (providerId === 'gemini') masked = keysRes.maskedGemini || '';
        else if (providerId === 'anthropic') masked = keysRes.maskedAnthropic || '';
      }
    } catch {}

    const popover = document.createElement('div');
    popover.className = 'ai-key-popover-menu';
    popover.dataset.providerId = providerId;
    popover.innerHTML = `
      <div class="ai-key-popover-header">
        <h4 class="ai-key-popover-title">${escapeHtml(provider.name)} API Key</h4>
        ${provider.keyHelpUrl ? `<a href="${escapeHtml(provider.keyHelpUrl)}" class="ai-key-popover-link" target="_blank" rel="noopener">Get Key ↗</a>` : ''}
      </div>
      <div class="ai-key-popover-input-wrap">
        <input type="password" class="ai-key-popover-input" placeholder="${masked ? masked : (provider.keyPlaceholder || 'Enter API Key...')}" autocomplete="off" spellcheck="false" />
        <button type="button" class="ai-key-popover-eye" title="Toggle Visibility">👁</button>
      </div>
      <div class="ai-key-popover-actions">
        ${provider.hasKey ? `<button type="button" class="ai-key-remove-btn">Remove</button>` : ''}
        <button type="button" class="ai-key-cancel-btn">Cancel</button>
        <button type="button" class="ai-key-save-btn">Save Key</button>
      </div>
    `;

    anchor.appendChild(popover);

    const input = popover.querySelector('.ai-key-popover-input');
    const eyeBtn = popover.querySelector('.ai-key-popover-eye');
    const cancelBtn = popover.querySelector('.ai-key-cancel-btn');
    const saveBtn = popover.querySelector('.ai-key-save-btn');
    const removeBtn = popover.querySelector('.ai-key-remove-btn');

    if (input) input.focus();

    eyeBtn?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    cancelBtn?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      popover.remove();
      if (statusBtn) statusBtn.classList.remove('open');
    });

    saveBtn?.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const val = input.value.trim();
      if (!val) {
        showToast('Please type an API key first', 'info');
        return;
      }
      try {
        await window.canvasDesktop?.saveApiKeys?.({ [providerId]: val });
        showToast(`${provider.name} API Key saved!`);
        popover.remove();
        if (statusBtn) statusBtn.classList.remove('open');
        await refreshModelsCatalog();
      } catch (err) {
        showToast(`Could not save key: ${err.message}`, 'error');
      }
    });

    if (removeBtn) {
      removeBtn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        try {
          await window.canvasDesktop?.saveApiKeys?.({ [providerId]: '' });
          showToast(`${provider.name} API Key removed`);
          popover.remove();
          if (statusBtn) statusBtn.classList.remove('open');
          await refreshModelsCatalog();
        } catch (err) {
          showToast(`Could not remove key: ${err.message}`, 'error');
        }
      });
    }

    const handleOutsideClick = (evt) => {
      if (!popover.contains(evt.target) && !anchor.contains(evt.target)) {
        popover.remove();
        if (statusBtn) statusBtn.classList.remove('open');
        document.removeEventListener('click', handleOutsideClick);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', handleOutsideClick);
    }, 10);
  }

  function renderCloudProvidersList(catalog) {
    if (!cloudProvidersList) return;
    cloudProvidersList.innerHTML = '';

    const isMatchingAppleOs = Boolean(catalog.isAppleIntelligenceAvailable);
    const providers = (catalog.cloudProviders || []).filter(p => !p.isAppleProvider || isMatchingAppleOs);

    providers.forEach(p => {
      const section = document.createElement('div');
      section.className = 'ai-cloud-provider-section';
      section.dataset.providerSection = p.id;

      const isApple = p.id === 'apple';
      const keyStatusClass = p.hasKey ? 'configured' : 'missing';
      const keyStatusText = isApple
        ? (p.hasKey ? 'Private Cloud Compute Ready' : 'macOS 26+ Required')
        : (p.hasKey ? 'Key Saved' : 'API Key required');

      let providerCardsHtml = '';
      p.models.forEach(m => {
        const isActive = activeModelConfig.type === 'cloud' && activeModelConfig.id === m.id;

        let actionHtml = '';
        if (isActive) {
          actionHtml = `<span class="ai-model-status-chip active"><span class="ai-status-dot ready"></span> Active</span>`;
        } else if (p.hasKey) {
          actionHtml = `<button type="button" class="secondary-button btn-sm ai-select-cloud-btn" data-provider-id="${escapeHtml(p.id)}" data-model-id="${escapeHtml(m.id)}">Select Model</button>`;
        } else if (isApple) {
          actionHtml = `<span class="ai-model-status-chip not-downloaded">Requires macOS 26+</span>`;
        } else {
          actionHtml = `<button type="button" class="secondary-button btn-sm ai-focus-key-btn" data-provider-id="${escapeHtml(p.id)}">Enter Key to Use</button>`;
        }

        const modelStatusText = isApple ? 'Private Cloud Compute' : 'Online API';

        providerCardsHtml += `
          <div class="ai-model-card ${isActive ? 'active' : ''}">
            <div class="ai-model-card-top">
              <div class="ai-model-card-header">
                <div class="ai-model-card-title-wrap">
                  <h4 class="ai-model-card-title">${escapeHtml(m.name)}</h4>
                  <span class="ai-model-card-provider">${escapeHtml(p.name)}</span>
                </div>
              </div>
              <p class="ai-model-card-desc">${escapeHtml(m.description || '')}</p>
            </div>
            <div class="ai-model-card-footer">
              <div class="ai-model-status-chip">
                ${modelStatusText}
              </div>
              <div class="ai-card-actions-wrap">
                ${actionHtml}
              </div>
            </div>
          </div>
        `;
      });

      section.innerHTML = `
        <div class="ai-cloud-provider-header">
          <div class="ai-cloud-provider-title-wrap">
            <span class="ai-cloud-provider-name">${escapeHtml(p.name)}</span>
          </div>
          ${!isApple ? `
            <div class="ai-cloud-key-menu-anchor">
              <button type="button" class="ai-cloud-provider-key-status ${keyStatusClass}" data-provider-id="${escapeHtml(p.id)}" title="Click to manage ${escapeHtml(p.name)} API key">
                <span>${keyStatusText}</span>
                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </button>
            </div>
          ` : `
            <span class="ai-cloud-provider-key-status ${keyStatusClass}">${keyStatusText}</span>
          `}
        </div>
        <div class="ai-models-grid">
          ${providerCardsHtml}
        </div>
      `;

      cloudProvidersList.appendChild(section);
    });
  }

  // Open & Close Modal
  function openModelModal() {
    if (!modelModalOverlay) return;
    modelModalOverlay.classList.remove('hidden');
    refreshModelsCatalog();
  }

  function closeModelModal() {
    if (!modelModalOverlay) return;
    modelModalOverlay.classList.add('hidden');
    document.querySelectorAll('.ai-key-popover-menu').forEach(el => el.remove());
    document.querySelectorAll('.ai-cloud-provider-key-status.open').forEach(el => el.classList.remove('open'));
  }

  async function selectLocalModelById(modelId) {
    if (!cachedCatalog) return;
    const model = (cachedCatalog.curatedLocalModels || []).find(m => m.id === modelId)
      || (cachedCatalog.customLocalModels || []).find(m => m.id === modelId);
    if (!model) return;

    if (!model.downloaded) {
      showToast(`Model ${model.name} must be downloaded first!`);
      return;
    }

    const modelInfo = {
      type: 'local',
      id: model.id,
      name: model.name,
      filename: model.filename,
      provider: model.provider
    };

    await switchActiveModel(modelInfo);
  }

  async function selectCloudModel(providerId, modelId) {
    if (!cachedCatalog) return;
    const provider = (cachedCatalog.cloudProviders || []).find(p => p.id === providerId);
    const model = provider?.models?.find(m => m.id === modelId);
    if (!model || !provider) return;

    if (!provider.hasKey) {
      showToast(`Please enter and save your ${provider.name} API Key first!`, 'error');
      switchModalTab('cloud');
      openProviderKeyMenu(providerId);
      return;
    }

    const modelInfo = {
      type: 'cloud',
      id: model.id,
      modelId: model.id,
      name: model.name,
      providerId: provider.id,
      providerName: provider.name
    };

    await switchActiveModel(modelInfo);
  }

  async function switchActiveModel(modelInfo) {
    if (!window.canvasDesktop?.setActiveModel) return;
    try {
      // If switching local models, clean up in-memory LLM instance
      if (currentLoadedModelFilename && modelInfo.filename !== currentLoadedModelFilename) {
        const aiApi = window.electronAi || window.canvasDesktop?.electronAi;
        if (aiApi && typeof aiApi.destroy === 'function') {
          try { await aiApi.destroy(); } catch { }
          currentLoadedModelFilename = null;
        }
      }

      const res = await window.canvasDesktop.setActiveModel(modelInfo);
      if (res && res.success) {
        activeModelConfig = res.activeModel;
        activeModelAlias = res.activeModel.filename || res.activeModel.modelId || res.activeModel.id;
        showToast(`Active model switched to: ${modelInfo.name}`);
        await refreshModelsCatalog();
      }
    } catch (err) {
      showToast(`Could not activate model: ${err.message}`, 'error');
    }
  }

  async function startModelDownload(modelId) {
    if (!window.canvasDesktop?.downloadModel) return;
    const model = (cachedCatalog?.curatedLocalModels || []).find(m => m.id === modelId);
    showToast(`Starting download of ${model?.name || 'model'}...`);

    // Mark card as downloading
    if (model) model.isDownloading = true;
    renderLocalModelsGrid(cachedCatalog);

    try {
      const res = await window.canvasDesktop.downloadModel(modelId);
      if (res && res.success) {
        showToast(res.alreadyExists ? `${res.model.name} is already downloaded!` : `${res.model.name} downloaded successfully!`);
        await refreshModelsCatalog();
      } else if (!res.aborted) {
        showToast(`Download failed: ${res.error || 'Unknown error'}`, 'error');
        await refreshModelsCatalog();
      }
    } catch (err) {
      showToast(`Download error: ${err.message}`, 'error');
      await refreshModelsCatalog();
    }
  }

  async function cancelModelDownload(modelId) {
    if (!window.canvasDesktop?.abortDownloadModel) return;
    try {
      await window.canvasDesktop.abortDownloadModel(modelId);
      showToast('Download cancelled.');
      await refreshModelsCatalog();
    } catch { }
  }

  async function deleteLocalModel(filename) {
    if (!window.canvasDesktop?.deleteModel) return;
    if (!confirm(`Are you sure you want to delete "${filename}" to free up disk space?`)) return;

    try {
      const res = await window.canvasDesktop.deleteModel(filename);
      if (res && res.success) {
        showToast(`Model ${filename} deleted from disk.`);
        await refreshModelsCatalog();
      } else {
        showToast(`Could not delete model: ${res.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      showToast(`Error deleting model: ${err.message}`, 'error');
    }
  }

  function focusProviderKeyInput(providerId) {
    if (providerId === 'openai') keyOpenAi?.focus();
    else if (providerId === 'gemini') keyGemini?.focus();
    else if (providerId === 'anthropic') keyAnthropic?.focus();
  }

  function switchModalTab(tab) {
    if (tab === 'local') {
      tabBtnLocal?.classList.add('active');
      tabBtnCloud?.classList.remove('active');
      tabPanelLocal?.classList.remove('hidden');
      tabPanelCloud?.classList.add('hidden');
    } else {
      tabBtnCloud?.classList.add('active');
      tabBtnLocal?.classList.remove('active');
      tabPanelCloud?.classList.remove('hidden');
      tabPanelLocal?.classList.add('hidden');
    }
  }

  // Open AI Page
  function openAiPage(targetCourseId) {
    const courseId = targetCourseId || appState.activeCourse?.id || 'all';
    updateCourseSelector(courseId);
    refreshModelsCatalog();

    if (typeof getActiveTab === 'function') {
      const activeTab = getActiveTab();
      if (activeTab && activeTab.type !== 'ai') {
        navigateTab(activeTab.id, { type: 'ai', title: 'Assistant' });
      } else if (!activeTab) {
        createNewTab({ type: 'ai', title: 'Assistant', activate: true });
      }
    } else if (typeof switchView === 'function') {
      switchView('ai');
    }

    setTimeout(() => {
      chatInput?.focus();
    }, 150);
  }

  window.toggleCourseAiDrawer = function (forceOpen, targetCourseId) {
    openAiPage(targetCourseId);
  };
  window.openCourseAi = openAiPage;
  window.onAiPageActivated = function () {
    refreshModelsCatalog();
    setTimeout(() => {
      chatInput?.focus();
    }, 100);
  };

  // Button triggers
  if (openHeroBtn) {
    openHeroBtn.addEventListener('click', () => {
      openAiPage(appState.activeCourse?.id);
    });
  }

  if (openTitlebarBtn) {
    openTitlebarBtn.addEventListener('click', () => {
      openAiPage(appState.activeCourse?.id);
    });
  }

  function closeDrawer() {
    if (overlay) overlay.classList.add('hidden');
    appState.aiDrawerOpen = false;
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeDrawer);
  }

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDrawer();
    });
  }

  window.openModelModal = openModelModal;
  window.closeModelModal = closeModelModal;

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modelModalOverlay && !modelModalOverlay.classList.contains('hidden')) {
      closeModelModal();
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (messagesContainer) {
        const rows = messagesContainer.querySelectorAll('.ai-message-row');
        rows.forEach(r => r.remove());
      }
      if (welcomeCard) welcomeCard.classList.remove('hidden');
      if (chatInput) {
        chatInput.value = '';
        chatInput.style.height = 'auto';
        chatInput.focus();
      }
      if (isGenerating && stopBtn) {
        stopBtn.click();
      }
      const aiApi = window.electronAi || window.canvasDesktop?.electronAi;
      if (aiApi && typeof aiApi.destroy === 'function') {
        aiApi.destroy().catch(() => { });
      }
      currentLoadedModelFilename = null;
      currentLoadedSystemPrompt = null;
    });
  }

  // Header Model Selector trigger button opens the full Model Selection Modal
  if (settingsToggleBtn) {
    settingsToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openModelModal();
    });
  }

  if (browseModelsModalBtn) {
    browseModelsModalBtn.addEventListener('click', openModelModal);
  }

  if (openCatalogBtn) {
    openCatalogBtn.addEventListener('click', openModelModal);
  }

  if (modelModalCloseBtn) {
    modelModalCloseBtn.addEventListener('click', closeModelModal);
  }

  if (modelModalOverlay) {
    modelModalOverlay.addEventListener('click', (e) => {
      if (e.target === modelModalOverlay) closeModelModal();
    });
  }

  if (tabBtnLocal) {
    tabBtnLocal.addEventListener('click', () => switchModalTab('local'));
  }

  if (tabBtnCloud) {
    tabBtnCloud.addEventListener('click', () => switchModalTab('cloud'));
  }

  // Modal delegation for Local models cards
  if (localModelsGrid) {
    localModelsGrid.addEventListener('click', (e) => {
      const selectBtn = e.target.closest('.ai-select-local-btn');
      if (selectBtn && selectBtn.dataset.selectId) {
        selectLocalModelById(selectBtn.dataset.selectId);
        return;
      }

      const dlBtn = e.target.closest('.ai-dl-trigger-btn');
      if (dlBtn && dlBtn.dataset.downloadId) {
        startModelDownload(dlBtn.dataset.downloadId);
        return;
      }

      const cancelBtn = e.target.closest('.ai-cancel-link');
      if (cancelBtn && cancelBtn.dataset.cancelId) {
        cancelModelDownload(cancelBtn.dataset.cancelId);
        return;
      }

      const delBtn = e.target.closest('.ai-delete-btn');
      if (delBtn && delBtn.dataset.filename) {
        deleteLocalModel(delBtn.dataset.filename);
        return;
      }
    });
  }

  // Modal delegation for Cloud providers list
  if (cloudProvidersList) {
    cloudProvidersList.addEventListener('click', (e) => {
      const selectBtn = e.target.closest('.ai-select-cloud-btn');
      if (selectBtn && selectBtn.dataset.providerId && selectBtn.dataset.modelId) {
        selectCloudModel(selectBtn.dataset.providerId, selectBtn.dataset.modelId);
        return;
      }

      const keyStatusBtn = e.target.closest('.ai-cloud-provider-key-status');
      if (keyStatusBtn && keyStatusBtn.dataset.providerId) {
        openProviderKeyMenu(keyStatusBtn.dataset.providerId, keyStatusBtn);
        return;
      }

      const focusBtn = e.target.closest('.ai-focus-key-btn');
      if (focusBtn && focusBtn.dataset.providerId) {
        openProviderKeyMenu(focusBtn.dataset.providerId, focusBtn);
        return;
      }
    });
  }

  // Quick dropdown selection
  if (modelSelect) {
    modelSelect.addEventListener('change', async () => {
      const val = modelSelect.value;
      if (!val) return;

      if (val.startsWith('download:')) {
        const modelId = val.replace('download:', '');
        openModelModal();
        switchModalTab('local');
        startModelDownload(modelId);
        return;
      }

      try {
        const parsed = JSON.parse(val);
        if (parsed.type === 'local') {
          await switchActiveModel(parsed);
        } else if (parsed.type === 'cloud') {
          await selectCloudModel(parsed.providerId, parsed.modelId);
        }
      } catch (e) {
        console.warn('Failed to parse model selection:', e);
      }
    });
  }

  // Load custom local GGUF file
  async function handleSelectCustomGgufFile() {
    if (!window.canvasDesktop?.selectModelFile) return;
    try {
      const res = await window.canvasDesktop.selectModelFile();
      if (res && res.success && res.model) {
        showToast(`Custom model selected: ${res.model.name}`);
        await refreshModelsCatalog();
      }
    } catch (err) {
      showToast(`Could not select file: ${err.message}`, 'error');
    }
  }

  if (selectFileBtn) {
    selectFileBtn.addEventListener('click', handleSelectCustomGgufFile);
  }

  if (modalSelectCustomFileBtn) {
    modalSelectCustomFileBtn.addEventListener('click', handleSelectCustomGgufFile);
  }

  // Download progress listener
  if (window.canvasDesktop?.onLlmDownloadProgress) {
    window.canvasDesktop.onLlmDownloadProgress((data) => {
      // Update quick panel
      if (downloadProgressWrap) downloadProgressWrap.classList.remove('hidden');
      if (downloadProgressBar) downloadProgressBar.style.width = `${data.percent}%`;
      if (downloadPercentLabel) downloadPercentLabel.textContent = `${data.percent}% (${data.downloadedMB || 0} / ${data.totalMB || 0} MB)`;
      if (downloadStatusLabel) downloadStatusLabel.textContent = data.done ? 'Download Complete!' : `Downloading (${data.speedMBs || '0.0'} MB/s)...`;

      // Update card in modal grid
      if (localModelsGrid && data.modelId) {
        const card = localModelsGrid.querySelector(`[data-model-id="${data.modelId}"]`);
        if (card) {
          const dlBox = card.querySelector('.ai-card-download-box');
          if (dlBox) {
            const fill = dlBox.querySelector('.ai-card-dl-fill');
            const text = dlBox.querySelector('.ai-card-dl-text');
            if (fill) fill.style.width = `${data.percent}%`;
            if (text) text.textContent = `${data.percent}% (${data.downloadedMB} / ${data.totalMB} MB) · ${data.speedMBs} MB/s`;
          }
        }
      }

      if (data.done) {
        showToast('Model downloaded and activated!');
        refreshModelsCatalog();
        setTimeout(() => {
          if (downloadProgressWrap) downloadProgressWrap.classList.add('hidden');
        }, 2500);
      }
    });
  }

  if (courseSelector) {
    courseSelector.addEventListener('change', () => {
      updateWelcomeCardStats();
    });
  }

  // Suggestion chips
  if (welcomeCard) {
    welcomeCard.addEventListener('click', (e) => {
      const chip = e.target.closest('.ai-suggestion-chip');
      if (chip && chip.dataset.prompt) {
        handleSendMessage(chip.dataset.prompt);
      }
    });
  }

  // Quick Data Tools bar clicks
  if (toolsBar) {
    toolsBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.ai-tool-pill-btn');
      if (btn && btn.dataset.tool) {
        const toolName = btn.dataset.tool;
        let args = {};
        try {
          if (btn.dataset.toolArgs) args = JSON.parse(btn.dataset.toolArgs);
        } catch { }
        const selectedCourseId = courseSelector ? courseSelector.value : 'all';
        if (selectedCourseId !== 'all' && !args.course_id) {
          args.course_id = selectedCourseId;
        }
        const label = btn.textContent.trim();
        handleSendMessage(`Fetch ${label}`, { tool: toolName, parameters: args });
      }
    });
  }

  const inputWrapper = document.querySelector('.ai-input-wrapper');
  if (courseSelector) {
    courseSelector.addEventListener('focus', () => {
      if (courseSelector.options.length <= 1) updateCourseSelector();
    });
    courseSelector.addEventListener('mousedown', () => {
      if (courseSelector.options.length <= 1) updateCourseSelector();
    });
  }

  // Textarea auto-resize and Enter submit
  if (chatInput) {
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      const newHeight = Math.min(chatInput.scrollHeight, 120);
      chatInput.style.height = `${newHeight}px`;
      if (newHeight > 24) {
        inputWrapper?.classList.add('is-multiline');
      } else {
        inputWrapper?.classList.remove('is-multiline');
      }
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });
  }

  if (inputForm) {
    inputForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSendMessage();
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', async () => {
      isGenerating = false;
      appState.aiIsGenerating = false;

      if (activeModelConfig.type === 'cloud') {
        if (window.canvasDesktop?.abortCloudStream && currentAbortUUID) {
          try {
            await window.canvasDesktop.abortCloudStream({ requestUUID: currentAbortUUID });
          } catch { }
        }
      } else {
        const aiApi = window.electronAi || window.canvasDesktop?.electronAi;
        if (aiApi && currentAbortUUID && typeof aiApi.abortRequest === 'function') {
          try {
            await aiApi.abortRequest(currentAbortUUID);
          } catch { }
        }
      }

      stopBtn.classList.add('hidden');
      if (sendBtn) sendBtn.disabled = false;
    });
  }

  function appendMessageBubble(role, text) {
    const row = document.createElement('div');
    row.className = `ai-message-row ${role}`;

    const contentWrap = document.createElement('div');
    contentWrap.className = 'ai-msg-content-wrap';

    const bubble = document.createElement('div');
    bubble.className = 'ai-message-bubble';
    bubble.innerHTML = renderSimpleMarkdown(text);

    contentWrap.appendChild(bubble);
    row.appendChild(contentWrap);

    messagesContainer.appendChild(row);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return bubble;
  }

  function createAssistantMessageBubble() {
    const row = document.createElement('div');
    row.className = 'ai-message-row assistant';

    const avatar = document.createElement('div');
    avatar.className = 'ai-msg-avatar';
    avatar.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>`;

    const contentWrap = document.createElement('div');
    contentWrap.className = 'ai-msg-content-wrap';

    const bubble = document.createElement('div');
    bubble.className = 'ai-message-bubble';

    const thinkingWrap = document.createElement('div');
    thinkingWrap.className = 'ai-thinking-feedback-card';
    thinkingWrap.innerHTML = `
      <div class="ai-thinking-indicator">
        <div class="ai-thinking-spinner"></div>
      </div>
      <div class="ai-thinking-content">
        <div class="ai-thinking-stage-title">Reviewing question...</div>
        <div class="ai-thinking-stage-sub">Preparing knowledge base context</div>
      </div>
      <div class="ai-thinking-dots">
        <span class="ai-thinking-dot"></span>
        <span class="ai-thinking-dot"></span>
        <span class="ai-thinking-dot"></span>
      </div>
    `;
    bubble.appendChild(thinkingWrap);

    contentWrap.appendChild(bubble);
    row.appendChild(avatar);
    row.appendChild(contentWrap);

    messagesContainer.appendChild(row);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    const titleEl = thinkingWrap.querySelector('.ai-thinking-stage-title');
    const subEl = thinkingWrap.querySelector('.ai-thinking-stage-sub');

    const setStatus = (title, sub) => {
      if (titleEl && title) titleEl.textContent = title;
      if (subEl && sub) subEl.textContent = sub;
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    };

    return { rowEl: row, bubbleEl: bubble, cursorEl: thinkingWrap, setStatus };
  }

  function jumpToCitedDocument(docTitle, page, section, localPath, sourcesList) {
    let targetFile = null;
    const qTitle = (docTitle || '').trim().toLowerCase();

    // 1. Check in appState.courseDetails.files
    if (appState.courseDetails?.files) {
      targetFile = appState.courseDetails.files.find(f => {
        const fn = (f.filename || f.display_name || '').toLowerCase();
        return fn === qTitle || fn.includes(qTitle) || qTitle.includes(fn);
      });
    }

    // 2. Check in sourcesList for matching localPath
    if (!targetFile && Array.isArray(sourcesList)) {
      const src = sourcesList.find(s => {
        const st = (s.title || '').toLowerCase();
        return st === qTitle || st.includes(qTitle) || qTitle.includes(st);
      });
      if (src && src.localPath) {
        targetFile = {
          id: src.docId || 'rag_doc_' + Date.now(),
          display_name: src.title,
          filename: src.title,
          local_path: src.localPath,
          is_downloaded: true,
          targetPageNum: page
        };
      }
    }

    // 3. Fallback file object using localPath
    if (!targetFile && localPath) {
      targetFile = {
        id: 'rag_doc_' + Date.now(),
        display_name: docTitle,
        filename: docTitle,
        local_path: localPath,
        is_downloaded: true,
        targetPageNum: page
      };
    }

    // If PDF or document file found, open in preview viewer directly on the cited page
    if (targetFile && typeof openFilePreview === 'function') {
      openFilePreview(targetFile, '', page ? parseInt(page, 10) : 1);
      return;
    }

    // If assignment brief, switch to assignments tab
    if (docTitle.toLowerCase().includes('assignment') || (section && section.toLowerCase().includes('rubric'))) {
      const asgTab = document.querySelector('[data-tab="assignments"]');
      if (asgTab) asgTab.click();
      return;
    }

    // If syllabus, switch to syllabus tab
    if (docTitle.toLowerCase().includes('syllabus')) {
      const sylTab = document.querySelector('[data-tab="syllabus"]');
      if (sylTab) sylTab.click();
      return;
    }
  }

  function attachMessageActions(bubbleEl, rawText, retrievedSources = []) {
    // 1. Wire up clicks on citations embedded within message markdown
    bubbleEl.querySelectorAll('.ai-citation-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const docTitle = tag.dataset.docTitle;
        const page = tag.dataset.page ? parseInt(tag.dataset.page, 10) : null;
        const section = tag.dataset.section;
        const localPath = tag.dataset.localPath;
        jumpToCitedDocument(docTitle, page, section, localPath, retrievedSources);
      });
    });

    // 2. Render verified Sources Consulted shelf if retrieved sources exist
    if (Array.isArray(retrievedSources) && retrievedSources.length > 0) {
      const shelf = document.createElement('div');
      shelf.className = 'ai-sources-shelf';
      shelf.innerHTML = `
        <div class="ai-sources-header">
          <span class="ai-sources-title">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            <span>${retrievedSources.length} Verified Course Source${retrievedSources.length > 1 ? 's' : ''} Consulted</span>
          </span>
        </div>
        <div class="ai-sources-pills">
          ${retrievedSources.map(s => `
            <button type="button" class="ai-citation-tag" data-doc-title="${escapeHtml(s.title)}" data-page="${s.pageNumber || ''}" data-section="${escapeHtml(s.section || '')}" data-local-path="${escapeHtml(s.localPath || '')}" title="Click to jump to ${escapeHtml(s.title)}${s.pageNumber ? ' (p. ' + s.pageNumber + ')' : ''}">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
              <span>${escapeHtml(s.title)}${s.pageNumber ? ` (p. ${s.pageNumber})` : ''}</span>
              <span class="ai-citation-match">${s.relevancePercent}%</span>
            </button>
          `).join('')}
        </div>
      `;

      shelf.querySelectorAll('.ai-citation-tag').forEach(tag => {
        tag.addEventListener('click', () => {
          const docTitle = tag.dataset.docTitle;
          const page = tag.dataset.page ? parseInt(tag.dataset.page, 10) : null;
          const section = tag.dataset.section;
          const localPath = tag.dataset.localPath;
          jumpToCitedDocument(docTitle, page, section, localPath, retrievedSources);
        });
      });

      bubbleEl.parentElement.appendChild(shelf);
    }

    const actions = document.createElement('div');
    actions.className = 'ai-msg-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'ai-copy-btn';
    copyBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Copy</span>`;

    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(rawText);
        copyBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#34d399" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span style="color:#34d399;">Copied!</span>`;
        setTimeout(() => {
          copyBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Copy</span>`;
        }, 1800);
      } catch { }
    });

    actions.appendChild(copyBtn);
    bubbleEl.parentElement.appendChild(actions);
  }

  async function ensureModelLoaded(systemPrompt) {
    const aiApi = window.electronAi || window.canvasDesktop?.electronAi;
    if (!aiApi) {
      throw new Error('@electron/llm API is not available. Please verify local model setup.');
    }

    const modelToLoad = activeModelConfig.filename || activeModelAlias || 'SmolLM2-360M-Instruct-Q4_K_M.gguf';

    // If already loaded with the same model and system prompt, skip re-initialization
    if (currentLoadedModelFilename === modelToLoad && currentLoadedSystemPrompt === systemPrompt) {
      return;
    }

    if (statusIndicator) {
      statusIndicator.className = 'ai-status-indicator loading';
      statusIndicator.title = 'Initializing Model...';
    }

    try {
      await aiApi.create({
        modelAlias: modelToLoad,
        systemPrompt: systemPrompt || 'You are the Assistant for Atelier courses. Answer concisely and accurately.',
        temperature: 0.6,
        topK: 40
      });
      currentLoadedModelFilename = modelToLoad;
      currentLoadedSystemPrompt = systemPrompt;
      if (statusIndicator) {
        statusIndicator.className = 'ai-status-indicator ready';
        statusIndicator.title = 'Local LLM Ready';
      }
    } catch (err) {
      if (statusIndicator) {
        statusIndicator.className = 'ai-status-indicator';
        statusIndicator.title = 'Model Error';
      }
      throw err;
    }
  }

  // Tool Calling & Execution Engine (Silent in UI - Debug Output in Terminal Only)
  async function executeToolCallSilently(toolName, parameters) {
    const formattedParams = parameters || {};

    // Display in terminal for debugging
    console.log(`[AI Tool Debug] Calling tool "${toolName}" with params:`, formattedParams);
    if (window.canvasDesktop?.logTerminal) {
      window.canvasDesktop.logTerminal({
        message: `Executing tool "${toolName}"`,
        data: formattedParams
      });
    }

    let result = null;
    if (window.canvasAiTools?.executeTool) {
      result = await window.canvasAiTools.executeTool(toolName, formattedParams);
    } else {
      result = { success: false, error: 'AI Tools engine is not initialized' };
    }

    // Display results in terminal for debugging
    console.log(`[AI Tool Debug] Tool "${toolName}" result:`, result?.success ? 'SUCCESS' : 'ERROR', result);
    if (window.canvasDesktop?.logTerminal) {
      window.canvasDesktop.logTerminal({
        message: `Tool "${toolName}" finished [${result?.success ? 'SUCCESS' : 'ERROR'}]`,
        data: result?.success ? result.data : result?.error
      });
    }

    return result;
  }

  function detectToolIntent(query, courseId) {
    if (!query) return null;
    const q = query.toLowerCase();

    // 1. Deadlines / upcoming assignments
    if (q.includes('deadline') || q.includes('due') || q.includes('what is due') || q.includes('upcoming') || q.includes('assignments due')) {
      return { tool: 'get_upcoming_deadlines', parameters: { days_ahead: 14 } };
    }

    // 2. Grades / score / GPA
    if (q.includes('grade') || q.includes('score') || q.includes('gpa') || q.includes('standing') || q.includes('how am i doing')) {
      return { tool: 'get_student_grades', parameters: courseId && courseId !== 'all' ? { course_id: courseId } : {} };
    }

    // 3. Announcements
    if (q.includes('announcement') || q.includes('news') || q.includes('update') || q.includes('latest message')) {
      return { tool: 'list_announcements', parameters: { course_id: courseId, limit: 5 } };
    }

    // 4. Syllabus / grading policy / office hours
    if (q.includes('syllabus') || q.includes('office hour') || q.includes('grading policy') || q.includes('late policy')) {
      return { tool: 'get_course_syllabus', parameters: { course_id: courseId || '48201' } };
    }

    // 5. Schedule / classes / calendar
    if (q.includes('schedule') || q.includes('calendar') || q.includes('what class') || q.includes('lecture time') || q.includes('meeting')) {
      return { tool: 'get_student_schedule', parameters: {} };
    }

    // 6. Modules
    if (q.includes('module') || q.includes('lessons') || q.includes('curriculum') || q.includes('topics covered')) {
      return { tool: 'list_modules', parameters: { course_id: courseId || '48201' } };
    }

    // 7. Files / readings / documents
    if (q.includes('file') || q.includes('reading') || q.includes('slides') || q.includes('pdf') || q.includes('handout')) {
      return { tool: 'list_course_files', parameters: { course_id: courseId } };
    }

    return null;
  }

  async function handleSendMessage(presetQuery, directToolCall = null) {
    const query = (presetQuery || chatInput?.value || '').trim();
    if (!query || isGenerating) return;

    if (chatInput) {
      chatInput.value = '';
      chatInput.style.height = 'auto';
      inputWrapper?.classList.remove('is-multiline');
    }

    if (welcomeCard) welcomeCard.classList.add('hidden');

    appendMessageBubble('user', query);

    const { bubbleEl, cursorEl, setStatus } = createAssistantMessageBubble();

    isGenerating = true;
    appState.aiIsGenerating = true;
    if (stopBtn) stopBtn.classList.remove('hidden');
    if (sendBtn) sendBtn.disabled = true;

    currentAbortUUID = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    try {
      const selectorVal = courseSelector ? courseSelector.value : 'all';
      let scope = 'global';
      let selectedCourseId = 'all';
      let activeFilePath = null;
      let activeDocTitle = null;

      if (selectorVal === 'active_doc') {
        scope = 'active_document';
        activeFilePath = appState.activeFile?.local_path || null;
        activeDocTitle = appState.activeFile?.display_name || appState.activeFile?.filename || null;
        selectedCourseId = appState.activeCourse?.id || 'all';
      } else if (selectorVal === 'all') {
        scope = 'global';
        selectedCourseId = 'all';
      } else {
        scope = 'course';
        selectedCourseId = selectorVal;
      }

      setStatus('Searching course knowledge...', 'Consulting syllabus, assignments & materials');

      // Tool Call Execution: Direct from button or intent-detected (Silent in UI, terminal debug only)
      let toolResult = null;
      const activeTool = directToolCall || detectToolIntent(query, selectedCourseId);
      if (activeTool && activeTool.tool) {
        toolResult = await executeToolCallSilently(activeTool.tool, activeTool.parameters);
      }

      let courseContextData = null;
      if (window.canvasDesktop?.getCourseAiContext) {
        courseContextData = await window.canvasDesktop.getCourseAiContext({
          courseId: selectedCourseId,
          query: query,
          scope: scope,
          activeFilePath: activeFilePath,
          activeDocTitle: activeDocTitle,
          modelType: activeModelConfig.type,
          modelAlias: activeModelConfig.filename || activeModelConfig.id
        });
      }

      const courseName = courseContextData?.courseName || (selectedCourseId === 'all' ? 'All Enrolled Courses' : 'Course');
      const contextText = courseContextData?.contextText || '';

      setStatus('Synthesizing answer...', 'Generating response with verified course content');

      let toolDataSection = '';
      let userPrompt = query;
      if (toolResult && toolResult.success) {
        toolDataSection = `\n\n### REAL-TIME DATA RETRIEVED FROM CANVAS (TOOL: ${activeTool.tool}):\n` + JSON.stringify(toolResult.data, null, 2);
        userPrompt = `${query}\n\n[Retrieved Data from Canvas Tool "${activeTool.tool}"]:\n` + JSON.stringify(toolResult.data, null, 2) + `\n\nPlease provide a direct, insightful, and comprehensive student summary of this retrieved data.`;
      }

      const toolsPrompt = window.canvasAiTools?.getPromptDefinition ? window.canvasAiTools.getPromptDefinition() : '';

      const systemPrompt = `You are the Academic AI Teaching Assistant in Atelier for "${courseName}".
You have DIRECT AND FULL ACCESS to the student's Canvas LMS coursework and local study materials:
- All enrolled courses, full syllabi, and schedules
- All learning modules and all individual module items/lessons
- All course pages, reading lists, lecture notes, and lab instructions
- All assignments, problem sets, quizzes, deadlines, points, submission types, and rubrics
- All course announcements and discussions
- All course documents, handouts, slides, and files (including complete text extracted from PDFs and code files)

VERIFIABLE CITATION PROTOCOL (MANDATORY):
1. Always base your statements strictly and directly on the provided Canvas Knowledge Base.
2. For EVERY claim, policy, deadline, formula, or grading criterion, you MUST provide an explicit citation using the exact format:
   "[Source: <Document Title>, p. <Page#>]" for slides and PDFs, or
   "[Source: <Document Title>, <Section>]" for syllabi, modules, and assignment briefs.
   Examples:
   - "[Source: CS301_Syllabus_Fall2026.pdf, p. 1]"
   - "[Source: Assignment 2 Brief, Grading Rubric Criteria]"
   - "[Source: Lecture 3: The Raft Consensus Algorithm, Safety]"
3. If the requested information is not in the provided excerpts, clearly state that it is not found in local materials. Do not invent details.

${toolsPrompt}

CANVAS ACADEMIC KNOWLEDGE BASE:
${contextText}${toolDataSection}`;

      let responseFull = '';

      if (activeModelConfig.type === 'cloud') {
        // Cloud API Streaming
        if (!window.canvasDesktop?.startCloudStream) {
          throw new Error('Cloud AI streaming is not available');
        }

        const providerId = activeModelConfig.providerId || 'openai';
        const modelId = activeModelConfig.modelId || activeModelConfig.id || 'gpt-5';

        await new Promise((resolve, reject) => {
          let streamDone = false;

          const removeListener = () => {
            if (window.canvasDesktop?.removeCloudChunkListener) {
              window.canvasDesktop.removeCloudChunkListener();
            }
          };

          window.canvasDesktop.onCloudChunk((data) => {
            if (data.requestUUID !== currentAbortUUID) return;

            if (data.error) {
              removeListener();
              reject(new Error(data.error));
              return;
            }

            if (data.chunk) {
              if (cursorEl.parentElement) cursorEl.remove();
              responseFull += data.chunk;
              bubbleEl.innerHTML = renderSimpleMarkdown(responseFull);
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }

            if (data.done) {
              streamDone = true;
              removeListener();
              resolve();
            }
          });

          window.canvasDesktop.startCloudStream({
            requestUUID: currentAbortUUID,
            provider: providerId,
            modelId: modelId,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ]
          }).then((res) => {
            if (!res || !res.success) {
              removeListener();
              reject(new Error(res?.error || 'Failed to start cloud stream'));
            }
          }).catch(err => {
            removeListener();
            reject(err);
          });
        });

      } else {
        // Local GGUF Engine
        const aiApi = window.electronAi || window.canvasDesktop?.electronAi;
        if (!aiApi) throw new Error('@electron/llm API is not available');

        const runLocalPrompt = async (sysPrompt, promptContent) => {
          await ensureModelLoaded(sysPrompt);
          let localReply = '';
          if (typeof aiApi.promptStreaming === 'function') {
            const stream = await aiApi.promptStreaming(promptContent, {
              requestUUID: currentAbortUUID,
              timeout: 60000
            });
            if (cursorEl && cursorEl.parentElement) cursorEl.remove();
            for await (const chunk of stream) {
              if (!isGenerating) break;
              localReply += chunk;
              bubbleEl.innerHTML = renderSimpleMarkdown(localReply);
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
          } else {
            const reply = await aiApi.prompt(promptContent, {
              requestUUID: currentAbortUUID,
              timeout: 60000
            });
            if (cursorEl && cursorEl.parentElement) cursorEl.remove();
            localReply = reply || 'No answer returned from model.';
            bubbleEl.innerHTML = renderSimpleMarkdown(localReply);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
          return localReply;
        };

        try {
          responseFull = await runLocalPrompt(systemPrompt, userPrompt);
        } catch (localErr) {
          const errMsg = localErr?.message || '';
          if (errMsg.includes('compress chat history') || errMsg.includes('context shift') || errMsg.includes('context size') || errMsg.includes('too long prompt')) {
            console.warn('Context shift triggered. Resetting session and applying compact fallback context...');
            if (aiApi && typeof aiApi.destroy === 'function') {
              try { await aiApi.destroy(); } catch { }
            }
            currentLoadedModelFilename = null;
            currentLoadedSystemPrompt = null;

            // Compact fallback prompt ensuring under 3,500 chars
            const compactContext = (contextText || '').slice(0, 3500);
            const fallbackPrompt = `You are the Course AI Teaching Assistant for "${courseName}".
Answer concisely and accurately using this course knowledge:
${compactContext}`;

            setStatus('Refining context...', 'Regenerating with compact focus');
            responseFull = await runLocalPrompt(fallbackPrompt, userPrompt);
          } else {
            throw localErr;
          }
        }
      }

      attachMessageActions(bubbleEl, responseFull, courseContextData?.retrievedSources || []);

    } catch (err) {
      if (cursorEl.parentElement) cursorEl.remove();
      bubbleEl.innerHTML = `
        <div style="color: #f87171; display: flex; flex-direction: column; gap: 8px;">
          <span>⚠️ ${escapeHtml(err.message || 'Error communicating with AI model')}</span>
          ${err.message && err.message.includes('API key') ? `
            <button type="button" class="secondary-button btn-sm" onclick="document.getElementById('aiModelSettingsToggleBtn').click();" style="align-self: flex-start; margin-top: 4px;">
              🔑 Configure API Key in Model Selection
            </button>
          ` : ''}
        </div>
      `;
      console.error('LLM prompt error:', err);
    } finally {
      isGenerating = false;
      appState.aiIsGenerating = false;
      if (stopBtn) stopBtn.classList.add('hidden');
      if (sendBtn) sendBtn.disabled = false;
      currentAbortUUID = null;
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  // Initial population
  refreshModelsCatalog();
  updateCourseSelector();

  window.onAiPageActivated = () => {
    updateCourseSelector();
    refreshModelsCatalog();
  };
}

