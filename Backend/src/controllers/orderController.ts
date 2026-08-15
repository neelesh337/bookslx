import { Request, Response, NextFunction } from 'express';
import { orderService } from '../services/orderService';
import { paymentService } from '../integrations/payment/PaymentService';

export class OrderController {
  async createDirectOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const buyerId = req.user!.id;
      const { listingId, addressId, idempotencyKey } = req.body;
      const order = await orderService.createDirectOrder(buyerId, listingId, addressId, idempotencyKey);
      return res.status(201).json({
        success: true,
        message: 'Order initialized successfully',
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateDeliveryAddress(req: Request, res: Response, next: NextFunction) {
    try {
      const buyerId = req.user!.id;
      const { id } = req.params;
      const { addressId } = req.body;
      const order = await orderService.updateDeliveryAddress(id, buyerId, addressId);
      return res.json({
        success: true,
        message: 'Delivery address updated for this order',
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  async createPaymentSession(req: Request, res: Response, next: NextFunction) {
    try {
      const buyerId = req.user!.id;
      const { id } = req.params;
      const session = await orderService.createPaymentSession(id, buyerId);
      return res.json({
        success: true,
        message: session.mode === 'razorpay' ? 'Checkout session ready' : 'Mock checkout session ready',
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }

  async processPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const buyerId = req.user!.id;
      const { id } = req.params;
      const { simulateFailure, idempotencyKey } = req.body;
      const razorpayPayload = {
        razorpay_order_id: req.body.razorpay_order_id,
        razorpay_payment_id: req.body.razorpay_payment_id,
        razorpay_signature: req.body.razorpay_signature,
      };
      const result = await orderService.processPayment(
        id,
        buyerId,
        simulateFailure,
        idempotencyKey,
        razorpayPayload
      );
      return res.json({
        success: result.success,
        message: result.success ? 'Payment protected and order updated!' : 'Payment failed',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Public webhook endpoint for Razorpay events (payment.captured / order.paid).
   * Signature is verified inside the provider against the RAW request body.
   */
  async razorpayWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const provider = paymentService.getProvider();
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body || {});

      const result = await provider.handleWebhook(req.headers as Record<string, any>, rawBody);

      if (!result.verified) {
        return res.status(400).json({ success: false, message: 'Webhook signature verification failed' });
      }

      // Razorpay sends payment.captured / order.paid for successful payments
      if (result.eventType === 'payment.captured' || result.eventType === 'order.paid') {
        const entity = result.data?.payment?.entity || result.data?.order?.entity?.payments?.entity || {};
        const paymentId = entity.id;
        const rzpOrderId = entity.order_id;
        const amount = entity.amount ? entity.amount / 100 : undefined;

        if (paymentId && rzpOrderId) {
          await orderService.confirmPaymentFromWebhook(paymentId, rzpOrderId, amount);
        }
      }

      return res.json({ success: true, received: true, event: result.eventType });
    } catch (error) {
      next(error);
    }
  }

  async cancelOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const buyerId = req.user!.id;
      const { id } = req.params;
      const { reason } = req.body;
      const order = await orderService.cancelOrder(buyerId, id, reason);
      return res.json({
        success: true,
        message: 'Order cancelled and refund processed successfully',
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  async sellerShipOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const sellerId = req.user!.id;
      const { id } = req.params;
      const result = await orderService.sellerShipOrder(sellerId, id);
      return res.json({
        success: true,
        message: 'Shipment created successfully!',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async completeOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const order = await orderService.completeOrder(userId, id);
      return res.json({
        success: true,
        message: 'Order delivery confirmed! Settlement released to seller.',
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  async getOrderDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const order = await orderService.getOrderDetails(userId, id);
      return res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { role } = req.query;
      const orders = await orderService.getUserOrders(userId, role as any);
      return res.json({
        success: true,
        data: orders,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const orderController = new OrderController();
