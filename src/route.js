/** The longest fragment that is looked at. A link with more than this is not one the page made. */
const MAX_HASH_LENGTH = 200;

/**
 * The build chosen by the address's fragment (`#build=older`), or undefined. The fragment is chosen by whoever made
 * the link, so this is strict: only a build in `known` is ever returned (compared exactly, and never a name inherited
 * from Object), and anything else, including text that is too long or not text at all, is ignored.
 */
export function profileFromHash(hash, known) {
  if (typeof hash !== 'string' || hash.length > MAX_HASH_LENGTH) return undefined;
  const wanted = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash).get('build');
  return wanted !== null && Object.hasOwn(known, wanted) ? wanted : undefined;
}

/** The fragment that records a choice of build: none for the default (a clean address), else `#build=name`. */
export function hashForProfile(profile, defaultProfile) {
  return profile === defaultProfile ? '' : `#build=${encodeURIComponent(profile)}`;
}
