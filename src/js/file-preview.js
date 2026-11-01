/**
 * File Preview Panel Controls & Rendering
 */
async function openFilePreview(file, searchQuery = '', targetPageNum = null) {
  if (!filePreviewPanel) return;
  if (targetPageNum) {
    file.targetPageNum = targetPageNum;
  }
  appState.activeFile = file;
  appState.activeFileSearchQuery = searchQuery;

  if (file.is_external_url) {
    const rawName = file.display_name || file.filename || 'External Link';
    if (previewFileIcon) previewFileIcon.textContent = '🔗';
    if (previewFileName) previewFileName.textContent = rawName;
    if (previewFileMetaTop) previewFileMetaTop.textContent = 'External Link • Webpage';
    if (previewOpenAppBtn) previewOpenAppBtn.style.display = 'none';
    if (previewExternalBtn) {
      previewExternalBtn.style.display = '';
      previewExternalBtn.title = 'Open in Browser';
    }
    filePreviewPanel.classList.remove('hidden');
    renderWebpagePreviewBody(file.url, rawName);
    return;
  }

  // Restore action buttons for local/canvas files
  if (previewOpenAppBtn) previewOpenAppBtn.style.display = 'none';
  if (previewExternalBtn) {
    previewExternalBtn.style.display = '';
    previewExternalBtn.title = 'Open with Default App';
  }

  const typeInfo = getFileTypeInfo(file);
  const rawName = file.display_name || file.filename || 'Document';
  const fileName = ensureFilenameExtension(rawName, file.content_type || file['content-type'] || (typeInfo.type === 'pdf' ? 'application/pdf' : ''));
  file.display_name = fileName;
  file.filename = fileName;
  const sizeStr = formatFileSize(file.size);

  // Update Preview Header & Details
  if (previewFileIcon) previewFileIcon.textContent = typeInfo.icon;
  if (previewFileName) previewFileName.textContent = fileName;
  if (previewFileMetaTop) previewFileMetaTop.textContent = `${typeInfo.label} • ${sizeStr}`;

  // Show Preview Panel
  filePreviewPanel.classList.remove('hidden');

  // If file is from live Canvas and hasn't been saved locally yet, download it immediately
  if (!file.local_path && !appState.isDemo) {
    if (previewBody) {
      previewBody.innerHTML = `
        <div class="preview-loading-wrap" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; height:100%;">
          <div class="preview-loading-spinner"></div>
          <span style="font-weight:600; font-size:14px; color:var(--color-text-primary);">Loading "${escapeHtml(fileName)}"...</span>
          <span style="font-size: 12px; color: var(--color-text-muted);">Downloading document to display in sidepanel</span>
        </div>
      `;
    }

    try {
      if (window.canvasDesktop?.getFileData) {
        const res = await window.canvasDesktop.getFileData({
          domain: appState.currentDomain,
          token: appState.currentToken,
          fileUrl: file.url,
          fileId: file.id,
          filename: fileName,
          courseId: appState.activeCourse?.id,
          mimeType: file['content-type'] || file.content_type
        });

        // Verify active file hasn't changed during download
        if (appState.activeFile?.id !== file.id && appState.activeFile?.display_name !== fileName) {
          return;
        }

        if (res.success) {
          file.local_path = res.localPath;
          file.is_downloaded = true;
          if (res.type === 'text') {
            if (typeInfo.type === 'markdown') {
              file.text_content = res.content;
            } else {
              file.code_content = res.content;
            }
          } else if (res.type === 'pdf') {
            file.localPdfPath = res.localPath;
            file.dataUrl = res.dataUrl;
          } else if (res.type === 'image') {
            file.dataUrl = res.dataUrl;
          }

          if (appState.courseDetails?.files) renderFilesTab(appState.courseDetails.files);
        }
      }
    } catch (err) {
      console.error('Error fetching file preview data:', err);
    }
  } else if (!file.local_path && appState.isDemo) {
    await ensureFileDownloaded(file);
    if (appState.courseDetails?.files) renderFilesTab(appState.courseDetails.files);
  }

  // Render Body directly showing the file in sidepanel
  renderPreviewBody(file, typeInfo, searchQuery);
}

