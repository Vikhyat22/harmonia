import { enqueueSpeechRequest } from '../services/queue.js';
import { getGuildSettings, getVoiceSessionOptions } from '../services/settingsStore.js';
import { getUserSettings } from '../services/userSettingsStore.js';
import { getLanguageOption } from '../utils/languages.js';
import { splitTextIntoChunks } from '../utils/text.js';
import { getSpeakerAccessDecision } from '../utils/accessControl.js';
import {
  containsBlockedWord,
  sanitizeAutoTtsContent,
  shouldHandleAutoTtsMessage
} from '../utils/autoTts.js';
import { handleMusicRequestChannelMessage } from '../utils/musicRequestChannel.js';
import { hasConfiguredAdminAccess } from '../utils/permissions.js';

export async function handleMessageCreate(message) {
  const settings = await getGuildSettings(message.guildId);
  const voiceSession = getVoiceSessionOptions(settings);

  if (await handleMusicRequestChannelMessage(message, settings)) {
    return;
  }

  if (!shouldHandleAutoTtsMessage(message, settings)) {
    return;
  }

  const text = sanitizeAutoTtsContent(message.content);
  if (!text) {
    return;
  }

  if (containsBlockedWord(text, settings.blockedWords)) {
    return;
  }

  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) {
    return;
  }

  const accessDecision = getSpeakerAccessDecision(
    message.member,
    message.author.id,
    settings,
    { bypass: hasConfiguredAdminAccess(message.member, settings) }
  );
  if (!accessDecision.allowed) {
    return;
  }

  const userSettings = await getUserSettings(message.author.id);
  const language = userSettings.defaultLanguage
    ? getLanguageOption(userSettings.defaultLanguage)
    : settings.defaultLanguage
      ? getLanguageOption(settings.defaultLanguage)
      : getLanguageOption('en-US');

  if (!language) {
    return;
  }

  try {
    await enqueueSpeechRequest({
      guild: message.guild,
      voiceChannelId: voiceChannel.id,
      requesterId: message.author.id,
      languageCode: language.code,
      languageName: language.name,
      chunks: splitTextIntoChunks(text, settings.chunkLength),
      ...voiceSession,
      source: 'auto',
      notifications: {}
    });
  } catch {
    // Ignore auto-TTS enqueue errors to avoid spamming the text channel.
  }
}
