import { prisma } from '../config/db';
import { env } from '../config/env';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';
import { calculateOrderAmount } from '../utils/pricing';
import { paymentService } from '../integrations/payment/PaymentService';
import { logisticsService } from '../integrations/logistics/LogisticsService';

// Order statuses that mean the sale for a listing is already locked in (paid or
// in fulfillment). Used to reject duplicate or competing payments for the same
// listing.
const PAID_ORDER_STATUSES = [
  'AWAITING_SHIPMENT',
  'PAYMENT_PROTECTED',
  'SHIPPED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DISPUTED',
];

export class OrderService {
  async createDirectOrder(
    buyerId: string,
    listingId: string,
    addressId?: string,
    idempotencyKey?: string
  ) {
    if (idempotencyKey) {
      const existing = await prisma.order.findUnique({ where: { idempotencyKey } });
      if (existing) return existing;
    }

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        book: true,
        seller: { include: { addresses: true } },
      },
    });

    if (!listing) throw new NotFoundError('Listing not found');

    if (listing.sellerId === buyerId) {
      throw new ForbiddenError('You cannot purchase your own listing');
    }

    if (listing.status !== 'ACTIVE') {
      throw new AppError(`Listing is ${listing.status} and cannot be purchased`);
    }

    const buyer = await prisma.user.findUnique({
      where: { id: buyerId },
      include: { addresses: true },
    });

    if (!buyer) throw new NotFoundError('User not found');

    let deliveryAddressSnapshot: any;
    if (addressId) {
      const addr = buyer.addresses.find((a) => a.id === addressId);
      if (addr) deliveryAddressSnapshot = addr;
    }

    if (!deliveryAddressSnapshot) {
      deliveryAddressSnapshot = buyer.addresses.find((a) => a.isDefault) || buyer.addresses[0] || {
        name: buyer.name,
        phone: buyer.phone || '9999999999',
        line1: '123 Main Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400001',
        country: 'India',
      };
    }

    const sellerPickupAddressSnapshot = listing.seller.addresses.find((a) => a.isPickupAddress || a.isDefault) || listing.seller.addresses[0] || {
      name: listing.seller.name,
      phone: listing.seller.phone || '9888888888',
      line1: '456 Seller Hub',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
      country: 'India',
    };

    const pricing = calculateOrderAmount(listing.askingPrice);
    const orderNumber = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // One pending order per buyer per listing — a double-click or a repeat
    // checkout returns the existing order instead of creating a duplicate.
    const existingOrder = await prisma.order.findFirst({
      where: { listingId, buyerId, status: 'PAYMENT_PENDING' },
    });
    if (existingOrder) return existingOrder;

    // NOTE: the listing is deliberately NOT reserved here. Checkout-initiation
    // must not block other buyers from making offers or buying the book — the
    // listing is only claimed (RESERVED) when the payment actually completes, in
    // processPayment. Abandoned checkouts therefore never lock the book.
    return await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNumber,
          buyerId,
          sellerId: listing.sellerId,
          listingId,
          bookPrice: pricing.bookPrice,
          shippingFee: pricing.shippingFee,
          platformFee: pricing.platformFee,
          discount: pricing.discount,
          totalAmount: pricing.totalAmount,
          status: 'PAYMENT_PENDING',
          deliveryAddressSnapshot: JSON.stringify(deliveryAddressSnapshot),
          pickupAddressSnapshot: JSON.stringify(sellerPickupAddressSnapshot),
          idempotencyKey: idempotencyKey || null,
          statusHistory: {
            create: {
              fromStatus: 'PAYMENT_PENDING',
              toStatus: 'PAYMENT_PENDING',
              changedById: buyerId,
              reason: 'Direct Buy order created',
            },
          },
        },
        include: {
          listing: { include: { book: true, images: true } },
          buyer: { select: { id: true, name: true, email: true } },
          seller: { select: { id: true, name: true, email: true } },
        },
      });

      return order;
    });
  }

  /**
   * Updates the delivery address snapshot on an order that is still awaiting
   * payment. The buyer can pick a different saved address — or one they just
   * added during checkout — before completing payment; the seller ships to this
   * snapshot when creating the shipment.
   */
  async updateDeliveryAddress(orderId: string, buyerId: string, addressId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundError('Order not found');

    if (order.buyerId !== buyerId) {
      throw new ForbiddenError('Not authorized to update this order');
    }

    if (order.status !== 'PAYMENT_PENDING') {
      throw new AppError(
        `Delivery address can only be changed while the order is awaiting payment (current: ${order.status})`
      );
    }

    const address = await prisma.address.findFirst({
      where: { id: addressId, userId: buyerId },
    });
    if (!address) {
      throw new NotFoundError('Delivery address not found for this buyer');
    }

    return await prisma.order.update({
      where: { id: orderId },
      data: { deliveryAddressSnapshot: JSON.stringify(address) },
      include: {
        listing: { include: { book: true, images: true } },
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /**
   * Prepares a checkout session. With Razorpay enabled this creates a real
   * Razorpay Order (amount in paise) that the in-app checkout modal charges,
   * and pre-records a PENDING payment row so the webhook can match it.
   * In mock mode it returns `{ mode: 'mock' }` and the frontend falls back to
   * the direct /pay call.
   */
  async createPaymentSession(orderId: string, buyerId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) throw new NotFoundError('Order not found');
    if (order.buyerId !== buyerId) {
      throw new ForbiddenError('Not authorized to create a payment session for this order');
    }
    if (order.status !== 'PAYMENT_PENDING') {
      throw new AppError(`Order is already in ${order.status} state`);
    }

    const provider = paymentService.getProvider();
    if (provider.name !== 'razorpay') {
      return { mode: 'mock' };
    }

    const paymentResult = await provider.createPayment({
      orderId,
      amount: order.totalAmount,
      currency: 'INR',
      metadata: { orderNumber: order.orderNumber },
    });

    // Pre-record the PENDING payment so the Razorpay webhook has a row to match.
    const existing = await prisma.payment.findUnique({ where: { orderId } });
    const paymentData = {
      provider: provider.name,
      providerTransactionId: paymentResult.providerTransactionId, // rzp_order_xxx
      status: 'PENDING',
      metadata: paymentResult.metadata ? JSON.stringify(paymentResult.metadata) : null,
    };

    if (existing) {
      await prisma.payment.update({ where: { id: existing.id }, data: paymentData });
    } else {
      await prisma.payment.create({
        data: {
          orderId,
          paymentNumber: `PAY-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
          amount: order.totalAmount,
          ...paymentData,
        },
      });
    }

    return {
      mode: 'razorpay',
      keyId: paymentResult.clientSecret, // key_id for the checkout modal
      rzpOrderId: paymentResult.providerTransactionId,
      amount: order.totalAmount,
      amountPaise: Math.round(order.totalAmount * 100),
      orderNumber: order.orderNumber,
      env: env.PAYMENT_ENV,
    };
  }

  async processPayment(
    orderId: string,
    buyerId: string,
    simulateFailure = false,
    idempotencyKey?: string,
    razorpayPayload?: {
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    }
  ) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: true,
        buyer: true,
        seller: true,
        payment: true,
      },
    });

    if (!order) throw new NotFoundError('Order not found');

    if (order.buyerId !== buyerId) {
      throw new ForbiddenError('Not authorized to make payment for this order');
    }

    const provider = paymentService.getProvider();
    const isRazorpay = provider.name === 'razorpay';

    let verificationPayload: Record<string, any>;
    if (isRazorpay) {
      if (!razorpayPayload?.razorpay_payment_id || !razorpayPayload?.razorpay_order_id || !razorpayPayload?.razorpay_signature) {
        throw new AppError('Missing Razorpay payment response details', 400, 'INVALID_PAYMENT_PAYLOAD');
      }
      verificationPayload = {
        orderId,
        amount: order.totalAmount,
        razorpay_order_id: razorpayPayload.razorpay_order_id,
        razorpay_payment_id: razorpayPayload.razorpay_payment_id,
        razorpay_signature: razorpayPayload.razorpay_signature,
      };
    } else {
      verificationPayload = {
        orderId,
        amount: order.totalAmount,
        simulateFailure,
      };
    }

    // Idempotency: if the payment webhook already finalized this order (order is
    // AWAITING_SHIPMENT with a PROTECTED payment), verify the signature anyway to
    // prove authenticity, then return the finalized state instead of erroring.
    if (isRazorpay && order.status === 'AWAITING_SHIPMENT' && order.payment?.status === 'PROTECTED') {
      const paymentResult = await provider.verifyPayment(orderId, verificationPayload);
      if (paymentResult.status === 'PROTECTED' || paymentResult.status === 'PAID') {
        return { success: true, order, payment: order.payment };
      }
    }

    if (order.status !== 'PAYMENT_PENDING') {
      // Razorpay edge case: the buyer may have completed payment in the checkout
      // modal AFTER the order was cancelled (e.g. the 15-minute reservation expired
      // while the modal was open). Money would be stranded at the provider with no
      // refund path — verify the captured payment and auto-refund it.
      if (isRazorpay && razorpayPayload?.razorpay_payment_id) {
        const pendingResult = await provider.verifyPayment(orderId, verificationPayload);
        if (pendingResult.status === 'PROTECTED' || pendingResult.status === 'PAID') {
          const refund = await provider.refundPayment({
            paymentId: pendingResult.providerTransactionId,
            amount: order.totalAmount,
            reason: 'Order no longer payable (cancelled/expired) — auto-refund of captured payment',
          });

          if (refund.status === 'REFUNDED') {
            const pendingPayment = await prisma.payment.findUnique({ where: { orderId } });
            if (pendingPayment) {
              await prisma.payment.update({
                where: { id: pendingPayment.id },
                data: {
                  status: 'REFUNDED',
                  providerTransactionId: pendingResult.providerTransactionId,
                  events: {
                    create: {
                      provider: 'razorpay',
                      eventId: refund.refundId,
                      eventType: 'AUTO_REFUND',
                      payload: JSON.stringify({ reason: 'order not payable when payment completed' }),
                      status: 'REFUNDED',
                    },
                  },
                },
              });
            }
          }

          throw new AppError(
            'Your payment was captured but the order was already cancelled/expired — the full amount has been auto-refunded.',
            409,
            'ORDER_CANCELLED_PAYMENT_REFUNDED'
          );
        }
      }
      throw new AppError(`Order is already in ${order.status} state`);
    }

    const paymentResult = await provider.verifyPayment(orderId, verificationPayload);

    // Claim the listing before recording any successful payment. Direct-buy
    // orders do not reserve the listing at checkout time, so several buyers may
    // be in checkout for the same book at once — only the first to actually pay
    // gets it. Losing payments are refunded and the loser's order cancelled.
    if (paymentResult.status === 'PROTECTED' || paymentResult.status === 'PAID') {
      await this.claimListingForPayment(order, buyerId, paymentResult);
    }

    const paymentNumber = `PAY-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    return await prisma.$transaction(async (tx) => {
      let payment = await tx.payment.findUnique({ where: { orderId } });

      if (!payment) {
        payment = await tx.payment.create({
          data: {
            orderId,
            paymentNumber,
            provider: provider.name,
            providerTransactionId: paymentResult.providerTransactionId,
            amount: order.totalAmount,
            status: paymentResult.status as any,
            idempotencyKey: idempotencyKey || null,
            metadata: paymentResult.metadata ? JSON.stringify(paymentResult.metadata) : null,
          },
        });
      } else {
        payment = await tx.payment.update({
          where: { orderId },
          data: {
            status: paymentResult.status as any,
            providerTransactionId: paymentResult.providerTransactionId,
            metadata: paymentResult.metadata ? JSON.stringify(paymentResult.metadata) : null,
          },
        });
      }

      if (paymentResult.status === 'PROTECTED' || paymentResult.status === 'PAID') {
        // Atomically transition the order to AWAITING_SHIPMENT, but ONLY if it is still
        // awaiting payment. If the reservation was expired or cancelled while the payment
        // was being processed, abort so the protected payment is never recorded against
        // an order that no longer exists in a payable state.
        const transition = await tx.order.updateMany({
          where: { id: orderId, status: 'PAYMENT_PENDING' },
          data: { status: 'AWAITING_SHIPMENT' },
        });

        if (transition.count === 0) {
          // The webhook may have just finalized the same payment concurrently.
          // If the order is already in a paid state, treat this as success (idempotent).
          const current = await tx.order.findUnique({ where: { id: orderId } });
          if (current && (current.status === 'AWAITING_SHIPMENT' || current.status === 'PAYMENT_PROTECTED')) {
            const alreadyPaidOrder = await tx.order.findUnique({
              where: { id: orderId },
              include: {
                listing: { include: { book: true, images: true } },
                payment: true,
                buyer: { select: { id: true, name: true, email: true } },
                seller: { select: { id: true, name: true, email: true } },
              },
            });
            return { success: true, order: alreadyPaidOrder, payment };
          }
          throw new ConflictError('Order is no longer awaiting payment and cannot be paid');
        }

        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: 'PAYMENT_PENDING',
            toStatus: 'AWAITING_SHIPMENT',
            changedById: buyerId,
            reason: 'Payment confirmed and protected by platform',
          },
        });

        const updatedOrder = await tx.order.findUnique({
          where: { id: orderId },
          include: {
            listing: { include: { book: true, images: true } },
            payment: true,
            buyer: { select: { id: true, name: true, email: true } },
            seller: { select: { id: true, name: true, email: true } },
          },
        });

        if (!updatedOrder) throw new ConflictError('Order no longer exists');

        // Notify seller: Order ready to ship
        await tx.notification.create({
          data: {
            userId: order.sellerId,
            type: 'ORDER_CREATED',
            title: 'New Order to Ship!',
            message: `Order #${order.orderNumber} is paid and ready to ship. Please create shipment.`,
            link: `/orders/${order.id}`,
          },
        });

        // Notify buyer
        await tx.notification.create({
          data: {
            userId: order.buyerId,
            type: 'PAYMENT_SUCCESS',
            title: 'Payment Successful',
            message: `Payment of ₹${order.totalAmount} protected for Order #${order.orderNumber}.`,
            link: `/orders/${order.id}`,
          },
        });

        // Remove item from buyer's cart if present
        const buyerCart = await tx.cart.findUnique({ where: { userId: buyerId } });
        if (buyerCart) {
          await tx.cartItem.deleteMany({
            where: { cartId: buyerCart.id, listingId: order.listingId },
          });
        }

        return { success: true, order: updatedOrder, payment };
      } else {
        // Payment failed -> Release listing back to ACTIVE
        await tx.listing.update({
          where: { id: order.listingId },
          data: {
            status: 'ACTIVE',
            reservedUntil: null,
            reservedByUserId: null,
          },
        });

        const cancelledOrder = await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'CANCELLED',
            statusHistory: {
              create: {
                fromStatus: 'PAYMENT_PENDING',
                toStatus: 'CANCELLED',
                changedById: buyerId,
                reason: 'Payment failed or declined',
              },
            },
          },
        });

        return { success: false, order: cancelledOrder, payment };
      }
    });
  }

  /**
   * Atomically reserves the listing for the paying buyer. Direct-buy orders do
   * not reserve the listing at checkout time, so this is where the sale is
   * actually locked in — only one buyer can win. Offer-acceptance orders already
   * hold the reservation, which is accepted here.
   *
   * If the listing was already sold/reserved by another buyer (or the same buyer
   * is paying twice for duplicate orders), any captured payment is refunded at
   * the provider, the losing order is cancelled, and a LISTING_SOLD_ELSEWHERE /
   * DUPLICATE_PAYMENT error is thrown.
   */
  private async claimListingForPayment(order: any, buyerId: string, paymentResult: any) {
    const reservedUntil = new Date();
    reservedUntil.setMinutes(reservedUntil.getMinutes() + 15);

    const claim = await prisma.listing.updateMany({
      where: { id: order.listingId, status: 'ACTIVE' },
      data: {
        status: 'RESERVED',
        reservedByUserId: buyerId,
        reservedUntil,
      },
    });

    if (claim.count > 0) {
      // We won the listing — competing offers are now dead.
      await prisma.offer.updateMany({
        where: { listingId: order.listingId, status: { in: ['PENDING', 'COUNTERED'] } },
        data: { status: 'EXPIRED' },
      });
      return;
    }

    // Listing is no longer ACTIVE — the buyer may already hold it (offer path).
    const listing = await prisma.listing.findUnique({ where: { id: order.listingId } });
    const holdsReservation =
      !!listing && listing.status === 'RESERVED' && listing.reservedByUserId === buyerId;

    if (!holdsReservation) {
      // Someone else bought/reserved it while this buyer was in checkout.
      await this.rejectLostPayment(
        order,
        paymentResult.providerTransactionId,
        order.totalAmount,
        'Listing sold to another buyer before payment completed'
      );
      throw new AppError(
        'This book was just purchased by another buyer before your payment completed. Your payment has been refunded.',
        409,
        'LISTING_SOLD_ELSEWHERE'
      );
    }

    // The buyer already holds the reservation, but paying twice for duplicate
    // orders on the same listing (e.g. a double-click created two orders) must
    // not produce two sales.
    const duplicateLiveOrder = await prisma.order.findFirst({
      where: {
        listingId: order.listingId,
        id: { not: order.id },
        status: { in: PAID_ORDER_STATUSES },
      },
    });
    if (duplicateLiveOrder) {
      await this.rejectLostPayment(
        order,
        paymentResult.providerTransactionId,
        order.totalAmount,
        'Duplicate payment for an already-paid order on this listing'
      );
      throw new AppError(
        'This order is a duplicate — this book was already paid for. Your payment has been refunded.',
        409,
        'DUPLICATE_PAYMENT'
      );
    }
  }

  /**
   * Best-effort refund at the payment provider for a payment that cannot be
   * honored, and cancels the losing order. The mock provider refund is a no-op.
   */
  private async rejectLostPayment(order: any, paymentIdAtProvider: string, amount: number, reason: string) {
    const provider = paymentService.getProvider();
    try {
      await provider.refundPayment({
        paymentId: paymentIdAtProvider,
        amount,
        reason,
      });
    } catch (e) {
      console.error('[payments] Auto-refund failed for lost payment:', e);
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        statusHistory: {
          create: {
            fromStatus: order.status,
            toStatus: 'CANCELLED',
            changedById: order.buyerId,
            reason,
          },
        },
      },
    });
  }

  /**
   * Idempotent webhook finalizer. Called by the Razorpay webhook endpoint when a
   * `payment.captured` / `order.paid` event arrives. If the order is still
   * PAYMENT_PENDING, it transitions it to AWAITING_SHIPMENT and marks the payment
   * PROTECTED (with a PaymentEvent audit trail). Safe to call multiple times — a
   * duplicate event or a race with the checkout `/pay` call is a no-op.
   *
   * Returns the updated order, or null when no matching payment row exists.
   */
  async confirmPaymentFromWebhook(paymentId: string, rzpOrderId: string, amount?: number) {
    // The pre-recorded payment row stores the rzp_order_xxx as providerTransactionId;
    // after a successful checkout it is updated to the rzp_pay_xxx. Match either.
    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { providerTransactionId: paymentId },
          { providerTransactionId: rzpOrderId },
          { metadata: { contains: rzpOrderId } },
        ],
      },
    });

    if (!payment) return null;

    const order = await prisma.order.findUnique({ where: { id: payment.orderId } });
    if (!order) return null;

    // Already finalized (by the checkout flow or a duplicate webhook) — idempotent no-op
    if (order.status !== 'PAYMENT_PENDING') return order;

    // Claim the listing the same way processPayment does — a webhook-confirmed
    // payment must not double-sell a listing another buyer already paid for.
    const reservedUntil = new Date();
    reservedUntil.setMinutes(reservedUntil.getMinutes() + 15);

    const claim = await prisma.listing.updateMany({
      where: { id: order.listingId, status: 'ACTIVE' },
      data: {
        status: 'RESERVED',
        reservedByUserId: order.buyerId,
        reservedUntil,
      },
    });

    if (claim.count === 0) {
      const listing = await prisma.listing.findUnique({ where: { id: order.listingId } });
      const holdsReservation =
        !!listing && listing.status === 'RESERVED' && listing.reservedByUserId === order.buyerId;

      if (!holdsReservation) {
        // Lost to another buyer — refund the captured payment and leave the
        // order unfinalized.
        await this.rejectLostPayment(
          order,
          paymentId,
          amount ?? order.totalAmount,
          'Listing sold to another buyer before payment completed (webhook)'
        );
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'REFUNDED' },
        });
        return order;
      }

      const duplicateLiveOrder = await prisma.order.findFirst({
        where: {
          listingId: order.listingId,
          id: { not: order.id },
          status: { in: PAID_ORDER_STATUSES },
        },
      });
      if (duplicateLiveOrder) {
        await this.rejectLostPayment(
          order,
          paymentId,
          amount ?? order.totalAmount,
          'Duplicate payment for an already-paid order on this listing (webhook)'
        );
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'REFUNDED' },
        });
        return order;
      }
    } else {
      // We won the listing — competing offers are now dead.
      await prisma.offer.updateMany({
        where: { listingId: order.listingId, status: { in: ['PENDING', 'COUNTERED'] } },
        data: { status: 'EXPIRED' },
      });
    }

    return await prisma.$transaction(async (tx) => {
      const transition = await tx.order.updateMany({
        where: { id: order.id, status: 'PAYMENT_PENDING' },
        data: { status: 'AWAITING_SHIPMENT' },
      });

      if (transition.count === 0) {
        // Concurrent finalization won the race — nothing more to do
        return await tx.order.findUnique({ where: { id: order.id } });
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: 'PAYMENT_PENDING',
          toStatus: 'AWAITING_SHIPMENT',
          changedById: order.buyerId,
          reason: 'Payment captured — confirmed via Razorpay webhook',
        },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PROTECTED',
          providerTransactionId: paymentId, // now the rzp_pay_xxx id
          events: {
            create: {
              provider: 'razorpay',
              eventId: paymentId,
              eventType: 'WEBHOOK_CAPTURED',
              payload: JSON.stringify({ rzpOrderId, amount: amount ?? payment.amount }),
              status: 'PROTECTED',
            },
          },
        },
      });

      // Notify seller the order is ready to ship
      await tx.notification.create({
        data: {
          userId: order.sellerId,
          type: 'ORDER_CREATED',
          title: 'New Order to Ship!',
          message: `Order #${order.orderNumber} is paid and ready to ship. Please create shipment.`,
          link: `/orders/${order.id}`,
        },
      });

      // Notify buyer
      await tx.notification.create({
        data: {
          userId: order.buyerId,
          type: 'PAYMENT_SUCCESS',
          title: 'Payment Successful',
          message: `Payment of ₹${order.totalAmount} protected for Order #${order.orderNumber}.`,
          link: `/orders/${order.id}`,
        },
      });

      // Remove the item from the buyer's cart if present
      const buyerCart = await tx.cart.findUnique({ where: { userId: order.buyerId } });
      if (buyerCart) {
        await tx.cartItem.deleteMany({
          where: { cartId: buyerCart.id, listingId: order.listingId },
        });
      }

      return await tx.order.findUnique({ where: { id: order.id } });
    });
  }

  async cancelOrder(buyerId: string, orderId: string, reason?: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: { include: { book: true } }, payment: true },
    });

    if (!order) throw new NotFoundError('Order not found');

    // Only the buyer can cancel their own order
    if (order.buyerId !== buyerId) {
      throw new ForbiddenError('Only the buyer can cancel this order');
    }

    // Cancellation is only allowed before the order has been shipped
    if (order.status !== 'AWAITING_SHIPMENT' && order.status !== 'PAYMENT_PROTECTED') {
      throw new AppError(`Order cannot be cancelled in current state: ${order.status}`);
    }

    // A protected escrow payment must exist to refund
    if (!order.payment) {
      throw new AppError('No protected payment found for this order', 500, 'PAYMENT_NOT_FOUND');
    }

    const payment = order.payment;
    const provider = paymentService.getProvider();

    return await prisma.$transaction(async (tx) => {
      // 1. Atomically transition the order to REFUNDED, but ONLY if it is still awaiting
      //    shipment. This re-validates the state under the DB write lock, so a concurrent
      //    seller ship (or a second cancel request) cannot race past this guard.
      const transition = await tx.order.updateMany({
        where: { id: orderId, status: { in: ['AWAITING_SHIPMENT', 'PAYMENT_PROTECTED'] } },
        data: { status: 'REFUNDED' },
      });

      if (transition.count === 0) {
        throw new ConflictError('Order was already shipped or modified and can no longer be cancelled');
      }

      // 2. Only now that the state transition is secured, execute the refund at the provider.
      //    For Razorpay the refund must target the rzp_pay_xxx id (providerTransactionId),
      //    not our internal paymentNumber — fall back for the mock provider.
      const refundResult = await provider.refundPayment({
        paymentId: payment.providerTransactionId || payment.paymentNumber,
        amount: order.totalAmount,
        reason: reason || 'Buyer-initiated cancellation before shipment',
      });

      if (refundResult.status !== 'REFUNDED') {
        throw new AppError('Refund failed at payment provider', 500, 'REFUND_FAILED');
      }

      // 3. Audit trail for the cancellation
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: 'REFUNDED',
          changedById: buyerId,
          reason: `Buyer cancelled before shipment. Refund: ${refundResult.refundId}`,
        },
      });

      // 4. Payment status -> REFUNDED (escrow returned to buyer) with provider audit event
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'REFUNDED',
          events: {
            create: {
              provider: provider.name,
              eventId: refundResult.refundId,
              eventType: 'REFUND',
              payload: JSON.stringify({ amount: order.totalAmount, reason: reason || null }),
              status: 'REFUNDED',
            },
          },
        },
      });

      // 5. Release the listing back to ACTIVE, but only if this buyer still holds the reservation
      await tx.listing.updateMany({
        where: { id: order.listingId, reservedByUserId: buyerId },
        data: { status: 'ACTIVE', reservedUntil: null, reservedByUserId: null },
      });

      // 6. Notify buyer of the refund
      await tx.notification.create({
        data: {
          userId: buyerId,
          type: 'ORDER_CANCELLED',
          title: 'Order Cancelled & Refund Processed',
          message: `Order #${order.orderNumber} was cancelled. Refund of ₹${order.totalAmount} has been returned to you.`,
          link: `/orders/${order.id}`,
        },
      });

      // 7. Notify seller the order was cancelled and the listing was relisted
      await tx.notification.create({
        data: {
          userId: order.sellerId,
          type: 'ORDER_CANCELLED',
          title: 'Order Cancelled by Buyer',
          message: `Buyer cancelled Order #${order.orderNumber} before shipment. Your book "${order.listing.book.title}" has been relisted.`,
          link: `/orders/${order.id}`,
        },
      });

      return await tx.order.findUnique({ where: { id: orderId } });
    });
  }

  async sellerShipOrder(sellerId: string, orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: { include: { book: true } },
        buyer: { select: { id: true, email: true } },
        shipment: true,
      },
    });

    if (!order) throw new NotFoundError('Order not found');

    if (order.sellerId !== sellerId) {
      throw new ForbiddenError('Only the seller can ship this order');
    }

    if (order.status !== 'AWAITING_SHIPMENT' && order.status !== 'PAYMENT_PROTECTED') {
      throw new AppError(`Order cannot be shipped in current state: ${order.status}`);
    }

    const provider = logisticsService.getProvider();
    const shipmentResult = await provider.createShipment({
      orderId,
      orderNumber: order.orderNumber,
      pickupAddress: typeof order.pickupAddressSnapshot === 'string' ? JSON.parse(order.pickupAddressSnapshot) : (order.pickupAddressSnapshot as any),
      deliveryAddress: typeof order.deliveryAddressSnapshot === 'string' ? JSON.parse(order.deliveryAddressSnapshot) : (order.deliveryAddressSnapshot as any),
      deliveryEmail: order.buyer?.email || undefined,
    });

    return await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.create({
        data: {
          orderId,
          courierName: shipmentResult.courierName,
          trackingNumber: shipmentResult.trackingNumber,
          trackingUrl: shipmentResult.trackingUrl,
          status: 'SHIPPED',
          estDeliveryDate: shipmentResult.estDeliveryDate,
          shippedAt: new Date(),
          events: {
            create: shipmentResult.events.map((e) => ({
              status: e.status,
              description: e.description,
              location: e.location || null,
              timestamp: e.timestamp,
            })),
          },
        },
        include: { events: true },
      });

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'SHIPPED',
          statusHistory: {
            create: {
              fromStatus: order.status,
              toStatus: 'SHIPPED',
              changedById: sellerId,
              reason: `Shipment created via ${shipmentResult.courierName}`,
            },
          },
        },
      });

      // Notify Buyer
      await tx.notification.create({
        data: {
          userId: order.buyerId,
          type: 'SHIPMENT_CREATED',
          title: 'Order Shipped!',
          message: `Your book "${order.listing.book.title}" has been shipped via ${shipmentResult.courierName}. Tracking: ${shipmentResult.trackingNumber}`,
          link: `/orders/${order.id}`,
        },
      });

      return { order: updatedOrder, shipment };
    });
  }

  /**
   * Applies a courier tracking update received via the logistics provider's
   * webhook. Finds the shipment by its provider tracking number (AWB) and
   * advances it — returns null when no matching shipment exists.
   */
  async applyShipmentWebhook(
    trackingNumber: string,
    newStatus: 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED',
    location?: string
  ) {
    const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
    if (!shipment) return null;
    await this.autoAdvanceShipmentStatus(shipment.orderId, newStatus, location);
    return shipment;
  }

  /**
   * Advances a shipment without an actor check — the courier status is owned by
   * the logistics provider. Called by the mock delivery simulator job and the
   * logistics tracking webhook.
   * (SHIPPED → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED).
   */
  async autoAdvanceShipmentStatus(orderId: string, newStatus: 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED', location?: string) {
    const shipment = await prisma.shipment.findUnique({ where: { orderId } });
    if (!shipment) throw new NotFoundError('Shipment not found');

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: { include: { book: true } } },
    });
    if (!order) throw new NotFoundError('Order not found');

    return this.applyShipmentTransition(shipment, order, newStatus, location);
  }

  /**
   * Shared transition used by both the seller-driven courier controls and the
   * mock delivery simulator. The shipment update is conditional on its current
   * status, so a concurrent advance (double-click or scheduler race) is a no-op
   * instead of duplicating events.
   */
  private async applyShipmentTransition(
    shipment: any,
    order: any,
    newStatus: 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED',
    location?: string
  ) {
    if (shipment.status === newStatus) return { order, shipment };

    const descriptions: Record<string, string> = {
      IN_TRANSIT: 'Package in transit between hubs',
      OUT_FOR_DELIVERY: 'Package out for delivery with local courier agent',
      DELIVERED: 'Package delivered to buyer delivery address',
    };

    return await prisma.$transaction(async (tx) => {
      // Atomically claim the transition — only moves if the shipment is still
      // in the expected previous status (no-op on a concurrent advance).
      const moved = await tx.shipment.updateMany({
        where: { orderId: order.id, status: shipment.status },
        data: {
          status: newStatus,
          deliveredAt: newStatus === 'DELIVERED' ? new Date() : undefined,
        },
      });

      if (moved.count === 0) {
        return { order, shipment };
      }

      await tx.shipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          status: newStatus,
          description: descriptions[newStatus] || `Status updated to ${newStatus}`,
          location: location || 'Transit Hub',
        },
      });

      // IN_TRANSIT / OUT_FOR_DELIVERY / DELIVERED all map 1:1 onto the order status.
      const nextOrderStatus = newStatus;

      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: nextOrderStatus,
          statusHistory: {
            create: {
              fromStatus: order.status,
              toStatus: nextOrderStatus,
              reason: `Tracking update: ${newStatus}`,
            },
          },
        },
      });

      await tx.notification.create({
        data: {
          userId: order.buyerId,
          type: 'SHIPMENT_UPDATE',
          title: `Shipment Update: ${newStatus.replace(/_/g, ' ')}`,
          message: `Your order #${order.orderNumber} is now ${newStatus.replace(/_/g, ' ')}.`,
          link: `/orders/${order.id}`,
        },
      });

      const updatedShipment = await tx.shipment.findUnique({
        where: { id: shipment.id },
        include: { events: { orderBy: { timestamp: 'desc' } } },
      });

      return { order: updatedOrder, shipment: updatedShipment };
    });
  }

  async completeOrder(userId: string, orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: true, payment: true },
    });

    if (!order) throw new NotFoundError('Order not found');

    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenError('Not authorized');
    }

    if (order.status !== 'DELIVERED') {
      throw new AppError('Order must be in DELIVERED status to complete');
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Order status -> COMPLETED
      const completedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'COMPLETED',
          statusHistory: {
            create: {
              fromStatus: 'DELIVERED',
              toStatus: 'COMPLETED',
              changedById: userId,
              reason: 'Order delivery confirmed and completed by buyer',
            },
          },
        },
      });

      // 2. Listing status -> SOLD
      await tx.listing.update({
        where: { id: order.listingId },
        data: { status: 'SOLD' },
      });

      // 3. Payment status -> RELEASED (Seller Settlement)
      if (order.payment) {
        await tx.payment.update({
          where: { id: order.payment.id },
          data: { status: 'RELEASED' },
        });
      }

      // 4. Update user metrics
      await tx.user.update({
        where: { id: order.sellerId },
        data: { totalSales: { increment: 1 } },
      });

      await tx.user.update({
        where: { id: order.buyerId },
        data: { totalPurchases: { increment: 1 } },
      });

      // 5. Notify seller of settlement release
      await tx.notification.create({
        data: {
          userId: order.sellerId,
          type: 'DELIVERED',
          title: 'Order Completed & Payment Released!',
          message: `Order #${order.orderNumber} is completed. Settlement of ₹${order.bookPrice} has been released. Please review your buyer!`,
          link: `/orders/${order.id}`,
        },
      });

      // 6. Notify buyer to review seller
      await tx.notification.create({
        data: {
          userId: order.buyerId,
          type: 'REVIEW_REQUEST',
          title: 'How was your experience?',
          message: `Please leave a review for seller on Order #${order.orderNumber}.`,
          link: `/orders/${order.id}`,
        },
      });

      return completedOrder;
    });
  }

  async getOrderDetails(userId: string, orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: { include: { book: true, images: true } },
        buyer: { select: { id: true, name: true, email: true, phone: true, rating: true } },
        seller: { select: { id: true, name: true, email: true, phone: true, rating: true } },
        payment: true,
        shipment: { include: { events: { orderBy: { timestamp: 'desc' } } } },
        disputes: { include: { evidences: true } },
        reviews: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!order) throw new NotFoundError('Order not found');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.role !== 'ADMIN' && order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenError('Not authorized to view this order');
    }

    return order;
  }

  async getUserOrders(userId: string, roleType: 'buyer' | 'seller' | 'all' = 'all') {
    const where: any = {};
    if (roleType === 'buyer') where.buyerId = userId;
    else if (roleType === 'seller') where.sellerId = userId;
    else where.OR = [{ buyerId: userId }, { sellerId: userId }];

    return await prisma.order.findMany({
      where,
      include: {
        listing: { include: { book: true, images: { where: { isPrimary: true } } } },
        buyer: { select: { id: true, name: true } },
        seller: { select: { id: true, name: true } },
        shipment: true,
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const orderService = new OrderService();
