/**
 * Preload Script
 * Exposes safe IPC APIs to renderer via contextBridge
 * Context isolation enabled - no nodeIntegration in renderer
 */

import { contextBridge, ipcRenderer } from 'electron';

const IPC_CHANNELS = {
  SELECT_FILES: 'dialog:select-files',
  SELECT_FOLDER: 'dialog:select-folder',
  SELECT_OUTPUT: 'dialog:select-output',
  COMPRESS: 'compressor:compress',
  EXTRACT: 'compressor:extract',
  GET_SETTINGS: 'settings:get',
  SAVE_SETTINGS: 'settings:save',
  GET_HISTORY: 'history:get',
  ADD_HISTORY: 'history:add',
  CLEAR_HISTORY: 'history:clear',
  GET_VERSION: 'app:version',
  OPEN_PATH: 'shell:open-path',
} as const;

const PROGRESS_CHANNEL = 'compressor:progress';

export interface ICompressorAPI {
  selectFiles: () => Promise<string[]>;
  selectFolder: () => Promise<string | null>;
  selectOutput: (defaultPath?: string) => Promise<string | null>;
  compress: (payload: {
    sources: string[];
    outputPath: string;
    format: string;
    level: number;
  }) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
  extract: (payload: {
    archivePath: string;
    outputDir: string;
    format?: string;
  }) => Promise<{ success: boolean; outputDir?: string; error?: string }>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>;
  getHistory: () => Promise<HistoryEntry[]>;
  clearHistory: () => Promise<void>;
  getVersion: () => Promise<string>;
  openPath: (path: string) => Promise<{ success: boolean }>;
  onProgress: (callback: (data: { percent: number; status: string }) => void) => () => void;
}

export interface AppSettings {
  compressionLevel: number;
  outputDirectory: string;
  autoOpenResultFolder: boolean;
  theme: 'light' | 'dark' | 'system';
  animationsEnabled: boolean;
}

export interface HistoryEntry {
  type: 'compress' | 'extract';
  sources: string[];
  output: string;
  format: string;
  timestamp: number;
}

const api: ICompressorAPI = {
  selectFiles: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_FILES),
  selectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_FOLDER),
  selectOutput: (defaultPath?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_OUTPUT, defaultPath),
  compress: (payload) => ipcRenderer.invoke(IPC_CHANNELS.COMPRESS, payload),
  extract: (payload) => ipcRenderer.invoke(IPC_CHANNELS.EXTRACT, payload),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  saveSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, settings),
  getHistory: () => ipcRenderer.invoke(IPC_CHANNELS.GET_HISTORY),
  clearHistory: () => ipcRenderer.invoke(IPC_CHANNELS.CLEAR_HISTORY),
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
};

contextBridge.exposeInMainWorld('compressorAPI', api);
