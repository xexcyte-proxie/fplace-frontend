import type {
  GuestFingerprintRecord,
  GuestFingerprintResponse,
} from '../../domain/entities';
import { createGuestFingerprintResponse } from '../../domain/entities';

const STORAGE_KEY = 'fplaces_guest_fingerprint_records';

/**
 * In-memory (+ localStorage) fake backend for guest fingerprint APIs.
 *
 * Replace this datasource with a remote HTTP client later; the repository
 * interface and response shapes stay the same.
 */
export class GuestFingerprintMockDatasource {
  private records = new Map<string, GuestFingerprintRecord>();

  constructor() {
    this.hydrateFromStorage();
  }

  async validateGuestFingerprint(
    visitorId: string,
  ): Promise<GuestFingerprintResponse> {
    await this.simulateLatency();

    const normalized = this.normalizeVisitorId(visitorId);
    const existing = this.records.get(normalized);

    if (!existing) {
      return this.registerGuestFingerprint(normalized);
    }

    if (existing.limitReached) {
      return createGuestFingerprintResponse({
        allowed: false,
        guestId: existing.guestId,
        reason: 'Guest limit reached',
      });
    }

    const updated: GuestFingerprintRecord = {
      ...existing,
      lastSeenAt: new Date().toISOString(),
    };
    this.records.set(normalized, updated);
    this.persist();

    return createGuestFingerprintResponse({
      allowed: true,
      guestId: updated.guestId,
      reason: null,
    });
  }

  async registerGuestFingerprint(
    visitorId: string,
  ): Promise<GuestFingerprintResponse> {
    await this.simulateLatency();

    const normalized = this.normalizeVisitorId(visitorId);
    const existing = this.records.get(normalized);

    if (existing) {
      if (existing.limitReached) {
        return createGuestFingerprintResponse({
          allowed: false,
          guestId: existing.guestId,
          reason: 'Guest limit reached',
        });
      }

      return createGuestFingerprintResponse({
        allowed: true,
        guestId: existing.guestId,
        reason: null,
      });
    }

    const now = new Date().toISOString();
    const record: GuestFingerprintRecord = {
      visitorId: normalized,
      guestId: this.createGuestId(),
      createdAt: now,
      limitReached: false,
      lastSeenAt: now,
    };

    this.records.set(normalized, record);
    this.persist();

    return createGuestFingerprintResponse({
      allowed: true,
      guestId: record.guestId,
      reason: null,
    });
  }

  async markGuestLimitReached(
    visitorId: string,
  ): Promise<GuestFingerprintResponse> {
    await this.simulateLatency();

    const normalized = this.normalizeVisitorId(visitorId);
    const existing = this.records.get(normalized);

    if (!existing) {
      const now = new Date().toISOString();
      const record: GuestFingerprintRecord = {
        visitorId: normalized,
        guestId: this.createGuestId(),
        createdAt: now,
        limitReached: true,
        lastSeenAt: now,
      };
      this.records.set(normalized, record);
      this.persist();

      return createGuestFingerprintResponse({
        allowed: false,
        guestId: record.guestId,
        reason: 'Guest limit reached',
      });
    }

    const updated: GuestFingerprintRecord = {
      ...existing,
      limitReached: true,
      lastSeenAt: new Date().toISOString(),
    };
    this.records.set(normalized, updated);
    this.persist();

    return createGuestFingerprintResponse({
      allowed: false,
      guestId: updated.guestId,
      reason: 'Guest limit reached',
    });
  }

  /** Test helper — clear all mock guest records (memory + localStorage). */
  clearAll(): void {
    this.records.clear();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  /** Test helper — inspect stored mock records. */
  listRecords(): GuestFingerprintRecord[] {
    return Array.from(this.records.values()).map((record) => ({ ...record }));
  }

  private normalizeVisitorId(visitorId: string): string {
    const trimmed = visitorId.trim();
    if (!trimmed) {
      throw new Error('visitorId is required');
    }
    return trimmed;
  }

  private createGuestId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `guest_${crypto.randomUUID()}`;
    }
    return `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private hydrateFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as GuestFingerprintRecord[];
      if (!Array.isArray(parsed)) return;
      for (const record of parsed) {
        if (record?.visitorId && record?.guestId) {
          this.records.set(record.visitorId, record);
        }
      }
    } catch {
      /* ignore corrupt / unavailable storage */
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Array.from(this.records.values())),
      );
    } catch {
      /* storage unavailable — memory-only for this session */
    }
  }

  /** Small delay so callers behave like a real network boundary. */
  private simulateLatency(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, 40 + Math.floor(Math.random() * 80));
    });
  }
}

export const guestFingerprintMockDatasource =
  new GuestFingerprintMockDatasource();
