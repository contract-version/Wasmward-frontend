// Keeps the hash of the inline stylesheet in index.html's Content-Security-Policy current.
//
//   node update-csp.mjs            rewrite the hash in index.html if the stylesheet changed
//   node update-csp.mjs --check    only report: exit 1 if the hash is stale, change nothing
//
// The policy allows the one inline <style> by its SHA-256, so editing the CSS without updating the hash would
// leave the page unstyled in a browser. test/csp.test.js also fails when they differ.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** The policy text of the CSP meta tag in `html`, and the match that holds it. Throws if there is not exactly one. */
function policyIn(html) {
  const tags = [...html.matchAll(/(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/gi)];
  if (tags.length !== 1) throw new Error(`expected one Content-Security-Policy meta tag, found ${tags.length}`);
  return tags[0];
}

/** The 'sha256-...' source for the page's one inline stylesheet. Throws if there is not exactly one. */
export function styleHash(html) {
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)];
  if (styles.length !== 1) throw new Error(`expected one inline <style>, found ${styles.length}`);
  return `'sha256-${createHash('sha256').update(styles[0][1]).digest('base64')}'`;
}

/** `html` with the style-src of its policy set to the current hash of the stylesheet. */
export function withCurrentHash(html) {
  const tag = policyIn(html);
  const [whole, before, policy, after] = tag;
  if (!/(^|;)\s*style-src\s/.test(policy)) throw new Error('the policy has no style-src directive to update');
  const updated = policy.replace(/(^|;)(\s*)style-src\s[^;]*/, `$1$2style-src ${styleHash(html)}`);
  return html.replace(whole, `${before}${updated}${after}`);
}

function main(argv) {
  const check = argv.includes('--check');
  const unknown = argv.filter((word) => word !== '--check');
  if (unknown.length > 0) {
    console.error(`error: unknown argument ${unknown[0]}`);
    return 2;
  }
  let html;
  let updated;
  try {
    html = readFileSync('index.html', 'utf8');
    updated = withCurrentHash(html);
  } catch (error) {
    console.error(`error: ${error.message}`);
    return 2;
  }
  if (updated === html) {
    console.log('The stylesheet hash in index.html is current.');
    return 0;
  }
  if (check) {
    console.error('The stylesheet hash in index.html is stale. Run: node update-csp.mjs');
    return 1;
  }
  writeFileSync('index.html', updated);
  console.log('Updated the stylesheet hash in index.html.');
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
