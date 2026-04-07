import { ChannelType, SlashCommandBuilder } from '../lib/discord.js';
import { getGuildSettings, updateGuildSettings } from '../services/settingsStore.js';
import { getConfiguredAdminError, hasConfiguredAdminAccess } from '../utils/permissions.js';
import { isMessageContentIntentEnabled } from '../utils/runtimeConfig.js';

function uniqueChannelIds(channelIds) {
  return [...new Set(channelIds)];
}

export const autoTtsCommand = {
  data: new SlashCommandBuilder()
    .setName('autotts')
    .setDescription('Manage channels where normal messages are spoken automatically')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Enable auto-TTS in a text channel')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Text channel to enable')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Disable auto-TTS in a text channel')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Text channel to disable')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Show the current auto-TTS channels')
    ),

  async execute(interaction) {
    if (!isMessageContentIntentEnabled()) {
      return interaction.reply({
        content: '❌ Auto-TTS is disabled. Set `ENABLE_MESSAGE_CONTENT_INTENT=true` in your environment and enable the Message Content intent in the Discord Developer Portal first.',
        flags: 64
      });
    }

    const settings = await getGuildSettings(interaction.guildId);
    if (!hasConfiguredAdminAccess(interaction.member, settings)) {
      return interaction.reply({ content: getConfiguredAdminError(), flags: 64 });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'list') {
      return interaction.reply({
        content: settings.autoTtsChannelIds.length > 0
          ? `🔊 Auto-TTS channels:\n${settings.autoTtsChannelIds.map((id) => `<#${id}>`).join('\n')}`
          : 'No auto-TTS channels are configured.',
        flags: 64
      });
    }

    const channel = interaction.options.getChannel('channel', true);

    if (subcommand === 'add') {
      const next = uniqueChannelIds([...settings.autoTtsChannelIds, channel.id]);
      await updateGuildSettings(interaction.guildId, { autoTtsChannelIds: next });
      return interaction.reply({
        content: `✅ Enabled auto-TTS in ${channel}.`,
        flags: 64
      });
    }

    const next = settings.autoTtsChannelIds.filter((channelId) => channelId !== channel.id);
    await updateGuildSettings(interaction.guildId, { autoTtsChannelIds: next });
    return interaction.reply({
      content: `✅ Disabled auto-TTS in ${channel}.`,
      flags: 64
    });
  }
};
