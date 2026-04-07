function isTruthyEnv(value) {
  return ['true', '1', 'yes'].includes(value?.trim().toLowerCase());
}

export function isMessageContentIntentEnabled() {
  return isTruthyEnv(process.env.ENABLE_MESSAGE_CONTENT_INTENT);
}

export function isHttpServerEnabled() {
  if (process.env.ENABLE_HTTP_SERVER !== undefined) {
    return isTruthyEnv(process.env.ENABLE_HTTP_SERVER);
  }

  return !process.env.DYNO?.startsWith('worker.');
}
