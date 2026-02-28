/**
 * UI Logic - DOM updates, panels, toasts, progress
 * Pure DOM manipulation, no frameworks
 */

import type { HistoryEntry, AppSettings, FileEntry } from '../types';

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
export function showGlobalProgress(percent: number, status: string, title?: string): void {
  const modal = document.getElementById('global-progress-modal');
  const fill = document.getElementById('global-progress-fill');
  const statusEl = document.getElementById('global-progress-status');
  const titleEl = document.getElementById('progress-modal-title');
  if (title && titleEl) titleEl.textContent = title;
  if (modal) modal.classList.remove('hidden');
  if (fill) fill.style.width = `${percent}%`;
  if (statusEl) statusEl.textContent = status;
}

export function hideGlobalProgress(): void {
  const modal = document.getElementById('global-progress-modal');
  if (modal) modal.classList.add('hidden');
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
  

  const deleteSourcesEl = document.getElementById('setting-delete-sources') as HTMLInputElement;
  const overwriteBehaviorEl = document.getElementById('setting-overwrite-behavior') as HTMLSelectElement;

  if (levelEl) levelEl.value = String(settings.compressionLevel);
  if (levelValueEl) levelValueEl.textContent = String(settings.compressionLevel);
  if (outputDirEl) outputDirEl.value = settings.outputDirectory || '';
  if (outputDirEl) outputDirEl.placeholder = 'Same as source';
  if (autoOpenEl) autoOpenEl.checked = settings.autoOpenResultFolder ?? true;
  if (themeEl) themeEl.value = settings.theme || 'system';
  if (animationsEl) animationsEl.checked = settings.animationsEnabled ?? true;
  

  if (deleteSourcesEl) deleteSourcesEl.checked = settings.deleteSourcesAfterProcess ?? false;
  if (overwriteBehaviorEl) overwriteBehaviorEl.value = settings.overwriteBehavior || 'prompt';
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

// File Browser
export function renderBreadcrumbs(containerId: string, pathPieces: { name: string; fullPath: string }[], onNav: (path: string) => void): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  pathPieces.forEach((piece, index) => {
    const span = document.createElement('span');
    span.className = 'breadcrumb-item';
    span.textContent = piece.name || (index === 0 ? 'Home' : piece.name);
    span.onclick = () => onNav(piece.fullPath);
    container.appendChild(span);
    
    if (index < pathPieces.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'breadcrumb-sep';
      sep.textContent = ' / ';
      container.appendChild(sep);
    }
  });
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(ms: number): string {
  if (!ms) return '--';
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

const folderIcon = `<svg class="file-icon" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`;
const fileIcon = `<svg class="file-icon" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`;

export function renderBrowseList(containerId: string, entries: FileEntry[], onSelect: (entry: FileEntry, multi: boolean) => void, onOpen: (entry: FileEntry) => void, isSelected: (path: string) => boolean): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (entries.length === 0) {
    container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--color-text-muted);">Empty folder</div>';
    return;
  }

  entries.forEach((entry) => {
    const el = document.createElement('div');
    el.className = `file-item ${entry.isDirectory ? 'folder' : 'file'}`;
    if (isSelected(entry.path)) el.classList.add('selected');

    el.innerHTML = `
      <div class="col-name" title="${entry.name}">
        ${entry.isDirectory ? folderIcon : fileIcon}
        <span>${entry.name}</span>
      </div>
      <div class="col-date">${formatDate(entry.modifiedAt)}</div>
      <div class="col-size">${entry.isDirectory ? '--' : formatSize(entry.size)}</div>
    `;

    el.addEventListener('click', (e) => onSelect(entry, e.metaKey || e.ctrlKey));
    el.addEventListener('dblclick', () => onOpen(entry));
    
    container.appendChild(el);
  });
}
