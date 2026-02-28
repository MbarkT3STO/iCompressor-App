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
  applySettingsToForm,
  applyTheme,
  renderBreadcrumbs,
  renderBrowseList
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
    const defaultName = basename(sources[0]) + '.' + ext;

    const settings = await ipc.getSettings();
    const outputDir = settings.outputDirectory || dirname(sources[0]);
    const defaultPath = outputDir ? `${outputDir}/${defaultName}` : defaultName;

    const outputPath = await ipc.selectOutput(defaultPath);
    if (!outputPath) return;

    const compressionLevel = settings.compressionLevel ?? 6;

    const unsub = ipc.onProgress((data) => {
      showGlobalProgress(data.percent, data.status, 'Compressing...');
    });

    const result = await ipc.compress({
      sources,
      outputPath,
      format,
      level: compressionLevel,
    });

    unsub();
    hideGlobalProgress();

    if (result.success) {
      showToast('toast-compress', `Compressed to ${basename(result.outputPath!)}`, 'success');
      setFileList('compress-files-list', []);
      if (settings.autoOpenResultFolder && result.outputPath) {
        ipc.openPath(result.outputPath);
      }
    } else {
      showToast('toast-compress', result.error || 'Compression failed', 'error');
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

  document.getElementById('btn-extract')?.addEventListener('click', async () => {
    const archivePath = getSingleFile('extract-files-list');
    const outputInput = document.getElementById('extract-output') as HTMLInputElement;
    const outputDir = outputInput?.getAttribute('data-path') || outputInput?.value;

    if (!archivePath) {
      showToast('toast-extract', 'Select an archive first', 'error');
      return;
    }
    if (!outputDir) {
      showToast('toast-extract', 'Select an output folder', 'error');
      return;
    }

    const unsub = ipc.onProgress((data) => {
      showGlobalProgress(data.percent, data.status, 'Extracting...');
    });

    const result = await ipc.extract({
      archivePath,
      outputDir,
    });

    unsub();
    hideGlobalProgress();

    if (result.success) {
      showToast('toast-extract', 'Extraction complete', 'success');
      setSingleFile('extract-files-list', null);
      outputInput.value = '';
      outputInput.removeAttribute('data-path');
      const s = await ipc.getSettings();
      if (s?.autoOpenResultFolder && result.outputDir) {
        ipc.openPath(result.outputDir);
      }
    } else {
      showToast('toast-extract', result.error || 'Extraction failed', 'error');
    }
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
    await ipc.saveSettings({
      compressionLevel: Number(levelEl?.value ?? 6),
      outputDirectory: outputDirEl?.value || '',
      autoOpenResultFolder: autoOpenEl?.checked ?? true,
      theme: (themeEl?.value as 'light' | 'dark' | 'system') || 'system',
      animationsEnabled: animationsEl?.checked ?? true,
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

// Init - call when DOM ready
export function init(): void {
  setupNavigation();
  setupBrowse();
  setupCompress();
  setupExtract();
  setupHistory();
  setupSettings();
  loadSettings();

  document.getElementById('btn-cancel-progress')?.addEventListener('click', () => {
    hideGlobalProgress();
    // Use active panel's toast container
    const activePanel = document.querySelector('.panel.active');
    const toastId = activePanel?.id === 'panel-extract' ? 'toast-extract' : 'toast-compress';
    showToast(toastId, 'Modal dismissed (Process continues in background)', 'success');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
