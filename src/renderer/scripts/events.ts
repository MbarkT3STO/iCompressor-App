/**
 * Event Handlers - Wire up UI to IPC and UI logic
 * Drag & drop, file picker, buttons, progress
 */

import { ipc } from './ipc';
import {
  showPanel,
  setFileList,
  getPathsFromList,
  setSingleFile,
  getSingleFile,
  showGlobalProgress,
  hideGlobalProgress,
  showToast,
  renderExtractRecents,

  applyTheme,
  applyFlavor,
  applyLayout,
  applyAnimations,
  playSound,
  renderBreadcrumbs,
  renderBrowseList,
  renderBrowseTree,
  renderTreeChildren,
  updateBrowseSelection,
  showContextMenu,
  hideContextMenu,
  compressIcon,
  extractIcon,
  addIcon,
  infoIcon,
  showArchiveViewerModal,
  hideArchiveViewerModal,
  setArchiveViewerState,
  renderArchiveViewerPath,
  renderArchiveViewerTable,
  applySettingsToForm,
  formatSize,
  showFolderSizeModal,
  hideFolderSizeModal,
  showActionModal,
  renderHistory,
  showFilePreview,
  setBrowseLoading,
  updateCompressDest
} from './ui';
import type { AppSettings, FileEntry, HistoryEntry } from '../types';

// Path utilities (renderer-safe - we receive paths as strings from main)
function basename(p: string): string {
  return p.split(/[/\\]/).pop() || p;
}

function dirname(p: string): string {
  const parts = p.split(/[/\\]/);
  parts.pop();
  const sep = p.includes('\\') ? '\\' : '/';
  return parts.join(sep) || (p.startsWith('/') ? '/' : '.');
}

function joinPaths(parent: string, child: string): string {
  const sep = parent.includes('\\') ? '\\' : '/';
  return `${parent.replace(/[/\\]$/, '')}${sep}${child}`;
}

export let globalOpenArchiveHandler: ((path: string) => Promise<void>) | null = null;

// Drag & drop
function setupDropZone(
  zoneId: string,
  type: 'compress' | 'extract',
  onDrop: (paths: string[]) => void
): void {
  const zone = document.getElementById(zoneId);
  if (!zone) return;

  zone.addEventListener('click', (e) => {
    // Only trigger if we didn't click on a button or an interactive element
    if ((e.target as HTMLElement).closest('button') || 
        (e.target as HTMLElement).closest('.recent-card-mini') ||
        (e.target as HTMLElement).closest('.extract-recents-mini')) return;
    
    if (type === 'compress') {
      ipc.selectFiles().then((paths) => {
        if (paths.length > 0) {
          const existing = getPathsFromList('compress-files-list');
          const merged = [...new Set([...existing, ...paths])];
          setFileList('compress-files-list', merged);
        }
      });
    } else {
      ipc.selectArchive().then((archive) => {
        if (archive) setSingleFile('extract-files-list', archive);
      });
    }
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.add('drag-over');
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove('drag-over');
    const items = e.dataTransfer?.items;
    if (!items) return;
    const paths: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) paths.push((file as unknown as { path?: string }).path ?? file.name);
      }
    }
    if (paths.length > 0) onDrop(paths);
  });
}

// Navigation
let settingsLoaded = false;
function setupNavigation(): void {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panelId = btn.getAttribute('data-panel');
      if (panelId) {
        playSound('switch');
        showPanel(panelId);

        // Load settings only on the first visit — subsequent visits keep the
        // current form state since every control saves to disk immediately on change.
        if (panelId === 'settings' && !settingsLoaded) {
          loadSettings();
          settingsLoaded = true;
        }
        if (panelId === 'browse') initBrowse();
        if (panelId === 'history') initHistory();
      }
    });
  });
}

// Browse
let currentBrowsePath = '';
let selectedBrowsePaths = new Set<string>();

let browseClipboard: {
  action: 'cut' | 'copy';
  entries: FileEntry[];
} | null = null;
let browseEntries: FileEntry[] = [];
let browseSearchQuery = '';
let browseSortMode = 'name-asc';
let browseShowHidden = false;

// Navigation History stacks
let browseHistoryBack: string[] = [];
let browseHistoryForward: string[] = [];

// Recents
let recentArchives: string[] = JSON.parse(localStorage.getItem('recent_archives') || '[]');

// Keyboard navigation for browse tab
document.addEventListener('keydown', (e) => {
  if (document.getElementById('panel-browse')?.classList.contains('active')) {
    if (e.key === 'Enter' && selectedBrowsePaths.size > 0) {
      e.preventDefault();
      const selectedPath = Array.from(selectedBrowsePaths)[0];
      if (selectedPath) {
        const entry = browseEntries.find(e => e.path === selectedPath);
        if (entry) {
          handleBrowseOpen(entry);
        }
      }
    }
  }
});

async function initBrowse() {
  if (!currentBrowsePath) {
    currentBrowsePath = await ipc.getHomeDir();
  }
  await loadDirectory(currentBrowsePath);
}

// History
async function initHistory() {
  const entries = await ipc.getHistory();
  renderHistory(entries, async (path) => {
    // Show in Folder logic
    ipc.openPath(path);
  }, async () => {
    // Optional clear callback if needed inside ui.ts
  });
}

document.getElementById('btn-clear-history')?.addEventListener('click', async () => {
  await ipc.clearHistory();
  await initHistory();
  showToast('toast-browse', 'History cleared', 'success');
});

async function loadDirectory(dirPath: string, addToHistory: boolean = true) {
  if (addToHistory && currentBrowsePath && currentBrowsePath !== dirPath) {
    browseHistoryBack.push(currentBrowsePath);
    browseHistoryForward = []; // Clear forward stack on new navigation
  }

  setBrowseLoading(true);
  const result = await ipc.readDir(dirPath, browseShowHidden);
  setBrowseLoading(false);
  if (!result.success || !result.entries) {
    showToast('toast-compress', result.error || 'Failed to read directory', 'error'); // fallback toast
    return;
  }
  
  currentBrowsePath = dirPath;
  browseEntries = result.entries;
  selectedBrowsePaths.clear();
  
  // Clear search on directory change
  browseSearchQuery = '';
  const searchInput = document.getElementById('browse-search-input') as HTMLInputElement;
  if (searchInput) searchInput.value = '';
  
  updateBrowseUI();
}

function saveRecent(path: string) {
  if (!path) return;
  recentArchives = [path, ...recentArchives.filter(p => p !== path)].slice(0, 10);
  localStorage.setItem('recent_archives', JSON.stringify(recentArchives));
  renderRecents();
  renderExtractRecents(recentArchives, async (p) => {
    showPanel('extract');
    if (globalOpenArchiveHandler) globalOpenArchiveHandler(p);
  });
}

