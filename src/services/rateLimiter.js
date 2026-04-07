const WINDOW_MS = 15_000;
const MAX_REQUESTS_PER_WINDOW = 3;
const MAX_QUEUED_PER_USER = 3;

const userWindows = new Map();

function getUserKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

export function checkRateLimit({
  guildId,
  userId,
  queuedCountForUser,
  kind = 'tts',
  ignoreQueueDepth = false
}) {
  const key = getUserKey(guildId, userId);
  const now = Date.now();
  const timestamps = (userWindows.get(key) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);

  if (!ignoreQueueDepth && queuedCountForUser >= MAX_QUEUED_PER_USER) {
    userWindows.set(key, timestamps);
    return {
      allowed: false,
      error: kind === 'music'
        ? `You already have ${MAX_QUEUED_PER_USER} queued tracks in this server. Please wait for some to finish before queueing more.`
        : `You already have ${MAX_QUEUED_PER_USER} queued messages in this server. Please wait for some to finish or use /dequeue.`
    };
  }

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    userWindows.set(key, timestamps);
    return {
      allowed: false,
      error: kind === 'music'
        ? 'You are sending music requests too quickly. Please wait a few seconds and try again.'
        : 'You are sending TTS requests too quickly. Please wait a few seconds and try again.'
    };
  }

  timestamps.push(now);
  userWindows.set(key, timestamps);
  return { allowed: true };
}

export function resetRateLimiter() {
  userWindows.clear();
}
