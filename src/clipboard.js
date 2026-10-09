/**
 * Copies `text` to the clipboard and reports what happened as { ok, message }, for a short note on the page. It never
 * throws: a clipboard can be missing (an old browser, a page that is not secure), can refuse (no permission, no
 * recent click), or can fail in other ways, and each of those is a sentence, not an error page.
 *
 * `clipboard` is `navigator.clipboard`, passed in so it can be tested.
 */
export async function copyText(text, clipboard) {
  if (typeof text !== 'string' || text === '') return { ok: false, message: 'Nothing to copy.' };
  if (typeof clipboard?.writeText !== 'function') return { ok: false, message: 'Copying is not available in this browser.' };
  try {
    await clipboard.writeText(text);
    return { ok: true, message: 'Copied.' };
  } catch (error) {
    return { ok: false, message: `Could not copy: ${error instanceof Error ? error.message : String(error)}` };
  }
}
