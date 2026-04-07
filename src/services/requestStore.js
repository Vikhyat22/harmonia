import { randomUUID } from 'crypto';

const REQUEST_TTL_MS = 15 * 60 * 1000;
const pendingRequests = new Map();

function cleanupExpiredRequests() {
  const now = Date.now();

  for (const [requestId, request] of pendingRequests.entries()) {
    if (request.expiresAt <= now) {
      pendingRequests.delete(requestId);
    }
  }
}

export function createPendingRequest({
  guildId,
  userId,
  text,
  voiceChannelId = null,
  requestChannelId = null
}) {
  cleanupExpiredRequests();

  const requestId = randomUUID().slice(0, 8);
  pendingRequests.set(requestId, {
    guildId,
    userId,
    text,
    voiceChannelId,
    requestChannelId,
    expiresAt: Date.now() + REQUEST_TTL_MS
  });

  return requestId;
}

export function getPendingRequest(requestId) {
  cleanupExpiredRequests();
  return pendingRequests.get(requestId) ?? null;
}

export function deletePendingRequest(requestId) {
  pendingRequests.delete(requestId);
}

export function clearPendingRequests() {
  pendingRequests.clear();
}
