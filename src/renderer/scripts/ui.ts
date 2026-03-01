/**
 * UI Logic - DOM updates, panels, toasts, progress
 * Pure DOM manipulation, no frameworks
 */

import type { AppSettings, FileEntry } from '../types';

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
  if (navItem) {
    navItem.classList.add('active');
  }
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
export function showToast(containerId: string, message: string, type: 'success' | 'error' | 'info', duration: number = 4000): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, duration);
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

  const browseViewEl = document.getElementById('setting-browse-view') as HTMLSelectElement;
  if (browseViewEl) browseViewEl.value = settings.browseViewMode || 'explorer';

  // Flavor
  const flavor = settings.themeFlavor || 'midnight';
  document.querySelectorAll('.flavor-swatch').forEach(sw => {
    sw.classList.toggle('active', sw.getAttribute('data-flavor') === flavor);
  });
  applyTheme(settings.theme || 'system');
  applyFlavor(flavor);
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

export function applyFlavor(flavor: string): void {
  const root = document.documentElement;
  if (flavor === 'midnight') {
    root.removeAttribute('data-flavor');
  } else {
    root.setAttribute('data-flavor', flavor);
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

export function formatSize(bytes: number): string {
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

const folderIcon = `<svg class="file-icon" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`;
const fileIcon = `<svg class="file-icon" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`;

export const compressIcon = `<svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-2 10h-2v2h-2v-2h-2v-2h2v-2h2v2h2v2z"/></svg>`;
export const extractIcon = `<svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`;
export const addIcon = `<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`;
export const infoIcon = `<svg viewBox="0 0 24 24"><path d="M11 17h2v-6h-2v6zm1-15C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM11 9h2V7h-2v2z"/></svg>`;

export function renderBrowseList(
  containerId: string, 
  entries: FileEntry[], 
  onSelect: (entry: FileEntry, multi: boolean) => void, 
  onOpen: (entry: FileEntry) => void, 
  isSelected: (path: string) => boolean,
  onContextMenu: (entry: FileEntry, x: number, y: number) => void
): void {
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
    el.setAttribute('data-path', entry.path);
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
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      onContextMenu(entry, e.clientX, e.clientY);
    });
    
    container.appendChild(el);
  });
}

const chevronIcon = `<svg class="tree-toggle-icon" viewBox="0 0 24 24" width="18" height="18"><path d="M7 10l5 5 5-5z"/></svg>`;

export function renderBrowseTree(
  containerId: string, 
  entries: FileEntry[], 
  onSelect: (entry: FileEntry, multi: boolean) => void, 
  onOpen: (entry: FileEntry) => void, 
  onExpand: (entry: FileEntry, childrenContainer: HTMLElement) => Promise<void>,
  isSelected: (path: string) => boolean,
  onContextMenu: (entry: FileEntry, x: number, y: number) => void
): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const tree = document.createElement('div');
  tree.className = 'browse-tree';

  if (entries.length === 0) {
    container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--color-text-muted);">Empty folder</div>';
    return;
  }

  entries.forEach(entry => {
    const node = createTreeNode(entry, onSelect, onOpen, onExpand, isSelected, onContextMenu);
    tree.appendChild(node);
  });

  container.appendChild(tree);
}

function createTreeNode(
  entry: FileEntry,
  onSelect: (entry: FileEntry, multi: boolean) => void,
  onOpen: (entry: FileEntry) => void,
  onExpand: (entry: FileEntry, childrenContainer: HTMLElement) => Promise<void>,
  isSelected: (path: string) => boolean,
  onContextMenu: (entry: FileEntry, x: number, y: number) => void
): HTMLElement {
  const node = document.createElement('div');
  node.className = 'tree-node';
  if (isSelected(entry.path)) node.classList.add('selected');

  const row = document.createElement('div');
  row.className = 'tree-row';
  row.setAttribute('data-path', entry.path);
  if (isSelected(entry.path)) row.classList.add('selected');

  const toggle = document.createElement('div');
  toggle.className = 'tree-toggle';
  if (entry.isDirectory) {
    toggle.innerHTML = chevronIcon;
    toggle.onclick = async (e) => {
      e.stopPropagation();
      const isExpanded = node.classList.toggle('expanded');
      if (isExpanded && children.children.length === 0) {
        await onExpand(entry, children);
      }
    };
  }

  const icon = document.createElement('div');
  icon.className = 'tree-icon';
  icon.innerHTML = entry.isDirectory ? folderIcon : fileIcon;

  const name = document.createElement('div');
  name.className = 'tree-name';
  name.textContent = entry.name;

  row.appendChild(toggle);
  row.appendChild(icon);
  row.appendChild(name);

  row.onclick = (e) => onSelect(entry, e.metaKey || e.ctrlKey);
  row.ondblclick = () => onOpen(entry);
  row.oncontextmenu = (e) => {
    e.preventDefault();
    onContextMenu(entry, e.clientX, e.clientY);
  };

  const children = document.createElement('div');
  children.className = 'tree-children';

  node.appendChild(row);
  node.appendChild(children);

  return node;
}

