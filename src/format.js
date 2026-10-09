/**
 * How long ago something happened, in words, for the "Last check" row. `timestamp` and `now` are milliseconds
 * since the Unix epoch; no timestamp means it has not happened.
 */
export function ago(timestamp, now) {
  if (timestamp === undefined) return 'never';
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  return seconds < 2 ? 'just now' : `${seconds} seconds ago`;
}
