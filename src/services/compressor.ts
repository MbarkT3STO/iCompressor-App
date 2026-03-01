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

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
}

export interface ArchiveFileEntry extends FileEntry {
  packedSize?: number;
  modified?: string; // e.g. "2023-10-25 14:30:00"
}

export type ProgressCallback = (data: { percent: number; status: string }) => void;

const SUPPORTED_EXTRACT = ['.zip', '.7z', '.rar', '.tar', '.tar.gz', '.tgz'];
const SUPPORTED_COMPRESS = ['.zip', '.7z', '.tar', '.tar.gz'];

function getFormatFromPath(filePath: string): string {
  let lower = filePath.toLowerCase();
  
  // Strip split volume extension (e.g., .001, .002)
  lower = lower.replace(/\.\d{3,}$/, '');

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
  splitVolumeSize?: string;
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

    // Use node-7z for 7z, password-protected zips, and any split volumes
    if (format === '7z' || (format === 'zip' && payload.password) || payload.splitVolumeSize) {
      return this.compress7z(sources, outputPath, level, payload.password, payload.splitVolumeSize);
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

  private async compress7z(sources: string[], outputPath: string, level: number, password?: string, splitVolumeSize?: string): Promise<CompressResult> {
    return new Promise((resolve) => {
      const pathTo7z = sevenBin.path7za;
      const args = sources.map((s) => path.resolve(s));

      // ── Maximum Compression Strategy ────────────────────────────────────────
      const clampedLevel = Math.min(9, Math.max(0, level));
      const rawFlags = [
        `-mx=${clampedLevel}`     // Compression level
      ];

      if (splitVolumeSize) {
        rawFlags.push(`-v${splitVolumeSize}`);
      }

      const is7z = outputPath.toLowerCase().endsWith('.7z');

      if (is7z) {
        // For 7z format only: we use LZMA2, solid mode, and large dictionary
        rawFlags.push('-m0=lzma2', '-ms=on');
        
        // Dictionary size optimization
        if (clampedLevel >= 9) rawFlags.push('-md=64m');
        else if (clampedLevel >= 7) rawFlags.push('-md=32m');
        else if (clampedLevel >= 5) rawFlags.push('-md=16m');
        else rawFlags.push('-md=4m');

        // BCJ filter for executables if no password
        if (!password) {
          rawFlags.push('-mf=BCJ');
        }
      } else {
        // For zip files, force UTF-8 for filenames
        rawFlags.push('-mcu=on');
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
          if (splitVolumeSize) {
            try {
              const outDir = path.dirname(outputPath);
              const baseName = path.basename(outputPath);
              const files = fs.readdirSync(outDir).filter(f => f.startsWith(baseName + '.00'));
              for (const f of files) {
                const match = f.match(/(.*)\.(\w{2,4})\.(\d{3,})$/i);
                if (match) {
                  const newName = `${match[1]}.${match[3]}.${match[2]}`;
                  fs.renameSync(path.join(outDir, f), path.join(outDir, newName));
                }
              }
            } catch (err) {
              console.error('Error renaming split volumes:', err);
            }
          }
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
      stream.on('error', (err: any) => {
        finish(false, err.message || err.stderr || 'Compression failed');
      });
    });
  }



  async extract(payload: ExtractPayload): Promise<ExtractResult> {
    const { archivePath, outputDir } = payload;

    if (!fs.existsSync(archivePath)) {
      return { success: false, error: 'Archive not found' };
    }

    return this.withSplitWorkaround(archivePath, async (actualPath) => {
      const format = getFormatFromPath(actualPath);
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

        const stream = Seven.extractFull(actualPath, outputDir, extractOptions);

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
    });
  }

  private async withSplitWorkaround<T>(
    archivePath: string, 
    operation: (actualPath: string) => Promise<T>
  ): Promise<T> {
    const match = archivePath.match(/(.*)\.(\d{3,})\.(\w{2,4})$/i);
    if (!match) return operation(archivePath);
    
    const baseStr = match[1];
    const seqNum = match[2];
    const ext = match[3];
    const outDir = path.dirname(archivePath);
    const tempDir = path.join(outDir, `.ic-tmp-${Date.now()}`);
    
    fs.mkdirSync(tempDir, { recursive: true });
    
    try {
      const files = fs.readdirSync(outDir).filter(f => {
        const fMatch = f.match(/(.*)\.(\d{3,})\.(\w{2,4})$/i);
        return fMatch && fMatch[1] === path.basename(baseStr) && fMatch[3].toLowerCase() === ext.toLowerCase();
      });
      
      for (const f of files) {
        const parts = f.match(/(.*)\.(\d{3,})\.(\w{2,4})$/i);
        if (parts) {
          const original7zName = `${parts[1]}.${parts[3]}.${parts[2]}`;
          try {
            fs.linkSync(path.join(outDir, f), path.join(tempDir, original7zName));
          } catch (e) {}
        }
      }
      
      const targetArchive = path.join(tempDir, `${path.basename(baseStr)}.${ext}.${seqNum}`);
      return await operation(targetArchive);
    } finally {
      if (fs.existsSync(tempDir)) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
      }
    }
  }

  async test(archivePath: string, password?: string): Promise<{ success: boolean; error?: string }> {
    if (!fs.existsSync(archivePath)) {
      return { success: false, error: 'Archive not found' };
    }

    return this.withSplitWorkaround(archivePath, async (actualPath) => {
      const pathTo7z = sevenBin.path7za;

      return new Promise((resolve) => {
        const { execFile } = require('child_process');
        const args = ['l', '-slt'];
        if (password) {
          args.push(`-p${password}`);
        }
        args.push(actualPath);

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
    });
  }

  async listArchive(archivePath: string, password?: string): Promise<{ success: boolean; files?: ArchiveFileEntry[]; error?: string }> {
    if (!fs.existsSync(archivePath)) {
      return { success: false, error: 'Archive not found' };
    }

    return this.withSplitWorkaround(archivePath, async (actualPath) => {
      const pathTo7z = sevenBin.path7za;

      return new Promise((resolve) => {
        const { execFile } = require('child_process');
        // -slt outputs data in a machine-readable block format (Path = ..., Size = ...)
        const args = ['l', '-slt'];
        if (password) args.push(`-p${password}`);
        args.push(actualPath);

        execFile(pathTo7z, args, (error: any, stdout: string, stderr: string) => {
          if (error) {
            const outStr = (stdout + stderr).toLowerCase();
            if (outStr.includes('wrong password') || outStr.includes('cannot open encrypted archive')) {
              resolve({ success: false, error: 'Wrong password or encrypted archive' });
            } else {
              resolve({ success: false, error: error.message });
            }
            return;
          }

          const files: ArchiveFileEntry[] = [];
          
          // Parse the -slt output blocks
          // Data usually starts after a line containing "----------"
          const blocks = stdout.split(/\r?\n\r?\n/);
          
          for (const block of blocks) {
            if (!block.includes('Path = ')) continue;
            
            const lines = block.split(/\r?\n/);
            let pathValue = '';
            let size = 0;
            let packedSize = 0;
            let isDirectory = false;
            let modified = '';

            for (const line of lines) {
              const eqIdx = line.indexOf('=');
              if (eqIdx === -1) continue;
              
              const key = line.substring(0, eqIdx).trim();
              const value = line.substring(eqIdx + 1).trim();

              if (key === 'Path') pathValue = value;
              else if (key === 'Size') size = parseInt(value, 10) || 0;
              else if (key === 'Packed Size') packedSize = parseInt(value, 10) || 0;
              else if (key === 'Modified') modified = value;
              else if (key === 'Folder') isDirectory = value === '+';
              // Often attributes line dictates folder if Folder field isn't explicitly +
              else if (key === 'Attributes' && value.startsWith('D')) isDirectory = true;
            }

            // Skip the archive root itself which 7-Zip sometimes lists first
            if (pathValue && pathValue !== path.basename(actualPath) && !block.includes('Type = ')) {
              files.push({
                name: path.basename(pathValue),
                path: pathValue,
                isDirectory,
                size,
                packedSize,
                modified
              });
            }
          }

          resolve({ success: true, files });
        });
      });
    });
  }



  async extractSingleFile(
    archivePath: string, 
    internalPath: string, 
    outputDir: string, 
    password?: string
  ): Promise<CompressResult> {
    return this.withSplitWorkaround(archivePath, async (actualPath) => {
      return new Promise((resolve) => {
        const pathTo7z = sevenBin.path7za;
        const options: any = {
          $bin: pathTo7z,
          $cherryPick: [internalPath],
        };

        if (password) {
          options.password = password;
        }

        // 'extract' in node-7z uses 'e' internally, dropping directory paths, 
        // which is ideal for single-file drag and drop to temp
        const stream = Seven.extract(actualPath, outputDir, options);

        let isResolved = false;
        const finish = (success: boolean, error?: string) => {
          if (isResolved) return;
          isResolved = true;
          if (success) {
            resolve({ success: true, outputPath: path.join(outputDir, path.basename(internalPath)) });
          } else {
            resolve({ success: false, error });
          }
        };

        stream.on('end', () => finish(true));
        stream.on('error', (err: any) => finish(false, err.message));
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