export function renderTreeChildren(
  container: HTMLElement,
  entries: FileEntry[],
  onSelect: (entry: FileEntry, multi: boolean) => void,
  onOpen: (entry: FileEntry) => void,
  onExpand: (entry: FileEntry, childrenContainer: HTMLElement) => Promise<void>,
  isSelected: (path: string) => boolean,
  onContextMenu: (entry: FileEntry, x: number, y: number) => void
): void {
  container.innerHTML = '';
  entries.forEach(entry => {
    const node = createTreeNode(entry, onSelect, onOpen, onExpand, isSelected, onContextMenu);
    container.appendChild(node);
  });
}

export function updateBrowseSelection(containerId: string, selectedPaths: Set<string>): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  const items = container.querySelectorAll('[data-path]');
  items.forEach(item => {
    const path = item.getAttribute('data-path');
    if (path && selectedPaths.has(path)) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

// Archive Viewer Modal
export function showArchiveViewerModal(): void {
  const modal = document.getElementById('archive-viewer-modal');
  if (modal) modal.classList.remove('hidden');
}

export function hideArchiveViewerModal(): void {
  const modal = document.getElementById('archive-viewer-modal');
  if (modal) modal.classList.add('hidden');
}

export function setArchiveViewerState(state: 'loading' | 'error' | 'empty' | 'data', errorMessage?: string): void {
  const loading = document.getElementById('archive-viewer-loading');
  const error = document.getElementById('archive-viewer-error');
  const errorMsg = document.getElementById('archive-viewer-error-msg');
  const empty = document.getElementById('archive-viewer-empty');
  const table = document.getElementById('archive-viewer-table-container');

  [loading, error, empty, table].forEach(el => el?.classList.add('hidden'));

  switch (state) {
    case 'loading': loading?.classList.remove('hidden'); break;
    case 'error': 
      if (errorMsg && errorMessage) errorMsg.textContent = errorMessage;
      error?.classList.remove('hidden'); 
      break;
    case 'empty': empty?.classList.remove('hidden'); break;
    case 'data': table?.classList.remove('hidden'); break;
  }
}

export function renderArchiveViewerPath(archiveName: string, pathParts: string[], onNav: (index: number) => void): void {
  const container = document.getElementById('archive-viewer-breadcrumbs');
  const title = document.getElementById('archive-viewer-title');
  if (title) title.textContent = archiveName;
  
  if (!container) return;
  container.innerHTML = '';
  
  const root = document.createElement('span');
  root.className = 'breadcrumb-item';
  root.textContent = 'Root';
  root.onclick = () => onNav(-1);
  container.appendChild(root);

  pathParts.forEach((part, idx) => {
    const sep = document.createElement('span');
    sep.className = 'breadcrumb-sep';
    sep.textContent = ' / ';
    container.appendChild(sep);

    const span = document.createElement('span');
    span.className = 'breadcrumb-item';
    span.textContent = part;
    span.onclick = () => onNav(idx);
    container.appendChild(span);
  });
}

export function renderArchiveViewerTable(
  files: any[], 
  onFolderClick: (folderName: string) => void,
  onDragStart?: (file: any) => void
): void {
  const tbody = document.getElementById('archive-viewer-tbody');
  const stats = document.getElementById('archive-viewer-stats');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (stats) stats.textContent = `${files.length} items`;

  files.forEach(file => {
    const tr = document.createElement('tr');
    tr.className = 'viewer-row-item';
    
    // Size formatting
    const sizeStr = file.isDirectory ? '--' : formatSize(file.size || 0);
    const packedStr = file.isDirectory ? '--' : formatSize(file.packedSize || 0);
    // Parse the 7z output "yyyy-MM-dd HH:mm:ss" if present
    const dateStr = file.modified ? file.modified.substring(0, 16) : '--';
    
    tr.innerHTML = `
      <td class="col-name" title="${file.name}">
        ${file.isDirectory ? folderIcon.replace('file-icon', 'viewer-icon folder-icon') : fileIcon.replace('file-icon', 'viewer-icon file-icon')}
        <span>${file.name}</span>
      </td>
      <td class="col-size">${sizeStr}</td>
      <td class="col-packed">${packedStr}</td>
      <td class="col-date">${dateStr}</td>
    `;

    if (file.isDirectory) {
      tr.addEventListener('dblclick', () => onFolderClick(file.name));
    } else if (onDragStart) {
      tr.draggable = true;
      tr.addEventListener('dragstart', (e) => {
        e.preventDefault();
        onDragStart(file);
      });
    }

    tbody.appendChild(tr);
  });
}

// Micro-sounds generator
let audioCtx: AudioContext | null = null;
export function playSound(type: 'click' | 'success' | 'error' | 'switch'): void {
  try {
    if (typeof window === 'undefined') return;
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    switch (type) {
      case 'click':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case 'switch':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.02, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
        break;
      case 'success':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2); // G5
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      case 'error':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.2);
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
    }
  } catch (e) {
    console.warn('Audio play failed', e);
  }
}