function renderRecents() {
  const container = document.getElementById('browse-recents');
  const list = document.getElementById('recents-list');
  if (!container || !list) return;

  if (recentArchives.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  list.innerHTML = '';

  recentArchives.forEach(path => {
    const name = path.split(/[/\\]/).pop() || path;
    const item = document.createElement('div');
    item.className = 'recent-item';
    item.title = path;
    item.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
      <span class="recent-name">${name}</span>
    `;
    item.onclick = async () => {
      console.log('Recent item clicked:', path);
      // Always try to open as archive preview, just like in extract tab
      if (globalOpenArchiveHandler) {
        globalOpenArchiveHandler(path);
      }
    };
    list.appendChild(item);
  });
}

function updateBrowseUI() {
  // Update breadcrumbs
  const parts = currentBrowsePath.split(/[/\\]/).filter(Boolean);
  const isWin = currentBrowsePath.includes('\\') || /^[a-zA-Z]:/.test(currentBrowsePath);
  const sep = isWin ? '\\' : '/';
  
  const pieces = [];
  let currentAccum = isWin && currentBrowsePath.startsWith('\\\\') ? '\\\\' : (isWin ? '' : '/');
  
  if (parts.length === 0 && !isWin) {
    pieces.push({ name: '/', fullPath: '/' });
  } else {
    parts.forEach((part, i) => {
      currentAccum += part;
      pieces.push({ name: part, fullPath: currentAccum });
      currentAccum += sep;
    });
  }

  renderBreadcrumbs('browse-breadcrumbs', pieces, (path: string) => loadDirectory(path));
  
  // Render based on selected view mode
  let filteredEntries = browseSearchQuery 
    ? browseEntries.filter(e => e.name.toLowerCase().includes(browseSearchQuery.toLowerCase()))
    : [...browseEntries];

  filteredEntries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    switch (browseSortMode) {
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      case 'size-desc':
        return (b.size || 0) - (a.size || 0);
      case 'size-asc':
        return (a.size || 0) - (b.size || 0);
      case 'date-desc':
        return (b.modifiedAt || 0) - (a.modifiedAt || 0);
      case 'date-asc':
        return (a.modifiedAt || 0) - (b.modifiedAt || 0);
      default:
        return a.name.localeCompare(b.name);
    }
  });

  ipc.getSettings().then(settings => {
    if (settings.browseViewMode === 'tree') {
      renderBrowseTree(
        'browse-list',
        filteredEntries,
        handleBrowseSelect,
        handleBrowseOpen,
        handleBrowseExpand,
        (path: string) => selectedBrowsePaths.has(path),
        handleBrowseContextMenu
      );
    } else {
      renderBrowseList(
        'browse-list', 
        filteredEntries, 
        handleBrowseSelect, 
        handleBrowseOpen,
        (path: string) => selectedBrowsePaths.has(path),
        handleBrowseContextMenu
      );
    }
  });

  updateBrowseButtons();

  // Attach background context menu for pasting
  const listContainer = document.getElementById('browse-list');
  if (listContainer) {
    listContainer.addEventListener('contextmenu', (e) => {
      // Don't override if we clicked on an actual item
      if ((e.target as HTMLElement).closest('.file-item, .tree-item')) return;
      
      e.preventDefault();
      
      if (browseClipboard && browseClipboard.entries.length > 0) {
        showContextMenu(e.clientX, e.clientY, [
          {
            label: 'Paste Here',
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"/></svg>`,
            action: () => handleBrowsePaste(currentBrowsePath)
          }
        ]);
      } else {
        hideContextMenu();
      }
    });
  }
}

async function handleBrowseExpand(entry: FileEntry, container: HTMLElement) {
  const result = await ipc.readDir(entry.path);
  if (result.success && result.entries) {
    renderTreeChildren(
      container,
      result.entries,
      handleBrowseSelect,
      handleBrowseOpen,
      handleBrowseExpand,
      (path: string) => selectedBrowsePaths.has(path),
      handleBrowseContextMenu
    );
  }
}

function handleBrowseContextMenu(entry: FileEntry, x: number, y: number) {
  const isArchive = /\.(zip|7z|rar|tar|gz|tgz)$/i.test(entry.path);
  const items = [
    {
      label: 'Compress Now',
      icon: compressIcon,
      action: () => {
        setFileList('compress-files-list', [entry.path]);
        showPanel('compress');
      }
    },
    {
      label: 'Add to Compress List',
      icon: addIcon,
      action: () => {
        const existing = getPathsFromList('compress-files-list');
        if (!existing.includes(entry.path)) {
          setFileList('compress-files-list', [...existing, entry.path]);
          showToast('toast-compress', `Added ${entry.name} to list`, 'success');
        }
      }
    },
    {
      label: 'Rename',
      icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
      action: () => handleBrowseRename(entry)
    },
    {
      label: 'Delete',
      icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
      action: () => handleBrowseDelete(entry)
    }
  ];

  if (isArchive) {
    items.unshift({
      label: 'Extract Now',
      icon: extractIcon,
      action: () => {
        setSingleFile('extract-files-list', entry.path);
        if (globalOpenArchiveHandler) globalOpenArchiveHandler(entry.path);
        showPanel('extract');
      }
    });
  }

  if (entry.isDirectory) {
    items.push({
      label: 'Calculate Size',
      icon: infoIcon,
      action: async () => {
        showToast('toast-browse', `Calculating...`, 'info');
        const res = await ipc.getFolderSize(entry.path);
        if (res.success && res.size !== undefined) {
          showFolderSizeModal(entry.name, res.size);
        } else {
          showToast('toast-browse', `Failed to calculate size`, 'error');
        }
      }
    });

    items.push({
      label: 'New Folder',
      icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-1 11h-2v2h-2v-2h-2v-2h2v-2h2v2h2v2z"/></svg>`,
      action: () => handleBrowseNewFolder(entry.path)
    });
  }

  // Show in Explorer / Reveal in Finder
  items.push({
    label: 'Show in Explorer',
    icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`,
    action: () => {
      ipc.showItemInFolder(entry.path); // Use showItemInFolder to select the item
    }
  });

  items.push({
    divider: true
  } as any);

  items.push({
    label: 'Cut',
    icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3z"/></svg>`,
    action: () => {
      browseClipboard = { action: 'cut', entries: [entry] };
      showToast('toast-browse', 'Item cut to clipboard', 'info');
    }
  });

  items.push({
    label: 'Copy',
    icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`,
    action: () => {
      browseClipboard = { action: 'copy', entries: [entry] };
      showToast('toast-browse', 'Item copied to clipboard', 'success');
    }
  });

  if (entry.isDirectory && browseClipboard && browseClipboard.entries.length > 0) {
    items.push({
      label: 'Paste Here',
      icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"/></svg>`,
      action: () => handleBrowsePaste(entry.path)
    });
  }

  showContextMenu(x, y, items);
}

