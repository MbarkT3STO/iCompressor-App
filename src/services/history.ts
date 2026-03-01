import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { HistoryEntry } from '../renderer/types';

export class HistoryService {
  private historyFilePath: string;
  private maxEntries = 100;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.historyFilePath = path.join(userDataPath, 'icompressor_history.json');
    this.ensureFileExists();
  }

  private ensureFileExists(): void {
    if (!fs.existsSync(this.historyFilePath)) {
      this.saveHistory([]);
    }
  }

  public getHistory(): HistoryEntry[] {
    try {
      const data = fs.readFileSync(this.historyFilePath, 'utf-8');
      return JSON.parse(data) as HistoryEntry[];
    } catch {
      return [];
    }
  }

  private saveHistory(history: HistoryEntry[]): void {
    try {
      fs.writeFileSync(this.historyFilePath, JSON.stringify(history, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save history', e);
    }
  }

  public addEntry(entry: HistoryEntry): void {
    const history = this.getHistory();
    history.unshift(entry);
    
    // Keep only the last `maxEntries` items
    if (history.length > this.maxEntries) {
      history.length = this.maxEntries;
    }
    
    this.saveHistory(history);
  }

  public clearHistory(): void {
    this.saveHistory([]);
  }
}
