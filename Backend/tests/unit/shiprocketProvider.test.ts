import { describe, it, expect, vi } from 'vitest';
import { ShiprocketProvider, mapShiprocketStatus, ShiprocketHttp } from '../../src/integrations/logistics/ShiprocketProvider';
import { CreateShipmentParams } from '../../src/integrations/logistics/LogisticsProvider';
import { AppError } from '../../src/utils/errors';

/** Fake HTTP client — routes calls through a stateful handler and records them. */
function createFakeHttp(handler: (method: 'get' | 'post', url: string, body?: any) => any) {
  const calls: Array<{ method: 'get' | 'post'; url: string; body?: any }> = [];
  const http: ShiprocketHttp = {
    async get(url, _config) {
      calls.push({ method: 'get', url });
      return { data: handler('get', url) };
    },
    async post(url, body, _config) {
      calls.push({ method: 'post', url, body });
      return { data: handler('post', url, body) };
    },
  };
  return { http, calls };
}

const baseShipmentParams: CreateShipmentParams = {
  orderId: 'order-123',
  orderNumber: 'ORD-2026-0001',
  pickupAddress: {
    name: 'Priya Patel',
    phone: '9876543211',
    line1: 'Room 304, Sarojini Naidu Hostel',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400076',
    country: 'India',
  },
  deliveryAddress: {
    name: 'Rahul Sharma',
    phone: '9876543210',
    line1: 'Flat 402, Sunshine Heights',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400053',
    country: 'India',
  },
  deliveryEmail: 'rahul@bookslx.local',
  weightKg: 0.5,
};

function happyPathHandler(method: 'get' | 'post', url: string, body?: any) {
  if (url.includes('/auth/login')) return { token: 'JWT-TOKEN-1' };
  if (url.includes('/orders/create/adhoc')) {
    return { order_id: 'SR-ORDER-1', shipment_id: 47207224 };
  }
  if (url.includes('/courier/serviceability')) {
    return {
      data: [
        { courier_name: 'Bluedart', rate: 110, etd: '2026-08-18', courier_id: 10 },
        { courier_name: 'Delhivery Surface', rate: 85, etd: '2026-08-20', courier_id: 12 },
        { courier_name: 'XpressBees', rate: 90, etd: '2026-08-19', courier_id: 14 },
      ],
    };
  }
  if (url.includes('/courier/assign/awb')) {
    return { awb_assign_status: 1, response: { awb_code: 'AWB-781004001750', courier_name: 'Delhivery Surface', etd: '2026-08-20' } };
  }
  if (url.includes('/courier/generate/label')) {
    return { label_created: true, label_url: 'https://shiprocket.in/labels/AWB-781004001750.pdf' };
  }
  if (url.includes('/orders/cancel')) {
    return { success: true, message: 'Order cancelled successfully' };
  }
  if (url.includes('/courier/track/awb')) {
    return {
      tracking_data: {
        awb_code: 'AWB-781004001750',
        courier_name: 'Delhivery Surface',
        shipment_status: 'IN TRANSIT',
        etd: '2026-08-20',
        shipment_track: [
          { status: 'Manifested', activity: 'Manifest uploaded', location: 'Mumbai', date: '2026-08-17 10:00:00' },
          { status: 'Picked Up', activity: 'Shipment picked up', location: 'Mumbai', date: '2026-08-17 14:00:00' },
        ],
      },
    };
  }
  throw new Error(`Unexpected ${method.toUpperCase()} ${url}`);
}

describe('mapShiprocketStatus', () => {
  it('maps delivery labels onto BooksLX statuses', () => {
    expect(mapShiprocketStatus('DELIVERED')).toBe('DELIVERED');
    expect(mapShiprocketStatus('Out for Delivery')).toBe('OUT_FOR_DELIVERY');
    expect(mapShiprocketStatus('IN TRANSIT')).toBe('IN_TRANSIT');
    expect(mapShiprocketStatus('PICKED UP')).toBe('IN_TRANSIT');
    expect(mapShiprocketStatus('Manifested')).toBe('IN_TRANSIT');
  });

  it('returns UNKNOWN for non-forward states', () => {
    expect(mapShiprocketStatus('FAILED')).toBe('UNKNOWN');
    expect(mapShiprocketStatus('RETURNED')).toBe('UNKNOWN');
    expect(mapShiprocketStatus('CANCELLED')).toBe('UNKNOWN');
    expect(mapShiprocketStatus(undefined)).toBe('UNKNOWN');
  });
});