async function handleBrowsePaste(targetDir: string) {
  if (!browseClipboard || browseClipboard.entries.length === 0) return;

  const entries = browseClipboard.entries;
  let successCount = 0;
  let failCount = 0;

  showGlobalProgress(0, browseClipboard.action === 'copy' ? 'Copying...' : 'Moving...', 'Please wait');

  for (const entry of entries) {
    const fileName = entry.name;
    const destPath = joinPaths(targetDir, fileName);

    // Skip if pasting into the exact same directory without renaming (handled implicitly by cpSync but better avoided)
    if (entry.path === destPath) {
      failCount++;
      continue;
    }

    let result;
    if (browseClipboard.action === 'copy') {
      result = await ipc.copyFile(entry.path, destPath);
    } else {
      result = await ipc.renameFile(entry.path, destPath);
    }

    if (result.success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  hideGlobalProgress();

  if (browseClipboard.action === 'cut' && successCount > 0) {
    browseClipboard = null;
  }

  if (failCount > 0) {
    showToast('toast-browse', `${successCount} items processed, ${failCount} failed.`, 'error');
  } else {
    showToast('toast-browse', `Successfully ${browseClipboard?.action === 'copy' ? 'copied' : 'moved'} items.`, 'success');
  }

  loadDirectory(currentBrowsePath, false);
}

async function handleBrowseRename(entry: FileEntry) {
  const result = await showActionModal({
    title: 'Rename',
    message: `Enter a new name for "${entry.name}":`,
    mode: 'prompt',
    defaultValue: entry.name,
    confirmText: 'Rename',
    placeholder: 'New name...'
  });

  if (typeof result !== 'string' || !result || result === entry.name) return;

  const parentDir = dirname(entry.path);
  const newPath = joinPaths(parentDir, result);

  const res = await ipc.renameFile(entry.path, newPath);
  if (res.success) {
    showToast('toast-browse', `Renamed ${entry.name} to ${result}`, 'success');
    await loadDirectory(parentDir);
  } else {
    showToast('toast-browse', res.error || 'Failed to rename', 'error');
  }
}

async function handleBrowseDelete(entry: FileEntry) {
  const confirm = await showActionModal({
    title: 'Delete',
    message: `Are you sure you want to delete ${entry.name}? This action cannot be undone.`,
    mode: 'confirm',
    confirmText: 'Delete',
    cancelText: 'Keep'
  });

  if (!confirm) return;

  const res = await ipc.deleteFile(entry.path);
  if (res.success) {
    showToast('toast-browse', `Deleted ${entry.name}`, 'success');
    await loadDirectory(dirname(entry.path));
  } else {
    showToast('toast-browse', res.error || 'Failed to delete', 'error');
  }
}

// Hidden files toggle
document.getElementById('btn-browse-hidden')?.addEventListener('click', () => {
  browseShowHidden = !browseShowHidden;
  const btn = document.getElementById('btn-browse-hidden');
  if (btn) {
    btn.classList.toggle('active', browseShowHidden);
  }
  loadDirectory(currentBrowsePath);
});

async function handleBrowseNewFolder(parentDir: string) {
  const result = await showActionModal({
    title: 'New Folder',
    message: 'Enter a name for the new folder:',
    mode: 'prompt',
    defaultValue: 'New Folder',
    confirmText: 'Create',
    placeholder: 'Folder name...'
  });

  if (typeof result !== 'string' || !result) return;

  const newPath = joinPaths(parentDir, result);
  const res = await ipc.createFolder(newPath);
  
  if (res.success) {
    showToast('toast-browse', `Created folder "${result}"`, 'success');
    await loadDirectory(currentBrowsePath); // Refresh current view
  } else {
    showToast('toast-browse', res.error || 'Failed to create folder', 'error');
  }
}

document.getElementById('btn-browse-new-folder')?.addEventListener('click', () => {
  if (currentBrowsePath) {
    handleBrowseNewFolder(currentBrowsePath);
  }
});

function handleBrowseSelect(entry: FileEntry, multi: boolean) {
  if (multi) {
    if (selectedBrowsePaths.has(entry.path)) {
      selectedBrowsePaths.delete(entry.path);
    } else {
      selectedBrowsePaths.add(entry.path);
    }
  } else {
    // Single select: toggles if clicking same, otherwise sets unique
    if (selectedBrowsePaths.size === 1 && selectedBrowsePaths.has(entry.path)) {
      selectedBrowsePaths.clear();
    } else {
      selectedBrowsePaths.clear();
      selectedBrowsePaths.add(entry.path);
    }
  }
  updateBrowseSelection('browse-list', selectedBrowsePaths);
  updateBrowseButtons();
}

function handleBrowseOpen(entry: FileEntry) {
  if (entry.isDirectory) {
    loadDirectory(entry.path);
  } else {
    const isArchive = /\.(zip|7z|rar|tar|gz|tgz)$/i.test(entry.path);
    if (isArchive) {
      if (globalOpenArchiveHandler) {
        globalOpenArchiveHandler(entry.path);
      }
    } else {
      showToast('toast-browse', `Opening ${entry.name}...`, 'info');
      ipc.openPath(entry.path);
    }
  }
}

function updateBrowseButtons() {
  const btnCompress = document.getElementById('btn-browse-compress') as HTMLButtonElement;
  const btnExtract = document.getElementById('btn-browse-extract') as HTMLButtonElement;
  const btnBack = document.getElementById('btn-browse-back') as HTMLButtonElement;
  const btnForward = document.getElementById('btn-browse-forward') as HTMLButtonElement;
  const btnUp = document.getElementById('btn-browse-up') as HTMLButtonElement;
  
  if (btnBack) btnBack.disabled = browseHistoryBack.length === 0;
  if (btnForward) btnForward.disabled = browseHistoryForward.length === 0;
  
  // Disable Up button if we're at root or can't go up
  if (btnUp) {
    const canGoUp = currentBrowsePath && dirname(currentBrowsePath) !== currentBrowsePath;
    btnUp.disabled = !canGoUp;
  }

  const selectedCount = selectedBrowsePaths.size;
  if (btnCompress) btnCompress.disabled = selectedCount === 0;
  if (btnExtract) {
    // Only allow extract if exactly one supported archive is selected
    if (selectedCount === 1) {
      const path = Array.from(selectedBrowsePaths)[0];
      const isArchive = /\.(zip|7z|rar|tar|gz|tgz)$/i.test(path);
      btnExtract.disabled = !isArchive;
    } else {
      btnExtract.disabled = true;
    }
  }
}

function setupBrowse() {
  document.getElementById('btn-browse-refresh')?.addEventListener('click', () => {
    if (currentBrowsePath) loadDirectory(currentBrowsePath);
  });

  document.getElementById('btn-browse-compress')?.addEventListener('click', () => {
    if (selectedBrowsePaths.size > 0) {
      const paths = Array.from(selectedBrowsePaths);
      const existing = getPathsFromList('compress-files-list');
      const merged = [...new Set([...existing, ...paths])];
      setFileList('compress-files-list', merged);
      showPanel('compress');
    }
  });

  document.getElementById('btn-browse-extract')?.addEventListener('click', () => {
    if (selectedBrowsePaths.size === 1) {
      const path = Array.from(selectedBrowsePaths)[0];
      showPanel('extract');
      if (globalOpenArchiveHandler) {
        globalOpenArchiveHandler(path);
      }
    }
  });

  document.getElementById('browse-search-input')?.addEventListener('input', (e) => {
    browseSearchQuery = (e.target as HTMLInputElement).value;
    updateBrowseUI();
  });

  const sortBtn = document.getElementById('btn-browse-sort');
  const sortContainer = document.getElementById('browse-sort-container');
  const sortMenu = document.getElementById('browse-sort-menu');
  const sortLabel = document.getElementById('current-sort-label');

  sortBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    sortContainer?.classList.toggle('open');
    playSound('click');
  });

  sortMenu?.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const value = li.getAttribute('data-value');
      if (value) {
        browseSortMode = value;
        if (sortLabel) sortLabel.textContent = li.textContent;
        
        // Update active class
        sortMenu.querySelectorAll('li').forEach(item => item.classList.remove('active'));
        li.classList.add('active');
        
        sortContainer?.classList.remove('open');
        updateBrowseUI();
      }
    });
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (sortContainer?.classList.contains('open') && !sortContainer.contains(e.target as Node)) {
      sortContainer.classList.remove('open');
    }
  });

  document.getElementById('btn-toggle-recents')?.addEventListener('click', (e) => {
    // Only toggle if not clicking the clear button
    const isClearBtn = (e.target as HTMLElement).closest('.btn-clear-recents');
    if (!isClearBtn) {
      const recents = document.getElementById('browse-recents');
      recents?.classList.toggle('collapsed');
      playSound('click');
    }
  });

  // History Navigation
  document.getElementById('btn-browse-back')?.addEventListener('click', () => {
    if (browseHistoryBack.length > 0) {
      const prev = browseHistoryBack.pop();
      if (prev) {
        browseHistoryForward.push(currentBrowsePath);
        loadDirectory(prev, false);
      }
    }
  });

  document.getElementById('btn-browse-forward')?.addEventListener('click', () => {
    if (browseHistoryForward.length > 0) {
      const next = browseHistoryForward.pop();
      if (next) {
        browseHistoryBack.push(currentBrowsePath);
        loadDirectory(next, false);
      }
    }
  });

  // Up Navigation
  document.getElementById('btn-browse-up')?.addEventListener('click', () => {
    if (currentBrowsePath) {
      const parentPath = dirname(currentBrowsePath);
      if (parentPath && parentPath !== currentBrowsePath) {
        loadDirectory(parentPath);
      }
    }
  });

  // Keyboard Shortcuts (Back/Forward)
  document.addEventListener('keydown', (e) => {
    if (e.altKey) {
      if (e.key === 'ArrowLeft') {
        document.getElementById('btn-browse-back')?.click();
      } else if (e.key === 'ArrowRight') {
        document.getElementById('btn-browse-forward')?.click();
      }
    }
  });

  document.getElementById('btn-clear-recents')?.addEventListener('click', () => {
    recentArchives = [];
    localStorage.removeItem('recent_archives');
    renderRecents();
  });

  renderRecents();
}

