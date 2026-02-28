/**
 * Settings Service
 * Manages user preferences with file-based persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

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

const DEFAULT_SETTINGS: AppSettings = {
  compressionLevel: 6,
  outputDirectory: '',
  autoOpenResultFolder: true,
  theme: 'system',
  animationsEnabled: true,
  defaultFormat: 'zip',
  deleteSourcesAfterProcess: false,
  overwriteBehavior: 'prompt',
};

function getSettingsPath(): string {
  const userData = app.getPath('userData');
  return path.join(userData, 'settings.json');
}

export class SettingsService {
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private loaded = false;

  private load(): void {
    if (this.loaded) return;
    try {
      const p = getSettingsPath();
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        this.settings = { ...DEFAULT_SETTINGS, ...parsed };
      }
      this.loaded = true;
    } catch {
      this.loaded = true;
    }
  }

  private save(): void {
    try {
      const p = getSettingsPath();
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(this.settings, null, 2));
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }

  get(): AppSettings {
    this.load();
    return { ...this.settings };
  }

  saveSettings(partial: Partial<AppSettings>): void {
    this.load();
    this.settings = { ...this.settings, ...partial };
    this.save();
  }
}
