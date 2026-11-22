// Wires the verify page: reads the query, fetches or reads the bytes, hashes them with crypto.subtle.
import { compareHashes, fetchBytes, isSha256, normalizeHash, readVerifyQuery, sealedDate, sha256OfBytes } from './verify-core.js';

/** @param {string} id @returns {HTMLElement} */
const byId = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const copyInput = /** @type {HTMLInputElement} */ (byId('verify-copy'));
const fileInput = /** @type {HTMLInputElement} */ (byId('verify-file'));
const shaInput = /** @type {HTMLInputElement} */ (byId('verify-sha'));
const result = byId('verify-result');
const sealedNote = byId('verify-sealed');

const query = readVerifyQuery(location.search);
const sealed = sealedDate(query.sealed);
if (query.copy) copyInput.value = query.copy;
if (query.sha256) shaInput.value = query.sha256;
if (sealed) sealedNote.textContent = `The pact was sealed ${sealed}.`;

/** @param {string} text */
const esc = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** @param {'match' | 'mismatch' | 'problem'} state @param {string} headline @param {string} detail @param {string} [computed] */
function show(state, headline, detail, computed) {
  const expected = normalizeHash(shaInput.value);
  const hashes = computed === undefined ? '' : `<dl class="verify__hashes"><dt>Expected</dt><dd><code>${esc(expected)}</code></dd><dt>Computed here</dt><dd><code>${esc(computed)}</code></dd></dl>`;
  result.dataset.state = state;
  result.innerHTML = `<p class="verify__verdict">${esc(headline)}</p><p class="small">${esc(detail)}</p>${hashes}`;
}

/** @param {Uint8Array | ArrayBuffer} bytes */
async function judge(bytes) {
  const computed = await sha256OfBytes(bytes);
  const verdict = compareHashes(shaInput.value, computed);
  if (verdict.status === 'invalid') return show('problem', 'The expected hash is not valid', 'A SHA-256 is 64 hexadecimal characters (0 to 9 and a to f).', computed);
  if (verdict.status === 'match') {
    return show('match', sealed ? `Matches the pact sealed ${sealed}` : 'Matches the pact', 'These are the bytes the ghost sealed. Not one of them has changed.', computed);
  }
  return show('mismatch', 'Does not match', 'These bytes are not the ones the pact sealed. Check that you chose the snapshot file, not a web page.', computed);
}

async function run() {
  result.dataset.state = 'idle';
  if (!isSha256(shaInput.value)) return show('problem', 'The expected hash is not valid', 'A SHA-256 is 64 hexadecimal characters (0 to 9 and a to f).');
  const file = fileInput.files?.[0];
  if (file) return judge(await file.arrayBuffer());
  if (!copyInput.value.trim()) return show('problem', 'Nothing to check yet', 'Give the address of a saved copy, or choose a file.');
  const copy = await fetchBytes(window.fetch.bind(window), copyInput.value.trim(), location.href);
  if (copy.status === 'ok') return judge(copy.bytes);
  if (copy.status === 'http') return show('problem', `The address answered HTTP ${copy.code}`, 'Check the address, or choose the snapshot file from this device instead.');
  if (copy.status === 'refused') return show('problem', 'That address cannot be checked', copy.reason);
  return show('problem', 'Your browser could not fetch the saved copy', 'The site that holds it may not allow other pages to read it (CORS), or the network failed. Download the file, then choose it with the file upload above.');
}

byId('verify-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void run();
});
fileInput.addEventListener('change', () => {
  if (fileInput.files?.length) void run();
});
if (query.copy && query.sha256) void run();
