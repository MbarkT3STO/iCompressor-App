/**
 * iCompressor - Main Process
 * Electron main entry point with window management and IPC handlers
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import { IPC_CHANNELS, PROGRESS_CHANNEL } from './ipc-channels';

let mainWindow: BrowserWindow | null = null;
const isDev = process.argv.includes('--dev');

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for native modules in preload
    },
  });

  const rendererPath = `file://${path.join(__dirname, '../renderer/index.html')}`;
  mainWindow.loadURL(rendererPath);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

// Register IPC handlers - done dynamically to avoid circular deps at load
function registerIpcHandlers(): void {
  const { CompressorService } = require('../services/compressor');
  const { SettingsService } = require('../services/settings');
  const { HistoryService } = require('../services/history');

  const compressor = new CompressorService();
  const settings = new SettingsService();
  const history = new HistoryService();

  // Send progress to renderer
  const sendProgress = (data: { percent: number; status: string }) => {
    mainWindow?.webContents.send(PROGRESS_CHANNEL, data);
  };

  compressor.onProgress(sendProgress);

  // File dialogs
  ipcMain.handle(IPC_CHANNELS.SELECT_FILES, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      title: 'Select files or folders to compress',
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle(IPC_CHANNELS.SELECT_FOLDER, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Select folder',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.SELECT_OUTPUT, async (_, defaultPath?: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath,
      title: 'Save archive as',
      filters: [
        { name: 'ZIP Archive', extensions: ['zip'] },
        { name: '7z Archive', extensions: ['7z'] },
        { name: 'TAR Archive', extensions: ['tar'] },
        { name: 'TAR.GZ Archive', extensions: ['tar.gz'] },
        { name: 'All Archives', extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePath;
  });

  // Compression
  ipcMain.handle(
    IPC_CHANNELS.COMPRESS,
    async (
      _,
      payload: {
        sources: string[];
        outputPath: string;
        format: string;
        level: number;
      }
    ) => {
      try {
        const result = await compressor.compress(payload);
        if (result.success && payload.sources.length > 0) {
          history.add({
            type: 'compress',
            sources: payload.sources,
            output: payload.outputPath,
            format: payload.format,
            timestamp: Date.now(),
          });
        }
        return result;
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.EXTRACT,
    async (
      _,
      payload: { archivePath: string; outputDir: string; format?: string }
    ) => {
      try {
        const result = await compressor.extract(payload);
        if (result.success) {
          history.add({
            type: 'extract',
            sources: [payload.archivePath],
            output: payload.outputDir,
            format: payload.format || '',
            timestamp: Date.now(),
          });
        }
        return result;
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  // Settings
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => settings.get());
  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, (_, s) => settings.saveSettings(s));

  // History
  ipcMain.handle(IPC_CHANNELS.GET_HISTORY, () => history.get());
  ipcMain.handle(IPC_CHANNELS.ADD_HISTORY, (_, h) => history.add(h));
  ipcMain.handle(IPC_CHANNELS.CLEAR_HISTORY, () => history.clear());

  // App
  ipcMain.handle(IPC_CHANNELS.GET_VERSION, () => app.getVersion());

  // Shell - open path in file manager (file: reveal in folder; dir: open folder)
  ipcMain.handle(IPC_CHANNELS.OPEN_PATH, async (_, targetPath: string) => {
    try {
      const fs = require('fs');
      const stat = fs.statSync(targetPath);
      if (stat.isFile()) {
        shell.showItemInFolder(targetPath);
      } else {
        shell.openPath(targetPath);
      }
      return { success: true };
    } catch {
      return { success: false };
    }
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
