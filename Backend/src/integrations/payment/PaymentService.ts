import { env } from '../../config/env';
import { PaymentProvider } from './PaymentProvider';
import { MockPaymentProvider } from './MockPaymentProvider';
import { RazorpayPaymentProvider } from './RazorpayPaymentProvider';

class PaymentServiceFactory {
  private provider: PaymentProvider;

  constructor() {
    if (env.PAYMENT_MODE === 'razorpay') {
      // If the user hasn't dropped in real keys yet, fall back to mock instead of
      // crashing the server (placeholder detection: rzp_test_ + 'x' padding).
      const hasKeys =
        !!env.RAZORPAY_KEY_ID &&
        !!env.RAZORPAY_KEY_SECRET &&
        !env.RAZORPAY_KEY_ID.includes('xxxxxxxx');

      if (hasKeys) {
        this.provider = new RazorpayPaymentProvider(
          env.RAZORPAY_KEY_ID,
          env.RAZORPAY_KEY_SECRET,
          env.RAZORPAY_WEBHOOK_SECRET
        );
      } else {
        console.warn(
          '[PaymentService] PAYMENT_MODE=razorpay but no Razorpay keys configured — falling back to MockPaymentProvider. ' +
            'Add RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to Backend/.env (free test keys from dashboard.razorpay.com).'
        );
        this.provider = new MockPaymentProvider();
      }
    } else {
      this.provider = new MockPaymentProvider();
    }
  }

  public getProvider(): PaymentProvider {
    return this.provider;
  }

  /** True when the active provider is the real Razorpay integration. */
  public isRazorpay(): boolean {
    return this.provider.name === 'razorpay';
  }
}

export const paymentService = new PaymentServiceFactory();
