/**
 * IPC channel constants - shared between main and preload
 * Duplicated here to avoid main importing from renderer path
 */

export const IPC_CHANNELS = {
  SELECT_FILES: 'dialog:select-files',
  SELECT_FOLDER: 'dialog:select-folder',
  SELECT_ARCHIVE: 'dialog:select-archive',
  SELECT_OUTPUT: 'dialog:select-output',
  COMPRESS: 'compressor:compress',
  EXTRACT: 'compressor:extract',
  TEST: 'compressor:test',
  LIST_ARCHIVE: 'compressor:list',
  EXTRACT_PREVIEW_FILE: 'compressor:preview',
  COMPUTE_CHECKSUM: 'compressor:checksum',
  CONVERT_ARCHIVE: 'compressor:convert',
  SELECTIVE_EXTRACT: 'compressor:selective-extract',

  GET_SETTINGS: 'settings:get',
  SAVE_SETTINGS: 'settings:save',
  GET_HISTORY: 'history:get',
  CLEAR_HISTORY: 'history:clear',


  GET_VERSION: 'app:version',
  OPEN_PATH: 'shell:open-path',
  SHOW_ITEM_IN_FOLDER: 'shell:show-item-in-folder',
  READ_DIR: 'fs:read-dir',
  FS_DELETE: 'fs:delete',
  FS_RENAME: 'fs:rename',
  FS_MKDIR: 'fs:mkdir',
  GET_HOME_DIR: 'fs:get-home-dir',
  GET_FOLDER_SIZE: 'fs:get-folder-size',
  OPEN_EXTERNAL: 'shell:open-external',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  OPEN_WITH: 'app:open-with',
  START_NATIVE_DRAG: 'app:start-native-drag',
  SET_TRAY_ENABLED: 'tray:set-enabled',
} as const;

export const PROGRESS_CHANNEL = 'compressor:progress';
