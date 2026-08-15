import axios from 'axios';
import { LogisticsProvider, CreateShipmentParams, ShipmentResult } from './LogisticsProvider';
import { AppError } from '../../utils/errors';

const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';
// Shiprocket auth tokens are valid for 240 hours (10 days) — cache and refresh.
const TOKEN_TTL_MS = 10 * 24 * 60 * 60 * 1000;
const DEFAULT_WEIGHT_KG = 0.5;

/** Minimal HTTP surface so tests can inject a fake client. */
export interface ShiprocketHttp {
  get(url: string, config?: Record<string, any>): Promise<{ data: any }>;
  post(url: string, body?: any, config?: Record<string, any>): Promise<{ data: any }>;
}

export interface ShiprocketConfig {
  email: string;
  password: string;
  /** Pickup location name as registered in the Shiprocket panel (default: "default"). */
  pickupLocation?: string;
  /** Optional webhook security token — Shiprocket sends it as the `x-api-key` header. */
  webhookKey?: string;
  /** Injectable HTTP client (defaults to axios) for tests. */
  http?: ShiprocketHttp;
}

/**
 * Maps a Shiprocket status label (e.g. "IN TRANSIT", "Out for Delivery",
 * "DELIVERED", "PICKED UP", "FAILED") onto BooksLX's shipment statuses.
 * Returns 'UNKNOWN' for anything that is not a forward delivery step
 * (FAILED / RETURNED / CANCELLED) so callers can skip those.
 */
export function mapShiprocketStatus(
  raw: string | null | undefined
): 'SHIPPED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'UNKNOWN' {
  const s = (raw || '')
    .toUpperCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Order matters: "OUT FOR DELIVERY" contains "DELIVER" — check it first.
  if (s.includes('OUT FOR DELIVERY')) return 'OUT_FOR_DELIVERY';
  if (s.includes('DELIVER')) return 'DELIVERED';
  if (
    s.includes('IN TRANSIT') ||
    s.includes('TRANSIT') ||
    s.includes('PICKED UP') ||
    s.includes('PICKUP') ||
    s.includes('MANIFEST') ||
    s.includes('SHIPPED') ||
    s.includes('ACCEPTED')
  ) {
    return 'IN_TRANSIT';
  }
  return 'UNKNOWN';
}

/** Parses Shiprocket's loose date formats into a Date, or falls back to now + N days. */
function parseEtd(raw: string | number | null | undefined, fallbackDays = 4): Date {
  if (!raw) {
    const d = new Date();
    d.setDate(d.getDate() + fallbackDays);
    return d;
  }
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + fallbackDays);
    return fallback;
  }
  return d;
}

const authHeaders = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

/**
 * Real Shiprocket integration (base URL: apiv2.shiprocket.in).
 *
 * Flow when a seller ships an order:
 *   1. auth/login with the API-user email + password -> Bearer token (cached, 10d TTL)
 *   2. orders/create/adhoc with pickup + delivery addresses -> shipment_id
 *   3. courier/serviceability -> pick the cheapest serviceable courier
 *   4. courier/assign/awb -> AWB (tracking number) + courier name + ETA
 *   5. courier/generate/label (best-effort) -> label PDF URL for the tracking link
 *
 * Tracking statuses arrive via webhook (POST with `awb`, `current_status`,
 * `scans[]`) — verified against `LOGISTICS_WEBHOOK_KEY` (x-api-key header).
 */
