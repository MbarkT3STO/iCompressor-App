/**
 * Preload Script
 * Exposes safe IPC APIs to renderer via contextBridge
 * Context isolation enabled - no nodeIntegration in renderer
 */

import { contextBridge, ipcRenderer } from 'electron';

const IPC_CHANNELS = {
  SELECT_FILES: 'dialog:select-files',
  SELECT_FOLDER: 'dialog:select-folder',
  SELECT_ARCHIVE: 'dialog:select-archive',
  SELECT_OUTPUT: 'dialog:select-output',
  COMPRESS: 'compressor:compress',
  EXTRACT: 'compressor:extract',
  TEST: 'compressor:test',
  LIST_ARCHIVE: 'compressor:list',
  GET_SETTINGS: 'settings:get',
  SAVE_SETTINGS: 'settings:save',
  EXTRACT_PREVIEW_FILE: 'compressor:preview',
  GET_HISTORY: 'history:get',
  CLEAR_HISTORY: 'history:clear',

  GET_VERSION: 'app:version',
  OPEN_PATH: 'shell:open-path',
  READ_DIR: 'fs:read-dir',
  GET_HOME_DIR: 'fs:get-home-dir',
  GET_FOLDER_SIZE: 'fs:get-folder-size',
  OPEN_EXTERNAL: 'shell:open-external',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  OPEN_WITH: 'app:open-with',
  START_NATIVE_DRAG: 'app:start-native-drag',
  SET_TRAY_ENABLED: 'tray:set-enabled',
} as const;

const PROGRESS_CHANNEL = 'compressor:progress';

export interface ICompressorAPI {
  selectFiles: () => Promise<string[]>;
  selectFolder: () => Promise<string | null>;
  selectArchive: () => Promise<string | null>;
  selectOutput: (defaultPath?: string, format?: string) => Promise<string | null>;
  compress: (payload: {
    sources: string[];
    outputPath: string;
    format: string;
    level: number;
    password?: string;
  }) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
  extract: (payload: {
    archivePath: string;
    outputDir: string;
    format?: string;
    password?: string;
  }) => Promise<{ success: boolean; outputDir?: string; error?: string }>;
  test: (
    archivePath: string,
    password?: string
  ) => Promise<{ success: boolean; error?: string }>;
  listArchive: (
    archivePath: string,
    password?: string
  ) => Promise<{ success: boolean; files?: any[]; error?: string }>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>;

  getVersion: () => Promise<string>;
  openPath: (path: string) => Promise<{ success: boolean }>;
  onProgress: (callback: (data: { percent: number; status: string }) => void) => () => void;
  getHomeDir: () => Promise<string>;
  getFolderSize: (path: string) => Promise<{ success: boolean; size?: number; error?: string }>;
  getHistory: () => Promise<any[]>;
  clearHistory: () => Promise<void>;
  extractPreviewFile: (archivePath: string, internalPath: string, password?: string) => Promise<{ success: boolean; data?: string; type?: 'text' | 'image' | 'unsupported'; error?: string }>;
  readDir: (path: string) => Promise<{ success: boolean; entries?: FileEntry[]; error?: string }>;
  openExternal: (url: string) => Promise<{ success: boolean }>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  getPlatform: () => string;
  onOpenWith: (callback: (data: { filePath: string; action: 'compress' | 'extract' }) => void) => () => void;
  startNativeDrag: (archivePath: string, internalPath: string, password?: string) => void;
  setTrayEnabled: (enabled: boolean) => void;
}

export interface AppSettings {
  compressionLevel: number;
  outputDirectory: string;
  autoOpenResultFolder: boolean;
  theme: 'light' | 'dark' | 'system';
  animationsEnabled: boolean;
  minimizeToTray: boolean;
  deleteSourcesAfterProcess: boolean;
  overwriteBehavior: 'overwrite' | 'skip' | 'prompt';
  themeFlavor?: string;
  browseViewMode: 'explorer' | 'tree';
  layout: 'header' | 'sidebar';
  showHistoryTab: boolean;
  showBrowseRecents: boolean;
  autoResizeWindow: boolean;
}



export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

const api: ICompressorAPI = {
  selectFiles: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_FILES),
  selectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_FOLDER),
  selectArchive: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_ARCHIVE),
  selectOutput: (defaultPath?: string, format?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_OUTPUT, defaultPath, format),
  compress: (payload) => ipcRenderer.invoke(IPC_CHANNELS.COMPRESS, payload),
  extract: (payload) => ipcRenderer.invoke(IPC_CHANNELS.EXTRACT, payload),
  test: (archivePath: string, password?: string) => ipcRenderer.invoke(IPC_CHANNELS.TEST, { archivePath, password }),
  listArchive: (archivePath: string, password?: string) => ipcRenderer.invoke(IPC_CHANNELS.LIST_ARCHIVE, { archivePath, password }),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  saveSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, settings),

  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.GET_VERSION),
  openPath: (p: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_PATH, p),
  onProgress: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, data: { percent: number; status: string }) =>
      callback(data);
    ipcRenderer.on(PROGRESS_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(PROGRESS_CHANNEL, handler);
    };
  },
  getHomeDir: () => ipcRenderer.invoke(IPC_CHANNELS.GET_HOME_DIR),
  readDir: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.READ_DIR, path),
  getFolderSize: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_FOLDER_SIZE, path),
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL, url),
  minimizeWindow: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximizeWindow: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_MAXIMIZE),
  closeWindow: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE),
  getPlatform: () => process.platform,
  onOpenWith: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, data: { filePath: string; action: 'compress' | 'extract' }) =>
      callback(data);
    ipcRenderer.on(IPC_CHANNELS.OPEN_WITH, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OPEN_WITH, handler);
  },
  startNativeDrag: (archivePath: string, internalPath: string, password?: string) => {
    ipcRenderer.send(IPC_CHANNELS.START_NATIVE_DRAG, archivePath, internalPath, password);
  },
  setTrayEnabled: (enabled: boolean) => ipcRenderer.send(IPC_CHANNELS.SET_TRAY_ENABLED, enabled),
  getHistory: () => ipcRenderer.invoke(IPC_CHANNELS.GET_HISTORY),
  clearHistory: () => ipcRenderer.invoke(IPC_CHANNELS.CLEAR_HISTORY),
  extractPreviewFile: (archivePath: string, internalPath: string, password?: string) => 
    ipcRenderer.invoke(IPC_CHANNELS.EXTRACT_PREVIEW_FILE, { archivePath, internalPath, password })
};

contextBridge.exposeInMainWorld('compressorAPI', api);

// Signal main that renderer is loaded and ready to receive the pending open-with intent
ipcRenderer.send('renderer:ready');