describe('ShiprocketProvider.createShipment', () => {
  it('authenticates, creates the order, picks the cheapest courier, and returns the AWB', async () => {
    const { http, calls } = createFakeHttp(happyPathHandler);
    const provider = new ShiprocketProvider({ email: 'api@bookslx.local', password: 'secret', http });

    const result = await provider.createShipment(baseShipmentParams);

    expect(result.status).toBe('SHIPPED');
    expect(result.trackingNumber).toBe('AWB-781004001750');
    expect(result.courierName).toBe('Delhivery Surface'); // cheapest (85) chosen over Bluedart (110)
    expect(result.trackingUrl).toContain('AWB-781004001750');
    expect(result.shipmentId).toBe('47207224');
    expect(result.events.length).toBe(1);

    // Auth first, then the shipment flow in order.
    const urls = calls.map((c) => c.url);
    expect(urls[0]).toContain('/auth/login');
    expect(urls.some((u) => u.includes('/orders/create/adhoc'))).toBe(true);
    expect(urls.some((u) => u.includes('/courier/serviceability'))).toBe(true);
    expect(urls.some((u) => u.includes('/courier/assign/awb'))).toBe(true);
    expect(urls.some((u) => u.includes('/courier/generate/label'))).toBe(true);

    // The adhoc order carried the buyer's delivery address + email + weight.
    const adhoc = calls.find((c) => c.url.includes('/orders/create/adhoc'))?.body;
    expect(adhoc.billing_customer_name).toBe('Rahul Sharma');
    expect(adhoc.billing_pincode).toBe('400053');
    expect(adhoc.billing_email).toBe('rahul@bookslx.local');
    expect(adhoc.weight).toBe(0.5);
    expect(adhoc.order_id).toBe('ORD-2026-0001');
  });

  it('caches the auth token across shipments (login happens once)', async () => {
    let loginCount = 0;
    const { http } = createFakeHttp((method, url) => {
      if (url.includes('/auth/login')) {
        loginCount += 1;
        return { token: 'JWT-TOKEN-1' };
      }
      return happyPathHandler(method, url);
    });
    const provider = new ShiprocketProvider({ email: 'api@bookslx.local', password: 'secret', http });

    await provider.createShipment(baseShipmentParams);
    await provider.createShipment(baseShipmentParams);

    expect(loginCount).toBe(1);
  });

  it('re-authenticates and retries once when a request comes back 401', async () => {
    let loginCount = 0;
    let assignAttempts = 0;
    const { http } = createFakeHttp((method, url) => {
      if (url.includes('/auth/login')) {
        loginCount += 1;
        return { token: `JWT-TOKEN-${loginCount}` };
      }
      if (url.includes('/orders/create/adhoc')) return { order_id: 'SR-ORDER-1', shipment_id: 47207224 };
      if (url.includes('/courier/serviceability')) {
        return { data: [{ courier_name: 'Delhivery', rate: 85, courier_id: 12 }] };
      }
      if (url.includes('/courier/assign/awb')) {
        assignAttempts += 1;
        if (assignAttempts === 1) {
          throw Object.assign(new Error('Token expired'), { response: { status: 401 } });
        }
        return { awb_assign_status: 1, response: { awb_code: 'AWB-2', courier_name: 'Delhivery' } };
      }
      if (url.includes('/courier/generate/label')) return { label_url: '' };
      throw new Error(`Unexpected ${method.toUpperCase()} ${url}`);
    });
    const provider = new ShiprocketProvider({ email: 'api@bookslx.local', password: 'secret', http });

    const result = await provider.createShipment(baseShipmentParams);

    expect(result.trackingNumber).toBe('AWB-2');
    expect(loginCount).toBe(2); // initial + refresh after 401
  });

  it('throws SHIPROCKET_ORDER_FAILED when the order response has no shipment_id', async () => {
    const { http } = createFakeHttp((method, url) => {
      if (url.includes('/auth/login')) return { token: 'T' };
      if (url.includes('/orders/create/adhoc')) return { order_id: 'SR-ORDER-1' }; // no shipment_id
      throw new Error(`Unexpected ${method.toUpperCase()} ${url}`);
    });
    const provider = new ShiprocketProvider({ email: 'a@b.c', password: 'p', http });

    const err: any = await provider.createShipment(baseShipmentParams).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('SHIPROCKET_ORDER_FAILED');
  });

  it('throws SHIPROCKET_NO_COURIER when no courier serves the route', async () => {
    const { http } = createFakeHttp((method, url) => {
      if (url.includes('/auth/login')) return { token: 'T' };
      if (url.includes('/orders/create/adhoc')) return { order_id: 'SR-ORDER-1', shipment_id: 47207224 };
      if (url.includes('/courier/serviceability')) return { data: [] };
      throw new Error(`Unexpected ${method.toUpperCase()} ${url}`);
    });
    const provider = new ShiprocketProvider({ email: 'a@b.c', password: 'p', http });

    const err: any = await provider.createShipment(baseShipmentParams).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('SHIPROCKET_NO_COURIER');
  });

  it('throws SHIPROCKET_AWB_FAILED when no AWB is assigned', async () => {
    const { http } = createFakeHttp((method, url) => {
      if (url.includes('/auth/login')) return { token: 'T' };
      if (url.includes('/orders/create/adhoc')) return { order_id: 'SR-ORDER-1', shipment_id: 47207224 };
      if (url.includes('/courier/serviceability')) {
        return { data: [{ courier_name: 'Delhivery', rate: 85, courier_id: 12 }] };
      }
      if (url.includes('/courier/assign/awb')) return { awb_assign_status: 0, response: {} }; // no awb_code
      throw new Error(`Unexpected ${method.toUpperCase()} ${url}`);
    });
    const provider = new ShiprocketProvider({ email: 'a@b.c', password: 'p', http });

    const err: any = await provider.createShipment(baseShipmentParams).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('SHIPROCKET_AWB_FAILED');
  });
});

