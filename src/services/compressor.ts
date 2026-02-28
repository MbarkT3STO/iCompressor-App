/**
 * Compressor Service
 * Handles compression and extraction for zip, 7z, rar, tar, tar.gz
 * Uses archiver for creation (zip, tar, tar.gz), node-7z for 7z and all extraction
 */

import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import Seven from 'node-7z';
import sevenBin from '7zip-bin';
import { EventEmitter } from 'events';

export type ProgressCallback = (data: { percent: number; status: string }) => void;

const SUPPORTED_EXTRACT = ['.zip', '.7z', '.rar', '.tar', '.tar.gz', '.tgz'];
const SUPPORTED_COMPRESS = ['.zip', '.7z', '.tar', '.tar.gz'];

function getFormatFromPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'targz';
  if (lower.endsWith('.7z')) return '7z';
  if (lower.endsWith('.zip')) return 'zip';
  if (lower.endsWith('.rar')) return 'rar';
  if (lower.endsWith('.tar')) return 'tar';
  return '';
}

function inferOutputPath(sources: string[], format: string, outputDir: string): string {
  const base = path.basename(sources[0]);
  const name = path.basename(base, path.extname(base));
  const ext = format === 'targz' ? 'tar.gz' : format === '7z' ? '7z' : format;
  return path.join(outputDir || path.dirname(sources[0]), `${name}.${ext}`);
}

export interface CompressPayload {
  sources: string[];
  outputPath: string;
  format: string;
  level: number;
  password?: string;
}

export interface CompressResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

export interface ExtractPayload {
  archivePath: string;
  outputDir: string;
  format?: string;
  password?: string;
}

export interface ExtractResult {
  success: boolean;
  outputDir?: string;
  error?: string;
}

export class CompressorService extends EventEmitter {
  private onProgressHandler: ProgressCallback | null = null;

  onProgress(cb: ProgressCallback): void {
    this.onProgressHandler = cb;
  }

  private progress(percent: number, status: string): void {
    if (this.onProgressHandler) {
      this.onProgressHandler({ percent, status });
    }
  }

  async compress(payload: CompressPayload): Promise<CompressResult> {
    const { sources, outputPath, format, level } = payload;

    if (!sources.length) {
      return { success: false, error: 'No sources selected' };
    }

    const ext = format === 'targz' ? 'tar.gz' : format;

    if (payload.password && (format === 'tar' || format === 'targz')) {
      return { success: false, error: 'TAR/TAR.GZ formats do not support password encryption. Please use ZIP or 7Z.' };
    }

    // Use node-7z for 7z, and for password-protected zips (archiver doesn't support encryption)
    if (format === '7z' || (format === 'zip' && payload.password)) {
      return this.compress7z(sources, outputPath, level, payload.password);
    }

    const archiverFormat = format as 'zip' | 'tar' | 'targz';
    return this.compressWithArchiver(sources, outputPath, archiverFormat, level);
  }

