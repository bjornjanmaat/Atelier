/* ==========================================================================
   Initialization & Event Listeners
   ========================================================================== */
function initDynamicScrollbars() {
  let scrollTimeout = null;

  function onScrollActivity(target) {
    document.body.classList.add('is-scrolling');
    if (target && target instanceof Element) {
      target.classList.add('is-scrolling');
    }

    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }

    scrollTimeout = setTimeout(() => {
      document.body.classList.remove('is-scrolling');
      const activeScrollEls = document.querySelectorAll('.is-scrolling');
      activeScrollEls.forEach(el => el.classList.remove('is-scrolling'));
    }, 850);
  }

  window.addEventListener('scroll', (e) => {
    onScrollActivity(e.target);
  }, { capture: true, passive: true });

  window.addEventListener('wheel', (e) => {
    onScrollActivity(e.target);
  }, { capture: true, passive: true });
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initDynamicScrollbars();
  setupEventListeners();
  loadSavedCredentials();
  indexAllAvailableFilesForSearch();
  initCourseAiAssistant();
  if (typeof initNotes === 'function') {
    initNotes();
  }
});