// Compress
function setupCompress(): void {
  const listId = 'compress-files-list';

  // Drop Zones
  setupDropZone('drop-zone-compress-hero', 'compress', (paths) => {
    const existing = getPathsFromList(listId);
    const merged = [...new Set([...existing, ...paths])];
    setFileList(listId, merged);
  });

  // Hero Actions
  document.getElementById('btn-add-files-hero')?.addEventListener('click', (e) => {
    e.stopPropagation();
    ipc.selectFiles().then((paths) => {
      if (paths.length > 0) {
        const existing = getPathsFromList(listId);
        const merged = [...new Set([...existing, ...paths])];
        setFileList(listId, merged);
      }
    });
  });

  document.getElementById('btn-add-folder-hero')?.addEventListener('click', (e) => {
    e.stopPropagation();
    ipc.selectFolder().then((path) => {
      if (path) {
        const existing = getPathsFromList(listId);
        const merged = [...new Set([...existing, path])];
        setFileList(listId, merged);
      }
    });
  });

  // Destination Change
  let customOutputDir: string | null = null;
  document.getElementById('btn-change-dest-compress')?.addEventListener('click', async () => {
    const dir = await ipc.selectFolder();
    if (dir) {
      customOutputDir = dir;
      updateCompressDest(dir);
    }
  });

  // Action Bar buttons
  document.getElementById('btn-add-files-v2')?.addEventListener('click', () => {
    ipc.selectFiles().then((paths) => {
      if (paths.length > 0) {
        const existing = getPathsFromList(listId);
        const merged = [...new Set([...existing, ...paths])];
        setFileList(listId, merged);
      }
    });
  });

  document.getElementById('btn-add-folder-v2')?.addEventListener('click', () => {
    ipc.selectFolder().then((path) => {
      if (path) {
        const existing = getPathsFromList(listId);
        const merged = [...new Set([...existing, path])];
        setFileList(listId, merged);
      }
    });
  });

  // Interactive Background Orb
  const orb = document.getElementById('interactive-orb');
  if (orb) {
    window.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 40;
      const y = (e.clientY / window.innerHeight - 0.5) * 40;
      orb.style.transform = `translate(${x}px, ${y}px)`;
    });
  }

  document.getElementById('btn-clear-all-v2')?.addEventListener('click', () => {
    setFileList(listId, []);
    playSound('click');
  });

  // Compression Level
  const levelEl = document.getElementById('compression-level-v2') as HTMLInputElement;
  const levelLabel = document.getElementById('level-label-v2');
  levelEl?.addEventListener('input', () => {
    if (levelLabel) levelLabel.textContent = levelEl.value;
  });

  // Password Toggle
  const pwdToggle = document.getElementById('archive-password-toggle-v2') as HTMLInputElement;
  const pwdInput = document.getElementById('archive-password-v2') as HTMLInputElement;
  pwdToggle?.addEventListener('change', () => {
    if (pwdInput) {
      pwdInput.classList.toggle('hidden', !pwdToggle.checked);
      if (pwdToggle.checked) pwdInput.focus();
      else pwdInput.value = '';
    }
  });

  // Format Chips
  let selectedFormat = 'zip';
  const chips = document.querySelectorAll('#format-chips .chip');
  
  // Restore last-used format
  ipc.getSettings().then((s: AppSettings) => {
    if (s.lastUsedFormat) {
      selectedFormat = s.lastUsedFormat;
      chips.forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-value') === selectedFormat);
      });
    }
  });

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedFormat = chip.getAttribute('data-value') || 'zip';
      playSound('click');
      // Persist last-used format
      ipc.saveSettings({ lastUsedFormat: selectedFormat } as any);
    });
  });

  // Compression Presets
  const presetChips = document.querySelectorAll('#preset-chips .preset-chip');
  const presetLevels: Record<string, number> = { fastest: 1, balanced: 5, maximum: 7, ultra: 9 };
  presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      presetChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const preset = chip.getAttribute('data-preset') || 'maximum';
      const level = presetLevels[preset] ?? 7;
      if (levelEl) { levelEl.value = String(level); }
      if (levelLabel) { levelLabel.textContent = String(level); }
      playSound('click');
    });
  });

  // Split Volume Toggle
  const splitToggle = document.getElementById('split-volume-toggle') as HTMLInputElement;
  const splitOptions = document.getElementById('split-volume-options');
  splitToggle?.addEventListener('change', () => {
    splitOptions?.classList.toggle('hidden', !splitToggle.checked);
  });

  // Main Compress Action
  document.getElementById('btn-compress-v2')?.addEventListener('click', async () => {
    const sources = getPathsFromList(listId);
    if (sources.length === 0) {
      showToast('toast-compress', 'Select at least one file or folder', 'error');
      return;
    }

    const format = selectedFormat;
    const ext = format === 'targz' ? 'tar.gz' : format;
    
    const nameInput = document.getElementById('archive-name-v2') as HTMLInputElement;
    const customName = nameInput?.value.trim();
    const defaultName = customName ? (customName.endsWith('.' + ext) ? customName : `${customName}.${ext}`) : `${basename(sources[0])}.${ext}`;
    
    const password = pwdToggle?.checked ? pwdInput?.value : undefined;
    const settings = await ipc.getSettings();
    const outputDir = customOutputDir || settings.outputDirectory; // No fallback here
    
    let outputPath: string | null = null;
    if (outputDir) {
      outputPath = `${outputDir}/${defaultName}`;
    } else {
      // If no directory is set anywhere, prompt the user
      outputPath = await ipc.selectOutput(defaultName, format);
      if (!outputPath) return; // User canceled the save dialog
    }

    const compressionLevel = levelEl ? Number(levelEl.value) : 6;

    showGlobalProgress(0, 'Preparing...', 'Compressing...');

    let unsub: (() => void) | null = null;
    try {
      unsub = ipc.onProgress((data) => {
        showGlobalProgress(data.percent, data.status, 'Compressing...');
      });

      const result = await ipc.compress({
        sources,
        outputPath,
        format,
        level: compressionLevel,
        password,
        splitVolumeSize: splitToggle?.checked ? (document.getElementById('split-volume-size') as HTMLSelectElement)?.value || undefined : undefined,
      });

      if (result.success) {
        playSound('success');
        showToast('toast-compress', `Compressed to ${basename(result.outputPath!)}`, 'success');
        if (result.outputPath) saveRecent(result.outputPath);
        setFileList(listId, []);
        if (settings.autoOpenResultFolder && result.outputPath) {
          ipc.openPath(dirname(result.outputPath));
        }

        // Show compression stats modal
        if (result.outputPath) {
          const formatBytes = (bytes: number): string => {
            if (!bytes || bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
          };

          const inputSize = result.inputSize || 0;
          const outputSize = result.outputSize || 0;
          const ratio = inputSize > 0 ? ((1 - outputSize / inputSize) * 100).toFixed(1) : '0';

          const statsModal = document.getElementById('compression-stats-modal');
          const origEl = document.getElementById('stats-original-size');
          const compEl = document.getElementById('stats-compressed-size');
          const ratioEl = document.getElementById('stats-ratio');
          const hashEl = document.getElementById('stats-checksum');

          if (origEl) origEl.textContent = formatBytes(inputSize);
          if (compEl) compEl.textContent = formatBytes(outputSize);
          if (ratioEl) ratioEl.textContent = `${ratio}% smaller`;
          if (hashEl) hashEl.textContent = 'Computing...';

          statsModal?.classList.remove('hidden');

          // Compute checksum async
          ipc.computeChecksum(result.outputPath).then((res: any) => {
            if (hashEl) hashEl.textContent = res.success ? res.hash : 'Failed';
          });
        }
      } else {
        playSound('error');
        showToast('toast-compress', result.error || 'Compression failed', 'error');
      }
    } catch (err: any) {
      showToast('toast-compress', err.message || 'An unexpected error occurred', 'error');
    } finally {
      if (unsub) unsub();
      setTimeout(() => hideGlobalProgress(), 500);
    }
  });
}

