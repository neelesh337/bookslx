import { describe, it, expect, afterEach } from 'vitest';
import { realtimeHub, notifyUser } from '../../src/services/realtimeService';
import { prisma } from '../../src/config/db';
import { truncateAll, createUser } from '../helpers';

/** Minimal stand-in for an Express Response that records writes. */
class FakeRes {
  written: string[] = [];
  headers: any = null;
  private handlers: Record<string, Array<() => void>> = {};

  writeHead(status: number, headers: any) {
    this.headers = { status, headers };
  }
  write(chunk: string) {
    this.written.push(chunk);
  }
  on(event: string, cb: () => void) {
    (this.handlers[event] ||= []).push(cb);
  }
  emit(event: string) {
    (this.handlers[event] || []).forEach((cb) => cb());
  }
}

const openRes: FakeRes[] = [];
function trackRes(res: FakeRes): FakeRes {
  openRes.push(res);
  return res;
}

function lastEventData(res: FakeRes): any | null {
  for (let i = res.written.length - 1; i >= 0; i--) {
    const line = res.written[i];
    if (line.startsWith('data: ')) {
      return JSON.parse(line.slice(6));
    }
  }
  return null;
}

afterEach(async () => {
  // Close every subscribed fake connection so the singleton hub stays clean
  // for the next test (and so 'close' cleanup is exercised).
  for (const res of openRes) res.emit('close');
  openRes.length = 0;
  await truncateAll();
  await prisma.$disconnect();
});

describe('realtimeService SSE hub', () => {
  it('subscribe writes SSE headers + connection banner and registers the client', () => {
    const res = trackRes(new FakeRes());
    realtimeHub.subscribe('user-1', res as any);

    expect(res.headers.status).toBe(200);
    expect(res.headers.headers['Content-Type']).toBe('text/event-stream');
    expect(res.written[0]).toContain(': connected');
    expect(realtimeHub.connectionCount('user-1')).toBe(1);
  });

  it('publish delivers a JSON event to the subscribed user only', () => {
    const buyerRes = trackRes(new FakeRes());
    const otherRes = trackRes(new FakeRes());
    realtimeHub.subscribe('buyer', buyerRes as any);
    realtimeHub.subscribe('other', otherRes as any);

    realtimeHub.publish('buyer', {
      type: 'COUNTER_OFFER',
      title: 'Counter Offer Received',
      message: 'Counter offer of ₹420 for "Clean Code"',
      link: '/offers/abc',
      timestamp: '2026-08-16T00:00:00.000Z',
    });

    const delivered = lastEventData(buyerRes);
    expect(delivered.type).toBe('COUNTER_OFFER');
    expect(delivered.message).toContain('₹420');
    expect(lastEventData(otherRes)).toBeNull();
  });

  it('publishing to a user with no open connection is a no-op', () => {
    expect(() =>
      realtimeHub.publish('nobody', {
        type: 'OFFER_ACCEPTED',
        title: 'Offer Accepted!',
        message: 'accepted',
        timestamp: '2026-08-16T00:00:00.000Z',
      })
    ).not.toThrow();
  });

  it('disconnect removes the connection', () => {
    const res = trackRes(new FakeRes());
    realtimeHub.subscribe('user-1', res as any);
    expect(realtimeHub.connectionCount('user-1')).toBe(1);

    res.emit('close');
    expect(realtimeHub.connectionCount('user-1')).toBe(0);
  });

  it('notifyUser creates the DB notification and pushes it over SSE', async () => {
    const user = await createUser({ name: 'Rahul' });
    const res = trackRes(new FakeRes());
    realtimeHub.subscribe(user.id, res as any);

    const created: any = await notifyUser(user.id, {
      type: 'COUNTER_OFFER',
      title: 'Counter Offer Received',
      message: 'Counter offer of ₹420 for "Clean Code"',
      link: '/offers/abc',
    });

    expect(created.userId).toBe(user.id);
    expect(created.type).toBe('COUNTER_OFFER');

    const delivered = lastEventData(res);
    expect(delivered.type).toBe('COUNTER_OFFER');
    expect(delivered.message).toContain('₹420');
    expect(delivered.timestamp).toBeTruthy();
  });
});
