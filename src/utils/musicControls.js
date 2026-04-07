import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from '../lib/discord.js';

export const MUSIC_PREFIX = 'music';
const activeMusicControlMessages = new Map();

export function buildMusicControlRow(paused = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${MUSIC_PREFIX}:previous:ctrl`)
      .setLabel('⏮ Previous')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${MUSIC_PREFIX}:${paused ? 'resume' : 'pause'}:ctrl`)
      .setLabel(paused ? '▶ Resume' : '⏸ Pause')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${MUSIC_PREFIX}:skip:ctrl`)
      .setLabel('⏭ Skip')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${MUSIC_PREFIX}:stop:ctrl`)
      .setLabel('⏹ Stop')
      .setStyle(ButtonStyle.Danger)
  );
}

export function setActiveMusicControlMessage(guildId, messageId) {
  if (!guildId || !messageId) {
    return;
  }

  activeMusicControlMessages.set(guildId, messageId);
}

export function clearActiveMusicControlMessage(guildId, messageId = null) {
  if (!guildId) {
    return;
  }

  if (messageId && activeMusicControlMessages.get(guildId) !== messageId) {
    return;
  }

  activeMusicControlMessages.delete(guildId);
}

export function isActiveMusicControlMessage(guildId, messageId) {
  if (!guildId || !messageId) {
    return false;
  }

  return activeMusicControlMessages.get(guildId) === messageId;
}
