/**
 * Given the count of messages already in the DB for a session and the full
 * incoming client history, work out how the DB needs to change to accept the
 * next turn.
 *
 * Cases (with dbCount = messages already persisted, n = incoming.length):
 * - Normal send       n = dbCount + 1 → trim 0, append the trailing new user msg + (later) the assistant msg
 * - Regenerate        n = dbCount - 1 → trim 1 (the old assistant), append 0 (the user msg is already there)
 * - Multi-trim        n < dbCount - 1 → trim (dbCount - n), append 0
 * - Multi-append      n > dbCount + 1 → trim 0, append the trailing (n - dbCount) messages
 * - Idle              n = dbCount     → trim 0, append 0
 *
 * Returns the trim count + the slice of `incoming` that is new (not yet in the DB).
 * The assistant response (if any) is appended separately by the caller in onFinish.
 */
export type Reconciliation<T> = {
  trimCount: number;
  newMessages: T[];
};

export function reconcileIncoming<T>(dbCount: number, incoming: readonly T[]): Reconciliation<T> {
  const trimCount = Math.max(0, dbCount - incoming.length);
  const newMessages = incoming.slice(dbCount - trimCount);
  return { trimCount, newMessages: [...newMessages] };
}
