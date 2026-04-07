import { SlashCommandBuilder } from '../lib/discord.js';
import { getGuildSettings } from '../services/settingsStore.js';
import { getQueueSnapshot } from '../services/queue.js';
import { getUserSettings } from '../services/userSettingsStore.js';
import { createBrandEmbed } from '../utils/brand.js';
import { replyWithEmbedFallback } from '../utils/replies.js';

export const settingsCommand = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Show the bot settings for this server'),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guildId);
    const userSettings = await getUserSettings(interaction.user.id);
    const snapshot = getQueueSnapshot(interaction.guildId);

    const embed = createBrandEmbed({
      title: 'Harmonia Settings',
      description: 'Server voice defaults, moderation rules, and queue behavior.',
      tone: 'support'
    })
      .addFields(
        {
          name: 'Default Language',
          value: settings.defaultLanguage ?? 'Not set'
        },
        {
          name: 'Your Default Language',
          value: userSettings.defaultLanguage ?? 'Not set'
        },
        {
          name: 'Idle Disconnect',
          value: settings.stayConnected
            ? `Disabled while 24/7 mode is on (fallback: ${Math.round(settings.idleDisconnectMs / 1000)} seconds)`
            : `${Math.round(settings.idleDisconnectMs / 1000)} seconds`
        },
        {
          name: '24/7 Mode',
          value: settings.stayConnected ? 'On' : 'Off'
        },
        {
          name: 'Chunk Length',
          value: `${settings.chunkLength} characters`
        },
        {
          name: 'Bot Admin Role',
          value: settings.adminRoleId ? `<@&${settings.adminRoleId}>` : 'Not set'
        },
        {
          name: 'DJ Role',
          value: settings.djRoleId ? `<@&${settings.djRoleId}>` : 'Not set'
        },
        {
          name: 'Access Mode',
          value: settings.accessMode === 'allowlist' ? 'Allowlist only' : 'Open'
        },
        {
          name: 'Auto-TTS Channels',
          value: settings.autoTtsChannelIds.length > 0
            ? settings.autoTtsChannelIds.map((id) => `<#${id}>`).join('\n')
            : 'Not set'
        },
        {
          name: 'Music Request Channel',
          value: settings.musicRequestChannelId
            ? `<#${settings.musicRequestChannelId}>`
            : 'Not set'
        },
        {
          name: 'Blocked Words',
          value: settings.blockedWords.length > 0
            ? `${settings.blockedWords.length} configured`
            : 'None'
        },
        {
          name: 'Blocked Speakers',
          value: [
            `Users: ${settings.blockedUserIds.length}`,
            `Roles: ${settings.blockedRoleIds.length}`
          ].join('\n')
        },
        {
          name: 'Allowed Speakers',
          value: [
            `Users: ${settings.allowedUserIds.length}`,
            `Roles: ${settings.allowedRoleIds.length}`
          ].join('\n')
        },
        {
          name: 'Queue Status',
          value: snapshot.current || snapshot.queued.length > 0
            ? `Playing: ${snapshot.current ? 'yes' : 'no'}\nQueued: ${snapshot.queued.length}`
            : 'Idle'
        }
      );

    await replyWithEmbedFallback(interaction, embed, { flags: 64 });
  }
};
