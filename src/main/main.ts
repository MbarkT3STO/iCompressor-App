/**
 * iCompressor - Main Process
 * Electron main entry point with window management and IPC handlers
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import { IPC_CHANNELS, PROGRESS_CHANNEL } from './ipc-channels';

let mainWindow: BrowserWindow | null = null;
const isDev = process.argv.includes('--dev');

// Track files/folders queued before the window is ready
const ARCHIVE_EXTENSIONS = new Set(['.zip', '.7z', '.rar', '.tar', '.gz', '.tgz']);

function getActionForPath(filePath: string): 'compress' | 'extract' {
  const ext = filePath.includes('.') ? '.' + filePath.split('.').slice(1).join('.').toLowerCase() : '';
  // Check multi-part extensions like .tar.gz first
  if (ext.endsWith('.tar.gz') || ext.endsWith('.tgz') || ARCHIVE_EXTENSIONS.has(ext)) {
    return 'extract';
  }
  return 'compress';
}

let pendingOpen: { filePath: string; action: 'compress' | 'extract' } | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
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

  // Force hide macOS native traffic lights since we built our own
  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(false);
  }

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
        password?: string;
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
      payload: { archivePath: string; outputDir: string; format?: string; password?: string }
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

  ipcMain.handle(
    IPC_CHANNELS.TEST,
    async (_, payload: { archivePath: string; password?: string }) => {
      try {
        return await compressor.test(payload.archivePath, payload.password);
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

  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, async (_, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch {
      return { success: false };
    }
  });

  // File System (Browse)
  ipcMain.handle(IPC_CHANNELS.GET_HOME_DIR, () => {
    return app.getPath('home');
  });

  ipcMain.handle(IPC_CHANNELS.READ_DIR, async (_, dirPath: string) => {
    const fs = require('fs');
    try {
      const dirents = fs.readdirSync(dirPath, { withFileTypes: true });
      const entries = dirents.map((dirent: any) => {
        const fullPath = path.join(dirPath, dirent.name);
        let size = 0;
        let modifiedAt = 0;
        try {
          const stat = fs.statSync(fullPath);
          size = stat.size;
          modifiedAt = stat.mtimeMs;
        } catch {
          // ignore stat errors (e.g., permissions)
        }
        return {
          name: dirent.name,
          path: fullPath,
          isDirectory: dirent.isDirectory(),
          size,
          modifiedAt,
        };
      });
      // Sort: folders first, then alphabetical
      entries.sort((a: any, b: any) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      return { success: true, entries };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  });

  // Window Controls
  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    mainWindow?.minimize();
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => {
    mainWindow?.close();
  });
}

// ─── Handle open-file from macOS Services / file associations ─────────────────
// macOS sends this *before* app is ready, so we buffer it in pendingOpen
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  const action = getActionForPath(filePath);
  if (mainWindow?.webContents) {
    mainWindow.webContents.send(IPC_CHANNELS.OPEN_WITH, { filePath, action });
    mainWindow.show();
  } else {
    pendingOpen = { filePath, action };
  }
});

// ─── Also handle plain CLI arg (e.g. `electron . /path/to/file.zip`) ──────────
function checkCliArgs(): void {
  // Filter out electron flags and our own entry points
  const args = process.argv.slice(isDev ? 3 : 2).filter(a => !a.startsWith('-') && a !== '.');
  if (args.length > 0) {
    const filePath = args[0];
    pendingOpen = { filePath, action: getActionForPath(filePath) };
  }
}

app.whenReady().then(() => {
  checkCliArgs();
  registerIpcHandlers();
  createWindow();

  // Once the renderer signals it's ready, flush any pending open-with intent
  ipcMain.on('renderer:ready', () => {
    if (pendingOpen && mainWindow?.webContents) {
      mainWindow.webContents.send(IPC_CHANNELS.OPEN_WITH, pendingOpen);
      pendingOpen = null;
    }
  });

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