describe('ShiprocketProvider.getTracking / cancelShipment', () => {
  it('maps the tracking response and scans into a ShipmentResult', async () => {
    const { http } = createFakeHttp(happyPathHandler);
    const provider = new ShiprocketProvider({ email: 'a@b.c', password: 'p', http });

    const result = await provider.getTracking('AWB-781004001750');

    expect(result.status).toBe('IN_TRANSIT');
    expect(result.courierName).toBe('Delhivery Surface');
    expect(result.events.length).toBe(2);
    expect(result.events[0].status).toBe('IN_TRANSIT'); // Manifested -> IN_TRANSIT
    expect(result.events[1].status).toBe('IN_TRANSIT'); // Picked Up -> IN_TRANSIT
    expect(result.events[1].location).toBe('Mumbai');
  });

  it('cancels a shipment by AWB', async () => {
    const { http, calls } = createFakeHttp(happyPathHandler);
    const provider = new ShiprocketProvider({ email: 'a@b.c', password: 'p', http });

    const result = await provider.cancelShipment('AWB-781004001750');

    expect(result.success).toBe(true);
    const cancelCall = calls.find((c) => c.url.includes('/orders/cancel'));
    expect(cancelCall?.body?.awb).toBe('AWB-781004001750');
  });
});

describe('ShiprocketProvider.handleWebhook', () => {
  const webhookPayload = (status: string, awb = 'AWB-781004001750') => ({
    awb,
    courier_name: 'Delhivery Surface',
    current_status: status,
    scans: [{ date: '2026-08-17 14:00:00', status: 'Picked Up', activity: 'Shipment picked up', location: 'Mumbai' }],
  });

  it('verifies with the configured x-api-key security token and maps the status', async () => {
    const provider = new ShiprocketProvider({
      email: 'a@b.c',
      password: 'p',
      webhookKey: 'wh-secret',
      http: createFakeHttp(happyPathHandler).http,
    });

    const result = await provider.handleWebhook(
      { 'x-api-key': 'wh-secret' },
      JSON.stringify(webhookPayload('IN TRANSIT'))
    );

    expect(result.verified).toBe(true);
    expect(result.status).toBe('IN_TRANSIT');
    expect(result.trackingNumber).toBe('AWB-781004001750');
    expect(result.location).toBe('Mumbai');
  });

  it('rejects a webhook with a missing or wrong security token', async () => {
    const provider = new ShiprocketProvider({
      email: 'a@b.c',
      password: 'p',
      webhookKey: 'wh-secret',
      http: createFakeHttp(happyPathHandler).http,
    });

    const missing = await provider.handleWebhook({}, JSON.stringify(webhookPayload('IN TRANSIT')));
    expect(missing.verified).toBe(false);

    const wrong = await provider.handleWebhook(
      { 'x-api-key': 'wrong' },
      JSON.stringify(webhookPayload('IN TRANSIT'))
    );
    expect(wrong.verified).toBe(false);
  });

  it('maps DELIVERED and OUT FOR DELIVERY, and returns UNKNOWN for FAILED', async () => {
    const provider = new ShiprocketProvider({
      email: 'a@b.c',
      password: 'p',
      http: createFakeHttp(happyPathHandler).http,
    });

    const delivered = await provider.handleWebhook({}, JSON.stringify(webhookPayload('DELIVERED')));
    expect(delivered.status).toBe('DELIVERED');

    const ofd = await provider.handleWebhook({}, JSON.stringify(webhookPayload('Out for Delivery')));
    expect(ofd.status).toBe('OUT_FOR_DELIVERY');

    const failed = await provider.handleWebhook({}, JSON.stringify(webhookPayload('FAILED')));
    expect(failed.status).toBe('UNKNOWN');
  });

  it('skips status mapping when no security token is configured (open webhook)', async () => {
    const provider = new ShiprocketProvider({
      email: 'a@b.c',
      password: 'p',
      http: createFakeHttp(happyPathHandler).http,
    });

    const result = await provider.handleWebhook({}, JSON.stringify(webhookPayload('IN TRANSIT')));
    expect(result.verified).toBe(true);
  });
});