function closeFilePreview() {
  if (window.currentPreviewPdfDoc) {
    try { window.currentPreviewPdfDoc.destroy(); } catch { }
    window.currentPreviewPdfDoc = null;
  }
  if (!filePreviewPanel) return;
  filePreviewPanel.classList.add('hidden');
  appState.activeFile = null;
  appState.activeFileSearchQuery = '';
  if (previewOpenAppBtn) previewOpenAppBtn.style.display = 'none';
  document.querySelectorAll('.file-row-card').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.assignment-row-card').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.home-announcement-item').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.announcement-card').forEach(c => c.classList.remove('active'));
  if (typeof clearCalendarPageSelection === 'function') {
    clearCalendarPageSelection();
  }
}

function findMatchesInPdfText(str, query) {
  const matches = [];
  const sLower = (str || '').toLowerCase();
  const qLower = (query || '').toLowerCase().trim();
  if (!qLower || !sLower) return matches;

  // 1. Full phrase match
  let idx = sLower.indexOf(qLower);
  if (idx !== -1) {
    while (idx !== -1) {
      matches.push({ start: idx, len: qLower.length });
      idx = sLower.indexOf(qLower, idx + qLower.length);
    }
    return matches;
  }

  // 2. Individual words if multi-word query
  const words = qLower.split(/\s+/).filter(w => w.length >= 2);
  if (words.length > 1) {
    for (const w of words) {
      let wIdx = sLower.indexOf(w);
      while (wIdx !== -1) {
        const already = matches.some(m => m.start <= wIdx && (m.start + m.len) >= (wIdx + w.length));
        if (!already) {
          matches.push({ start: wIdx, len: w.length });
        }
        wIdx = sLower.indexOf(w, wIdx + w.length);
      }
    }
  }
  return matches;
}