export class ShiprocketProvider implements LogisticsProvider {
  public name = 'shiprocket';
  private email: string;
  private password: string;
  private pickupLocation: string;
  private webhookKey: string;
  private http: ShiprocketHttp;
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: ShiprocketConfig) {
    this.email = config.email;
    this.password = config.password;
    this.pickupLocation = config.pickupLocation || 'default';
    this.webhookKey = config.webhookKey || '';
    this.http = config.http || (axios as unknown as ShiprocketHttp);
  }

  /** Returns a cached Bearer token, refreshing (or re-logging-in on 401) as needed. */
  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;

    const res = await this.http.post(`${SHIPROCKET_BASE_URL}/auth/login`, {
      email: this.email,
      password: this.password,
    });
    const token = res.data?.token;
    if (!token) {
      throw new AppError(
        'Shiprocket login failed — no token returned. Check LOGISTICS_API_KEY (email) and LOGISTICS_API_SECRET (password).',
        502,
        'SHIPROCKET_AUTH_FAILED'
      );
    }

    this.token = token;
    this.tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
    return token;
  }

  /** POST helper that transparently refreshes the token once on a 401. */
  private async authedPost(url: string, body: any): Promise<{ data: any }> {
    try {
      return await this.http.post(url, body, authHeaders(await this.getToken()));
    } catch (err: any) {
      if (err?.response?.status === 401) {
        this.token = null; // force re-login
        return await this.http.post(url, body, authHeaders(await this.getToken()));
      }
      throw this.toAppError(err, 'Shiprocket request failed');
    }
  }

  /** GET helper with the same one-shot 401 refresh. */
  private async authedGet(url: string): Promise<{ data: any }> {
    try {
      return await this.http.get(url, authHeaders(await this.getToken()));
    } catch (err: any) {
      if (err?.response?.status === 401) {
        this.token = null;
        return await this.http.get(url, authHeaders(await this.getToken()));
      }
      throw this.toAppError(err, 'Shiprocket request failed');
    }
  }

  private toAppError(err: any, fallbackMessage: string): AppError {
    const status = err?.response?.status;
    const message = err?.response?.data?.message || err?.response?.data?.error || err?.message || fallbackMessage;
    if (status === 401) {
      return new AppError('Shiprocket authentication failed — check your API user credentials.', 502, 'SHIPROCKET_AUTH_FAILED');
    }
    if (status === 429) {
      return new AppError('Shiprocket rate limit exceeded — try again shortly.', 429, 'SHIPROCKET_RATE_LIMITED');
    }
    return new AppError(`Shiprocket: ${message}`, status && status >= 400 && status < 500 ? 502 : 500, 'SHIPROCKET_ERROR');
  }

  async createShipment(params: CreateShipmentParams): Promise<ShipmentResult> {
    const weightKg = params.weightKg ?? DEFAULT_WEIGHT_KG;

    // 1. Create the adhoc order — Shiprocket returns its own order_id + shipment_id.
    const orderRes = await this.authedPost(`${SHIPROCKET_BASE_URL}/orders/create/adhoc`, {
      order_id: params.orderNumber,
      order_date: new Date().toISOString().replace('T', ' ').slice(0, 16),
      pickup_location: this.pickupLocation,
      comment: `BooksLX order ${params.orderNumber}`,
      billing_customer_name: params.deliveryAddress.name,
      billing_last_name: '',
      billing_address: [params.deliveryAddress.line1, params.deliveryAddress.line2].filter(Boolean).join(', '),
      billing_city: params.deliveryAddress.city,
      billing_pincode: params.deliveryAddress.postalCode,
      billing_state: params.deliveryAddress.state,
      billing_country: params.deliveryAddress.country,
      billing_email: params.deliveryEmail || '',
      billing_phone: params.deliveryAddress.phone,
      shipping_is_billing: true,
      order_items: [
        {
          name: `Book (${params.orderNumber})`,
          sku: params.orderId,
          units: 1,
          selling_price: '0',
          discount: '',
          tax: '',
          hsn: '',
        },
      ],
      payment_method: 'Prepaid',
      shipping_charges: 0,
      gift_wrap: false,
      txn_gift_wrap: false,
      sub_total: '0',
      length: 15,
      breadth: 15,
      height: 5,
      weight: weightKg,
    });

    const shipmentId = orderRes.data?.shipment_id;
    if (!shipmentId) {
      throw new AppError(
        'Shiprocket created the order without a shipment_id — check the pickup location is registered in the Shiprocket panel.',
        502,
        'SHIPROCKET_ORDER_FAILED'
      );
    }

    // 2. Find a serviceable courier for the route and pick the cheapest.
    const svcRes = await this.authedGet(
      `${SHIPROCKET_BASE_URL}/courier/serviceability/?pickup_postcode=${encodeURIComponent(
        params.pickupAddress.postalCode
      )}&delivery_postcode=${encodeURIComponent(params.deliveryAddress.postalCode)}&weight=${weightKg}&cod=0`
    );
    const couriers: any[] = Array.isArray(svcRes.data?.data) ? svcRes.data.data : [];
    const courier = [...couriers].sort((a, b) => Number(a.rate ?? 0) - Number(b.rate ?? 0))[0];

    if (!courier || !courier.courier_id) {
      throw new AppError(
        `No courier is serviceable between ${params.pickupAddress.postalCode} and ${params.deliveryAddress.postalCode}.`,
        502,
        'SHIPROCKET_NO_COURIER'
      );
    }

    // 3. Assign the AWB (tracking number) for the chosen courier.
    const assignRes = await this.authedPost(`${SHIPROCKET_BASE_URL}/courier/assign/awb`, {
      shipment_id: String(shipmentId),
      courier_id: String(courier.courier_id),
      is_return: 0,
    });

    const assigned = assignRes.data?.response || assignRes.data || {};
    const awb: string = assigned.awb_code || assignRes.data?.awb_code || '';
    if (!awb) {
      throw new AppError(
        `Shiprocket did not assign an AWB for shipment ${shipmentId}.`,
        502,
        'SHIPROCKET_AWB_FAILED'
      );
    }

    // 4. Best-effort label PDF — used as the live tracking link when available.
    let labelUrl: string = assigned.label_url || '';
    if (!labelUrl) {
      try {
        const labelRes = await this.authedPost(`${SHIPROCKET_BASE_URL}/courier/generate/label`, {
          shipment_id: String(shipmentId),
        });
        labelUrl = labelRes.data?.label_url || '';
      } catch {
        // Label generation is optional — the tracking page still works without it.
      }
    }

    const courierName: string = assigned.courier_name || courier.courier_name || 'Shiprocket Courier';
    const etdRaw = assigned.etd || courier.etd || null;

    return {
      shipmentId: String(shipmentId),
      orderId: params.orderId,
      courierName,
      trackingNumber: awb,
      trackingUrl: labelUrl || `https://shiprocket.co/track/awb/${awb}`,
      status: 'SHIPPED',
      estDeliveryDate: parseEtd(etdRaw),
      shippedAt: new Date(),
      events: [
        {
          status: 'SHIPPED',
          description: `Shipment created via Shiprocket (${courierName}) — AWB ${awb}`,
          location: params.pickupAddress.city,
          timestamp: new Date(),
        },
      ],
    };
  }

  async getTracking(trackingNumber: string): Promise<ShipmentResult> {
    const res = await this.authedGet(`${SHIPROCKET_BASE_URL}/courier/track/awb/${encodeURIComponent(trackingNumber)}`);
    const tracking = res.data?.tracking_data || res.data || {};
    const scans: any[] = Array.isArray(tracking.shipment_track) ? tracking.shipment_track : [];

    const mapped = mapShiprocketStatus(tracking.shipment_status || tracking.track_status);
    const status = mapped === 'UNKNOWN' ? 'IN_TRANSIT' : mapped;

    return {
      shipmentId: trackingNumber,
      orderId: trackingNumber,
      courierName: tracking.courier_name || 'Shiprocket Courier',
      trackingNumber,
      trackingUrl: `https://shiprocket.co/track/awb/${trackingNumber}`,
      status,
      estDeliveryDate: parseEtd(tracking.etd),
      events: scans.map((scan) => {
        const mapped = mapShiprocketStatus(scan.status || scan.activity);
        return {
          status: mapped === 'UNKNOWN' ? 'IN_TRANSIT' : mapped,
          description: scan.activity || scan.status || 'Tracking update',
          location: scan.location || undefined,
          timestamp: new Date(scan.date || Date.now()),
        };
      }),
    };
  }

  async cancelShipment(trackingNumber: string): Promise<{ success: boolean; message: string }> {
    const res = await this.authedPost(`${SHIPROCKET_BASE_URL}/orders/cancel`, {
      awb: trackingNumber,
    });
    const success = res.data?.success !== false;
    return {
      success,
      message: res.data?.message || `Shiprocket shipment ${trackingNumber} cancelled.`,
    };
  }

  /**
   * Verifies a Shiprocket tracking webhook. Shiprocket posts `awb`,
   * `current_status`, `scans[]`, etc. to our URL with an optional `x-api-key`
   * security token (configured as LOGISTICS_WEBHOOK_KEY). Status is mapped to
   * BooksLX statuses — 'UNKNOWN' means "acknowledge but don't move the order".
   */
  async handleWebhook(
    headers: Record<string, any>,
    payload: any
  ): Promise<{ verified: boolean; status: string; trackingNumber: string; location?: string }> {
    // Verify the security token when one is configured (Shiprocket: x-api-key).
    let verified = true;
    if (this.webhookKey) {
      const provided = headers['x-api-key'];
      verified = !!provided && String(provided) === this.webhookKey;
    }
    if (!verified) {
      return { verified: false, status: 'UNKNOWN', trackingNumber: '' };
    }

    let data: any = payload;
    if (typeof payload === 'string') {
      try {
        data = JSON.parse(payload);
      } catch {
        return { verified: true, status: 'UNKNOWN', trackingNumber: '' };
      }
    }

    const trackingNumber = data?.awb || data?.tracking_number || '';
    const status = mapShiprocketStatus(data?.current_status || data?.shipment_status);
    const scans: any[] = Array.isArray(data?.scans) ? data.scans : [];
    const lastScan = scans[scans.length - 1];
    const location = lastScan?.location || data?.location || undefined;

    return { verified: true, status, trackingNumber, location };
  }
}
