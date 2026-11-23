/**
 * Readable text: what a person reads on a page. Headings, paragraphs, list items and quotes of the main
 * content, in order, with menus, banners, scripts, timestamps and ids left out. Pure and cheerio only:
 * no script runs and no browser is involved, so a page that renders in the browser reads as (almost) empty.
 */
import * as cheerio from 'cheerio';
import type { Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';
import { formatMinor, normalizeWhitespace, parseMoney } from './normalize';

/** The selector a field uses to watch a page's readable text. */
export const READABLE_SELECTOR = ':readable';

/** Readable text shorter than this means the page builds its content in the browser. */
export const MIN_READABLE_CHARS = 200;

const BOILERPLATE =
  'script, style, noscript, template, nav, header, footer, aside, form, iframe, svg, time, [datetime], [hidden], [aria-hidden="true"], ' +
  '[role="navigation"], [role="banner"], [role="contentinfo"], [role="dialog"], [role="complementary"]';

const NOISY_NAME = /cookie|consent|gdpr|timestamp|generated|request-?id|session|trace|advert|sponsor|promo|\bad-|\bads\b|banner/i;

/** A line that only states a stamp or an id. */
const STAMP_LINE =
  /^(page generated|generated|last updated|last modified|updated|request id|request|session|trace id|build)\b[^.]{0,80}$/i;
const BARE_ID_OR_DATE = /^[\w:./+-]{0,40}\d[\w:./+-]{0,40}$/;

const BLOCKS = 'h1, h2, h3, h4, h5, h6, p, li, blockquote';

const MONEY = /[$£€]\s?\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*(?:\.\d{1,2})?\s?(?:USD|dollars)\b/g;

/** Writes each amount of money the one way the money normaliser does ("$ 200.00" and "$200" agree). */
function canonicalMoney(text: string): string {
  return text.replace(MONEY, (found) => {
    const money = parseMoney(found);
    return money ? formatMinor(money.amountMinor, money.currency) : found;
  });
}

/** The readable text of an HTML document, one block per line joined by a space. */
export function readableText(html: string): string {
  const $ = cheerio.load(html);
  $(BOILERPLATE).remove();
  $('[class], [id]').each((_, element) => {
    const el = $(element);
    if (NOISY_NAME.test(`${el.attr('class') ?? ''} ${el.attr('id') ?? ''}`)) el.remove();
  });
  let root: Cheerio<AnyNode> = $('main').first();
  if (root.length === 0) root = $('[role="main"]').first();
  if (root.length === 0) root = $('article').first();
  if (root.length === 0) root = $('body').first();
  if (root.length === 0) root = $.root();

  const lines: string[] = [];
  root.find(BLOCKS).each((_, element) => {
    const el = $(element);
    if (el.find(BLOCKS).length > 0) return;
    const text = normalizeWhitespace(el.text());
    if (text === '' || STAMP_LINE.test(text) || BARE_ID_OR_DATE.test(text)) return;
    const needsStop = el.is('h1, h2, h3, h4, h5, h6, li');
    lines.push(canonicalMoney(needsStop && !/[.!?:;]$/.test(text) ? `${text}.` : text));
  });
  return lines.join(' ');
}

/** The first `h1`, then the `title`, of a page: a name for its ghost. Empty when there is neither. */
export function pageTitle(html: string): string {
  const $ = cheerio.load(html);
  return normalizeWhitespace($('h1').first().text()) || normalizeWhitespace($('title').first().text());
}
