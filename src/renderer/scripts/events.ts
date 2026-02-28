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
  renderHistory,
  applyTheme,
  renderBreadcrumbs,
  renderBrowseList,
  showArchiveViewerModal,
  hideArchiveViewerModal,
  setArchiveViewerState,
  renderArchiveViewerPath,
  renderArchiveViewerTable,
  applySettingsToForm
} from './ui';
import type { FileEntry } from '../types';

// Path utilities (renderer-safe - we receive paths as strings from main)
function basename(p: string): string {
  return p.split(/[/\\]/).pop() || p;
}

function dirname(p: string): string {
  const parts = p.split(/[/\\]/);
  parts.pop();
  return parts.join('/') || '/';
}

// Drag & drop
function setupDropZone(
  zoneId: string,
  type: 'compress' | 'extract',
  onDrop: (paths: string[]) => void
): void {
  const zone = document.getElementById(zoneId);
  if (!zone) return;

  zone.addEventListener('click', () => {
    if (type === 'compress') {
      ipc.selectFiles().then((paths) => {
        if (paths.length > 0) {
          const existing = getPathsFromList('compress-files-list');
          const merged = [...new Set([...existing, ...paths])];
          setFileList('compress-files-list', merged);
        }
      });
    } else {
      ipc.selectFiles().then((paths) => {
        const archive = paths.find((p) => /\.(zip|7z|rar|tar|gz|tgz)$/i.test(p));
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
function setupNavigation(): void {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panelId = btn.getAttribute('data-panel');
      if (panelId) {
        showPanel(panelId);
        if (panelId === 'history') loadHistory();
        if (panelId === 'settings') loadSettings();
        if (panelId === 'browse') initBrowse();
      }
    });
  });
}

// Browse
let currentBrowsePath = '';
let selectedBrowsePaths = new Set<string>();
let browseEntries: FileEntry[] = [];

async function initBrowse() {
  if (!currentBrowsePath) {
    currentBrowsePath = await ipc.getHomeDir();
  }
  await loadDirectory(currentBrowsePath);
}

async function loadDirectory(dirPath: string) {
  const result = await ipc.readDir(dirPath);
  if (!result.success || !result.entries) {
    showToast('toast-compress', result.error || 'Failed to read directory', 'error'); // fallback toast
    return;
  }
  
  currentBrowsePath = dirPath;
  browseEntries = result.entries;
  selectedBrowsePaths.clear();
  updateBrowseUI();
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

  renderBreadcrumbs('browse-breadcrumbs', pieces, (path) => loadDirectory(path));
  
  // Render list
  renderBrowseList(
    'browse-list', 
    browseEntries, 
    handleBrowseSelect, 
    handleBrowseOpen,
    (path) => selectedBrowsePaths.has(path)
  );

  updateBrowseButtons();
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
  updateBrowseUI();
}

function handleBrowseOpen(entry: FileEntry) {
  if (entry.isDirectory) {
    loadDirectory(entry.path);
  }
}

function updateBrowseButtons() {
  const btnCompress = document.getElementById('btn-browse-compress') as HTMLButtonElement;
  const btnExtract = document.getElementById('btn-browse-extract') as HTMLButtonElement;
  
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
      setSingleFile('extract-files-list', path);
      showPanel('extract');
    }
  });
}

