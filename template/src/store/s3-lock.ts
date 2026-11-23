/**
 * Object Lock adapter for sealed pacts. Opt-in (`GHOST_PACT_BUCKET` with `GHOST_STORE=s3`); never
 * built by the default configuration. Every write carries `ObjectLockMode: COMPLIANCE` and a
 * retain-until date taken from the injected clock, and a pact that exists is never overwritten or
 * deleted through this adapter. The S3 client comes from an injectable factory so tests pass fakes.
 */
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Clock } from '../clock';
import { assertKey, type BlobStore } from './blob';
import type { S3Like } from './s3';

const DAY_MS = 86_400_000;

export interface S3ObjectLockBlobStoreOptions {
  bucket: string;
  prefix?: string;
  /** Days each pact stays locked, counted from the write. A whole number of at least 1. */
  retentionDays: number;
  clock: Clock;
  /** Builds the S3 client on first use. Tests return a fake. */
  clientFactory?: () => S3Like;
  region?: string;
}

export class PactLockError extends Error {
  override name = 'PactLockError';
}

export class S3ObjectLockBlobStore implements BlobStore {
  private readonly bucket: string;
  private readonly prefix: string;
  private readonly retentionDays: number;
  private readonly clock: Clock;
  private readonly factory: () => S3Like;
  private client: S3Like | undefined;

  constructor(options: S3ObjectLockBlobStoreOptions) {
    if (!options.bucket) throw new Error('S3ObjectLockBlobStore needs a bucket (set GHOST_PACT_BUCKET).');
    if (!Number.isInteger(options.retentionDays) || options.retentionDays < 1) {
      throw new Error('The pact retention period must be a whole number of days, at least 1.');
    }
    this.bucket = options.bucket;
    this.prefix = options.prefix ?? '';
    this.retentionDays = options.retentionDays;
    this.clock = options.clock;
    this.factory = options.clientFactory ?? (() => new S3Client(options.region ? { region: options.region } : {}));
  }

  private s3(): S3Like {
    this.client ??= this.factory();
    return this.client;
  }

  private objectKey(key: string): string {
    assertKey(key);
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<string | null> {
    try {
      const result = await this.s3().send(new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }));
      return (await result.Body?.transformToString('utf-8')) ?? null;
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'NoSuchKey' || name === 'NotFound') return null;
      throw error;
    }
  }

  async put(key: string, body: string): Promise<void> {
    if ((await this.get(key)) !== null) throw new PactLockError(`The pact document ${key} is sealed and cannot be overwritten.`);
    const retainUntil = new Date(this.clock.now().getTime() + this.retentionDays * DAY_MS);
    await this.s3().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
        Body: body,
        ContentType: 'application/json; charset=utf-8',
        ObjectLockMode: 'COMPLIANCE',
        ObjectLockRetainUntilDate: retainUntil,
        IfNoneMatch: '*',
      }),
    );
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.s3().send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: `${this.prefix}${prefix}`, ContinuationToken: token }),
      );
      for (const object of page.Contents ?? []) if (object.Key) keys.push(object.Key.slice(this.prefix.length));
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return keys.sort();
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    throw new PactLockError(`The pact document ${key} is sealed and cannot be deleted.`);
  }
}

const PACT_PREFIX = 'pacts/';

/** Sends `pacts/` keys to the locked store and every other key to the ordinary one. */
export class PactRoutingBlobStore implements BlobStore {
  constructor(
    private readonly rest: BlobStore,
    private readonly pacts: BlobStore,
  ) {}

  private route(key: string): BlobStore {
    return key.startsWith(PACT_PREFIX) ? this.pacts : this.rest;
  }

  get(key: string): Promise<string | null> {
    return this.route(key).get(key);
  }

  put(key: string, body: string): Promise<void> {
    return this.route(key).put(key, body);
  }

  delete(key: string): Promise<void> {
    return this.route(key).delete(key);
  }

  async list(prefix: string): Promise<string[]> {
    if (prefix.startsWith(PACT_PREFIX)) return this.pacts.list(prefix);
    const rest = await this.rest.list(prefix);
    if (!PACT_PREFIX.startsWith(prefix)) return rest;
    return [...rest, ...(await this.pacts.list(prefix))].sort();
  }
}
