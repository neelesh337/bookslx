import { Request, Response, NextFunction } from 'express';
import { logisticsService } from '../integrations/logistics/LogisticsService';
import { orderService } from '../services/orderService';

export class LogisticsController {
  /**
   * Shiprocket tracking webhook. Shiprocket POSTs `awb`, `current_status` and
   * `scans[]` whenever a package moves; we verify the optional `x-api-key`
   * security token, find the shipment by AWB, and advance it through the
   * logistics-owned status pipeline (no user can move these manually).
   */
  async shiprocketWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const provider = logisticsService.getProvider();
      if (provider.name !== 'shiprocket') {
        return res.status(400).json({ success: false, message: 'Shiprocket logistics is not enabled' });
      }

      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body || {});
      const result = await provider.handleWebhook(req.headers as Record<string, any>, rawBody);

      if (!result.verified) {
        return res.status(400).json({ success: false, message: 'Webhook verification failed' });
      }

      // Acknowledge non-forward events (FAILED / RETURNED / CANCELLED) and the
      // already-shipped state without touching the order.
      if (!result.trackingNumber || result.status === 'UNKNOWN' || result.status === 'SHIPPED') {
        return res.json({ success: true, received: true, status: result.status });
      }

      const shipment = await orderService.applyShipmentWebhook(
        result.trackingNumber,
        result.status as 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED',
        result.location
      );

      if (!shipment) {
        // Shiprocket may send updates for shipments we don't know — acknowledge.
        return res.json({ success: true, received: true, ignored: true });
      }

      return res.json({ success: true, received: true, status: result.status });
    } catch (error) {
      next(error);
    }
  }
}

export const logisticsController = new LogisticsController();
