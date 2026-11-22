// The verify page: static HTML, shared by the dashboard server and the static demo build.

/** @param {string} text */
const esc = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * @param {{ appName: string; theme: Record<string, string> }} options
 * @returns {string}
 */
export function renderVerifyPage(options) {
  const themeVars = Object.entries(options.theme)
    .map(([k, v]) => `--${k}:${esc(v)};`)
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The ghost testifies · ${esc(options.appName)}</title>
<meta name="description" content="Check in your browser that a saved copy matches the SHA-256 your pact sealed.">
<link rel="stylesheet" href="/ui/style.css">
<style>:root{${themeVars}}</style>
</head>
<body class="verify-body">
<main class="verify" id="main">
  <p class="eyebrow">Ghost Watcher · ${esc(options.appName)}</p>
  <h1>The ghost testifies</h1>
  <p class="verify__lede">Your browser recomputes the SHA-256 of a saved copy and compares it with the one your pact sealed. Nothing is uploaded: the hashing happens on this device.</p>
  <form class="verify__form" id="verify-form" novalidate>
    <label for="verify-copy">Address of the saved copy</label>
    <input id="verify-copy" name="copy" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://…">
    <label for="verify-file">Or a snapshot file from this device</label>
    <input id="verify-file" name="file" type="file">
    <label for="verify-sha">Expected SHA-256</label>
    <input id="verify-sha" name="sha256" type="text" autocomplete="off" spellcheck="false" placeholder="64 hexadecimal characters">
    <p class="muted small" id="verify-sealed"></p>
    <button type="submit" class="btn btn--glow" id="verify-go">Check the hash</button>
  </form>
  <div class="verify__result" id="verify-result" role="status" aria-live="polite" data-state="idle"></div>
  <p class="muted small">The hash covers the snapshot file the ghost stored, so an archived web page will not match it. Upload the snapshot file, or use the address the dispute pack gave you.</p>
  <p><a class="btn btn--small" href="/">Back to ${esc(options.appName)}</a></p>
</main>
<script type="module" src="/ui/verify.js"></script>
</body>
</html>`;
}