// Extract
function setupExtract(): void {

  document.getElementById('btn-select-extract-output')?.addEventListener('click', async () => {
    const dir = await ipc.selectFolder();
    if (dir) {
      (document.getElementById('extract-output') as HTMLInputElement).value = dir;
      (document.getElementById('extract-output') as HTMLInputElement).setAttribute('data-path', dir);
    }
  });

  let currentExtractArchive = '';
  let currentExtractOutput = '';

  const passwordModal = document.getElementById('password-prompt-modal');
  const passwordInput = document.getElementById('extract-password-input') as HTMLInputElement;
  const passwordError = document.getElementById('password-error-message');

  const showPasswordModal = (showError = false) => {
    if (passwordModal) passwordModal.classList.remove('hidden');
    if (passwordInput) {
      passwordInput.value = '';
      passwordInput.focus();
    }
    if (passwordError) {
      if (showError) passwordError.classList.remove('hidden');
      else passwordError.classList.add('hidden');
    }
  };

  const hidePasswordModal = () => {
    if (passwordModal) {
      passwordModal.classList.add('hiding');
      setTimeout(() => {
        passwordModal.classList.add('hidden');
        passwordModal.classList.remove('hiding');
        if (passwordInput) passwordInput.value = '';
        if (passwordError) passwordError.classList.add('hidden');
      }, 300);
    }
  };

  document.getElementById('btn-cancel-password')?.addEventListener('click', hidePasswordModal);

  const doExtract = async (archivePath: string, outputDir: string, password?: string) => {
    
    let hasShownProgress = false;
    let operationDone = false;
    
    const unsub = ipc.onProgress((data) => {
      if (operationDone) return; // Discard stale ticker events after completion
      if (!hasShownProgress) {
        hasShownProgress = true;
        if (password) {
          // Password is correct — swap modal for progress
          hidePasswordModal();
        }
      }
      showGlobalProgress(data.percent, data.status, 'Extracting...');
    });

    const result = await ipc.extract({ archivePath, outputDir, password });

    operationDone = true;
    unsub();

    if (result.success) {
      playSound('success');
      // Show 100% briefly so the bar finishes cleanly, then hide
      showGlobalProgress(100, 'Complete', 'Extracting...');
      if (archivePath) saveRecent(archivePath);
      setTimeout(() => {
        hideGlobalProgress();
        hidePasswordModal();
        showToast('toast-extract', 'Extraction complete', 'success');
      }, 350);
      
      const s = await ipc.getSettings();
      if (s?.autoOpenResultFolder && result.outputDir) {
        ipc.openPath(result.outputDir);
      }
    } else {
      const err = result.error || '';
      const errLower = err.toLowerCase();
      // node-7z password errors often contain these keywords
      // "Wrong password : <file>" or "Data error : <file>" (when no password provided)
      if (
        errLower.includes('password') || 
        errLower.includes('encrypt') || 
        errLower.includes('data error')
      ) {
        playSound('error');
        hideGlobalProgress(); // Force hide in case any async progress events trickled
        showPasswordModal(!!password); // Keep it open, but flash the red error text
      } else {
        playSound('error');
        hideGlobalProgress();
        hidePasswordModal();
        showToast('toast-extract', result.error || 'Extraction failed', 'error');
      }
    }
  };

  // Archive Viewer Logic
  let currentViewerArchive = '';
  let currentViewerFiles: any[] = [];
  let currentViewerPath: string[] = [];

  // Viewer search
  let viewerSearchQuery = '';
  const viewerSearchInput = document.getElementById('viewer-search-input') as HTMLInputElement;
  viewerSearchInput?.addEventListener('input', () => {
    viewerSearchQuery = viewerSearchInput.value.toLowerCase();
    updateViewerUI();
  });

  // Viewer checkbox selection tracking
  let viewerSelectedFiles = new Set<string>();

  const updateExtractSelectedBtn = () => {
    const mainBtn = document.getElementById('btn-extract-from-viewer') as HTMLButtonElement;
    if (!mainBtn) return;
    
    if (viewerSelectedFiles.size > 0) {
      mainBtn.querySelector('span')!.textContent = 'Extract Selected';
      mainBtn.classList.add('smart-selected');
    } else {
      mainBtn.querySelector('span')!.textContent = 'Extract All';
      mainBtn.classList.remove('smart-selected');
    }
  };

  // Select All checkbox
  document.getElementById('viewer-select-all')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    const checkboxes = document.querySelectorAll('.viewer-row-check') as NodeListOf<HTMLInputElement>;
    viewerSelectedFiles.clear();
    checkboxes.forEach(cb => {
      cb.checked = checked;
      const tr = cb.closest('tr');
      if (tr) {
        if (checked) tr.classList.add('selected');
        else tr.classList.remove('selected');
      }
      // Allow adding both files and directories
      const fileName = cb.dataset.fileName || '';
      const currentPathStr = currentViewerPath.join('/');
      const fullPath = currentPathStr ? `${currentPathStr}/${fileName}` : fileName;
      if (checked) {
        viewerSelectedFiles.add(fullPath);
      }
    });
    updateExtractSelectedBtn();
  });

  interface ViewerState {
    archivePath: string;
    files: any[];
    path: string[];
    searchQuery: string;
    password?: string;
    selectedFiles: Set<string>;
  }
  const viewerStateStack: ViewerState[] = [];

  const updateViewerUI = () => {
    const currentPathStr = currentViewerPath.join('/');
    
    // Toggle Back button visibility based on stack depth
    const backBtn = document.getElementById('btn-viewer-back');
    if (backBtn) {
      if (viewerStateStack.length > 0) {
        backBtn.classList.remove('hidden');
      } else {
        backBtn.classList.add('hidden');
      }
    }

    // Filter files for current directory level
    let filesToShow = currentViewerFiles.filter(f => {
      const isRoot = currentViewerPath.length === 0;
      if (isRoot) {
        return !f.path.includes('/');
      } else {
        const prefix = currentPathStr + '/';
        if (!f.path.startsWith(prefix)) return false;
        const remainder = f.path.substring(prefix.length);
        return !remainder.includes('/');
      }
    });

    // Apply search filter
    if (viewerSearchQuery) {
      filesToShow = filesToShow.filter(f => f.name.toLowerCase().includes(viewerSearchQuery));
    }

    // Reset selection state on navigation
    viewerSelectedFiles.clear();
    const selectAllCb = document.getElementById('viewer-select-all') as HTMLInputElement;
    if (selectAllCb) selectAllCb.checked = false;
    updateExtractSelectedBtn();

    if (filesToShow.length === 0) {
      setArchiveViewerState(viewerSearchQuery ? 'empty' : 'empty');
    } else {
      setArchiveViewerState('data');
      renderArchiveViewerTable(
        filesToShow, 
        (folderName) => {
          currentViewerPath.push(folderName);
          viewerSearchQuery = '';
          if (viewerSearchInput) viewerSearchInput.value = '';
          updateViewerUI();
        },
        (file) => {
          ipc.startNativeDrag(currentViewerArchive, file.path, file.isDirectory, currentViewerPassword);
        },
        async (file) => {
          const ext = file.name.split('.').pop()?.toLowerCase();
          const archiveExts = ['zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'iso', 'bz2', 'xz'];
          
          if (ext && archiveExts.includes(ext)) {
            // Found a nested archive! Handle it
            showGlobalProgress(0, 'Extracting nested archive...', 'Please wait');
            const res = await ipc.extractTempFile(currentViewerArchive, file.path, currentViewerPassword);
            hideGlobalProgress();
            
            if (res.success && res.outputPath) {
              // Push the current state
              viewerStateStack.push({
                archivePath: currentViewerArchive,
                files: currentViewerFiles,
                path: [...currentViewerPath],
                searchQuery: viewerSearchQuery,
                password: currentViewerPassword,
                selectedFiles: new Set(viewerSelectedFiles)
              });
              
              // Load the new archive
              await loadArchiveIntoViewer(res.outputPath);
            } else {
              showToast('toast-extract', res.error || 'Failed to open nested archive', 'error');
            }
          } else {
            // Normal file preview
            showFilePreview(basename(file.path));
            const res = await ipc.extractPreviewFile(currentViewerArchive, file.path, currentViewerPassword);
            if (res.success) {
              showFilePreview(basename(file.path), res.data, res.type, res.error);
            } else {
              showFilePreview(basename(file.path), undefined, undefined, res.error || 'Failed to extract preview');
            }
          }
        },
        (file, checked) => {
          const fullPath = file.path;
          // Sync selection class on TR
          const checkboxes = document.querySelectorAll('.viewer-row-check') as NodeListOf<HTMLInputElement>;
          checkboxes.forEach(cb => {
            if (cb.dataset.fileName === file.name && cb.dataset.isDir === String(file.isDirectory)) {
              const tr = cb.closest('tr');
              if (tr) {
                if (checked) tr.classList.add('selected');
                else tr.classList.remove('selected');
              }
            }
          });

          if (checked) {
            viewerSelectedFiles.add(fullPath); // Add both files and folders
          } else {
            viewerSelectedFiles.delete(fullPath);
          }
          updateExtractSelectedBtn();
        }
      );
    }

    renderArchiveViewerPath(basename(currentViewerArchive), currentViewerPath, (idx) => {
      if (idx === -1) {
        currentViewerPath = [];
      } else {
        currentViewerPath = currentViewerPath.slice(0, idx + 1);
      }
      viewerSearchQuery = '';
      if (viewerSearchInput) viewerSearchInput.value = '';
      updateViewerUI();
    });
  };

  document.getElementById('btn-viewer-back')?.addEventListener('click', () => {
    if (viewerStateStack.length > 0) {
      const parentState = viewerStateStack.pop();
      if (parentState) {
        currentViewerArchive = parentState.archivePath;
        currentViewerFiles = parentState.files;
        currentViewerPath = parentState.path;
        viewerSearchQuery = parentState.searchQuery;
        currentViewerPassword = parentState.password || '';
        if (viewerSearchInput) viewerSearchInput.value = parentState.searchQuery;
        
        viewerSelectedFiles.clear();
        parentState.selectedFiles.forEach(f => viewerSelectedFiles.add(f));
        
        updateViewerUI();
      }
    }
  });

  document.getElementById('btn-close-viewer')?.addEventListener('click', () => {
    hideArchiveViewerModal();
    // Clear stack on full close so next open is clean
    viewerStateStack.length = 0;
  });

  // Add ESC key support for closing archive viewer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('archive-viewer-modal');
      if (modal && !modal.classList.contains('hidden')) {
        hideArchiveViewerModal();
        viewerStateStack.length = 0;
      }
    }
  });

  // Add backdrop click support for closing archive viewer
  document.addEventListener('click', (e) => {
    const modal = document.getElementById('archive-viewer-modal');
    if (modal && !modal.classList.contains('hidden')) {
      const backdrop = modal.querySelector('.progress-modal-backdrop');
      if (backdrop && e.target === backdrop) {
        hideArchiveViewerModal();
        viewerStateStack.length = 0;
      }
    }
  });

  let currentViewerPassword = '';

  const loadArchiveIntoViewer = async (archivePath: string, pwd?: string) => {
    // Store globally for viewer operations
    currentViewerArchive = archivePath;
    currentViewerPassword = pwd || '';
    currentViewerPath = [];
    currentViewerFiles = [];

    showArchiveViewerModal();
    setArchiveViewerState('loading');

    const result = await ipc.listArchive(archivePath, pwd);

    if (result.success && result.files) {
      const map = new Map<string, any>();
      
      result.files.forEach(f => {
        const normalizedPath = f.path.replace(/\\/g, '/');
        map.set(normalizedPath, { ...f, path: normalizedPath });
        
        const parts = normalizedPath.split('/');
        let currentParent = '';
        for (let i = 0; i < parts.length - 1; i++) {
          currentParent += (i === 0 ? '' : '/') + parts[i];
          if (!map.has(currentParent)) {
            map.set(currentParent, {
              name: parts[i],
              path: currentParent,
              isDirectory: true,
              size: 0,
              packedSize: 0,
              modified: f.modified || ''
            });
          }
        }
      });
      
      currentViewerFiles = Array.from(map.values());
      updateViewerUI();
    } else {
      setArchiveViewerState('error', result.error);
    }
  };
  
  const handleArchiveSelection = async (archivePath: string) => {
    currentExtractArchive = archivePath;
    currentViewerArchive = archivePath;
    
    // Populate Viewer immediately.
    // If extraction requires a password, the user will be prompted after clicking Extract in the viewer.
    await loadArchiveIntoViewer(archivePath);
  };
  globalOpenArchiveHandler = handleArchiveSelection;

  document.getElementById('btn-submit-password')?.addEventListener('click', async () => {
    if (currentExtractArchive && currentExtractOutput) {
      const pwd = passwordInput?.value;
      if (pwd) {
        const submitBtn = document.getElementById('btn-submit-password') as HTMLButtonElement;
        if (submitBtn) submitBtn.disabled = true;

        await doExtract(currentExtractArchive, currentExtractOutput, pwd);

        if (submitBtn) submitBtn.disabled = false;
      }
    }
  });

  passwordInput?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('btn-submit-password')?.click();
    }
  });

  document.getElementById('btn-open-archive-v2')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const archivePath = await ipc.selectArchive();
    if (!archivePath) return;
    await handleArchiveSelection(archivePath);
  });

  // (loadArchiveIntoViewer was moved up)
  
  const handleSelectiveExtract = async () => {
    if (viewerSelectedFiles.size === 0) {
      showToast('toast-extract', 'No files selected', 'error');
      return;
    }
    const settings = await ipc.getSettings();
    let outputDir = settings.outputDirectory;
    if (!outputDir) {
      const selected = await ipc.selectFolder();
      if (!selected) return;
      outputDir = selected;
    }
    hideArchiveViewerModal();

    showGlobalProgress(0, 'Preparing...', 'Extracting selected...');
    const unsub = ipc.onProgress((data) => {
      showGlobalProgress(data.percent, data.status, 'Extracting selected...');
    });
    try {
      const result = await ipc.selectiveExtract(
        currentViewerArchive,
        Array.from(viewerSelectedFiles),
        outputDir,
        currentViewerPassword || undefined
      );
      if (result.success) {
        playSound('success');
        showGlobalProgress(100, 'Complete', 'Extracting selected...');
        setTimeout(() => {
          hideGlobalProgress();
          showToast('toast-extract', `Extracted ${viewerSelectedFiles.size} files`, 'success');
        }, 350);
        if (settings.autoOpenResultFolder && result.outputDir) ipc.openPath(result.outputDir);
      } else {
        playSound('error');
        hideGlobalProgress();
        showToast('toast-extract', result.error || 'Extraction failed', 'error');
      }
    } finally {
      unsub();
    }
  };

  document.getElementById('btn-extract-from-viewer')?.addEventListener('click', async () => {
    // Smart Extraction: If something is selected, trigger selective extraction
    if (viewerSelectedFiles.size > 0) {
      await handleSelectiveExtract();
      return;
    }

    const settings = await ipc.getSettings();
    let outputDir = settings.outputDirectory;
    
    if (!outputDir) {
      const selected = await ipc.selectFolder();
      if (!selected) return;
      outputDir = selected;
    }
    
    currentExtractOutput = outputDir;
    
    // Test for encryption before extracting
    const testResult = await ipc.test(currentViewerArchive);
    if (!testResult.success) {
      const errLower = (testResult.error || '').toLowerCase();
      if (
        errLower.includes('password') ||
        errLower.includes('encrypt') ||
        errLower.includes('data error') ||
        (testResult.error || '').includes('Wrong password')
      ) {
        hideArchiveViewerModal();
        showPasswordModal(false);
        return; 
      }
    }
    
    hideArchiveViewerModal();
    await doExtract(currentViewerArchive, outputDir);
  });

  // Extract Here (same dir as archive)
  document.getElementById('btn-extract-here')?.addEventListener('click', async () => {
    const outputDir = dirname(currentViewerArchive);
    hideArchiveViewerModal();
    await doExtract(currentViewerArchive, outputDir);
  });

  // Extract to Subfolder
  document.getElementById('btn-extract-subfolder')?.addEventListener('click', async () => {
    const archiveName = basename(currentViewerArchive).replace(/\.[^.]+$/, '').replace(/\.tar$/, '');
    const outputDir = dirname(currentViewerArchive) + '/' + archiveName;
    hideArchiveViewerModal();
    await doExtract(currentViewerArchive, outputDir);
  });



  // Verify Integrity (Checksum)
  document.getElementById('btn-verify-integrity')?.addEventListener('click', async () => {
    showToast('toast-extract', 'Computing SHA-256...', 'info');
    const result = await ipc.computeChecksum(currentViewerArchive);
    if (result.success && result.hash) {
      // Show in stats modal
      const statsModal = document.getElementById('compression-stats-modal');
      const origEl = document.getElementById('stats-original-size');
      const compEl = document.getElementById('stats-compressed-size');
      const ratioEl = document.getElementById('stats-ratio');
      const hashEl = document.getElementById('stats-checksum');
      const titleEl = statsModal?.querySelector('.progress-modal-title');

      if (titleEl) titleEl.textContent = 'Archive Integrity';
      if (origEl) origEl.textContent = basename(currentViewerArchive);
      if (compEl) compEl.textContent = '—';
      if (ratioEl) ratioEl.textContent = 'Verified ✓';
      if (hashEl) hashEl.textContent = result.hash;

      statsModal?.classList.remove('hidden');
    } else {
      showToast('toast-extract', result.error || 'Failed to compute checksum', 'error');
    }
  });

  // Stats modal controls
  document.getElementById('btn-close-stats')?.addEventListener('click', () => {
    document.getElementById('compression-stats-modal')?.classList.add('hidden');
  });
  document.getElementById('stats-modal-backdrop')?.addEventListener('click', () => {
    document.getElementById('compression-stats-modal')?.classList.add('hidden');
  });
  document.getElementById('btn-copy-checksum')?.addEventListener('click', () => {
    const hash = document.getElementById('stats-checksum')?.textContent;
    if (hash && hash !== '—' && hash !== 'Computing...') {
      navigator.clipboard.writeText(hash);
      showToast('toast-compress', 'Checksum copied to clipboard', 'success');
    }
  });
}



