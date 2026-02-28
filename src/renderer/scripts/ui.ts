/**
 * UI Logic - DOM updates, panels, toasts, progress
 * Pure DOM manipulation, no frameworks
 */

import type { HistoryEntry, AppSettings } from '../types';

// Panel switching
export function showPanel(panelId: string): void {
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((n) => {
    n.classList.remove('active');
    n.setAttribute('aria-selected', n.getAttribute('data-panel') === panelId ? 'true' : 'false');
  });
  const panel = document.getElementById(`panel-${panelId}`);
  const navItem = document.querySelector(`.nav-item[data-panel="${panelId}"]`);
  panel?.classList.add('active');
  navItem?.classList.add('active');
}

// File list helpers
export function addFileToList(listId: string, path: string, onRemove?: () => void): void {
  const list = document.getElementById(listId);
  if (!list) return;
  const li = document.createElement('li');
  li.innerHTML = `
    <span class="file-name" title="${path}">${path.split(/[/\\]/).pop() || path}</span>
    <button type="button" class="file-remove" aria-label="Remove">×</button>
  `;
  const nameEl = li.querySelector('.file-name') as HTMLSpanElement;
  if (nameEl) nameEl.textContent = path.split(/[/\\]/).pop() || path;
  nameEl?.setAttribute('title', path);
  const removeBtn = li.querySelector('.file-remove') as HTMLButtonElement;
  removeBtn?.addEventListener('click', () => {
    li.remove();
    onRemove?.();
  });
  list.appendChild(li);
}

export function clearFileList(listId: string): void {
  const list = document.getElementById(listId);
  if (list) list.innerHTML = '';
}

export function getFileListPaths(listId: string): string[] {
  const list = document.getElementById(listId);
  if (!list) return [];
  const items = list.querySelectorAll('li[data-path]');
  return Array.from(items).map((el) => el.getAttribute('data-path') || '');
}

// Store paths on list items - we need to pass path when adding
export function setFileList(listId: string, paths: string[], onRemove?: (path: string) => void): void {
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = '';
  paths.forEach((path) => {
    const li = document.createElement('li');
    li.setAttribute('data-path', path);
    const name = path.split(/[/\\]/).pop() || path;
    li.innerHTML = `
      <span class="file-name" title="${path}">${name}</span>
      <button type="button" class="file-remove" aria-label="Remove">×</button>
    `;
    const removeBtn = li.querySelector('.file-remove') as HTMLButtonElement;
    removeBtn?.addEventListener('click', () => {
      li.remove();
      onRemove?.(path);
    });
    list.appendChild(li);
  });
}

export function getPathsFromList(listId: string): string[] {
  const list = document.getElementById(listId);
  if (!list) return [];
  return Array.from(list.querySelectorAll('li[data-path]')).map(
    (el) => el.getAttribute('data-path') || ''
  );
}

// Single-file list (extract) - stores one path
export function setSingleFile(listId: string, path: string | null): void {
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = '';
  if (path) {
    const li = document.createElement('li');
    li.setAttribute('data-path', path);
    const name = path.split(/[/\\]/).pop() || path;
    li.innerHTML = `
      <span class="file-name" title="${path}">${name}</span>
      <button type="button" class="file-remove" aria-label="Remove">×</button>
    `;
    const removeBtn = li.querySelector('.file-remove') as HTMLButtonElement;
    removeBtn?.addEventListener('click', () => setSingleFile(listId, null));
    list.appendChild(li);
  }
}

export function getSingleFile(listId: string): string | null {
  const list = document.getElementById(listId);
  if (!list) return null;
  const li = list.querySelector('li[data-path]');
  return li?.getAttribute('data-path') ?? null;
}

// Progress
export function showProgress(sectionId: string, percent: number, status: string): void {
  const section = document.getElementById(sectionId);
  const fill = section?.querySelector('.progress-fill') as HTMLElement;
  const statusEl = section?.querySelector('.progress-status') as HTMLElement;
  if (section) section.classList.remove('hidden');
  if (fill) fill.style.width = `${percent}%`;
  if (statusEl) statusEl.textContent = status;
}

export function hideProgress(sectionId: string): void {
  const section = document.getElementById(sectionId);
  if (section) section.classList.add('hidden');
}

// Toast
export function showToast(containerId: string, message: string, type: 'success' | 'error'): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// History list
export function renderHistory(entries: HistoryEntry[]): void {
  const list = document.getElementById('history-list');
  if (!list) return;
  if (entries.length === 0) {
    list.innerHTML = '<li class="history-empty">No history yet</li>';
    return;
  }
  list.innerHTML = entries
    .map(
      (e) => `
    <li>
      <span class="history-entry-type">${e.type}</span>
      <span class="history-entry-sources">${e.sources.map((s: string) => s.split(/[/\\]/).pop()).join(', ')}</span>
      <span class="history-entry-output">→ ${e.output}</span>
    </li>
  `
    )
    .join('');
}

// Settings form
export function applySettingsToForm(settings: AppSettings): void {
  const levelEl = document.getElementById('setting-compression-level') as HTMLInputElement;
  const levelValueEl = document.getElementById('compression-level-value');
  const outputDirEl = document.getElementById('setting-output-dir') as HTMLInputElement;
  const autoOpenEl = document.getElementById('setting-auto-open') as HTMLInputElement;
  const themeEl = document.getElementById('setting-theme') as HTMLSelectElement;
  const animationsEl = document.getElementById('setting-animations') as HTMLInputElement;
  if (levelEl) levelEl.value = String(settings.compressionLevel);
  if (levelValueEl) levelValueEl.textContent = String(settings.compressionLevel);
  if (outputDirEl) outputDirEl.value = settings.outputDirectory || '';
  if (outputDirEl) outputDirEl.placeholder = 'Same as source';
  if (autoOpenEl) autoOpenEl.checked = settings.autoOpenResultFolder;
  if (themeEl) themeEl.value = settings.theme;
  if (animationsEl) animationsEl.checked = settings.animationsEnabled;
}

// Theme
export function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}
