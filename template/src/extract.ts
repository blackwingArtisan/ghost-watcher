/**
 * Extraction reads only the watched regions of a page and normalizes them. Everything else on the
 * page (ads, banners, timestamps, scripts) is ignored, which is the first line of defense against noise.
 */
import * as cheerio from 'cheerio';
import type { Cheerio, CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import { normalizeValue, normalizeWhitespace, textOf, type MaybeValue } from './normalize';
import type { FieldKind, ListSpec, Watch } from './watch';

export interface ListItem {
  /** Stable key built from the list's identity fields. */
  key: string;
  values: Record<string, MaybeValue>;
}

export interface Extraction {
  fields: Record<string, MaybeValue>;
  lists: Record<string, ListItem[]>;
}

interface ReadSpec {
  selector: string;
  kind: FieldKind;
  attribute?: string;
  pattern?: string;
}

function readRaw($: CheerioAPI, scope: Cheerio<AnyNode>, spec: ReadSpec): string | null {
  const element = spec.selector === ':self' ? scope.first() : scope.find(spec.selector).first();
  if (element.length === 0) return null;
  let raw: string | undefined;
  if (spec.attribute) {
    raw = element.attr(spec.attribute);
  } else {
    const clone = element.clone();
    clone.find('script, style, noscript, template').remove();
    raw = $(clone).text();
  }
  if (raw === undefined) return null;
  const text = normalizeWhitespace(raw);
  if (spec.pattern) {
    const match = new RegExp(spec.pattern, 'i').exec(text);
    if (!match) return null;
    return match[1] ?? match[0];
  }
  return text.length > 0 ? text : null;
}

function readValue($: CheerioAPI, scope: Cheerio<AnyNode>, spec: ReadSpec, baseUrl: string): MaybeValue {
  const raw = readRaw($, scope, spec);
  return raw === null ? null : normalizeValue(raw, spec.kind, baseUrl);
}

function itemKey(list: ListSpec, values: Record<string, MaybeValue>): string {
  return list.identity.map((name) => textOf(values[name] ?? null).toLowerCase()).join(' | ');
}

/** Extracts every watched field and list from an HTML document. Pure: same HTML in, same values out. */
export function extract(html: string, watch: Pick<Watch, 'fields' | 'lists' | 'url'>): Extraction {
  const $ = cheerio.load(html);
  const root = $.root();
  const fields: Record<string, MaybeValue> = {};
  for (const field of watch.fields) {
    fields[field.name] = readValue($, root, field, watch.url);
  }

  const lists: Record<string, ListItem[]> = {};
  for (const list of watch.lists) {
    const seen = new Set<string>();
    const items: ListItem[] = [];
    $(list.itemSelector).each((_, element) => {
      const scope = $(element);
      const values: Record<string, MaybeValue> = {};
      for (const [name, spec] of Object.entries(list.fields)) {
        values[name] = readValue($, scope, spec, watch.url);
      }
      const key = itemKey(list, values);
      if (key.replace(/[ |]/g, '') === '' || seen.has(key)) return;
      seen.add(key);
      items.push({ key, values });
    });
    lists[list.name] = items;
  }
  return { fields, lists };
}
