export interface ActorInput {
  userId: string | null;
  anonymousId: string | null;
}

export interface Actor {
  actorKind: 'user' | 'anonymous';
  actorId: string;
}

/**
 * Returns null when neither identity is present — caller decides whether to
 * skip per-actor enforcement (Phase 3 default) or reject the request.
 *
 * Why null instead of throw: Phase 4 will wire a pac_anon cookie via middleware
 * to guarantee anonymousId is always present for anon traffic. Until that
 * lands, anonymous requests legitimately have both fields null, and throwing
 * would 500 every anon visit.
 */
export function resolveActor(input: ActorInput): Actor | null {
  if (input.userId) return { actorKind: 'user', actorId: input.userId };
  if (input.anonymousId) return { actorKind: 'anonymous', actorId: input.anonymousId };
  return null;
}
