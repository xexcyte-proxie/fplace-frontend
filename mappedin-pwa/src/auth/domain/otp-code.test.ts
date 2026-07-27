import { describe, expect, it } from 'vitest';
import {
  isCompleteOtpCode,
  normalizeOtpDigits,
  OTP_CODE_LENGTH,
} from './otp-code';

describe('normalizeOtpDigits', () => {
  it('strips non-digits and caps length for autofill payloads', () => {
    expect(normalizeOtpDigits('12-34 56')).toBe('123456');
    expect(normalizeOtpDigits('9876543210')).toBe('987654');
    expect(normalizeOtpDigits('abc')).toBe('');
  });

  it('respects a custom length', () => {
    expect(normalizeOtpDigits('123456', 4)).toBe('1234');
  });
});

describe('isCompleteOtpCode', () => {
  it('accepts exact-length numeric codes', () => {
    expect(isCompleteOtpCode('123456')).toBe(true);
    expect(isCompleteOtpCode('12345')).toBe(false);
    expect(isCompleteOtpCode('12345a')).toBe(false);
    expect(OTP_CODE_LENGTH).toBe(6);
  });
});
