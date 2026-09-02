/**
 * Tells Human Behavior who the signed-in visitor is.
 *
 * Recording captures the page, never the account: an email only reaches Human
 * Behavior if this app hands it over after login. Without this module every
 * signed-in student shows up in the dashboard as an anonymous cookie with a
 * generated name, which is exactly what happened for the first 8,986 visitors.
 *
 * Two calls have to meet and the order is not guaranteed — the CDN loader is
 * `afterInteractive`, while Supabase can restore a session before it. So the
 * identity is buffered until the tracker exists, and the tracker flushes it on
 * arrival.
 */

/** The subset of the tracker handle this module uses. */
interface HumanBehaviorHandle {
  identifyUser: (userProperties: Record<string, unknown>) => Promise<unknown>;
}

export interface VisitorIdentity {
  email: string;
  name?: string;
  /** Supabase user id, so a visitor stays one person across devices. */
  userId: string;
}

let handle: HumanBehaviorHandle | null = null;
let pending: VisitorIdentity | null = null;
/** Last identity actually sent, so a re-render or a second auth event is a no-op. */
let sent: string | null = null;

function send(identity: VisitorIdentity): void {
  if (!handle) return;
  const key = `${identity.userId}:${identity.email}`;
  if (sent === key) return;
  sent = key;
  // Fire-and-forget: identification must never block or break sign-in.
  void Promise.resolve(
    handle.identifyUser({
      email: identity.email,
      name: identity.name,
      userId: identity.userId,
    }),
  ).catch((error: unknown) => {
    console.warn("[HumanBehavior] identify failed", error);
  });
}

/** Called once by HumanBehaviorInit with whatever `init()` returned. */
export function registerHumanBehaviorTracker(tracker: unknown): void {
  if (!tracker || typeof (tracker as HumanBehaviorHandle).identifyUser !== "function") return;
  handle = tracker as HumanBehaviorHandle;
  if (pending) {
    const identity = pending;
    pending = null;
    send(identity);
  }
}

/**
 * Call on every sign-in *and* on a restored session. The restored case is what
 * gives already-registered students an identity without waiting for them to
 * sign in again.
 */
export function identifyVisitor(identity: VisitorIdentity): void {
  if (!identity.email) return;
  if (!handle) {
    pending = identity;
    return;
  }
  send(identity);
}
