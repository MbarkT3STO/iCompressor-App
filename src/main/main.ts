/**
 * iCompressor - Main Process
 * Electron main entry point with window management and IPC handlers
 */

import { app, BrowserWindow, ipcMain, dialog, shell, screen, Tray, Menu, nativeImage } from 'electron';
import windowStateKeeper from 'electron-window-state';
import * as path from 'path';
import * as fs from 'fs';
import { IPC_CHANNELS, PROGRESS_CHANNEL } from './ipc-channels';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const isDev = process.argv.includes('--dev');

// ─── Handle open-file from macOS Services / file associations ─────────────────
// macOS sends this *before* app is ready, so we buffer it in pendingOpen
if (app) {
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    const action = getActionForPath(filePath);
    if (mainWindow?.webContents) {
      mainWindow.webContents.send(IPC_CHANNELS.OPEN_WITH, { filePath, action });
      mainWindow.show();
    } else {
      pendingOpens.push({ filePath, action });
    }
  });
}

// Track files/folders queued before the window is ready
const ARCHIVE_EXTENSIONS = new Set(['.zip', '.7z', '.rar', '.tar', '.gz', '.tgz']);

function getActionForPath(filePath: string): 'compress' | 'extract' {
  const normalized = filePath.toLowerCase();
  
  // Check multi-part extensions like .tar.gz first
  if (normalized.endsWith('.tar.gz') || normalized.endsWith('.tgz')) {
    return 'extract';
  }

  const ext = normalized.includes('.') ? '.' + normalized.split('.').pop() : '';
  if (ARCHIVE_EXTENSIONS.has(ext)) {
    return 'extract';
  }
  
  return 'compress';
}

let pendingOpens: { filePath: string; action: 'compress' | 'extract' }[] = [];

