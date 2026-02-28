/**
 * IPC channel constants - shared between main and preload
 * Duplicated here to avoid main importing from renderer path
 */

export const IPC_CHANNELS = {
  SELECT_FILES: 'dialog:select-files',
  SELECT_FOLDER: 'dialog:select-folder',
  SELECT_OUTPUT: 'dialog:select-output',
  COMPRESS: 'compressor:compress',
  EXTRACT: 'compressor:extract',
  TEST: 'compressor:test',
  LIST_ARCHIVE: 'compressor:list',
  GET_SETTINGS: 'settings:get',
  SAVE_SETTINGS: 'settings:save',

  GET_VERSION: 'app:version',
  OPEN_PATH: 'shell:open-path',
  READ_DIR: 'fs:read-dir',
  GET_HOME_DIR: 'fs:get-home-dir',
  OPEN_EXTERNAL: 'shell:open-external',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  OPEN_WITH: 'app:open-with',
} as const;

export const PROGRESS_CHANNEL = 'compressor:progress';
