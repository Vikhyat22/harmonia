import {
  pauseCurrentPlayback,
  replayPreviousTrack,
  resumeCurrentPlayback,
  skipCurrentSpeech,
  stopAndClearGuildQueue,
  getQueueSnapshot,
  removeQueuedItemAtPosition
} from '../services/queue.js';
import { getGuildSettings } from '../services/settingsStore.js';
import { getPlaybackControlDecision, getPlaybackControlError } from '../utils/playbackPermissions.js';
import {
  buildMusicControlRow,
  isActiveMusicControlMessage,
  MUSIC_PREFIX
} from '../utils/musicControls.js';
import { syncMusicRequestController } from '../utils/musicRequestChannel.js';

const LIVE_BUTTON_ACTIONS = new Set(['previous', 'pause', 'resume', 'skip', 'stop']);

async function rejectStaleControl(interaction) {
  const content = 'These controls are from an older track. Use the latest now-playing card or the music request controller.';

  try {
    await interaction.update({ components: [] });
    await interaction.followUp({ content, flags: 64 }).catch(() => {});
  } catch {
    await interaction.reply({ content, flags: 64 }).catch(() => {});
  }
}

async function rejectPlaybackControl(interaction, settings, options = {}) {
  const content = getPlaybackControlError(settings, options);

  try {
    await interaction.reply({ content, flags: 64 });
  } catch {
    await interaction.followUp({ content, flags: 64 }).catch(() => {});
  }
}

export async function handleMusicControls(interaction) {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return false;

  const parts = (interaction.customId ?? '').split(':');
  if (parts[0] !== MUSIC_PREFIX) return false;

  const action = parts[1];
  const guildId = interaction.guildId;

  if (interaction.isButton() && LIVE_BUTTON_ACTIONS.has(action)) {
    const settings = await getGuildSettings(guildId).catch(() => null);
    const messageId = interaction.message?.id ?? null;
    const isControllerMessage = Boolean(
      messageId
      && settings?.musicControllerMessageId
      && settings.musicControllerMessageId === messageId
    );
    const isActiveNowPlayingMessage = isActiveMusicControlMessage(guildId, messageId);

    if (!isControllerMessage && !isActiveNowPlayingMessage) {
      await rejectStaleControl(interaction);
      return true;
    }
  }

  if (action === 'previous') {
    const current = getQueueSnapshot(guildId).current;
    const settings = await getGuildSettings(guildId).catch(() => null);
    const access = getPlaybackControlDecision(interaction.member, interaction.user.id, settings);
    if (!access.allowed) {
      await rejectPlaybackControl(interaction, settings);
      return true;
    }

    const result = await replayPreviousTrack(guildId, {
      guild: interaction.guild,
      voiceChannelId: interaction.member?.voice?.channel?.id ?? null,
      textChannel: interaction.channel,
      requesterId: interaction.user.id
    });

    if (!result.replayed) {
      const message = result.reason === 'speech-active'
        ? 'A TTS message is currently playing, so there is no music track to rewind right now.'
        : 'There is no previously played music track to replay yet.';
      return interaction.reply({ content: message, flags: 64 });
    }

    await interaction.deferUpdate().catch(() => {});
    await syncMusicRequestController(interaction.guild, { channel: interaction.channel }).catch(() => {});
    return true;
  }

  if (action === 'pause') {
    const current = getQueueSnapshot(guildId).current;
    const settings = await getGuildSettings(guildId).catch(() => null);
    const access = getPlaybackControlDecision(interaction.member, interaction.user.id, settings, {
      requesterId: current?.requesterId ?? null,
      allowRequester: true
    });
    if (!access.allowed) {
      await rejectPlaybackControl(interaction, settings, { allowRequester: true });
      return true;
    }

    const paused = pauseCurrentPlayback(guildId);
    if (!paused) {
      return interaction.reply({ content: 'Nothing is playing right now.', flags: 64 });
    }
    await interaction.update({ components: [buildMusicControlRow(true)] }).catch(() => {});
    await syncMusicRequestController(interaction.guild, { channel: interaction.channel }).catch(() => {});
    return true;
  }

  if (action === 'resume') {
    const current = getQueueSnapshot(guildId).current;
    const settings = await getGuildSettings(guildId).catch(() => null);
    const access = getPlaybackControlDecision(interaction.member, interaction.user.id, settings, {
      requesterId: current?.requesterId ?? null,
      allowRequester: true
    });
    if (!access.allowed) {
      await rejectPlaybackControl(interaction, settings, { allowRequester: true });
      return true;
    }

    const resumed = resumeCurrentPlayback(guildId);
    if (!resumed) {
      return interaction.reply({ content: 'Nothing is paused right now.', flags: 64 });
    }
    await interaction.update({ components: [buildMusicControlRow(false)] }).catch(() => {});
    await syncMusicRequestController(interaction.guild, { channel: interaction.channel }).catch(() => {});
    return true;
  }

  if (action === 'skip') {
    const current = getQueueSnapshot(guildId).current;
    const settings = await getGuildSettings(guildId).catch(() => null);
    const access = getPlaybackControlDecision(interaction.member, interaction.user.id, settings, {
      requesterId: current?.requesterId ?? null,
      allowRequester: true
    });
    if (!access.allowed) {
      await rejectPlaybackControl(interaction, settings, { allowRequester: true });
      return true;
    }

    await interaction.deferUpdate().catch(() => {});
    skipCurrentSpeech(guildId);
    await syncMusicRequestController(interaction.guild, { channel: interaction.channel }).catch(() => {});
    return true;
  }

  if (action === 'stop') {
    const settings = await getGuildSettings(guildId).catch(() => null);
    const access = getPlaybackControlDecision(interaction.member, interaction.user.id, settings);
    if (!access.allowed) {
      await rejectPlaybackControl(interaction, settings);
      return true;
    }

    await interaction.deferUpdate().catch(() => {});
    await stopAndClearGuildQueue(guildId);
    await syncMusicRequestController(interaction.guild, { channel: interaction.channel }).catch(() => {});
    return true;
  }

  if (action === 'remove') {
    const position = parseInt(interaction.values?.[0], 10);
    if (isNaN(position)) {
      await interaction.reply({ content: '❌ Invalid selection.', flags: 64 });
      return true;
    }

    const snapshot = getQueueSnapshot(guildId);
    const item = snapshot.queued[position - 1];

    if (!item) {
      await interaction.reply({ content: '❌ That track is no longer in the queue.', flags: 64 });
      return true;
    }

    const settings = await getGuildSettings(guildId).catch(() => null);
    const access = getPlaybackControlDecision(interaction.member, interaction.user.id, settings, {
      requesterId: item.requesterId ?? null,
      allowRequester: true
    });
    if (!access.allowed) {
      await rejectPlaybackControl(interaction, settings, { allowRequester: true });
      return true;
    }

    await removeQueuedItemAtPosition(guildId, position);
    await syncMusicRequestController(interaction.guild, { channel: interaction.channel }).catch(() => {});
    await interaction.reply({
      content: `🗑 Removed **${item.label}** from the queue.`,
      flags: 64
    });
    return true;
  }

  return false;
}
