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
  renderHistory,
  showFilePreview,
  setBrowseLoading
} from './ui';
import type { AppSettings, FileEntry, HistoryEntry } from '../types';

// Path utilities (renderer-safe - we receive paths as strings from main)
function basename(p: string): string {
  return p.split(/[/\\]/).pop() || p;
}

function dirname(p: string): string {
  const parts = p.split(/[/\\]/);
  parts.pop();
  return parts.join('/') || '/';
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
    if ((e.target as HTMLElement).closest('button')) return;
    
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
let browseEntries: FileEntry[] = [];
let browseSearchQuery = '';
let browseSortMode = 'name-asc';

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
  const result = await ipc.readDir(dirPath);
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
  }

  showContextMenu(x, y, items);
}

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
      const { updateCompressDest } = require('./ui');
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
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedFormat = chip.getAttribute('data-value') || 'zip';
      playSound('click');
    });
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
    const outputDir = customOutputDir || settings.outputDirectory || dirname(sources[0]);
    const defaultPath = outputDir ? `${outputDir}/${defaultName}` : defaultName;

    const outputPath = await ipc.selectOutput(defaultPath, format);
    if (!outputPath) return;

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
      });

      if (result.success) {
        playSound('success');
        showToast('toast-compress', `Compressed to ${basename(result.outputPath!)}`, 'success');
        if (result.outputPath) saveRecent(result.outputPath);
        setFileList(listId, []);
        if (settings.autoOpenResultFolder && result.outputPath) {
          ipc.openPath(result.outputPath);
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
    if (passwordModal) passwordModal.classList.add('hidden');
    if (passwordInput) passwordInput.value = '';
    if (passwordError) passwordError.classList.add('hidden');
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

  const updateViewerUI = () => {
    const currentPathStr = currentViewerPath.join('/');
    
    // Filter files for current directory level
    const filesToShow = currentViewerFiles.filter(f => {
      // If we are at root (empty path array), we want items with no slashes in their path
      // If we are in "folder/sub", we want items starting with "folder/sub/" but exactly one level deep
      
      const isRoot = currentViewerPath.length === 0;
      if (isRoot) {
        // Items in root have no slashes in their path, or are directories
        return !f.path.includes('/');
      } else {
        const prefix = currentPathStr + '/';
        if (!f.path.startsWith(prefix)) return false;
        
        // Remove prefix to see how many slashes are left
        const remainder = f.path.substring(prefix.length);
        // It must not contain any more slashes to be in this exact directory
        return !remainder.includes('/');
      }
    });

    if (filesToShow.length === 0) {
      setArchiveViewerState('empty');
    } else {
      setArchiveViewerState('data');
      renderArchiveViewerTable(
        filesToShow, 
        (folderName) => {
          currentViewerPath.push(folderName);
          updateViewerUI();
        },
        (file) => {
          ipc.startNativeDrag(currentViewerArchive, file.path, currentViewerPassword);
        },
        async (file) => {
          showFilePreview(basename(file.path));
          const res = await ipc.extractPreviewFile(currentViewerArchive, file.path, currentViewerPassword);
          if (res.success) {
            showFilePreview(basename(file.path), res.data, res.type, res.error);
          } else {
            showFilePreview(basename(file.path), undefined, undefined, res.error || 'Failed to extract preview');
          }
        }
      );
    }

    renderArchiveViewerPath(basename(currentViewerArchive), currentViewerPath, (idx) => {
      if (idx === -1) {
        currentViewerPath = [];
      } else {
        currentViewerPath = currentViewerPath.slice(0, idx + 1);
      }
      updateViewerUI();
    });
  };

  document.getElementById('btn-close-viewer')?.addEventListener('click', hideArchiveViewerModal);

  // Add ESC key support for closing archive viewer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('archive-viewer-modal');
      if (modal && !modal.classList.contains('hidden')) {
        hideArchiveViewerModal();
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
  
  document.getElementById('btn-extract-from-viewer')?.addEventListener('click', async () => {
    const outputDir = await ipc.selectFolder();
    if (!outputDir) return;
    
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
}



// Settings
async function loadSettings(): Promise<void> {
  const settings = await ipc.getSettings();
  applySettingsToForm(settings);
  applyTheme(settings.theme ?? 'system');
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
      themeFlavor: (document.querySelector('.flavor-swatch.active')?.getAttribute('data-flavor') as any) || 'midnight',
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
    if ((e.target as HTMLElement).closest('button')) return;
    
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
