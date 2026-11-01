/**
 * Canvas LMS Desktop Client
 * 
 * The codebase has been restructured into modular files in `src/js/` for enhanced
 * readability, maintainability, and clean separation of concerns:
 * 
 * - `js/state-dom.js`: Storage keys, demo data, application state, and DOM elements
 * - `js/utils.js`: Formatting, date & file helpers, themes, toasts, and HTML escape
 * - `js/offline.js`: Offline storage, cache persistence, background sync, and offline banner
 * - `js/auth-events.js`: Authentication forms, token storage, and global keyboard/window listeners
 * - `js/tabs-nav.js`: Multi-tab browsing, navigation controls, history stack, and context menus
 * - `js/courses.js`: Course card rendering, custom color/icon palette modal, and course filters
 * - `js/search.js`: Centralized global search overlay, document text indexing, and PDF search
 * - `js/sidebar-filters.js`: Sidebar active course list, search input, and course grid display
 * - `js/widgets.js`: Home dashboard widgets (Calendar with slide-in detail card, Assignments, Announcements)
 * - `js/course-modules.js`: Course page header, course navigation, modules viewer, and full-page reader
 * - `js/course-assignments.js`: Course assignments tab, submissions, grading breakdown, and file download
 * - `js/file-preview.js`: Slide-out file preview panel, PDF viewer, and syntax-highlighted code viewer
 * - `js/grades-profile.js`: Grades tab, raw JSON inspector, and user profile view
 * - `js/ai-assistant.js`: AI chat drawer, local/cloud LLM model selection, and prompt streaming
 * - `js/init.js`: DOMContentLoaded bootstrap and initial loader
 */
