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

      // ── Total Bytes Calculation ─────────────────────────────────────────────
      const getSize = (p: string): number => {
        try {
          const st = fs.statSync(p);
          if (st.isDirectory()) {
            return fs.readdirSync(p).reduce((sum, f) => sum + getSize(path.join(p, f)), 0);
          }
          return st.size;
        } catch { return 0; }
      };
      const totalBytes = Math.max(1, sources.reduce((s, src) => s + getSize(src), 0));

      const output = fs.createWriteStream(outputPath);
      const archive = archiver(
        archiveFormat,
        gzip
          ? { gzip: { level: Math.min(9, Math.max(0, level)) } }
          : { zlib: { level: Math.min(9, Math.max(0, level)) } }
      );

      let lastPercent = 0;
      let isResolved = false;

      const finish = (success: boolean, error?: string) => {
        if (isResolved) return;
        isResolved = true;
        if (success) {
          this.progress(100, 'Complete');
          resolve({ success: true, outputPath });
        } else {
          this.progress(0, '');
          resolve({ success: false, error: error || 'Unknown error' });
        }
      };

      archive.on('progress', (data: any) => {
        const processed = data.fs?.processedBytes || 0;
        // Cap at 99 so we only hit 100 on 'close'
        const rawPct = Math.min(99, Math.round((processed / totalBytes) * 100));
        
        // Only broadcast if it actually changed to reduce IPC noise
        if (rawPct > lastPercent) {
          lastPercent = rawPct;
          this.progress(rawPct, `Compressing... ${rawPct}%`);
        }
      });

      output.on('close', () => finish(true));
      archive.on('error', (err: Error) => finish(false, err.message));
      output.on('error', (err: Error) => finish(false, err.message));

      archive.pipe(output);

      sources.forEach((src) => {
        const stat = fs.statSync(src);
        const name = path.basename(src);
        if (stat.isDirectory()) {
          archive.directory(src, name);
        } else {
          archive.file(src, { name });
        }
      });

      archive.finalize();
    });
  }

  private async compress7z(sources: string[], outputPath: string, level: number, password?: string): Promise<CompressResult> {
    return new Promise((resolve) => {
      const pathTo7z = sevenBin.path7za;
      const args = sources.map((s) => path.resolve(s));

      // ── Maximum Compression Strategy ────────────────────────────────────────
      // For high levels, we use LZMA2 with large dictionary sizes and solid mode.
      const clampedLevel = Math.min(9, Math.max(0, level));
      
      const rawFlags = [
        `-mx=${clampedLevel}`,    // Compression level
        '-m0=lzma2',             // Use LZMA2
        '-ms=on',                // Enable solid mode
      ];

      // Dictionary size optimization
      // Level 9: 64MB, Level 7+: 32MB, Level 5+: 16MB, others: 4MB
      if (clampedLevel >= 9) rawFlags.push('-md=64m');
      else if (clampedLevel >= 7) rawFlags.push('-md=32m');
      else if (clampedLevel >= 5) rawFlags.push('-md=16m');
      else rawFlags.push('-md=4m');

      // BCJ filter for executables if no password (password + filters can sometimes be prickly with 7za)
      if (!password) {
        rawFlags.push('-mf=BCJ');
      }

      const compressOptions: any = {
        $bin: pathTo7z,
        recursive: true,
        $progress: true,
        $raw: rawFlags,
      };

      if (password) {
        compressOptions.password = password;
      }

      const stream = Seven.add(outputPath, args, compressOptions);
      let isResolved = false;

      const finish = (success: boolean, error?: string) => {
        if (isResolved) return;
        isResolved = true;
        if (success) {
          this.progress(100, 'Complete');
          resolve({ success: true, outputPath });
        } else {
          // Verify if file was actually produced (7za sometimes warns on stderr)
          try {
            if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
              this.progress(100, 'Complete');
              return resolve({ success: true, outputPath });
            }
          } catch {}
          this.progress(0, '');
          resolve({ success: false, error: error || 'Compression failed' });
        }
      };

      stream.on('progress', (p: any) => {
        const pct = Math.min(99, p.percent || 0);
        this.progress(pct, `Compressing... ${pct}%`);
      });

      stream.on('end', () => finish(true));
      stream.on('error', (err: Error) => finish(false, err.message));
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

      // Smooth progress ticker: interpolates between node-7z's coarse ~10% jumps
      let targetPercent = 1;
      let currentPercent = 0;
      this.progress(1, 'Extracting... 1%');

      const ticker = setInterval(() => {
        if (currentPercent < targetPercent) {
          currentPercent = Math.min(targetPercent, currentPercent + Math.max(0.5, (targetPercent - currentPercent) * 0.3));
          const displayPct = Math.round(currentPercent);
          this.progress(displayPct, `Extracting... ${displayPct}%`);
        }
      }, 80);

      stream.on('progress', (p: { percent?: number }) => {
        const pct = p.percent ?? 0;
        if (pct > targetPercent) targetPercent = Math.min(99, pct);
      });

      stream.on('end', () => {
        clearInterval(ticker);
        this.progress(100, 'Complete');
        resolve({ success: true, outputDir });
      });

      stream.on('error', (err: any) => {
        clearInterval(ticker);
        this.progress(0, '');
        const detailedError = err.stderr ? String(err.stderr) : String(err.message);
        resolve({ success: false, error: detailedError });
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
