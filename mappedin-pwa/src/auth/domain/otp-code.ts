/** Expected length of email verification OTP codes. */
export const OTP_CODE_LENGTH = 6;

/** Strips non-digits and caps to the OTP length (autofill / paste safe). */
export function normalizeOtpDigits(
  raw: string,
  length: number = OTP_CODE_LENGTH,
): string {
  return raw.replace(/\D/g, '').slice(0, length);
}

/** True when the value is a complete numeric OTP. */
export function isCompleteOtpCode(
  value: string,
  length: number = OTP_CODE_LENGTH,
): boolean {
  return new RegExp(`^\\d{${length}}$`).test(value);
}
