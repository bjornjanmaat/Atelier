
const { app, ipcMain } = require('electron');
const { loadElectronLlm } = require('@electron/llm');
const path = require('node:path');

app.whenReady().then(async () => {
  try {
    console.log('Testing loadElectronLlm in Electron...');
    await loadElectronLlm({
      getModelPath: async (alias) => path.resolve('models/SmolLM2-360M-Instruct-Q4_K_M.gguf')
    });
    console.log('loadElectronLlm succeeded!');
    console.log('ipcMain handles:', ipcMain._invokeHandlers ? Object.keys(ipcMain._invokeHandlers) : 'handlers exist');
  } catch (e) {
    console.log('loadElectronLlm failed:', e);
  }
  app.quit();
});
