import { SlashCommandBuilder } from '../lib/discord.js';
import { getGuildSettings, getVoiceSessionOptions } from '../services/settingsStore.js';
import { getCurrentQueueItem, replayPreviousTrack } from '../services/queue.js';
import { getSpeakerAccessDecision, getSpeakerAccessError } from '../utils/accessControl.js';
import { errEmbed, mutedEmbed, okEmbed } from '../utils/embed.js';
import { resolveInteractionGuild } from '../utils/guildContext.js';
import { createInteractionMusicNotifications } from '../utils/musicNotifications.js';
import { hasConfiguredAdminAccess } from '../utils/permissions.js';
import { getPlaybackControlDecision, getPlaybackControlError } from '../utils/playbackPermissions.js';
import { syncMusicRequestController } from '../utils/musicRequestChannel.js';
import { resolveMemberVoiceChannel } from '../utils/voiceState.js';

export const previousCommand = {
  data: new SlashCommandBuilder()
    .setName('previous')
    .setDescription('Replay the previously played music track'),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guildId);
    const accessDecision = getSpeakerAccessDecision(
      interaction.member,
      interaction.user.id,
      settings,
      { bypass: hasConfiguredAdminAccess(interaction.member, settings) }
    );
    if (!accessDecision.allowed) {
      return interaction.reply({
        embeds: [errEmbed(getSpeakerAccessError(accessDecision)?.replace('TTS', 'music playback')
          ?? '❌ You are not allowed to use music playback in this server.')],
        flags: 64
      });
    }

    const playbackDecision = getPlaybackControlDecision(interaction.member, interaction.user.id, settings);
    if (!playbackDecision.allowed) {
      return interaction.reply({
        embeds: [errEmbed(getPlaybackControlError(settings))],
        flags: 64
      });
    }

    const current = getCurrentQueueItem(interaction.guildId);
    let voiceChannelId = current?.voiceChannelId ?? null;

    if (!voiceChannelId) {
      const voiceChannel = await resolveMemberVoiceChannel(interaction);
      if (!voiceChannel) {
        return interaction.reply({
          embeds: [mutedEmbed('Join a voice channel first to replay the previous track.')],
          flags: 64
        });
      }
      voiceChannelId = voiceChannel.id;
    }

    const guild = await resolveInteractionGuild(interaction);
    if (!guild) {
      return interaction.reply({
        embeds: [errEmbed('❌ Could not resolve this server. Please try again.')],
        flags: 64
      });
    }

    const voiceSession = getVoiceSessionOptions(settings);
    const result = await replayPreviousTrack(interaction.guildId, {
      guild,
      voiceChannelId,
      textChannel: interaction.channel,
      requesterId: interaction.user.id,
      ...voiceSession,
      source: 'music',
      notifications: createInteractionMusicNotifications(interaction)
    });

    if (!result.replayed) {
      const message = result.reason === 'speech-active'
        ? 'A TTS message is currently playing, so there is no music track to rewind right now.'
        : 'There is no previously played music track to replay yet.';

      return interaction.reply({
        embeds: [mutedEmbed(message)],
        flags: 64
      });
    }

    await syncMusicRequestController(interaction.guild, { channel: interaction.channel }).catch(() => {});

    const detail = result.preservedCurrent
      ? ` The current track will resume after **${result.replayedItem.label}**.`
      : '';

    return interaction.reply({
      embeds: [okEmbed(`⏮ Replaying **${result.replayedItem.label}**.${detail}`)],
      flags: 64
    });
  }
};
