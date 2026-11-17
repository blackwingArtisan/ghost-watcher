/**
 * Amazon S3 adapter for the storage port. Opt-in with `GHOST_STORE=s3`; never constructed by tests or
 * by the default configuration. The client is injectable so the adapter can be exercised with a fake.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { assertKey, type BlobStore } from './blob';

/** The one method of `S3Client` this adapter uses. */
export interface S3Like {
  send: S3Client['send'];
}

export interface S3BlobStoreOptions {
  bucket: string;
  /** Key prefix inside the bucket, e.g. `ghost-watcher/bonus-watch/`. */
  prefix?: string;
  client?: S3Like;
  clientConfig?: S3ClientConfig;
}

export class S3BlobStore implements BlobStore {
  private readonly client: S3Like;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(options: S3BlobStoreOptions) {
    if (!options.bucket) throw new Error('S3BlobStore needs a bucket (set GHOST_S3_BUCKET).');
    this.bucket = options.bucket;
    this.prefix = options.prefix ?? '';
    this.client = options.client ?? new S3Client(options.clientConfig ?? {});
  }

  private objectKey(key: string): string {
    assertKey(key);
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<string | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }));
      return (await result.Body?.transformToString('utf-8')) ?? null;
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'NoSuchKey' || name === 'NotFound') return null;
      throw error;
    }
  }

  async put(key: string, body: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
        Body: body,
        ContentType: 'application/json; charset=utf-8',
      }),
    );
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: `${this.prefix}${prefix}`, ContinuationToken: token }),
      );
      for (const object of page.Contents ?? []) {
        if (object.Key) keys.push(object.Key.slice(this.prefix.length));
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return keys.sort();
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }));
  }
}
