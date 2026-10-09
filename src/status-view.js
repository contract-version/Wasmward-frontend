/**
 * How a status is shown in the badge: its text and a tone for the colour (`supported`, `waiting` or `blocked`).
 *
 * Pass the *effective* status, the one `guard.health()` reports, which already counts a check that is too old as
 * `stale`. The status in `guard.status()` is only what the last check found, so a stalled poll would still read
 * "supported" there while writes are blocked.
 *
 * Only `supported` is green and only `pending` is "waiting". Everything else, including a status this page has
 * never heard of, is `blocked`: an unknown state must not look fine.
 */
export function statusView(status) {
  if (status === 'supported') return { text: status, tone: 'supported' };
  if (status === 'pending') return { text: status, tone: 'waiting' };
  return { text: String(status), tone: 'blocked' };
}

/** Shown while a new guard is starting, before its first check. */
export const CHECKING = { text: 'checking', tone: 'waiting' };

/** Shown when the guard could not start at all, for example because the RPC serves a different network. */
export const CANNOT_CHECK = { text: 'cannot check', tone: 'blocked' };
