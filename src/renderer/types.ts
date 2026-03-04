/**
 * Shared types for renderer
 */



export interface AppSettings {
  compressionLevel: number;
  outputDirectory: string;
  autoOpenResultFolder: boolean;
  theme: 'light' | 'dark' | 'system';
  themeFlavor?: 'midnight' | 'strawberry' | 'matcha' | 'ocean' | 'moonlight' | 'twilight' | 'sunset';
  animationsEnabled: boolean;
  minimizeToTray: boolean;

  deleteSourcesAfterProcess: boolean;
  overwriteBehavior: 'overwrite' | 'skip' | 'prompt';
  browseViewMode: 'explorer' | 'tree' | 'tiles';
  layout: 'header' | 'sidebar';
  sidebarCollapsed: boolean;
  showHistoryTab: boolean;
  showBrowseRecents: boolean;
  autoResizeWindow: boolean;
  lastUsedFormat: string;
  soundEnabled: boolean;
  threadCount: number;
  ramLimit: number;
  dynamicTheme: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  action: 'compress' | 'extract';
  source: string;
  output: string;
  status: 'success' | 'error';
  errorMessage?: string;
  sizeReduction?: string; // Optional field to store "500MB -> 120MB" info if calculated
}
