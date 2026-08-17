import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';

export interface RealtimeEvent {
  type: string;
  title?: string;
  message?: string;
  link?: string;
  timestamp: string;
}

const HEARTBEAT_MS = 25_000;

/**
 * In-memory Server-Sent Events hub. Every logged-in client keeps one open GET
 * connection (`GET /api/realtime/events`) and the server pushes negotiation
 * events (offer created, counter, accept, reject, cancel, expiry) to the
 * affected user the moment they happen.
 *
 * Note: single-instance hub. If the backend ever runs on multiple instances,
 * swap the pub/sub for Redis (e.g. ioredis) keyed by userId.
 */
class RealtimeHub {
  private clients = new Map<string, Set<Response>>();

  subscribe(userId: string, res: Response) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');

    let set = this.clients.get(userId);
    if (!set) {
      set = new Set();
      this.clients.set(userId, set);
    }
    set.add(res);

    // Heartbeat so proxies (Render/NGINX) don't drop the idle connection.
    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        // Connection already gone — the 'close' handler cleans up.
      }
    }, HEARTBEAT_MS);

    const cleanup = () => {
      clearInterval(heartbeat);
      if (set) {
        set.delete(res);
        if (set.size === 0) this.clients.delete(userId);
      }
    };
    res.on('close', cleanup);
    res.on('error', cleanup);
  }

  publish(userId: string, event: RealtimeEvent) {
    const set = this.clients.get(userId);
    if (!set || set.size === 0) return;
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of set) {
      try {
        res.write(payload);
      } catch {
        // Client gone — the 'close' handler will clean it up.
      }
    }
  }

  /** Number of open connections for a user (tests / debugging). */
  connectionCount(userId: string) {
    return this.clients.get(userId)?.size || 0;
  }
}

export const realtimeHub = new RealtimeHub();

/**
 * Creates a notification for the user AND pushes it over SSE in one call.
 * Pass a Prisma transaction client when the notification must be created
 * atomically with other writes (the push itself is fire-and-forget).
 */
export async function notifyUser(
  userId: string,
  data: { type: string; title: string; message: string; link?: string },
  tx?: Prisma.TransactionClient
) {
  const created = tx
    ? await tx.notification.create({ data: { ...data, userId } })
    : await prisma.notification.create({ data: { ...data, userId } });

  realtimeHub.publish(userId, { ...data, timestamp: new Date().toISOString() });
  return created;
}
