import { existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { dirname, extname } from "node:path";

export interface RotatingFileLoggerOptions {
  /** Prefixed onto every log line, e.g. "astro-latex-compile" */
  identifier: string;
  /** Path to the active log file, e.g. /path/to/file.log */
  filePath: string;
  /** Rotate once the active log file's size reaches or exceeds this many bytes */
  maxSizeBytes: number;
  /** Number of rotated backups to retain (file-1.log .. file-N.log). Oldest beyond this is deleted. */
  backupCount: number;
}

function rotatedPath(filePath: string, index: number): string {
  const extension = extname(filePath);
  const pathWithoutExtension = filePath.slice(
    0,
    filePath.length - extension.length,
  );
  return `${pathWithoutExtension}-${index}${extension}`;
}

function formatTimestamp(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const timePart = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())},${pad(date.getMilliseconds(), 3)}`;
  return `${datePart} ${timePart}`;
}

function rotate(options: RotatingFileLoggerOptions): void {
  const { filePath, backupCount } = options;

  const oldestPath = rotatedPath(filePath, backupCount);
  if (existsSync(oldestPath)) {
    rmSync(oldestPath);
  }

  for (let index = backupCount - 1; index >= 1; index--) {
    const source = rotatedPath(filePath, index);
    if (existsSync(source)) {
      renameSync(source, rotatedPath(filePath, index + 1));
    }
  }

  if (backupCount >= 1) {
    renameSync(filePath, rotatedPath(filePath, 1));
  } else {
    rmSync(filePath);
  }
}

export class RotatingFileLogger {
  private readonly options: RotatingFileLoggerOptions;

  constructor(options: RotatingFileLoggerOptions) {
    this.options = options;
    mkdirSync(dirname(options.filePath), { recursive: true });
  }

  async write(message: string): Promise<void> {
    const { filePath, maxSizeBytes, identifier } = this.options;
    const line = `[${identifier}] ${formatTimestamp(new Date())} ${message}${message.endsWith("\n") ? "" : "\n"}`;

    if (existsSync(filePath) && statSync(filePath).size >= maxSizeBytes) {
      rotate(this.options);
    }

    await appendFile(filePath, line);
  }
}