async function renderPdfDocument(file, fileName, container, searchQuery = '') {
  // Clean loading spinner
  container.innerHTML = `
    <div class="preview-loading-wrap" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; height:100%;">
      <div class="preview-loading-spinner"></div>
      <span style="font-size:13px; color:var(--color-text-secondary); font-weight:500;">Loading "${escapeHtml(fileName)}"...</span>
    </div>
  `;

  try {
    let pdfjs = window.pdfjsLib;
    if (!pdfjs) {
      try {
        pdfjs = await import('../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs';
        window.pdfjsLib = pdfjs;
      } catch (err) {
        console.warn('PDF.js dynamic import fallback:', err);
      }
    }

    let pdfData = null;
    if (file.local_path && window.canvasDesktop?.readFileBytes) {
      const res = await window.canvasDesktop.readFileBytes(file.local_path);
      if (res?.success && res.data) {
        pdfData = new Uint8Array(res.data);
      }
    }

    if (!pdfData && file.dataUrl && file.dataUrl.includes('base64,')) {
      const base64 = file.dataUrl.split(',')[1];
      const binary = atob(base64);
      pdfData = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        pdfData[i] = binary.charCodeAt(i);
      }
    }

    if (!pdfjs || !pdfData) {
      const pdfSrc = file.local_path ? `file://${file.local_path}` : (file.dataUrl || file.localPdfPath);
      if (pdfSrc) {
        const hash = searchQuery ? `#search=${encodeURIComponent(searchQuery)}&toolbar=0&navpanes=0` : '#toolbar=0&navpanes=0';
        container.innerHTML = `<iframe src="${pdfSrc}${hash}" class="preview-pdf-embed-frame" title="${escapeHtml(fileName)}"></iframe>`;
      }
      return;
    }

    if (window.currentPreviewPdfDoc) {
      try { window.currentPreviewPdfDoc.destroy(); } catch { }
      window.currentPreviewPdfDoc = null;
    }

    const loadingTask = pdfjs.getDocument({
      data: pdfData,
      isEvalSupported: false,
      stopAtErrors: false
    });
    const pdfDoc = await loadingTask.promise;
    window.currentPreviewPdfDoc = pdfDoc;

    // Verify active file hasn't changed during parsing
    if (appState.activeFile !== file) return;

    // Search for target page containing match or use explicitly passed page
    let targetPageNum = (file && file.targetPageNum) ? parseInt(file.targetPageNum, 10) : 1;
    const qClean = (searchQuery || '').trim().toLowerCase();
    if (!file?.targetPageNum && qClean) {
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        try {
          const pg = await pdfDoc.getPage(p);
          const txt = await pg.getTextContent();
          const pageStr = txt.items.map(it => it.str).join(' ').toLowerCase();
          if (pageStr.includes(qClean)) {
            targetPageNum = p;
            break;
          }
        } catch { }
      }
    }

    container.innerHTML = '';

    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'preview-pdf-pages-scroll';

    const counter = document.createElement('div');
    counter.className = 'pdf-floating-counter';
    counter.textContent = `Page ${targetPageNum} of ${pdfDoc.numPages}`;

    container.appendChild(scrollContainer);
    container.appendChild(counter);

    // Function to calculate target width based on current container size
    const getTargetWidth = () => {
      const containerWidth = scrollContainer.clientWidth || 560;
      return Math.max(280, containerWidth - 28);
    };

    // Get page 1 aspect ratio
    const firstPage = await pdfDoc.getPage(1);
    const unscaledVp = firstPage.getViewport({ scale: 1 });
    const aspectRatio = unscaledVp.height / unscaledVp.width;
    let currentTargetWidth = getTargetWidth();

    // Create cards for each page
    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const card = document.createElement('div');
      card.className = 'pdf-page-card';
      card.dataset.pageNum = p;
      card.style.width = `${currentTargetWidth}px`;
      card.style.height = `${currentTargetWidth * aspectRatio}px`;

      const canvas = document.createElement('canvas');
      card.appendChild(canvas);

      const placeholder = document.createElement('div');
      placeholder.className = 'pdf-page-placeholder';
      placeholder.innerHTML = `<div class="pdf-page-mini-spinner"></div><span>Page ${p}</span>`;
      card.appendChild(placeholder);

      scrollContainer.appendChild(card);
    }

    const renderedPages = new Set();
    const renderPage = async (num, cardEl) => {
      if (renderedPages.has(num)) return;
      renderedPages.add(num);
      try {
        const page = await pdfDoc.getPage(num);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const pageUnscaled = page.getViewport({ scale: 1 });
        const curCardWidth = parseFloat(cardEl.style.width) || currentTargetWidth;
        const scale = (curCardWidth / pageUnscaled.width) * dpr;
        const viewport = page.getViewport({ scale });

        const canvas = cardEl.querySelector('canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        cardEl.style.height = `${viewport.height / dpr}px`;

        await page.render({ canvasContext: ctx, viewport }).promise;
        const placeholder = cardEl.querySelector('.pdf-page-placeholder');
        if (placeholder) placeholder.remove();

        // Highlight specific matched text bounding boxes on this page
        if (qClean) {
          try {
            cardEl.querySelectorAll('.pdf-text-match-highlight').forEach(el => el.remove());
            const textContent = await page.getTextContent();
            for (const item of textContent.items) {
              if (!item.str || !item.transform) continue;
              const matches = findMatchesInPdfText(item.str, qClean);
              if (matches.length === 0) continue;

              const itemHeight = Math.abs(item.height || item.transform[3] || item.transform[0] || 12);
              const totalStrLen = item.str.length || 1;
              const ty = item.transform[5];

              for (const m of matches) {
                const startRatio = m.start / totalStrLen;
                const lenRatio = Math.min(1 - startRatio, m.len / totalStrLen);
                const subX1 = item.transform[4] + item.width * startRatio;
                const subX2 = subX1 + item.width * lenRatio;

                const p1 = viewport.convertToViewportPoint(subX1, ty);
                const p2 = viewport.convertToViewportPoint(subX2, ty + itemHeight);

                const vxMin = Math.min(p1[0], p2[0]);
                const vxMax = Math.max(p1[0], p2[0]);
                const vyMin = Math.min(p1[1], p2[1]);
                const vyMax = Math.max(p1[1], p2[1]);

                const cLeft = (canvas.offsetLeft || 0) + (vxMin / dpr) - 2;
                const cTop = (canvas.offsetTop || 0) + (vyMin / dpr) - 1;
                const cWidth = Math.max(6, (vxMax - vxMin) / dpr + 4);
                const cHeight = Math.max(12, (vyMax - vyMin) / dpr + 2);

                const hlEl = document.createElement('div');
                hlEl.className = 'pdf-text-match-highlight';
                hlEl.style.left = `${cLeft}px`;
                hlEl.style.top = `${cTop}px`;
                hlEl.style.width = `${cWidth}px`;
                hlEl.style.height = `${cHeight}px`;
                cardEl.appendChild(hlEl);
              }
            }
          } catch (eHl) {
            console.warn('PDF text highlight error:', eHl);
          }
        }
      } catch (err) {
        console.error(`Error rendering PDF page ${num}:`, err);
      }
    };

    // Render page 1 immediately
    const firstCard = scrollContainer.querySelector('[data-page-num="1"]');
    if (firstCard) {
      await renderPage(1, firstCard);
    }

    // If target match page is not page 1, render it immediately and scroll directly to it!
    if (targetPageNum > 1) {
      const targetCard = scrollContainer.querySelector(`[data-page-num="${targetPageNum}"]`);
      if (targetCard) {
        await renderPage(targetPageNum, targetCard);
        setTimeout(() => {
          const firstHl = targetCard.querySelector('.pdf-text-match-highlight');
          if (firstHl) {
            firstHl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 120);
      }
    } else if (qClean && firstCard) {
      setTimeout(() => {
        const firstHl = firstCard.querySelector('.pdf-text-match-highlight');
        if (firstHl) {
          firstHl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 120);
    }

    // Lazy render on scroll with IntersectionObserver
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const pageNum = parseInt(entry.target.dataset.pageNum, 10);
          counter.textContent = `Page ${pageNum} of ${pdfDoc.numPages}`;
          renderPage(pageNum, entry.target);
        }
      });
    }, { root: scrollContainer, rootMargin: '350px 0px 350px 0px' });

    scrollContainer.querySelectorAll('.pdf-page-card').forEach(el => observer.observe(el));

    // Dynamic resize handler: scale cards and re-render pages to match available width
    let resizeTimer = null;
    const resizeObserver = new ResizeObserver(() => {
      const newWidth = getTargetWidth();
      if (Math.abs(newWidth - currentTargetWidth) < 2) return;
      currentTargetWidth = newWidth;

      scrollContainer.querySelectorAll('.pdf-page-card').forEach(card => {
        card.style.width = `${currentTargetWidth}px`;
        card.style.height = `${currentTargetWidth * aspectRatio}px`;
        const canvas = card.querySelector('canvas');
        if (canvas) {
          canvas.style.width = `${currentTargetWidth}px`;
          canvas.style.height = `${currentTargetWidth * aspectRatio}px`;
        }
      });

      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        renderedPages.clear();
        scrollContainer.querySelectorAll('.pdf-page-card').forEach(card => {
          const rect = card.getBoundingClientRect();
          const containerRect = scrollContainer.getBoundingClientRect();
          const isVisible = rect.bottom >= containerRect.top - 200 && rect.top <= containerRect.bottom + 200;
          if (isVisible) {
            renderPage(parseInt(card.dataset.pageNum, 10), card);
          }
        });
      }, 150);
    });

    resizeObserver.observe(scrollContainer);

  } catch (err) {
    console.error('PDF.js rendering error, fallback to embed:', err);
    const pdfSrc = file.local_path ? `file://${file.local_path}` : (file.dataUrl || file.localPdfPath);
    if (pdfSrc) {
      const hash = searchQuery ? `#search=${encodeURIComponent(searchQuery)}&toolbar=0&navpanes=0` : '#toolbar=0&navpanes=0';
      container.innerHTML = `<iframe src="${pdfSrc}${hash}" class="preview-pdf-embed-frame" title="${escapeHtml(fileName)}"></iframe>`;
    }
  }
}

