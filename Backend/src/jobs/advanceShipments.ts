import { prisma } from '../config/db';
import { env } from '../config/env';
import { orderService } from '../services/orderService';

const SWEEP_INTERVAL_MS = 10_000;
const STARTUP_DELAY_MS = 5_000;

/**
 * Mock delivery simulation timeline (elapsed time since the shipment was
 * created/shipped). In `LOGISTICS_MODE=mock` the courier is emulated: a real
 * delivery service would move the package through these stages automatically,
 * and so does the simulator — no manual "Dev Courier Control" clicks needed.
 */
export const SHIPMENT_STAGE_TIMING: Array<{
  from: string;
  to: 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
  afterMs: number;
}> = [
  { from: 'SHIPPED', to: 'IN_TRANSIT', afterMs: 30_000 },
  { from: 'IN_TRANSIT', to: 'OUT_FOR_DELIVERY', afterMs: 60_000 },
  { from: 'OUT_FOR_DELIVERY', to: 'DELIVERED', afterMs: 90_000 },
];

export interface MockShipmentAdvanceResult {
  advanced: number;
}

/** Best-effort city from the order's delivery address snapshot (for event locations). */
function deliveryCity(snapshot: string | null): string | undefined {
  if (!snapshot) return undefined;
  try {
    const parsed = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
    return parsed?.city || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Advances every mock shipment whose stage timer has elapsed, one stage at a
 * time, catching up overdue shipments through to DELIVERED. Ships nothing in a
 * real logistics mode — this simulator must never touch live carriers.
 *
 * `now` is injectable so tests can simulate the passage of time.
 */
export async function advanceMockShipments(now: Date = new Date()): Promise<MockShipmentAdvanceResult> {
  if (env.LOGISTICS_MODE !== 'mock') {
    return { advanced: 0 };
  }

  const dueShipments = await prisma.shipment.findMany({
    where: {
      shippedAt: { not: null },
      status: { in: SHIPMENT_STAGE_TIMING.map((s) => s.from) },
    },
    include: { order: true },
  });

  let advanced = 0;

  for (const shipment of dueShipments) {
    let currentStatus = shipment.status;

    // A shipment may be several stages overdue (e.g. the server was down), so
    // advance it through every due stage in one sweep.
    while (true) {
      const stage = SHIPMENT_STAGE_TIMING.find((s) => s.from === currentStatus);
      if (!stage || !shipment.shippedAt) break;

      const elapsedMs = now.getTime() - shipment.shippedAt.getTime();
      if (elapsedMs < stage.afterMs) break;

      const location =
        stage.to === 'IN_TRANSIT'
          ? 'Central Distribution Center'
          : deliveryCity(shipment.order.deliveryAddressSnapshot);

      try {
        await orderService.autoAdvanceShipmentStatus(shipment.orderId, stage.to, location);
        advanced += 1;
        currentStatus = stage.to;
      } catch (error) {
        console.error(`[jobs] Failed to advance shipment ${shipment.trackingNumber}:`, error);
        break;
      }
    }
  }

  return { advanced };
}

let intervalHandle: NodeJS.Timeout | null = null;
let startupHandle: NodeJS.Timeout | null = null;
let sweepRunning = false;

async function runSweep() {
  if (sweepRunning) return;
  sweepRunning = true;
  try {
    const result = await advanceMockShipments();
    if (result.advanced > 0) {
      console.log(`[jobs] Mock delivery simulation advanced ${result.advanced} shipment(s)`);
    }
  } catch (error) {
    console.error('[jobs] Mock delivery simulation sweep failed:', error);
  } finally {
    sweepRunning = false;
  }
}

/**
 * Starts the mock delivery simulator. Runs once shortly after boot (to catch up
 * shipments that advanced while the server was offline), then on a regular
 * interval. Idempotent — safe to call multiple times. No-op for non-mock
 * logistics modes (the sweep itself also guards on LOGISTICS_MODE).
 */
export function startMockShipmentJob(intervalMs: number = SWEEP_INTERVAL_MS): void {
  if (intervalHandle) return;

  startupHandle = setTimeout(() => {
    startupHandle = null;
    runSweep();
  }, STARTUP_DELAY_MS);

  intervalHandle = setInterval(runSweep, intervalMs);
}

export function stopMockShipmentJob(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (startupHandle) {
    clearTimeout(startupHandle);
    startupHandle = null;
  }
}
