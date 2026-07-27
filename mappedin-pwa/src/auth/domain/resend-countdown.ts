/** Cooldown before the user can request another OTP / verification code. */
export const RESEND_OTP_COOLDOWN_SECONDS = 45;
export const RESEND_OTP_COOLDOWN_MS = RESEND_OTP_COOLDOWN_SECONDS * 1000;

/** Formats remaining resend cooldown as `m:ss` (e.g. `0:45`). */
export function formatResendCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
