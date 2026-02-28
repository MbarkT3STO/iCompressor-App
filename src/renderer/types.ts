/**
 * Shared types for renderer
 */

export interface HistoryEntry {
  type: 'compress' | 'extract';
  sources: string[];
  output: string;
  format: string;
  timestamp: number;
}

export interface AppSettings {
  compressionLevel: number;
  outputDirectory: string;
  autoOpenResultFolder: boolean;
  theme: 'light' | 'dark' | 'system';
  animationsEnabled: boolean;
  defaultFormat: string;
  deleteSourcesAfterProcess: boolean;
  overwriteBehavior: 'overwrite' | 'skip' | 'prompt';
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}
