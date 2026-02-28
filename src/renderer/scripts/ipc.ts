/**
 * IPC Layer - Bridge to main process via preload
 * Thin wrapper around window.compressorAPI
 */

import type { AppSettings, HistoryEntry, FileEntry } from '../types';

declare global {
  interface Window {
    compressorAPI: any;
  }
}

const api = window.compressorAPI;

export const ipc: {
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
  getHomeDir: () => Promise<string>;
  readDir: (path: string) => Promise<{ success: boolean; entries?: FileEntry[]; error?: string }>;
  openExternal: (url: string) => Promise<{ success: boolean }>;
} = {
  selectFiles: () => api.selectFiles(),
  selectFolder: () => api.selectFolder(),
  selectOutput: (defaultPath?: string) => api.selectOutput(defaultPath),
  compress: (payload: {
    sources: string[];
    outputPath: string;
    format: string;
    level: number;
  }) => api.compress(payload),
  extract: (payload: {
    archivePath: string;
    outputDir: string;
    format?: string;
  }) => api.extract(payload),
  getSettings: () => api.getSettings(),
  saveSettings: (settings: Partial<AppSettings>) => api.saveSettings(settings),
  getHistory: () => api.getHistory(),
  clearHistory: () => api.clearHistory(),
  getVersion: () => api.getVersion(),
  openPath: (path: string) => api.openPath(path),
  onProgress: (callback: (data: { percent: number; status: string }) => void) =>
    api.onProgress(callback),
  getHomeDir: () => api.getHomeDir(),
  readDir: (path: string) => api.readDir(path),
  openExternal: (url: string) => api.openExternal(url),
};