// Settings
async function loadSettings(): Promise<void> {
  const settings = await ipc.getSettings();
  applySettingsToForm(settings);
  applyTheme(settings.theme ?? 'system');
  updateCompressDest();
}

function setupSettings(): void {
  const levelEl = document.getElementById('setting-compression-level') as HTMLInputElement;
  const levelValueEl = document.getElementById('compression-level-value');
  levelEl?.addEventListener('input', () => {
    if (levelValueEl) levelValueEl.textContent = levelEl.value;
  });

  document.getElementById('btn-select-output-dir')?.addEventListener('click', async () => {
    const dir = await ipc.selectFolder();
    if (dir) {
      (document.getElementById('setting-output-dir') as HTMLInputElement).value = dir;
      saveSettings();
    }
  });

  document.getElementById('btn-clear-output-dir')?.addEventListener('click', () => {
    const input = document.getElementById('setting-output-dir') as HTMLInputElement;
    if (input) {
      input.value = '';
      saveSettings();
    }
  });

  const saveSettings = async () => {
    const outputDirEl = document.getElementById('setting-output-dir') as HTMLInputElement;
    const autoOpenEl = document.getElementById('setting-auto-open') as HTMLInputElement;
    const minimizeTrayEl = document.getElementById('setting-minimize-tray') as HTMLInputElement;
    const themeEl = document.getElementById('setting-theme') as HTMLSelectElement;
    const animationsEl = document.getElementById('setting-animations') as HTMLInputElement;
    const showHistoryEl = document.getElementById('setting-show-history') as HTMLInputElement;
    const autoResizeWindowEl = document.getElementById('setting-auto-resize-window') as HTMLInputElement;

    const deleteSourcesEl = document.getElementById('setting-delete-sources') as HTMLInputElement;
    const overwriteBehaviorEl = document.getElementById('setting-overwrite-behavior') as HTMLSelectElement;

    await ipc.saveSettings({
      compressionLevel: Number(levelEl?.value ?? 6),
      outputDirectory: outputDirEl?.value || '',
      autoOpenResultFolder: autoOpenEl?.checked ?? true,
      minimizeToTray: minimizeTrayEl?.checked ?? true,
      theme: (themeEl?.value as 'light' | 'dark' | 'system') || 'system',
      themeFlavor: (document.querySelector('.flavor-swatch-v2.active')?.getAttribute('data-flavor') as any) || 'midnight',
      animationsEnabled: animationsEl?.checked ?? true,
      showHistoryTab: showHistoryEl?.checked ?? true,
      autoResizeWindow: autoResizeWindowEl?.checked ?? false,
      showBrowseRecents: (document.getElementById('setting-show-recents') as HTMLInputElement)?.checked ?? true,
      browseViewMode: (document.getElementById('setting-browse-view') as HTMLSelectElement)?.value as any || 'explorer',

      deleteSourcesAfterProcess: deleteSourcesEl?.checked ?? false,
      overwriteBehavior: (overwriteBehaviorEl?.value as 'overwrite' | 'skip' | 'prompt') || 'prompt',
      layout: (document.getElementById('setting-layout') as HTMLSelectElement)?.value as any || 'header',
    });
    updateBrowseUI(); // Refresh browser tab if open
    updateCompressDest(); // Update Compress tab destination label
  };

  levelEl?.addEventListener('change', saveSettings);
  document.getElementById('setting-output-dir')?.addEventListener('change', saveSettings);
  document.getElementById('setting-auto-open')?.addEventListener('change', saveSettings);
  document.getElementById('setting-show-recents')?.addEventListener('change', () => {
    const el = document.getElementById('setting-show-recents') as HTMLInputElement;
    const visible = el?.checked ?? true;
    const browseRecentsEl = document.getElementById('browse-recents');
    if (browseRecentsEl) browseRecentsEl.classList.toggle('setting-hidden', !visible);
    saveSettings();
  });
  document.getElementById('setting-minimize-tray')?.addEventListener('change', () => {
    const el = document.getElementById('setting-minimize-tray') as HTMLInputElement;
    const enabled = el?.checked ?? false;
    ipc.setTrayEnabled(enabled);  // tell main to create or destroy the tray immediately
    saveSettings();
  });
  document.getElementById('setting-theme')?.addEventListener('change', async () => {
    const themeEl = document.getElementById('setting-theme') as HTMLSelectElement;
    const theme = (themeEl?.value as 'light' | 'dark' | 'system') || 'system';
    applyTheme(theme);
    await saveSettings();
  });
  document.getElementById('setting-animations')?.addEventListener('change', () => {
    const animationsEl = document.getElementById('setting-animations') as HTMLInputElement;
    applyAnimations(animationsEl?.checked ?? true);
    saveSettings();
  });
  document.getElementById('setting-show-history')?.addEventListener('change', () => {
    const showHistoryEl = document.getElementById('setting-show-history') as HTMLInputElement;
    const isVisible = showHistoryEl?.checked ?? true;
    
    saveSettings().then(() => {
      ipc.getSettings().then(s => {
        applySettingsToForm(s);
        
        // If we just hid the history tab and we're currently ON it, switch to compress
        const activePanel = document.querySelector('.panel.active');
        if (!isVisible && activePanel?.id === 'panel-history') {
          showPanel('panel-compress');
        }
      });
    });
  });
  document.getElementById('setting-browse-view')?.addEventListener('change', saveSettings);
  document.getElementById('setting-layout')?.addEventListener('change', async () => {
    const layoutEl = document.getElementById('setting-layout') as HTMLSelectElement;
    const layout = (layoutEl?.value as 'header' | 'sidebar') || 'header';
    applyLayout(layout);
    await saveSettings();
    playSound('switch');
  });
  
  // Flavor swatches
  document.querySelectorAll('.flavor-swatch-v2').forEach(sw => {
    sw.addEventListener('click', async () => {
      document.querySelectorAll('.flavor-swatch-v2').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      const flavor = sw.getAttribute('data-flavor') || 'midnight';
      applyFlavor(flavor);
      await saveSettings();
    });
  });
  
  document.getElementById('setting-delete-sources')?.addEventListener('change', saveSettings);
  document.getElementById('setting-overwrite-behavior')?.addEventListener('change', saveSettings);
  document.getElementById('setting-auto-resize-window')?.addEventListener('change', saveSettings);
}

