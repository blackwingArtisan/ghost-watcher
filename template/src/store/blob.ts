/**
 * BlobStore is the storage port: a tiny key/value interface over text documents. The ghost store
 * (snapshots, statuses, alert history) is written on top of it, so swapping local files for S3 is a
 * one-line configuration change.
 */
import { mkdir, readFile, readdir, rm, writeFile, rename } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

export interface BlobStore {
  get(key: string): Promise<string | null>;
  put(key: string, body: string): Promise<void>;
  /** Keys that start with `prefix`, sorted ascending. */
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

const KEY_PATTERN = /^[A-Za-z0-9._\-/]+$/;

export function assertKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.includes('..') || key.startsWith('/')) {
    throw new Error(`Invalid storage key: ${key}`);
  }
}

export class MemoryBlobStore implements BlobStore {
  private readonly data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    assertKey(key);
    return this.data.get(key) ?? null;
  }

  async put(key: string, body: string): Promise<void> {
    assertKey(key);
    this.data.set(key, body);
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.data.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

/** Stores each key as a file under `root`. Writes are atomic (write to a temp file, then rename). */
export class FileBlobStore implements BlobStore {
  constructor(readonly root: string) {}

  private path(key: string): string {
    assertKey(key);
    return join(this.root, ...key.split('/'));
  }

  async get(key: string): Promise<string | null> {
    try {
      return await readFile(this.path(key), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async put(key: string, body: string): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, body, 'utf8');
    await rename(temp, path);
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (!entry.name.endsWith('.tmp')) keys.push(relative(this.root, full).split(sep).join('/'));
      }
    };
    await walk(this.root);
    return keys.filter((key) => key.startsWith(prefix)).sort();
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}
