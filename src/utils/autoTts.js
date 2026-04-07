export function sanitizeAutoTtsContent(text) {
  return text
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/<a?:\w+:\d+>/g, '')
    .replace(/<@!?\d+>/g, ' mention ')
    .replace(/<#\d+>/g, ' channel ')
    .replace(/<@&\d+>/g, ' role ')
    .replace(/[*_~`>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsBlockedWord(text, blockedWords = []) {
  const normalized = text.toLowerCase();
  return blockedWords.some((word) => word && normalized.includes(word.toLowerCase()));
}

export function shouldHandleAutoTtsMessage(message, settings) {
  if (!message.guildId || message.author?.bot) {
    return false;
  }

  if (!settings.autoTtsChannelIds.includes(message.channelId)) {
    return false;
  }

  return Boolean(message.content?.trim());
}
