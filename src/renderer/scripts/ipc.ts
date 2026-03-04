/**
 * IPC Layer - Bridge to main process via preload
 * Thin wrapper around window.compressorAPI
 */

import type { AppSettings, FileEntry } from '../types';

declare global {
  interface Window {
    compressorAPI: any;
  }
}

const api = window.compressorAPI;

export const ipc: {
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
    splitVolumeSize?: string;
    sfx?: boolean;
    threads?: number;
    ramLimit?: number;
    encryptHeader?: boolean;
  }) => Promise<{ success: boolean; outputPath?: string; error?: string; inputSize?: number; outputSize?: number }>;
  extract: (payload: {
    archivePath: string;
    outputDir: string;
    format?: string;
    password?: string;
  }) => Promise<{ success: boolean; outputDir?: string; error?: string }>;
  test: (archivePath: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  listArchive: (archivePath: string, password?: string) => Promise<{ success: boolean; files?: any[]; error?: string }>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>;

  getVersion: () => Promise<string>;
  openPath: (path: string) => Promise<{ success: boolean }>;
  showItemInFolder: (path: string) => Promise<{ success: boolean }>;
  onProgress: (callback: (data: { percent: number; status: string; speed?: string; eta?: string }) => void) => () => void;
  getHomeDir: () => Promise<string>;
  readDir: (path: string, showHidden?: boolean) => Promise<{ success: boolean; entries?: FileEntry[]; error?: string }>;
  deleteFile: (path: string) => Promise<{ success: boolean; error?: string }>;
  renameFile: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>;
  copyFile: (sourcePath: string, destPath: string) => Promise<{ success: boolean; error?: string }>;
  createFolder: (path: string) => Promise<{ success: boolean; error?: string }>;
  getFolderSize: (path: string) => Promise<{ success: boolean; size?: number; error?: string }>;
  openExternal: (url: string) => Promise<{ success: boolean }>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  getPlatform: () => string;
  onOpenWith: (callback: (data: { filePath: string; action: 'compress' | 'extract' }) => void) => () => void;
  startNativeDrag: (archivePath: string, internalPath: string, isFolder: boolean, password?: string) => void;
  getHistory: () => Promise<import('../types').HistoryEntry[]>;
  clearHistory: () => Promise<void>;
  extractPreviewFile: (archivePath: string, internalPath: string, password?: string) => Promise<{ success: boolean; data?: string; type?: 'text' | 'image' | 'unsupported'; error?: string }>;
  extractTempFile: (archivePath: string, internalPath: string, password?: string) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
  setTrayEnabled: (enabled: boolean) => void;
  computeChecksum: (filePath: string) => Promise<{ success: boolean; hash?: string; error?: string }>;
  convertArchive: (inputPath: string, outputFormat: string, outputDir: string, password?: string) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
  selectiveExtract: (archivePath: string, internalPaths: string[], outputDir: string, password?: string) => Promise<{ success: boolean; outputDir?: string; error?: string }>;
  pauseOperations: () => void;
  resumeOperations: () => void;
  cancelOperations: () => void;
} = {
  selectFiles: () => api.selectFiles(),
  selectFolder: () => api.selectFolder(),
  selectArchive: () => api.selectArchive(),
  selectOutput: (defaultPath?: string, format?: string) => api.selectOutput(defaultPath, format),
  compress: (payload: {
    sources: string[];
    outputPath: string;
    format: string;
    level: number;
    password?: string;
    splitVolumeSize?: string;
    sfx?: boolean;
    threads?: number;
    ramLimit?: number;
    encryptHeader?: boolean;
  }) => api.compress(payload),
  extract: (payload: {
    archivePath: string;
    outputDir: string;
    format?: string;
    password?: string;
  }) => api.extract(payload),
  test: (archivePath: string, password?: string) => api.test(archivePath, password),
  listArchive: (archivePath: string, password?: string) => api.listArchive(archivePath, password),
  getSettings: () => api.getSettings(),
  saveSettings: (settings: Partial<AppSettings>) => api.saveSettings(settings),

  getVersion: () => api.getVersion(),
  openPath: (path: string) => api.openPath(path),
  showItemInFolder: (path: string) => api.showItemInFolder(path),
  onProgress: (callback: (data: { percent: number; status: string; speed?: string; eta?: string }) => void) =>
    api.onProgress(callback),
  getHomeDir: () => api.getHomeDir(),
  readDir: (path: string, showHidden?: boolean) => api.readDir(path, showHidden),
  deleteFile: (path: string) => api.deleteFile(path),
  renameFile: (oldPath: string, newPath: string) => api.renameFile(oldPath, newPath),
  copyFile: (sourcePath: string, destPath: string) => api.copyFile(sourcePath, destPath),
  createFolder: (path: string) => api.createFolder(path),
  getFolderSize: (path: string) => api.getFolderSize(path),
  openExternal: (url: string) => api.openExternal(url),
  minimizeWindow: () => api.minimizeWindow(),
  maximizeWindow: () => api.maximizeWindow(),
  closeWindow: () => api.closeWindow(),
  getPlatform: () => api.getPlatform(),
  onOpenWith: (callback) => api.onOpenWith(callback),
  startNativeDrag: (archivePath: string, internalPath: string, isFolder: boolean, password?: string) =>
    api.startNativeDrag(archivePath, internalPath, isFolder, password),
  getHistory: () => api.getHistory(),
  clearHistory: () => api.clearHistory(),
  extractPreviewFile: (archivePath: string, internalPath: string, password?: string) => 
    api.extractPreviewFile(archivePath, internalPath, password),
  extractTempFile: (archivePath: string, internalPath: string, password?: string) => 
    api.extractTempFile(archivePath, internalPath, password),
  setTrayEnabled: (enabled: boolean) => api.setTrayEnabled(enabled),
  computeChecksum: (filePath: string) => api.computeChecksum(filePath),
  convertArchive: (inputPath: string, outputFormat: string, outputDir: string, password?: string) =>
    api.convertArchive(inputPath, outputFormat, outputDir, password),
  selectiveExtract: (archivePath: string, internalPaths: string[], outputDir: string, password?: string) =>
    api.selectiveExtract(archivePath, internalPaths, outputDir, password),
  pauseOperations: () => api.pauseOperations(),
  resumeOperations: () => api.resumeOperations(),
  cancelOperations: () => api.cancelOperations(),
};
