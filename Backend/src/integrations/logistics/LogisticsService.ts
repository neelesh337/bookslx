import { env } from '../../config/env';
import { LogisticsProvider } from './LogisticsProvider';
import { MockLogisticsProvider } from './MockLogisticsProvider';
import { ShiprocketProvider } from './ShiprocketProvider';

class LogisticsServiceFactory {
  private provider: LogisticsProvider;

  constructor() {
    if (env.LOGISTICS_MODE === 'shiprocket') {
      this.provider = new ShiprocketProvider({
        email: env.LOGISTICS_API_KEY,
        password: env.LOGISTICS_API_SECRET,
        pickupLocation: env.LOGISTICS_PICKUP_LOCATION,
        webhookKey: env.LOGISTICS_WEBHOOK_KEY,
      });
    } else {
      this.provider = new MockLogisticsProvider();
    }
  }

  public getProvider(): LogisticsProvider {
    return this.provider;
  }
}

export const logisticsService = new LogisticsServiceFactory();