// About
function setupAbout(): void {
  document.querySelectorAll('.external-link').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const url = target.getAttribute('data-url');
      if (url) {
        ipc.openExternal(url);
      }
    });
  });
}

// Extract drop zone - allow single archive click to browse
function setupExtractDropZoneClick(): void {
  const zone = document.getElementById('drop-zone-extract-hero');
  zone?.addEventListener('click', (e) => {
    // Prevent event if clicking on interactive elements or their children
    if ((e.target as HTMLElement).closest('button') || 
        (e.target as HTMLElement).closest('.recent-card-mini') ||
        (e.target as HTMLElement).closest('.extract-recents-mini')) return;
    
    ipc.selectArchive().then((archive) => {
      if (archive) globalOpenArchiveHandler?.(archive);
    });
  });

  // Interactive Background Orb for Extract
  const orb = document.getElementById('interactive-orb-extract');
  if (orb) {
    window.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 40;
      const y = (e.clientY / window.innerHeight - 0.5) * 40;
      orb.style.transform = `translate(${x}px, ${y}px)`;
    });
  }

  // Interactive Background Orb for Archive Viewer
  const viewerOrb = document.getElementById('interactive-orb-viewer');
  if (viewerOrb) {
    window.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 30;
      const y = (e.clientY / window.innerHeight - 0.5) * 30;
      viewerOrb.style.transform = `translate(${x}px, ${y}px)`;
    });
  }
}

