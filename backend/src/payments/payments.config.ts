import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Online payment provider settings. A provider is enabled only when all of its keys are set. */
@Injectable()
export class PaymentsConfig {
  constructor(private readonly config: ConfigService) {}

  private get(key: string) {
    return (this.config.get<string>(key) || '').trim();
  }

  get siteUrl() {
    return (this.get('PUBLIC_SITE_URL') || this.get('FRONTEND_URL') || 'http://localhost:3000').replace(/\/+$/, '');
  }

  get payme() {
    const merchantId = this.get('PAYME_MERCHANT_ID');
    const key = this.get('PAYME_KEY');
    const testMode = ['1', 'true', 'yes'].includes(this.get('PAYME_TEST_MODE').toLowerCase());
    return {
      enabled: Boolean(merchantId && key),
      merchantId,
      key,
      testMode,
      checkoutBase: testMode ? 'https://checkout.test.paycom.uz' : 'https://checkout.paycom.uz',
    };
  }

  get click() {
    const serviceId = this.get('CLICK_SERVICE_ID');
    const merchantId = this.get('CLICK_MERCHANT_ID');
    const secretKey = this.get('CLICK_SECRET_KEY');
    return { enabled: Boolean(serviceId && merchantId && secretKey), serviceId, merchantId, secretKey };
  }
}
