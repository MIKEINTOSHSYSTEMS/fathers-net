export type OtpChannel = 'sms' | 'whatsapp';
export type OtpPurpose = 'registration' | 'login';

export interface OtpDeliveryRequest {
  /** E.164 phone number (PII — must never be logged by any provider). */
  phone: string;
  /** The one-time passcode (secret — must never be logged by any provider). */
  code: string;
  channel: OtpChannel;
  purpose: OtpPurpose;
  /** X-Request-Id correlation id. */
  requestId: string;
}

/**
 * OTP delivery provider adapter (M-02 deferred, M-08). Phase 2 uses the
 * in-memory test-double; a production SMS/WhatsApp provider lands in Phase 4
 * behind this same interface. Providers must never log the code or phone.
 */
export interface OtpDeliveryProvider {
  deliver(request: OtpDeliveryRequest): Promise<void>;
}

/** Hermetic delivery test-double: records deliveries for assertions. */
export interface InMemoryOtpDeliveryProvider extends OtpDeliveryProvider {
  deliveries: OtpDeliveryRequest[];
  /** The most recently delivered code (test seam only). */
  lastCode: string | null;
}

export function createInMemoryOtpDeliveryProvider(): InMemoryOtpDeliveryProvider {
  const deliveries: OtpDeliveryRequest[] = [];
  return {
    deliveries,
    get lastCode(): string | null {
      if (deliveries.length === 0) {
        return null;
      }
      return deliveries[deliveries.length - 1].code;
    },
    async deliver(request: OtpDeliveryRequest): Promise<void> {
      deliveries.push(request);
    },
  };
}
