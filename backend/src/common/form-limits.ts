/**
 * Per-IP limits for public forms. The throttler keeps counters in this process (no Redis store is
 * configured), so on several instances or serverless each instance counts on its own; production
 * with more than one instance needs shared storage for these limits to be exact.
 */
const isTest = process.env.NODE_ENV === 'test';
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

/** Booking, callback (leads) and contact forms: 5 per 15 minutes per IP. */
export const PUBLIC_FORM_LIMIT = { default: { limit: 5, ttl: FIFTEEN_MINUTES } };
/** Online booking: same 5 per 15 minutes; the e2e suite books many visits from one address. */
export const BOOKING_FORM_LIMIT = { default: { limit: isTest ? 1000 : 5, ttl: FIFTEEN_MINUTES } };
/** Reviews: 3 per hour per IP. */
export const REVIEW_FORM_LIMIT = { default: { limit: 3, ttl: ONE_HOUR } };
