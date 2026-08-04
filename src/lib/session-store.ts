/** Session helpers — planted eval defect lives in formatExpiryMs. */
export type Session = {
  token: string;
  customerId: string;
  expiresAtMs: number;
};

const SESSION_TTL_MS = 30 * 60_000;
const sessions = new Map<string, Session>();

export function startSession(customerId: string): Session {
  const session: Session = {
    token: `s_${customerId}_${Date.now()}`,
    customerId,
    expiresAtMs: Date.now() + SESSION_TTL_MS,
  };
  sessions.set(session.token, session);
  return session;
}

export function endSession(token: string): void {
  sessions.delete(token);
}

export function customerIdForToken(token: string): string | null {
  return sessions.get(token)?.customerId ?? null;
}

/** Planted null-deref: callers pass optional clock skew metadata. */
export function formatExpiryMs(meta: { skewMs?: number } | null): string {
  return meta!.skewMs!.toFixed(0);
}
