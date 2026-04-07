import { ChannelType, SlashCommandBuilder } from '../lib/discord.js';
import { createPendingRequest } from '../services/requestStore.js';
import { enqueueSpeechRequest } from '../services/queue.js';
import { getGuildSettings, getVoiceSessionOptions } from '../services/settingsStore.js';
import { getUserSettings } from '../services/userSettingsStore.js';
import {
  buildLanguageSelectionComponents,
  buildLanguageSelectionContent
} from '../utils/languageMenu.js';
import { parseLanguageInput } from '../utils/languageAutocomplete.js';
import { getLanguageOption } from '../utils/languages.js';
import { createInteractionQueueNotifications } from '../utils/queueNotifications.js';
import { sendSpeakAnnouncement } from '../utils/speakAnnouncements.js';
import { splitTextIntoChunks } from '../utils/text.js';
import { getSpeakerAccessDecision, getSpeakerAccessError } from '../utils/accessControl.js';
import { containsBlockedWord } from '../utils/autoTts.js';
import { resolveInteractionGuild } from '../utils/guildContext.js';
import { hasConfiguredAdminAccess } from '../utils/permissions.js';
import { resolveMemberVoiceChannel } from '../utils/voiceState.js';

export const speakCommand = {
  data: new SlashCommandBuilder()
    .setName('speak')
    .setDescription('Convert text to speech in your voice channel')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Text to convert to speech')
        .setRequired(true)
        .setMaxLength(5000)
    )
    .addStringOption((option) =>
      option
        .setName('language')
        .setDescription('Optional language code like en-US. Leave blank to use the server default or picker.')
        .setAutocomplete(true)
        .setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Optional voice channel to speak in if auto-detection fails.')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(false)
    ),

  async autocomplete(interaction) {
    const { buildLanguageAutocompleteChoices } = await import('../utils/languageAutocomplete.js');
    const focused = interaction.options.getFocused();
    await interaction.respond(buildLanguageAutocompleteChoices(focused));
  },
  
  async execute(interaction) {
    const text = interaction.options.getString('text', true);
    const languageInput = interaction.options.getString('language');

    await interaction.deferReply({ flags: 64 });

    const selectedChannel = interaction.options.getChannel('channel');
    const voiceChannel = selectedChannel ?? await resolveMemberVoiceChannel(interaction);
    if (!voiceChannel) {
      return interaction.editReply({
        content: '❌ Join a voice channel first, or use the optional `channel` argument in `/speak`.',
      });
    }

    const settings = await getGuildSettings(interaction.guildId);
    const voiceSession = getVoiceSessionOptions(settings);
    const userSettings = await getUserSettings(interaction.user.id);
    const guild = await resolveInteractionGuild(interaction);
    if (!guild) {
      return interaction.editReply({
        content: '❌ I could not resolve this server from the interaction. Please try again.'
      });
    }

    const accessDecision = getSpeakerAccessDecision(
      interaction.member,
      interaction.user.id,
      settings,
      { bypass: hasConfiguredAdminAccess(interaction.member, settings) }
    );
    if (!accessDecision.allowed) {
      return interaction.editReply({
        content: getSpeakerAccessError(accessDecision)
      });
    }

    if (containsBlockedWord(text, settings.blockedWords)) {
      return interaction.editReply({
        content: '❌ Your message contains a blocked word or phrase for this server.'
      });
    }

    const resolvedLanguage = languageInput
      ? parseLanguageInput(languageInput)
      : userSettings.defaultLanguage
        ? getLanguageOption(userSettings.defaultLanguage)
      : settings.defaultLanguage
        ? getLanguageOption(settings.defaultLanguage)
        : null;

    if (languageInput && !resolvedLanguage) {
      return interaction.editReply({
        content: '❌ Unknown language. Use a supported code like `en-US` or pick from autocomplete.'
      });
    }

    if (resolvedLanguage) {
      const chunks = splitTextIntoChunks(text, settings.chunkLength);
      const queueResult = await enqueueSpeechRequest({
        guild,
        voiceChannelId: voiceChannel.id,
        requesterId: interaction.user.id,
        languageCode: resolvedLanguage.code,
        languageName: resolvedLanguage.name,
        chunks,
        ...voiceSession,
        source: 'slash',
        notifications: createInteractionQueueNotifications(interaction)
      });

      await sendSpeakAnnouncement({
        guild,
        textChannelId: interaction.channelId,
        requesterId: interaction.user.id,
        languageName: resolvedLanguage.name,
        text,
        voiceChannelId: voiceChannel.id,
        position: queueResult.position
      });

      return interaction.editReply({
        content: queueResult.position === 1
          ? `📝 Queued your TTS in ${resolvedLanguage.name}. Starting now.`
          : `📝 Queued your TTS in ${resolvedLanguage.name}. Position ${queueResult.position}.`
      });
    }

    const requestId = createPendingRequest({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      text,
      voiceChannelId: voiceChannel.id,
      requestChannelId: interaction.channelId
    });

    await interaction.editReply({
      content: buildLanguageSelectionContent(text.length, 0),
      components: buildLanguageSelectionComponents(requestId)
    });
  }
};