// Titlebar
function setupTitlebar(): void {
  const platform = ipc.getPlatform();
  const titlebar = document.getElementById('titlebar');
  const controls = document.querySelector('.titlebar-controls') as HTMLElement;

  if (titlebar && controls) {
    if (platform === 'darwin') {
      // macOS: Traffic lights on the left
      titlebar.style.justifyContent = 'flex-start';
      titlebar.style.paddingLeft = '12px';
      controls.classList.add('mac-controls');
      
      // On macOS, with titleBarStyle 'hidden', we usually don't need custom buttons 
      // because the OS traffic lights are still visible. However, if frame: false has removed them, 
      // we need to inject our own custom styled ones. Let's ensure the order is Close, Minimize, Maximize
      const closeBtn = document.getElementById('btn-window-close');
      const minBtn = document.getElementById('btn-window-minimize');
      const maxBtn = document.getElementById('btn-window-maximize');
      
      if (closeBtn && minBtn && maxBtn) {
        controls.innerHTML = '';
        controls.appendChild(closeBtn);
        controls.appendChild(minBtn);
        controls.appendChild(maxBtn);
      }
      
      // Physically move controls to be the FIRST child of titlebar for macOS
      if (titlebar.firstElementChild !== controls) {
        titlebar.insertBefore(controls, titlebar.firstChild);
      }
    } else {
      // Windows / Linux: Standard controls on the right
      titlebar.style.justifyContent = 'flex-end';
      controls.classList.add('win-controls');
    }
  }

  document.getElementById('btn-window-minimize')?.addEventListener('click', () => {
    ipc.minimizeWindow();
  });
  document.getElementById('btn-window-maximize')?.addEventListener('click', () => {
    ipc.maximizeWindow();
  });
  document.getElementById('btn-window-close')?.addEventListener('click', () => {
    ipc.closeWindow();
  });
}

// Init - call when DOM ready
export function init(): void {
  setupTitlebar();
  setupNavigation();
  setupBrowse();
  setupCompress();
  setupExtract();
  setupExtractDropZoneClick();

  // Setup Drop Zone for Extract
  setupDropZone('drop-zone-extract-hero', 'extract', (paths) => {
    if (paths.length > 0) {
      globalOpenArchiveHandler?.(paths[0]);
    }
  });

  setupSettings();
  setupAbout();
  setupWelcome();
  loadSettings();

  document.getElementById('btn-cancel-progress')?.addEventListener('click', () => {
    hideGlobalProgress();
    // Use active panel's toast container
    const activePanel = document.querySelector('.panel.active');
    const toastId = activePanel?.id === 'panel-extract' ? 'toast-extract' : 'toast-compress';
    showToast(toastId, 'Modal dismissed (Process continues in background)', 'success');
  });

  // ─── Handle open-file from macOS Services / double-click ─────────────────────
  // When the user right-clicks a folder → Services → "Compress with iCompressor"
  // or right-clicks an archive → Services → "Extract with iCompressor",
  // the main process sends OPEN_WITH and we route them to the right tab.
  ipc.onOpenWith(({ filePath, action }) => {
    if (action === 'compress') {
      showPanel('panel-compress');
      const existing = getPathsFromList('compress-files-list');
      const merged = [...new Set([...existing, filePath])];
      setFileList('compress-files-list', merged);
    } else {
      showPanel('panel-extract');
      setSingleFile('extract-files-list', filePath);
    }
  });
}

function setupWelcome(): void {
  document.getElementById('btn-welcome-start')?.addEventListener('click', () => {
    showPanel('compress');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
