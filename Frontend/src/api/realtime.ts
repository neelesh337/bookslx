import { API_BASE_URL } from './client';

export interface RealtimeEvent {
  type: string;
  title?: string;
  message?: string;
  link?: string;
  timestamp?: string;
}

const EVENT_NAME = 'bookslx:realtime';
let source: EventSource | null = null;

/**
 * Opens the Server-Sent Events stream for the current session. EventSource
 * cannot set Authorization headers, so the token travels as a query param —
 * the backend's /api/realtime/events route is the only endpoint that accepts
 * it that way. EventSource auto-reconnects on drops; the server heartbeats.
 */
export function connectRealtime(token: string) {
  disconnectRealtime();
  if (!token) return;

  const url = `${API_BASE_URL}/realtime/events?token=${encodeURIComponent(token)}`;
  source = new EventSource(url);
  source.onmessage = (e) => {
    try {
      const data = JSON.parse((e as MessageEvent).data) as RealtimeEvent;
      window.dispatchEvent(new CustomEvent<RealtimeEvent>(EVENT_NAME, { detail: data }));
    } catch {
      // Ignore malformed frames (heartbeats are comments, not data).
    }
  };
  // Reconnects are automatic; a no-op handler just silences the console.
  source.onerror = () => {};
}

export function disconnectRealtime() {
  if (source) {
    source.close();
    source = null;
  }
}

/** Subscribes to negotiation events. Returns an unsubscribe function. */
export function onRealtime(cb: (event: RealtimeEvent) => void): () => void {
  const handler = (ev: Event) => cb((ev as CustomEvent<RealtimeEvent>).detail);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