function createWindow(): void {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const mainWindowState = windowStateKeeper({
    defaultWidth: 800,
    defaultHeight: 600
  });

  // Check if auto-resize is enabled
  const { SettingsService } = require('../services/settings');
  const settings = new SettingsService();
  const appSettings = settings.get();
  
  let windowWidth = mainWindowState.width;
  let windowHeight = mainWindowState.height;
  
  if (appSettings.autoResizeWindow) {
    // Calculate ideal window size (80% of screen with minimum dimensions)
    const idealWidth = Math.max(800, Math.floor(width * 0.8));
    const idealHeight = Math.max(600, Math.floor(height * 0.8));
    
    // Center the window on screen
    const x = Math.floor((width - idealWidth) / 2);
    const y = Math.floor((height - idealHeight) / 2);
    
    windowWidth = idealWidth;
    windowHeight = idealHeight;
    
    mainWindow = new BrowserWindow({
      x,
      y,
      width: windowWidth,
      height: windowHeight,
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
  } else {
    mainWindow = new BrowserWindow({
      x: mainWindowState.x,
      y: mainWindowState.y,
      width: windowWidth,
      height: windowHeight,
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
  }

  const rendererPath = `file://${path.join(__dirname, '../renderer/index.html')}`;
  mainWindow.loadURL(rendererPath);

  mainWindowState.manage(mainWindow);

  // Force hide macOS native traffic lights since we built our own
  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(false);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Handle native OS window close button (e.g. macOS red dot, Alt+F4, Cmd+Q)
  // This is separate from WINDOW_CLOSE IPC (our custom titlebar buttons).
  mainWindow.on('close', (e) => {
    // Read the latest setting each time so it always reflects current state
    const { SettingsService } = require('../services/settings');
    const settingsSvc = new SettingsService();
    const s = settingsSvc.get();

    if (s.minimizeToTray) {
      e.preventDefault();   // stop the window from actually closing
      mainWindow?.hide();   // hide it to the tray instead
    }
    // else: let the event proceed → window closes → app quits
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
      properties: ['openFile', 'multiSelections'],
      title: 'Select files to compress',
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

  ipcMain.handle(IPC_CHANNELS.SELECT_ARCHIVE, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      title: 'Select an Archive',
      filters: [
        { name: 'Supported Archives', extensions: ['zip', '7z', 'rar', 'tar', 'gz', 'tgz'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.SELECT_OUTPUT, async (_, defaultPath?: string, format?: string) => {
    const allFilters = [
      { name: 'ZIP Archive', extensions: ['zip'] },
      { name: '7z Archive', extensions: ['7z'] },
      { name: 'TAR Archive', extensions: ['tar'] },
      { name: 'TAR.GZ Archive', extensions: ['tar', 'gz'] },
      { name: 'All Archives', extensions: ['*'] },
    ];

    // Put the user's selected format first so macOS pre-selects it
    const extMap: Record<string, string> = { zip: 'zip', '7z': '7z', tar: 'tar', targz: 'tar' };
    const selectedExt = extMap[format || 'zip'] || 'zip';
    const filters = [
      ...allFilters.filter(f => f.extensions[0] === selectedExt),
      ...allFilters.filter(f => f.extensions[0] !== selectedExt),
    ];

    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath,
      title: 'Save archive as',
      filters,
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

        if (result.success && result.outputPath) {
          history.addEntry({
            id: Date.now().toString(),
            timestamp: Date.now(),
            action: 'compress',
            source: payload.sources.map(s => require('path').basename(s)).join(', '),
            output: require('path').basename(result.outputPath),
            status: 'success'
          });
        }

        return result;
      } catch (err) {
        history.addEntry({
          id: Date.now().toString(),
          timestamp: Date.now(),
          action: 'compress',
          source: payload.sources[0] ? require('path').basename(payload.sources[0]) : 'Unknown',
          output: '',
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'Unknown error'
        });
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

        if (result.success && result.outputDir) {
          history.addEntry({
            id: Date.now().toString(),
            timestamp: Date.now(),
            action: 'extract',
            source: require('path').basename(payload.archivePath),
            output: result.outputDir,
            status: 'success'
          });
        }

        return result;
      } catch (err) {
        history.addEntry({
          id: Date.now().toString(),
          timestamp: Date.now(),
          action: 'extract',
          source: require('path').basename(payload.archivePath),
          output: '',
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'Unknown error'
        });
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );

  console.log('--- REGISTERING COMPRESSOR:LIST ---', IPC_CHANNELS.LIST_ARCHIVE);
  ipcMain.handle(
    IPC_CHANNELS.LIST_ARCHIVE,
    async (_, payload: { archivePath: string; password?: string }) => {
      try {
        return await compressor.listArchive(payload.archivePath, payload.password);
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.EXTRACT_PREVIEW_FILE,
    async (_, payload: { archivePath: string; internalPath: string; password?: string }) => {
      try {
        const os = require('os');
        const crypto = require('crypto');
        const tempDir = path.join(os.tmpdir(), `icompressor_preview_${crypto.randomBytes(4).toString('hex')}`);
        fs.mkdirSync(tempDir, { recursive: true });
        
        const result = await compressor.extractSingleFile(payload.archivePath, payload.internalPath, tempDir, payload.password);
        if (!result.success || !result.outputPath) {
          return { success: false, error: result.error || 'Failed to extract file for preview' };
        }
        
        const buffer = fs.readFileSync(result.outputPath);
        fs.unlinkSync(result.outputPath);
        fs.rmdirSync(tempDir);
        
        const ext = path.extname(payload.internalPath).toLowerCase();
        const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
        const textExts = ['.txt', '.md', '.json', '.xml', '.csv', '.js', '.ts', '.css', '.html', '.ini', '.log'];
        
        if (imageExts.includes(ext)) {
          let mime = 'image/png';
          if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
          else if (ext === '.gif') mime = 'image/gif';
          else if (ext === '.webp') mime = 'image/webp';
          else if (ext === '.svg') mime = 'image/svg+xml';
          else if (ext === '.bmp') mime = 'image/bmp';
          
          return {
            success: true,
            type: 'image',
            data: `data:${mime};base64,${buffer.toString('base64')}`
          };
        } else if (textExts.includes(ext) || buffer.length < 50000) {
          return {
            success: true,
            type: 'text',
            data: buffer.toString('utf8')
          };
        } else {
          return {
            success: true,
            type: 'unsupported'
          };
        }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
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
  ipcMain.handle(IPC_CHANNELS.GET_HISTORY, () => history.getHistory());
  ipcMain.handle(IPC_CHANNELS.CLEAR_HISTORY, () => history.clearHistory());



  // App
  ipcMain.handle(IPC_CHANNELS.GET_VERSION, () => app.getVersion());

  // Shell - open path in file manager (file: reveal in folder; dir: open folder)
  ipcMain.handle(IPC_CHANNELS.OPEN_PATH, async (_, targetPath: string) => {
    try {
      await shell.openPath(targetPath);
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

  ipcMain.handle(IPC_CHANNELS.GET_FOLDER_SIZE, async (_, dirPath: string) => {
    const fs = require('fs');
    try {
      let totalSize = 0;
      const getDirSize = (dir: string) => {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
          const fullPath = path.join(dir, file.name);
          try {
            if (file.isDirectory()) {
              getDirSize(fullPath);
            } else {
              totalSize += fs.statSync(fullPath).size;
            }
          } catch {
            // Ignore stat/read errors (permissions, locks, etc.)
          }
        }
      };
      
      try {
        const mainStat = fs.statSync(dirPath);
        if (mainStat.isDirectory()) {
          getDirSize(dirPath);
        } else {
          totalSize = mainStat.size;
        }
      } catch (err: any) {
        return { success: false, error: err.message };
      }
      
      return { success: true, size: totalSize };
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
    const s = settings.get();
    if (s.minimizeToTray) {
      mainWindow?.hide();
    } else {
      mainWindow?.close();
    }
  });

  ipcMain.on(IPC_CHANNELS.START_NATIVE_DRAG, async (event, archivePath, internalPath, password) => {
    try {
      const tempRoot = app.getPath('temp');
      const sessionSubfolder = `icompressor-drag-${Date.now()}`;
      const extractDir = path.join(tempRoot, sessionSubfolder);

      fs.mkdirSync(extractDir, { recursive: true });

      const result = await compressor.extractSingleFile(archivePath, internalPath, extractDir, password);

      if (result.success && result.outputPath) {
        event.sender.startDrag({
          file: result.outputPath,
          icon: path.join(__dirname, '../../build/icon.png')
        });
      }
    } catch (err) {
      console.error('Drag extraction error:', err);
    }
  });
}

// ─── Handle open-file from macOS Services / file associations ─────────────────
// Moved to top of file

// ─── Also handle plain CLI args (e.g. `electron . /path/to/file.zip`) ──────────
function checkCliArgs(argsToParse: string[] = process.argv): void {
  // Filter out electron flags, the exe itself, and our own entry points
  const args = argsToParse.filter(a => !a.startsWith('-') && !a.endsWith('iCompressor.exe') && !a.endsWith('electron.exe') && a !== '.' && !a.includes('main.js') && !a.includes('app.asar'));
  
  args.forEach(filePath => {
    const action = getActionForPath(filePath);
    if (mainWindow?.webContents) {
      mainWindow.webContents.send(IPC_CHANNELS.OPEN_WITH, { filePath, action });
    } else {
      pendingOpens.push({ filePath, action });
    }
  });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // We pass the new command line args to be parsed and sent
    checkCliArgs(commandLine);
  });

  app.whenReady().then(() => {
    checkCliArgs();
    registerIpcHandlers();
    createWindow();

    // Setup Tray
    const createTray = () => {
      if (tray) return;

      const iconPath = path.join(__dirname, '../../node_modules/app-builder-lib/templates/icons/electron-linux/16x16.png');
      const trayIcon = nativeImage.createFromPath(iconPath);
      tray = new Tray(trayIcon);

      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Show iCompressor', click: () => {
            if (mainWindow) {
              mainWindow.show();
              mainWindow.focus();
            } else {
              createWindow();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Quit', click: () => {
            // Bypass close handler so it doesn't hide to tray again
            if (mainWindow) mainWindow.removeAllListeners('close');
            tray?.destroy();
            tray = null;
            app.quit();
          }
        }
      ]);

      tray.setToolTip('iCompressor');
      tray.setContextMenu(contextMenu);

      tray.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            if (mainWindow.isFocused()) {
              mainWindow.hide();
            } else {
              mainWindow.focus();
            }
          } else {
            mainWindow.show();
          }
        } else {
          createWindow();
        }
      });
    };

    const destroyTray = () => {
      if (tray) {
        tray.destroy();
        tray = null;
      }
    };

    // IPC: renderer notifies main when minimize-to-tray is toggled in settings
    ipcMain.on(IPC_CHANNELS.SET_TRAY_ENABLED, (_event, enabled: boolean) => {
      if (enabled) {
        createTray();
      } else {
        destroyTray();
      }
    });

    // Only create tray at startup if the setting is enabled
    {
      const { SettingsService } = require('../services/settings');
      const startupS = new SettingsService().get();
      if (startupS.minimizeToTray) {
        createTray();
      }
    }

    // Once the renderer signals it's ready, flush any pending open-with intents
    ipcMain.on('renderer:ready', () => {
      if (pendingOpens.length > 0 && mainWindow?.webContents) {
        pendingOpens.forEach(item => {
          mainWindow!.webContents.send(IPC_CHANNELS.OPEN_WITH, item);
        });
        pendingOpens = [];
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else if (mainWindow) {
        mainWindow.show();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
