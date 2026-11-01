/**
 * Custom Application Dropdown Component
 * Replaces OS-native <select> dropdowns with custom styled, accessible application menus
 * that match the Canvas theme and #8b5cf6 accent color.
 */

(function () {
  'use strict';

  /**
   * Escape HTML utility
   */
  function escapeText(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Enhance a single <select> element with a custom application dropdown
   */
  function enhanceCustomDropdown(selectEl) {
    if (!selectEl || selectEl._customDropdownEnhanced) return selectEl?._customDropdownWrapper;
    if (selectEl.tagName !== 'SELECT') return null;

    selectEl._customDropdownEnhanced = true;

    // Create wrapper container
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-app-dropdown';
    if (selectEl.id) wrapper.dataset.forSelect = selectEl.id;

    // Transfer specific width/sizing classes if present
    if (selectEl.classList.contains('ai-course-selector')) {
      wrapper.classList.add('ai-course-dropdown-wrap');
    }
    if (selectEl.classList.contains('ai-model-dropdown')) {
      wrapper.classList.add('ai-model-dropdown-wrap');
    }

    // Insert wrapper next to select and move select inside
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);

    // Hide original select visually while keeping it functional
    selectEl.classList.add('custom-app-select-hidden');

    // Hide any sibling static arrow icons inside dedicated-select-wrapper or note-pill-select-wrapper
    const siblingArrow = wrapper.parentElement?.querySelector('.dedicated-select-arrow, .note-pill-chevron');
    if (siblingArrow) {
      siblingArrow.style.display = 'none';
    }

    // Create custom button trigger
    const triggerBtn = document.createElement('button');
    triggerBtn.type = 'button';
    triggerBtn.className = 'custom-app-dropdown-btn ' + Array.from(selectEl.classList)
      .filter(c => c !== 'custom-app-select-hidden')
      .join(' ');
    triggerBtn.setAttribute('aria-haspopup', 'listbox');
    triggerBtn.setAttribute('aria-expanded', 'false');

    // Adopt leading icon from parent wrapper if present (e.g. course book icon)
    const leadingIcon = wrapper.parentElement?.querySelector(':scope > svg:not(.dedicated-select-arrow):not(.note-pill-chevron):not(.custom-app-dropdown-arrow)');
    if (leadingIcon) {
      leadingIcon.classList.add('custom-app-dropdown-leading-icon');
      triggerBtn.appendChild(leadingIcon);
    }

    const labelSpan = document.createElement('span');
    labelSpan.className = 'custom-app-dropdown-label';

    const arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrowSvg.setAttribute('class', 'custom-app-dropdown-arrow');
    arrowSvg.setAttribute('viewBox', '0 0 24 24');
    arrowSvg.setAttribute('width', '12');
    arrowSvg.setAttribute('height', '12');
    arrowSvg.setAttribute('fill', 'none');
    arrowSvg.setAttribute('stroke', 'currentColor');
    arrowSvg.setAttribute('stroke-width', '2');
    arrowSvg.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';

    triggerBtn.appendChild(labelSpan);
    triggerBtn.appendChild(arrowSvg);
    wrapper.appendChild(triggerBtn);

    // Create custom menu container
    const menu = document.createElement('div');
    menu.className = 'custom-app-dropdown-menu hidden';
    menu.setAttribute('role', 'listbox');
    wrapper.appendChild(menu);

    /**
     * Build menu items from <select> options
     */
    function renderMenuItems() {
      menu.innerHTML = '';
      const children = Array.from(selectEl.children);
      const selectedOption = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];

      labelSpan.textContent = selectedOption ? selectedOption.textContent.trim() : 'Select option';
      labelSpan.title = labelSpan.textContent;

      children.forEach(child => {
        if (child.tagName === 'OPTGROUP') {
          const groupTitle = document.createElement('div');
          groupTitle.className = 'custom-app-dropdown-group-title';
          groupTitle.textContent = child.label || '';
          menu.appendChild(groupTitle);

          Array.from(child.children).forEach(opt => {
            if (opt.tagName === 'OPTION') {
              menu.appendChild(createItemEl(opt));
            }
          });
        } else if (child.tagName === 'OPTION') {
          menu.appendChild(createItemEl(child));
        }
      });
    }

    function createItemEl(opt) {
      const isSelected = opt.selected || opt.value === selectEl.value;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'custom-app-dropdown-item' + (isSelected ? ' selected' : '');
      item.dataset.value = opt.value;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', isSelected ? 'true' : 'false');

      const textSpan = document.createElement('span');
      textSpan.className = 'custom-app-dropdown-item-text';
      textSpan.textContent = opt.textContent.trim();
      item.appendChild(textSpan);

      if (isSelected) {
        const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        checkSvg.setAttribute('class', 'custom-app-dropdown-check');
        checkSvg.setAttribute('viewBox', '0 0 24 24');
        checkSvg.setAttribute('width', '13');
        checkSvg.setAttribute('height', '13');
        checkSvg.setAttribute('fill', 'none');
        checkSvg.setAttribute('stroke', 'currentColor');
        checkSvg.setAttribute('stroke-width', '2.5');
        checkSvg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
        item.appendChild(checkSvg);
      }

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const prevVal = selectEl.value;
        selectEl.value = opt.value;
        syncLabelAndSelection();
        closeMenu();
        if (prevVal !== opt.value) {
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      return item;
    }

    function syncLabelAndSelection() {
      const selectedOption = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
      labelSpan.textContent = selectedOption ? selectedOption.textContent.trim() : 'Select option';
      labelSpan.title = labelSpan.textContent;

      menu.querySelectorAll('.custom-app-dropdown-item').forEach(item => {
        const isMatch = item.dataset.value === selectEl.value;
        item.classList.toggle('selected', isMatch);
        item.setAttribute('aria-selected', isMatch ? 'true' : 'false');

        const existingCheck = item.querySelector('.custom-app-dropdown-check');
        if (isMatch && !existingCheck) {
          const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          checkSvg.setAttribute('class', 'custom-app-dropdown-check');
          checkSvg.setAttribute('viewBox', '0 0 24 24');
          checkSvg.setAttribute('width', '13');
          checkSvg.setAttribute('height', '13');
          checkSvg.setAttribute('fill', 'none');
          checkSvg.setAttribute('stroke', 'currentColor');
          checkSvg.setAttribute('stroke-width', '2.5');
          checkSvg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
          item.appendChild(checkSvg);
        } else if (!isMatch && existingCheck) {
          existingCheck.remove();
        }
      });
    }

    function openMenu() {
      // Close other open custom dropdowns
      document.querySelectorAll('.custom-app-dropdown.open').forEach(el => {
        if (el !== wrapper) {
          el.classList.remove('open');
          el.querySelector('.custom-app-dropdown-menu')?.classList.add('hidden');
          el.querySelector('.custom-app-dropdown-btn')?.setAttribute('aria-expanded', 'false');
        }
      });

      syncLabelAndSelection();
      wrapper.classList.add('open');
      menu.classList.remove('hidden');
      triggerBtn.setAttribute('aria-expanded', 'true');

      // Adjust positioning if near right or bottom edge
      requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth - 10) {
          menu.style.left = 'auto';
          menu.style.right = '0';
        } else {
          menu.style.left = '0';
          menu.style.right = 'auto';
        }
        if (rect.bottom > window.innerHeight - 20 && rect.top > 300) {
          menu.style.top = 'auto';
          menu.style.bottom = 'calc(100% + 6px)';
        } else {
          menu.style.top = 'calc(100% + 6px)';
          menu.style.bottom = 'auto';
        }

        // Scroll selected item into view
        const selectedEl = menu.querySelector('.custom-app-dropdown-item.selected');
        if (selectedEl) {
          selectedEl.scrollIntoView({ block: 'nearest' });
        }
      });
    }

    function closeMenu() {
      wrapper.classList.remove('open');
      menu.classList.add('hidden');
      triggerBtn.setAttribute('aria-expanded', 'false');
    }

    function toggleMenu() {
      if (wrapper.classList.contains('open')) {
        closeMenu();
      } else {
        openMenu();
      }
    }

    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    // Listen for changes from outside
    selectEl.addEventListener('change', () => {
      syncLabelAndSelection();
    });

    // Intercept .value setter on select instance so external code sets immediately reflect
    const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    if (originalDescriptor && originalDescriptor.set) {
      Object.defineProperty(selectEl, 'value', {
        get() {
          return originalDescriptor.get.call(this);
        },
        set(newVal) {
          originalDescriptor.set.call(this, newVal);
          syncLabelAndSelection();
        },
        configurable: true
      });
    }

    // MutationObserver to rebuild menu when options change
    const observer = new MutationObserver(() => {
      renderMenuItems();
    });
    observer.observe(selectEl, { childList: true, subtree: true, attributes: true });

    // Initial render
    renderMenuItems();

    selectEl._customDropdown = {
      sync: syncLabelAndSelection,
      render: renderMenuItems,
      open: openMenu,
      close: closeMenu
    };
    selectEl._customDropdownWrapper = wrapper;

    return wrapper;
  }

  // Global click-outside listener to close any open custom dropdown
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-app-dropdown')) {
      document.querySelectorAll('.custom-app-dropdown.open').forEach(el => {
        el.classList.remove('open');
        el.querySelector('.custom-app-dropdown-menu')?.classList.add('hidden');
        el.querySelector('.custom-app-dropdown-btn')?.setAttribute('aria-expanded', 'false');
      });
    }
  });

  // Global Escape key listener
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.custom-app-dropdown.open').forEach(el => {
        el.classList.remove('open');
        el.querySelector('.custom-app-dropdown-menu')?.classList.add('hidden');
        el.querySelector('.custom-app-dropdown-btn')?.setAttribute('aria-expanded', 'false');
      });
    }
  });

  /**
   * Initialize all select elements on page
   */
  function initAllCustomDropdowns() {
    const selects = document.querySelectorAll(
      'select.dedicated-select, select.ai-course-selector, select.ai-model-dropdown, select.note-pill-select, select.format-select, select#inboxComposeCourseSelect, select.custom-select'
    );
    selects.forEach(sel => enhanceCustomDropdown(sel));
  }

  // Auto-init on DOMContentLoaded or immediately if DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllCustomDropdowns);
  } else {
    initAllCustomDropdowns();
  }

  // Expose on window
  window.enhanceCustomDropdown = enhanceCustomDropdown;
  window.initAllCustomDropdowns = initAllCustomDropdowns;
})();