function renderPreviewBody(file, typeInfo, searchQuery = '') {
  if (!previewBody) return;
  previewBody.innerHTML = '';

  const fileName = file.display_name || file.filename || 'Document';

  if (file.is_external_url) {
    renderWebpagePreviewBody(file.url, fileName);
    return;
  }

  if (typeInfo.type === 'pdf') {
    renderPdfDocument(file, fileName, previewBody, searchQuery);
  } else if (typeInfo.type === 'image') {
    const imgSrc = file.local_path ? `file://${file.local_path}` : (file.dataUrl || file.url);
    const imgContainer = document.createElement('div');
    imgContainer.className = 'preview-image-container';
    imgContainer.style.cssText = 'flex: 1; height: 100%; display: flex; align-items: center; justify-content: center; overflow: auto; padding: 16px; min-width: 0; min-height: 0; width: 100%;';
    imgContainer.innerHTML = `<img src="${imgSrc}" alt="${escapeHtml(fileName)}" style="max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; border-radius: var(--radius-md); box-shadow: 0 4px 16px rgba(0,0,0,0.2);" />`;
    previewBody.appendChild(imgContainer);
  } else if (typeInfo.type === 'code') {
    const wrap = document.createElement('div');
    wrap.className = 'preview-scroll-content';
    wrap.style.cssText = 'flex: 1; height: 100%; overflow: auto;';
    const codeText = file.code_content || `// ${fileName}\n// File content loaded from Canvas LMS\nconsole.log("Ready");`;

    const lines = codeText.split('\n');
    let firstMatchedLine = -1;
    const qLower = (searchQuery || '').trim().toLowerCase();

    let codeRowsHtml = '';
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const isMatch = Boolean(qLower && line.toLowerCase().includes(qLower));
      if (isMatch && firstMatchedLine === -1) {
        firstMatchedLine = lineNum;
      }
      const lineHtml = isMatch
        ? highlightSearchMatch(line, searchQuery)
        : escapeHtml(line);
      codeRowsHtml += `<div class="code-line-row ${isMatch ? 'match-highlight-line' : ''}" data-line="${lineNum}"><span class="code-line-num">${lineNum}</span><span class="code-line-text">${lineHtml || ' '}</span></div>`;
    });

    wrap.innerHTML = `
      <div class="preview-code-wrap">
        <div class="preview-code-bar">
          <div style="display:flex; align-items:center; gap:8px;">
            <span>${escapeHtml(fileName)}</span>
          </div>
          <button class="secondary-button small-btn" id="copyCodeBtn">Copy Code</button>
        </div>
        <div class="preview-code-rows">${codeRowsHtml}</div>
      </div>
    `;

    wrap.querySelector('#copyCodeBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(codeText);
      showToast('Source code copied to clipboard!');
    });

    previewBody.appendChild(wrap);

    if (firstMatchedLine !== -1) {
      setTimeout(() => {
        const targetRow = wrap.querySelector(`.code-line-row[data-line="${firstMatchedLine}"]`);
        if (targetRow) {
          targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetRow.classList.add('pulse-match-line');
        }
      }, 100);
    }
  } else if (typeInfo.type === 'markdown') {
    const wrap = document.createElement('div');
    wrap.className = 'preview-scroll-content';
    wrap.style.cssText = 'flex: 1; height: 100%; overflow: auto; padding: 20px;';
    const mdText = file.text_content || `# ${fileName}\n\nDocument notes preview.`;

    let formatted = escapeHtml(mdText);
    if (searchQuery && searchQuery.trim()) {
      formatted = highlightSearchMatch(formatted, searchQuery.trim());
    }

    formatted = formatted
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/\n\n/gim, '<p></p>')
      .replace(/\n/gim, '<br />');

    const mdWrap = document.createElement('div');
    mdWrap.className = 'preview-markdown-view';
    mdWrap.innerHTML = formatted;
    wrap.appendChild(mdWrap);
    previewBody.appendChild(wrap);

    if (searchQuery && searchQuery.trim()) {
      setTimeout(() => {
        const firstMark = wrap.querySelector('mark');
        if (firstMark) {
          firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstMark.classList.add('pulse-match-target');
          const parentBlock = firstMark.closest('h1, h2, h3, p, li, blockquote');
          if (parentBlock) parentBlock.classList.add('match-highlight-block');
        }
      }, 100);
    }
  } else {
    const wrap = document.createElement('div');
    wrap.className = 'preview-scroll-content';
    wrap.style.cssText = 'flex: 1; height: 100%; overflow: auto; padding: 20px;';
    const content = file.text_content || 'Document ready for viewing.';
    const highlighted = searchQuery && searchQuery.trim() ? highlightSearchMatch(content, searchQuery.trim()) : escapeHtml(content);
    wrap.innerHTML = `
      <div class="preview-desc-banner">
        <h4>${escapeHtml(fileName)}</h4>
        <pre style="margin-top: 12px; font-family: monospace; white-space: pre-wrap;">${highlighted}</pre>
      </div>
    `;
    previewBody.appendChild(wrap);
    if (searchQuery && searchQuery.trim()) {
      setTimeout(() => {
        const firstMark = wrap.querySelector('mark');
        if (firstMark) firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }
}

function getFileTypeInfo(file) {
  if (!file) return { icon: '📁', label: 'Document', className: 'text', type: 'generic' };
  if (file.is_external_url) return { icon: '🔗', label: 'External Webpage', className: 'web', type: 'webpage' };
  const name = (file.display_name || file.filename || file.title || '').toLowerCase();
  const mime = (file['content-type'] || file.content_type || file.mime_class || '').toLowerCase();
  const isLocalPdf = Boolean(file.localPdfPath);
  const hasDocContent = Boolean(file.document_content);
  const previewType = (file.preview_type || '').toLowerCase();

  if (name.endsWith('.pdf') || mime.includes('pdf') || isLocalPdf || previewType === 'pdf' || name.includes('(pdf)') || name.includes('[pdf]') || hasDocContent || !hasValidFileExtension(name)) {
    if (name.endsWith('.py') || mime.includes('python') || previewType === 'code' || file.code_content ||
      name.endsWith('.js') || name.endsWith('.ts') || name.endsWith('.json') ||
      name.endsWith('.html') || name.endsWith('.css') || name.endsWith('.java') ||
      name.endsWith('.cpp') || name.endsWith('.c') || name.endsWith('.sql') || name.endsWith('.sh')) {
      return { icon: '💻', label: 'Source Code', className: 'code', type: 'code' };
    }
    if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.svg') || name.endsWith('.webp') || mime.startsWith('image/') || previewType === 'image') {
      return { icon: '🖼️', label: 'Image', className: 'image', type: 'image' };
    }
    if (name.endsWith('.md') || mime.includes('markdown') || previewType === 'markdown' || (file.text_content && !file.code_content && !hasDocContent)) {
      return { icon: '📝', label: 'Markdown Note', className: 'markdown', type: 'markdown' };
    }
    return { icon: '📄', label: 'PDF Document', className: 'pdf', type: 'pdf' };
  }
  if (name.endsWith('.py') || mime.includes('python') || previewType === 'code' || file.code_content ||
    name.endsWith('.js') || name.endsWith('.ts') || name.endsWith('.json') ||
    name.endsWith('.html') || name.endsWith('.css') || name.endsWith('.java') ||
    name.endsWith('.cpp') || name.endsWith('.c') || name.endsWith('.sql') || name.endsWith('.sh')) {
    return { icon: '💻', label: 'Source Code', className: 'code', type: 'code' };
  }
  if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.svg') || name.endsWith('.webp') || mime.startsWith('image/') || previewType === 'image') {
    return { icon: '🖼️', label: 'Image', className: 'image', type: 'image' };
  }
  if (name.endsWith('.md') || mime.includes('markdown') || previewType === 'markdown' || (file.text_content && !file.code_content && !hasDocContent)) {
    return { icon: '📝', label: 'Markdown Note', className: 'markdown', type: 'markdown' };
  }
  if (name.endsWith('.txt') || mime.includes('text/plain')) {
    return { icon: '📄', label: 'Text Document', className: 'text', type: 'text' };
  }
  if (name.endsWith('.docx') || name.endsWith('.doc')) {
    return { icon: '📘', label: 'Word Document', className: 'text', type: 'doc' };
  }
  if (name.endsWith('.pptx') || name.endsWith('.ppt')) {
    return { icon: '📊', label: 'Presentation Deck', className: 'pdf', type: 'presentation' };
  }
  return { icon: '📁', label: 'Document', className: 'text', type: 'generic' };
}

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return 'Unknown size';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderDocumentContentHtml(file) {
  const doc = file.document_content;
  if (!doc) {
    return `
      <div class="preview-doc-header">
        <h4 class="preview-doc-title">${escapeHtml(file.display_name || file.filename || 'Document')}</h4>
        <span class="preview-doc-subtitle">PDF Document • Switch to "PDF Viewer" tab to view original layout.</span>
      </div>
      <div class="preview-doc-section">
        <p class="preview-doc-p">${escapeHtml(file.description || 'Document file ready for review. Click Download or Open in Window to view.')}</p>
      </div>
    `;
  }

  let html = `
    <div class="preview-doc-header">
      <h3 class="preview-doc-title">${escapeHtml(doc.title || file.display_name)}</h3>
      ${doc.subtitle ? `<div class="preview-doc-subtitle">${escapeHtml(doc.subtitle)}</div>` : ''}
    </div>
  `;

  if (Array.isArray(doc.sections)) {
    doc.sections.forEach(sec => {
      html += `<div class="preview-doc-section">`;
      if (sec.heading) {
        html += `<h4 class="preview-doc-section-h">${escapeHtml(sec.heading)}</h4>`;
      }
      if (sec.body) {
        html += `<p class="preview-doc-p">${escapeHtml(sec.body)}</p>`;
      }
      if (Array.isArray(sec.table)) {
        html += `<table class="preview-doc-table"><tbody>`;
        sec.table.forEach(row => {
          html += `<tr>`;
          Object.values(row).forEach(val => {
            html += `<td>${escapeHtml(String(val))}</td>`;
          });
          html += `</tr>`;
        });
        html += `</tbody></table>`;
      }
      if (sec.callout) {
        html += `<div class="preview-doc-callout">${escapeHtml(sec.callout)}</div>`;
      }
      html += `</div>`;
    });
  }

  return html;
}

