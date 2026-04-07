import { randomUUID } from 'crypto';

const REVEAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const revealRecords = new Map();

function cleanupExpiredRecords() {
  const now = Date.now();

  for (const [revealId, record] of revealRecords.entries()) {
    if (record.expiresAt <= now) {
      revealRecords.delete(revealId);
    }
  }
}

export function createSpeakRevealRecord(payload) {
  cleanupExpiredRecords();

  const revealId = randomUUID().slice(0, 10);
  revealRecords.set(revealId, {
    ...payload,
    expiresAt: Date.now() + REVEAL_TTL_MS
  });

  return revealId;
}

export function getSpeakRevealRecord(revealId) {
  cleanupExpiredRecords();
  return revealRecords.get(revealId) ?? null;
}