// Compress
function setupCompress(): void {
  setupDropZone('drop-zone-compress', 'compress', (paths) => {
    const existing = getPathsFromList('compress-files-list');
    const merged = [...new Set([...existing, ...paths])];
    setFileList('compress-files-list', merged);
  });

  document.getElementById('btn-add-files')?.addEventListener('click', () => {
    ipc.selectFiles().then((paths) => {
      if (paths.length > 0) {
        const existing = getPathsFromList('compress-files-list');
        const merged = [...new Set([...existing, ...paths])];
        setFileList('compress-files-list', merged);
      }
    });
  });

  document.getElementById('btn-compress')?.addEventListener('click', async () => {
    const sources = getPathsFromList('compress-files-list');
    if (sources.length === 0) {
      showToast('toast-compress', 'Select at least one file or folder', 'error');
      return;
    }

    const formatSelect = document.getElementById('format-select') as HTMLSelectElement;
    const format = formatSelect?.value || 'zip';
    const ext = format === 'targz' ? 'tar.gz' : format;
    
    // Read optional custom name
    const nameInput = document.getElementById('archive-name') as HTMLInputElement;
    const customName = nameInput?.value.trim();
    const defaultName = customName ? `${customName}.${ext}` : `${basename(sources[0])}.${ext}`;
    
    // Read optional custom password
    const passwordInput = document.getElementById('archive-password') as HTMLInputElement;
    const password = passwordInput?.value;

    const settings = await ipc.getSettings();
    const outputDir = settings.outputDirectory || dirname(sources[0]);
    const defaultPath = outputDir ? `${outputDir}/${defaultName}` : defaultName;

    const outputPath = await ipc.selectOutput(defaultPath, format);
    if (!outputPath) return;

    const compressionLevel = settings.compressionLevel ?? 6;

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
        showToast('toast-compress', `Compressed to ${basename(result.outputPath!)}`, 'success');
        setFileList('compress-files-list', []);
        if (settings.autoOpenResultFolder && result.outputPath) {
          ipc.openPath(result.outputPath);
        }
      } else {
        showToast('toast-compress', result.error || 'Compression failed', 'error');
      }
    } catch (err: any) {
      showToast('toast-compress', err.message || 'An unexpected error occurred', 'error');
    } finally {
      if (unsub) unsub();
      // Brief delay to show 100% or error state before hiding
      setTimeout(() => hideGlobalProgress(), 500);
    }
  });
}

