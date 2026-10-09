const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (count, unit) => `${count} ${unit}${count === 1 ? '' : 's'} ago`;

/**
 * How long ago something happened, in words, for the "Last check" row. `timestamp` and `now` are milliseconds
 * since the Unix epoch; no timestamp means it has not happened. Seconds up to a minute, then minutes, hours and
 * days (rounded down), so a long outage reads "3 minutes ago" and not "187 seconds ago".
 */
export function ago(timestamp, now) {
  if (timestamp === undefined) return 'never';
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 2) return 'just now';
  if (seconds < MINUTE) return plural(seconds, 'second');
  if (seconds < HOUR) return plural(Math.floor(seconds / MINUTE), 'minute');
  if (seconds < DAY) return plural(Math.floor(seconds / HOUR), 'hour');
  return plural(Math.floor(seconds / DAY), 'day');
}

const NETWORKS = {
  'Test SDF Network ; September 2015': 'Stellar testnet',
  'Public Global Stellar Network ; September 2015': 'Stellar mainnet',
  'Test SDF Future Network ; October 2022': 'Stellar futurenet',
};

/**
 * The network the page watches, in words, for the "Network" row: its name when the passphrase is a well-known one,
 * the passphrase itself when it is not, and the host (never the path, query or credentials) of the RPC it asks.
 * An RPC address can carry an API key, so only `host` is ever shown.
 */
export function describeNetwork(passphrase, rpcUrl) {
  const name = Object.hasOwn(NETWORKS, passphrase) ? NETWORKS[passphrase] : `a network called "${passphrase}"`;
  let host;
  try {
    host = new URL(rpcUrl).host;
  } catch {
    host = '';
  }
  return host === '' ? name : `${name} (${host})`;
}

/**
 * A long hash as its first and last 8 characters ("a7a82511…4cf42509"), enough to recognise it. Anything that is
 * not text gives an empty string, and a value of 16 characters or fewer is left whole.
 */
export function shortHash(hash) {
  if (typeof hash !== 'string') return '';
  return hash.length <= 16 ? hash : `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

/**
 * The rows of the "What this build supports" list: label, full hash, short hash, and whether that build is the one
 * the contract is running now. `supported` is the config's list; `liveHash` is what the guard last saw, if anything.
 */
export function describeSupported(supported, liveHash) {
  return (supported ?? []).map((version) => ({
    label: version.label ?? 'unlabelled',
    hash: version.wasmHash,
    short: shortHash(version.wasmHash),
    live: liveHash !== undefined && version.wasmHash === liveHash,
  }));
}