  private async compressWithArchiver(
    sources: string[],
    outputPath: string,
    format: 'zip' | 'tar' | 'targz',
    level: number
  ): Promise<CompressResult> {
    return new Promise((resolve) => {
      const archiveFormat = format === 'targz' ? 'tar' : format;
      const gzip = format === 'targz';

      const output = fs.createWriteStream(outputPath);
      const archive = archiver(
        archiveFormat,
        gzip ? { gzip: { level: Math.min(9, Math.max(0, level)) } } : { zlib: { level: Math.min(9, Math.max(0, level)) } }
      );

      output.on('close', () => {
        this.progress(100, 'Complete');
        resolve({ success: true, outputPath });
      });

      archive.on('error', (err: Error) => {
        this.progress(0, '');
        resolve({ success: false, error: err.message });
      });

      archive.on('progress', (p: { entries: { total: number; processed: number }; fs: { processedBytes: number } }) => {
        const total = p.entries?.total ?? 1;
        const processed = p.entries?.processed ?? 0;
        const percent = total > 0 ? Math.min(99, Math.round((processed / total) * 100)) : 0;
        this.progress(percent, `Compressing... ${percent}%`);
      });

      archive.pipe(output);

      sources.forEach((src) => {
        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
          archive.directory(src, path.basename(src));
        } else {
          archive.file(src, { name: path.basename(src) });
        }
      });

      archive.finalize();
    });
  }

  private async compress7z(sources: string[], outputPath: string, level: number, password?: string): Promise<CompressResult> {
    return new Promise((resolve) => {
      const pathTo7z = sevenBin.path7za;
      const args = sources.map((s) => path.resolve(s));

      const extractOptions: any = {
        $bin: pathTo7z,
        recursive: true,
        $progress: true,
      };

      if (password) {
        extractOptions.password = password;
      }

      const stream = Seven.add(outputPath, args, extractOptions);

      stream.on('end', () => {
        this.progress(100, 'Complete');
        resolve({ success: true, outputPath });
      });

      stream.on('error', (err: Error) => {
        this.progress(0, '');
        resolve({ success: false, error: err.message });
      });

      stream.on('progress', (p: { percent?: number }) => {
        const percent = p.percent ?? 0;
        this.progress(percent, `Compressing... ${percent}%`);
      });
    });
  }

  async extract(payload: ExtractPayload): Promise<ExtractResult> {
    const { archivePath, outputDir } = payload;

    if (!fs.existsSync(archivePath)) {
      return { success: false, error: 'Archive not found' };
    }

    const format = getFormatFromPath(archivePath);
    if (!format) {
      return { success: false, error: 'Unsupported archive format' };
    }

    const pathTo7z = sevenBin.path7za;

    return new Promise((resolve) => {
      const extractOptions: any = {
        $bin: pathTo7z,
        $progress: true,
      };

      if (payload.password) {
        extractOptions.password = payload.password;
      }

      const stream = Seven.extractFull(archivePath, outputDir, extractOptions);

      stream.on('end', () => {
        this.progress(100, 'Complete');
        resolve({ success: true, outputDir });
      });

      stream.on('error', (err: Error) => {
        this.progress(0, '');
        resolve({ success: false, error: err.message });
      });

      stream.on('progress', (p: { percent?: number }) => {
        const percent = p.percent ?? 0;
        this.progress(percent, `Extracting... ${percent}%`);
      });
    });
  }

  async test(archivePath: string, password?: string): Promise<{ success: boolean; error?: string }> {
    if (!fs.existsSync(archivePath)) {
      return { success: false, error: 'Archive not found' };
    }

    const pathTo7z = sevenBin.path7za;

    return new Promise((resolve) => {
      const { execFile } = require('child_process');
      const args = ['l', '-slt'];
      if (password) {
        args.push(`-p${password}`);
      }
      args.push(archivePath);

      execFile(pathTo7z, args, (error: any, stdout: string, stderr: string) => {
        if (error) {
          // If the test command actually failed (e.g., wrong password supplied, or file is bad)
          // `7za` often outputs "Wrong password" or similar in stdout/stderr
          const outStr = (stdout + stderr).toLowerCase();
          if (outStr.includes('wrong password') || outStr.includes('cannot open encrypted archive') || outStr.includes('data error')) {
            resolve({ success: false, error: 'Wrong password' });
          } else {
            resolve({ success: false, error: error.message });
          }
          return;
        }

        // If no password was provided but stdout shows Encrypted = +, it requires a password
        if (!password && stdout.includes('Encrypted = +')) {
          resolve({ success: false, error: 'Password required' });
          return;
        }

        resolve({ success: true });
      });
    });
  }

  static isExtractable(filePath: string): boolean {
    const fmt = getFormatFromPath(filePath);
    return ['zip', '7z', 'rar', 'tar', 'targz'].includes(fmt);
  }

  static isCompressible(): boolean {
    return true;
  }
}