// Extract
function setupExtract(): void {
  setupDropZone('drop-zone-extract', 'extract', (paths) => {
    const archive = paths.find((p) => /\.(zip|7z|rar|tar|gz|tgz)$/i.test(p));
    if (archive) setSingleFile('extract-files-list', archive);
  });

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
      // Show 100% briefly so the bar finishes cleanly, then hide
      showGlobalProgress(100, 'Complete', 'Extracting...');
      setTimeout(() => {
        hideGlobalProgress();
        hidePasswordModal();
        showToast('toast-extract', 'Extraction complete', 'success');
        setSingleFile('extract-files-list', null);
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
        hideGlobalProgress(); // Force hide in case any async progress events trickled
        showPasswordModal(!!password); // Keep it open, but flash the red error text
      } else {
        hideGlobalProgress();
        hidePasswordModal();
        showToast('toast-extract', result.error || 'Extraction failed', 'error');
      }
    }
  };

  document.getElementById('btn-submit-password')?.addEventListener('click', async () => {
    if (currentExtractArchive && currentExtractOutput) {
      const pwd = passwordInput?.value;
      if (pwd) {
        const submitBtn = document.getElementById('btn-submit-password') as HTMLButtonElement;
        if (submitBtn) submitBtn.disabled = true;

        // Start extraction, but stay on password modal initially until success is proven
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

  document.getElementById('btn-extract')?.addEventListener('click', async () => {
    const archivePath = getSingleFile('extract-files-list');

    if (!archivePath) {
      showToast('toast-extract', 'Select an archive first', 'error');
      return;
    }

    const outputDir = await ipc.selectFolder();
    if (!outputDir) {
      // User cancelled the dialog, just return
      return;
    }
    
    currentExtractArchive = archivePath;
    currentExtractOutput = outputDir;

    // Test the archive silently first to check for encryption
    // WE DO NOT show the progress modal yet! We want the testing phase to be fully invisible.
    const testResult = await ipc.test(archivePath);
    if (!testResult.success) {
      const errLower = (testResult.error || '').toLowerCase();
      if (
        errLower.includes('password') ||
        errLower.includes('encrypt') ||
        errLower.includes('data error') ||
        (testResult.error || '').includes('Wrong password')
      ) {
        showPasswordModal(false);
        return; // Halt here until they enter password
      }
    }
    
    // Valid archive or zip without password, proceed normally
    await doExtract(archivePath, outputDir);
  });

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
      renderArchiveViewerTable(filesToShow, (folderName) => {
        currentViewerPath.push(folderName);
        updateViewerUI();
      });
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

  const btnViewArchive = document.getElementById('btn-view-archive') as HTMLButtonElement;
  
  // Enable View Archive button when file is selected
  const origSetSingleFile = setSingleFile;
  (window as any).__patchedSetSingleFile = (listId: string, path: string | null) => {
    origSetSingleFile(listId, path);
    if (listId === 'extract-files-list') {
      const btnExtract = document.getElementById('btn-extract') as HTMLButtonElement | null;
      if (btnViewArchive) btnViewArchive.disabled = !path;
      if (btnExtract) btnExtract.disabled = !path;
    }
  };
  // We don't want to actually re-declare setSingleFile, but since events.ts imports it, we can't easily patch it.
  // Instead we'll use a MutationObserver on the extract-files-list to toggle the button!
  
  const extractList = document.getElementById('extract-files-list');
  const btnExtract = document.getElementById('btn-extract') as HTMLButtonElement | null;
  
  if (extractList) {
    const observer = new MutationObserver(() => {
      const isEmpty = extractList.children.length === 0;
      if (btnViewArchive) btnViewArchive.disabled = isEmpty;
      if (btnExtract) btnExtract.disabled = isEmpty;
    });
    observer.observe(extractList, { childList: true });
  }

  btnViewArchive?.addEventListener('click', async () => {
    const archivePath = getSingleFile('extract-files-list');
    if (!archivePath) return;

    currentViewerArchive = archivePath;
    currentViewerPath = [];
    currentViewerFiles = [];

    showArchiveViewerModal();
    setArchiveViewerState('loading');

    const result = await ipc.listArchive(archivePath);

    if (result.success && result.files) {
      // Normalize slashes for windows archives
      const map = new Map<string, any>();
      
      result.files.forEach(f => {
        const normalizedPath = f.path.replace(/\\/g, '/');
        map.set(normalizedPath, { ...f, path: normalizedPath });
        
        // Synthesize missing parent directories
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
  });

  document.getElementById('btn-close-viewer')?.addEventListener('click', hideArchiveViewerModal);
  
  document.getElementById('btn-extract-from-viewer')?.addEventListener('click', () => {
    hideArchiveViewerModal();
    // Simulate click on main extract button
    document.getElementById('btn-extract')?.click();
  });
}

// History
async function loadHistory(): Promise<void> {
  const entries = await ipc.getHistory();
  renderHistory(entries);
}

function setupHistory(): void {
  document.getElementById('btn-clear-history')?.addEventListener('click', async () => {
    await ipc.clearHistory();
    renderHistory([]);
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
    const themeEl = document.getElementById('setting-theme') as HTMLSelectElement;
    const animationsEl = document.getElementById('setting-animations') as HTMLInputElement;


    const deleteSourcesEl = document.getElementById('setting-delete-sources') as HTMLInputElement;
    const overwriteBehaviorEl = document.getElementById('setting-overwrite-behavior') as HTMLSelectElement;

    await ipc.saveSettings({
      compressionLevel: Number(levelEl?.value ?? 6),
      outputDirectory: outputDirEl?.value || '',
      autoOpenResultFolder: autoOpenEl?.checked ?? true,
      theme: (themeEl?.value as 'light' | 'dark' | 'system') || 'system',
      animationsEnabled: animationsEl?.checked ?? true,

      deleteSourcesAfterProcess: deleteSourcesEl?.checked ?? false,
      overwriteBehavior: (overwriteBehaviorEl?.value as 'overwrite' | 'skip' | 'prompt') || 'prompt',
    });
  };

  levelEl?.addEventListener('change', saveSettings);
  document.getElementById('setting-output-dir')?.addEventListener('change', saveSettings);
  document.getElementById('setting-auto-open')?.addEventListener('change', saveSettings);
  document.getElementById('setting-theme')?.addEventListener('change', async () => {
    const themeEl = document.getElementById('setting-theme') as HTMLSelectElement;
    const theme = (themeEl?.value as 'light' | 'dark' | 'system') || 'system';
    applyTheme(theme);
    await saveSettings();
  });
  document.getElementById('setting-animations')?.addEventListener('change', saveSettings);
  

  document.getElementById('setting-delete-sources')?.addEventListener('change', saveSettings);
  document.getElementById('setting-overwrite-behavior')?.addEventListener('change', saveSettings);
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
  const zone = document.getElementById('drop-zone-extract');
  zone?.addEventListener('click', () => {
    ipc.selectFiles().then((paths) => {
      const archive = paths.find((p) => /\.(zip|7z|rar|tar|gz|tgz)$/i.test(p));
      if (archive) setSingleFile('extract-files-list', archive);
    });
  });
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
  setupHistory();
  setupSettings();
  setupAbout();
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
