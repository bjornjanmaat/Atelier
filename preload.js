const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('canvasDesktop', {
  getUserProfile: (credentials) => ipcRenderer.invoke('canvas:get-user-profile', credentials),
  getCourses: (credentials) => ipcRenderer.invoke('canvas:get-courses', credentials),
  getCourseDetails: (params) => ipcRenderer.invoke('canvas:get-course-details', params),
  getFileData: (params) => ipcRenderer.invoke('canvas:get-file-data', params),
  readFileBytes: (filePath) => ipcRenderer.invoke('canvas:read-file-bytes', filePath),
  readFileText: (params) => ipcRenderer.invoke('canvas:read-file-text', params),
  getCourseTextFiles: (params) => ipcRenderer.invoke('canvas:get-course-text-files', params),
  downloadFile: (params) => ipcRenderer.invoke('canvas:download-file', params),
  downloadAllCourseFiles: (params) => ipcRenderer.invoke('canvas:download-all-course-files', params),
  ensureDemoFiles: () => ipcRenderer.invoke('canvas:ensure-demo-files'),
  loadMockAccount: () => ipcRenderer.invoke('canvas:load-mock-account'),
  getAssignmentContent: (params) => ipcRenderer.invoke('canvas:get-assignment-content', params),
  submitAssignment: (params) => ipcRenderer.invoke('canvas:submit-assignment', params),
  selectFilesForSubmission: (options) => ipcRenderer.invoke('canvas:select-files-for-submission', options),
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
    } catch (_) {}
    return file?.path || null;
  },
  getOfflineStatus: () => ipcRenderer.invoke('canvas:get-offline-status'),
  precacheAll: (params) => ipcRenderer.invoke('canvas:precache-all', params),
  syncAllLocalContent: (params) => ipcRenderer.invoke('canvas:sync-all-local-content', params),
  clearCache: () => ipcRenderer.invoke('canvas:clear-cache'),
  openLocalFile: (filePath) => ipcRenderer.invoke('app:open-local-file', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('app:show-in-folder', filePath),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  fetchUrl: (url) => ipcRenderer.invoke('canvas:fetch-url', url),
  onNewTab: (callback) => ipcRenderer.on('app:new-tab', (_event, ...args) => callback(...args)),
  onCloseTab: (callback) => ipcRenderer.on('app:close-tab', (_event, ...args) => callback(...args)),
  logTerminal: (params) => ipcRenderer.invoke('app:log-terminal', params),
  getConversations: (params) => ipcRenderer.invoke('canvas:get-conversations', params),
  getConversation: (params) => ipcRenderer.invoke('canvas:get-conversation', params),
  sendConversationMessage: (params) => ipcRenderer.invoke('canvas:send-conversation-message', params),

  // Notes API
  selectNotesDirectory: (params) => ipcRenderer.invoke('canvas:select-notes-directory', typeof params === 'string' ? { defaultPath: params } : (params || {})),
  getDefaultNotesDirectory: () => ipcRenderer.invoke('canvas:get-default-notes-directory'),
  saveNoteFile: (directoryPath, note) => {
    if (typeof directoryPath === 'object' && directoryPath !== null && !note) {
      return ipcRenderer.invoke('canvas:save-note-file', directoryPath);
    }
    return ipcRenderer.invoke('canvas:save-note-file', { directoryPath, note });
  },
  loadNotesFromDir: (directoryPath) => {
    if (typeof directoryPath === 'object' && directoryPath !== null) {
      return ipcRenderer.invoke('canvas:load-notes-from-dir', directoryPath);
    }
    return ipcRenderer.invoke('canvas:load-notes-from-dir', { directoryPath });
  },
  deleteNoteFile: (directoryPath, noteId) => {
    if (typeof directoryPath === 'object' && directoryPath !== null && !noteId) {
      return ipcRenderer.invoke('canvas:delete-note-file', directoryPath);
    }
    return ipcRenderer.invoke('canvas:delete-note-file', { directoryPath, noteId });
  },
  selectNoteAttachment: () => ipcRenderer.invoke('canvas:select-note-attachment'),
  platform: process.platform,

  // Local LLM (@electron/llm) API
  getLlmModels: () => ipcRenderer.invoke('canvas:get-llm-models'),
  setActiveLlmModel: (modelName) => ipcRenderer.invoke('canvas:set-active-llm-model', modelName),
  selectModelFile: () => ipcRenderer.invoke('canvas:select-model-file'),
  downloadRecommendedModel: () => ipcRenderer.invoke('canvas:download-recommended-model'),
  getCourseAiContext: (params) => ipcRenderer.invoke('canvas:get-course-ai-context', params),
  onLlmDownloadProgress: (callback) => ipcRenderer.on('canvas:llm-download-progress', (_event, ...args) => callback(...args)),
  removeLlmDownloadProgressListener: () => ipcRenderer.removeAllListeners('canvas:llm-download-progress'),

  // RAG (Retrieval-Augmented Generation) Framework API
  ragQuery: (params) => ipcRenderer.invoke('canvas:rag-query', params),
  ragGetStatus: () => ipcRenderer.invoke('canvas:rag-get-status'),
  ragReindex: () => ipcRenderer.invoke('canvas:rag-reindex'),

  // Multi-Model Catalog & Cloud API Engine
  getModelsCatalog: () => ipcRenderer.invoke('canvas:get-models-catalog'),
  setActiveModel: (modelInfo) => ipcRenderer.invoke('canvas:set-active-model', modelInfo),
  downloadModel: (modelId) => ipcRenderer.invoke('canvas:download-model', { modelId }),
  abortDownloadModel: (modelId) => ipcRenderer.invoke('canvas:abort-download-model', { modelId }),
  deleteModel: (filename) => ipcRenderer.invoke('canvas:delete-model', { filename }),
  getApiKeys: () => ipcRenderer.invoke('canvas:get-api-keys'),
  saveApiKeys: (keys) => ipcRenderer.invoke('canvas:save-api-keys', keys),
  startCloudStream: (params) => ipcRenderer.invoke('canvas:cloud-llm-stream-start', params),
  abortCloudStream: (params) => ipcRenderer.invoke('canvas:cloud-llm-abort', params),
  onCloudChunk: (callback) => ipcRenderer.on('canvas:cloud-llm-chunk', (_event, ...args) => callback(...args)),
  removeCloudChunkListener: () => ipcRenderer.removeAllListeners('canvas:cloud-llm-chunk'),

  // Direct access to electronAi methods
  electronAi: {
    create: (options) => ipcRenderer.invoke('ELECTRON_LLM_CREATE', options),
    destroy: () => ipcRenderer.invoke('ELECTRON_LLM_DESTROY'),
    prompt: (input, options) => ipcRenderer.invoke('ELECTRON_LLM_PROMPT', input, options),
    promptStreaming: (input, options) => {
      return new Promise((resolve) => {
        ipcRenderer.once('ELECTRON_LLM_PROMPT_STREAMING_PORT', (event) => {
          const [port] = event.ports;
          port.start();
          const iterator = {
            async next() {
              return new Promise((res, rej) => {
                port.onmessage = (e) => {
                  if (e.data.type === 'error') rej(new Error(e.data.error));
                  else if (e.data.type === 'done') res({ done: true, value: undefined });
                  else res({ value: e.data.chunk, done: false });
                };
              });
            },
            async return() { port.close(); return { done: true, value: undefined }; },
            async throw(err) { port.close(); throw err; },
            [Symbol.asyncIterator]() { return this; }
          };
          resolve(iterator);
        });
        ipcRenderer.send('ELECTRON_LLM_PROMPT_STREAMING_REQUEST', input, options);
      });
    },
    abortRequest: (requestUUID) => ipcRenderer.invoke('ELECTRON_LLM_ABORT_REQUEST', { requestUUID })
  }
});

try {
  window.addEventListener('DOMContentLoaded', () => {
    if (document.documentElement && !document.documentElement.hasAttribute('data-platform')) {
      document.documentElement.setAttribute('data-platform', process.platform);
    }
  });
} catch (_) {}

