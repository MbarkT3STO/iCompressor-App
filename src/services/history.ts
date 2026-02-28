/**
 * History Service
 * Persists compression/extraction history
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface HistoryEntry {
  type: 'compress' | 'extract';
  sources: string[];
  output: string;
  format: string;
  timestamp: number;
}

const MAX_ENTRIES = 100;

function getHistoryPath(): string {
  const userData = app.getPath('userData');
  return path.join(userData, 'history.json');
}

export class HistoryService {
  private entries: HistoryEntry[] = [];
  private loaded = false;

  private load(): void {
    if (this.loaded) return;
    try {
      const p = getHistoryPath();
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        this.entries = JSON.parse(raw);
        if (!Array.isArray(this.entries)) this.entries = [];
      }
      this.loaded = true;
    } catch {
      this.loaded = true;
    }
  }

  private save(): void {
    try {
      const p = getHistoryPath();
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(this.entries, null, 2));
    } catch (err) {
      console.error('Failed to save history:', err);
    }
  }

  get(): HistoryEntry[] {
    this.load();
    return [...this.entries];
  }

  add(entry: HistoryEntry): void {
    this.load();
    this.entries.unshift(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(0, MAX_ENTRIES);
    }
    this.save();
  }

  clear(): void {
    this.entries = [];
    this.save();
  }
}