// Context Menu
export interface ContextMenuItem {
  label: string;
  icon?: string;
  action: () => void;
  danger?: boolean;
  divider?: boolean;
  shortcut?: string;
}

let activeContextMenu: HTMLElement | null = null;

export function showContextMenu(x: number, y: number, items: ContextMenuItem[]): void {
  hideContextMenu();

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  
  // Initial positioning to measure size
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.visibility = 'hidden';
  document.body.appendChild(menu);

  items.forEach(item => {
    if (item.divider) {
      const div = document.createElement('div');
      div.className = 'context-menu-divider';
      menu.appendChild(div);
      return;
    }

    const el = document.createElement('div');
    el.className = `context-menu-item ${item.danger ? 'danger' : ''}`;
    
    el.innerHTML = `
      ${item.icon || ''}
      <span>${item.label}</span>
      ${item.shortcut ? `<span class="shortcut">${item.shortcut}</span>` : ''}
    `;

    el.onclick = () => {
      item.action();
      hideContextMenu();
    };

    menu.appendChild(el);
  });

  // Adjust position if it goes off screen
  const rect = menu.getBoundingClientRect();
  const pad = 10;
  
  let finalX = x;
  let finalY = y;

  if (x + rect.width > window.innerWidth - pad) {
    finalX = window.innerWidth - rect.width - pad;
  }
  if (y + rect.height > window.innerHeight - pad) {
    finalY = window.innerHeight - rect.height - pad;
  }

  menu.style.left = `${Math.max(pad, finalX)}px`;
  menu.style.top = `${Math.max(pad, finalY)}px`;
  menu.style.visibility = 'visible';

  activeContextMenu = menu;

  // Close on click outside
  const closeHandler = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      hideContextMenu();
      document.removeEventListener('mousedown', closeHandler);
    }
  };
  
  // slightly defer to avoid closing on the initial click
  setTimeout(() => {
    document.addEventListener('mousedown', closeHandler);
  }, 10);
}

// Folder Size Modal

export function showFolderSizeModal(folderName: string, sizeStr: string): void {
  const modal = document.getElementById('folder-size-modal');
  const nameEl = document.getElementById('folder-size-name');
  const valueEl = document.getElementById('folder-size-value');
  
  if (nameEl) nameEl.textContent = folderName;
  if (valueEl) valueEl.textContent = sizeStr;
  
  if (modal) {
    modal.classList.remove('hidden');
    // Ensure OK button binds click
    const okBtn = document.getElementById('btn-close-folder-size');
    const backdrop = document.getElementById('folder-size-modal-backdrop');
    
    const closeHandler = () => {
      hideFolderSizeModal();
      okBtn?.removeEventListener('click', closeHandler);
      backdrop?.removeEventListener('click', closeHandler);
    };
    
    okBtn?.addEventListener('click', closeHandler);
    backdrop?.addEventListener('click', closeHandler);
  }
}

export function hideFolderSizeModal(): void {
  const modal = document.getElementById('folder-size-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

export function hideContextMenu(): void {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
}
