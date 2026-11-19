/**
 * Page-level change detection, used to count the noise a ghost ignores. A page's visible text
 * changes far more often than the parts anyone watches (timestamps, request ids, rotating banners),
 * so the runner records a fingerprint of the whole page and counts every visit where the page moved
 * but no rule cared. The same fingerprint is what a plain whole-page watcher would alert on.
 */
import * as cheerio from 'cheerio';

/** The text a visitor would see on the page: scripts and styles removed, whitespace collapsed. */
export function pageText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, template').remove();
  const body = $('body');
  const text = body.length > 0 ? body.text() : $.root().text();
  return text.replace(/\s+/g, ' ').trim();
}

/** A short FNV-1a hash of a string. */
export function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Fingerprint of a page's visible text. Two visits with the same fingerprint showed the same words. */
export function pageFingerprint(html: string): string {
  return hashText(pageText(html));
}
