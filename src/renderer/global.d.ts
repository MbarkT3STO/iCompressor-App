/**
 * Type declarations for renderer - window.compressorAPI
 */

interface HistoryEntry {
  id: string;
  timestamp: number;
  action: 'compress' | 'extract';
  source: string;
  output: string;
  status: 'success' | 'error';
  errorMessage?: string;
  sizeReduction?: string;
}

interface AppSettings {
  compressionLevel: number;
  outputDirectory: string;
  autoOpenResultFolder: boolean;
  theme: 'light' | 'dark' | 'system';
  animationsEnabled: boolean;
}

interface ICompressorAPI {
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
  extractPreviewFile: (archivePath: string, internalPath: string, password?: string) => Promise<{ success: boolean; data?: string; type?: 'text' | 'image' | 'unsupported'; error?: string }>;
  getVersion: () => Promise<string>;
  openPath: (path: string) => Promise<{ success: boolean }>;
  getFolderSize: (path: string) => Promise<{ success: boolean; size?: number; error?: string }>;
  onProgress: (callback: (data: { percent: number; status: string; speed?: string; eta?: string }) => void) => () => void;
  startNativeDrag: (archivePath: string, internalPath: string, password?: string) => void;
  pauseOperations: () => void;
  resumeOperations: () => void;
  cancelOperations: () => void;
}

declare global {
  interface Window {
    compressorAPI: ICompressorAPI;
  }
}

export {};
