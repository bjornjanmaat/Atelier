
const { app, ipcMain } = require('electron');
const { loadElectronLlm } = require('@electron/llm');
const path = require('node:path');

app.whenReady().then(async () => {
  try {
    console.log('Testing loadElectronLlm in Electron main process...');
    await loadElectronLlm({
      getModelPath: async (modelAlias) => {
        return path.resolve('models/SmolLM2-360M-Instruct-Q4_K_M.gguf');
      }
    });
    console.log('loadElectronLlm succeeded!');
    console.log('Registered ipcMain handles:', ipcMain.eventNames ? ipcMain.eventNames() : 'done');
    app.quit();
  } catch (err) {
    console.error('loadElectronLlm failed:', err);
    app.exit(1);
  }
});
