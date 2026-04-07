import { cleanupAudio, generateTTS } from '../services/tts.js';
import {
  deletePendingRequest,
  getPendingRequest
} from '../services/requestStore.js';
import { enqueueSpeechRequest } from '../services/queue.js';
import { getGuildSettings, getVoiceSessionOptions } from '../services/settingsStore.js';
import {
  buildLanguageSelectionComponents,
  buildLanguageSelectionContent,
  parseLanguagePageCustomId,
  parseLanguageSelectCustomId
} from '../utils/languageMenu.js';
import { getLanguageOption } from '../utils/languages.js';
import { createInteractionQueueNotifications } from '../utils/queueNotifications.js';
import { sendSpeakAnnouncement } from '../utils/speakAnnouncements.js';
import { splitTextIntoChunks } from '../utils/text.js';
import { containsBlockedWord } from '../utils/autoTts.js';
import { resolveInteractionGuild } from '../utils/guildContext.js';
import { resolveMemberVoiceChannel } from '../utils/voiceState.js';

function getAuthorizedRequest(interaction, requestId) {
  const request = getPendingRequest(requestId);

  if (!request) {
    return { error: '❌ This /speak request expired. Please run /speak again.' };
  }

  if (request.userId !== interaction.user.id) {
    return { error: '❌ Only the user who started this /speak request can use these controls.' };
  }

  if (request.guildId !== interaction.guildId) {
    return { error: '❌ This selection belongs to a different server.' };
  }

  return { request };
}

export async function handleLanguageSelect(interaction) {
  const pageAction = parseLanguagePageCustomId(interaction.customId);
  if (pageAction && interaction.isButton()) {
    await interaction.deferUpdate();

    const { requestId, page } = pageAction;
    const { request, error } = getAuthorizedRequest(interaction, requestId);

    if (error) {
      return interaction.editReply({ content: error, components: [] });
    }

    return interaction.editReply({
      content: buildLanguageSelectionContent(request.text.length, page),
      components: buildLanguageSelectionComponents(requestId, page)
    });
  }

  if (!interaction.isStringSelectMenu()) return;

  const selectAction = parseLanguageSelectCustomId(interaction.customId);
  if (!selectAction) return;

  await interaction.deferUpdate();

  const { requestId } = selectAction;
  const { request, error } = getAuthorizedRequest(interaction, requestId);

  if (error) {
    return interaction.editReply({ content: error, components: [] });
  }

  const selectedCode = interaction.values[0];
  if (!selectedCode) {
    return interaction.editReply({
      content: '❌ No language selected!',
      components: []
    });
  }

  const selectedLanguage = getLanguageOption(selectedCode);
  if (!selectedLanguage) {
    return interaction.editReply({
      content: '❌ Invalid language selected!',
      components: []
    });
  }

  await interaction.editReply({
    content: `📝 Queuing your TTS in ${selectedLanguage.name}...`,
    components: []
  });

  try {
    const settings = await getGuildSettings(interaction.guildId);
    const voiceSession = getVoiceSessionOptions(settings);
    const guild = await resolveInteractionGuild(interaction);
    if (!guild) {
      deletePendingRequest(requestId);
      return interaction.editReply({
        content: '❌ I could not resolve this server from the interaction. Please run `/speak` again.'
      });
    }

    const voiceChannel = request.voiceChannelId
      ? guild.channels?.cache?.get(request.voiceChannelId) ?? await resolveMemberVoiceChannel(interaction)
      : await resolveMemberVoiceChannel(interaction);
    if (!voiceChannel) {
      deletePendingRequest(requestId);
      return interaction.editReply({
        content: '❌ I could not find the target voice channel anymore. Please run `/speak` again and use the optional `channel` argument if needed.'
      });
    }

    if (containsBlockedWord(request.text, settings.blockedWords)) {
      deletePendingRequest(requestId);
      return interaction.editReply({
        content: '❌ Your message contains a blocked word or phrase for this server.'
      });
    }

    const queueResult = await enqueueSpeechRequest({
      guild,
      voiceChannelId: voiceChannel.id,
      requesterId: interaction.user.id,
      languageCode: selectedCode,
      languageName: selectedLanguage.name,
      chunks: splitTextIntoChunks(request.text, settings.chunkLength),
      ...voiceSession,
      notifications: createInteractionQueueNotifications(interaction)
    });
    await sendSpeakAnnouncement({
      guild,
      textChannelId: request.requestChannelId ?? interaction.channelId,
      requesterId: interaction.user.id,
      languageName: selectedLanguage.name,
      text: request.text,
      voiceChannelId: voiceChannel.id,
      position: queueResult.position
    });
    deletePendingRequest(requestId);

    return interaction.editReply({
      content: queueResult.position === 1
        ? `📝 Queued your TTS in ${selectedLanguage.name}. Starting now.`
        : `📝 Queued your TTS in ${selectedLanguage.name}. Position ${queueResult.position}.`
    });
  } catch (error) {
    console.error('TTS Error:', error);
    deletePendingRequest(requestId);
    return interaction.editReply({
      content: '❌ An error occurred queueing speech!'
    });
  }
}
