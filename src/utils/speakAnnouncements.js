import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from '../lib/discord.js';
import { createSpeakRevealRecord } from '../services/speakRevealStore.js';

export const SPEAK_REVEAL_PREFIX = 'speak_reveal';

export function buildSpeakAnnouncement({
  requesterId,
  languageName,
  voiceChannelId,
  position
}) {
  const segments = [
    `🗣️ <@${requesterId}>`,
    languageName,
    `<#${voiceChannelId}>`,
    position > 1 ? `Queue #${position}` : 'Live now',
    'Text hidden'
  ];

  return segments.join(' • ');
}

export function buildSpeakAnnouncementComponents(revealId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${SPEAK_REVEAL_PREFIX}:${revealId}`)
        .setLabel('View Message')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function parseSpeakRevealCustomId(customId) {
  const [prefix, revealId] = customId.split(':');
  if (prefix !== SPEAK_REVEAL_PREFIX || !revealId) {
    return null;
  }

  return { revealId };
}

async function resolveAnnouncementChannel(guild, channelId) {
  if (!guild || !channelId) {
    return null;
  }

  const cached = guild.channels?.cache?.get?.(channelId);
  if (cached?.isTextBased?.() && typeof cached.send === 'function') {
    return cached;
  }

  const fetched = await guild.channels?.fetch?.(channelId).catch(() => null);
  if (fetched?.isTextBased?.() && typeof fetched.send === 'function') {
    return fetched;
  }

  return null;
}

export async function sendSpeakAnnouncement({
  guild,
  textChannelId,
  requesterId,
  languageName,
  text,
  voiceChannelId,
  position
}) {
  const channel = await resolveAnnouncementChannel(guild, textChannelId);
  if (!channel) {
    return false;
  }

  const revealId = createSpeakRevealRecord({
    requesterId,
    languageName,
    text
  });

  try {
    await channel.send({
      content: buildSpeakAnnouncement({
        requesterId,
        languageName,
        voiceChannelId,
        position
      }),
      components: buildSpeakAnnouncementComponents(revealId)
    });
    return true;
  } catch (error) {
    console.error('Speak announcement failed:', error);
    return false;
  }
}
