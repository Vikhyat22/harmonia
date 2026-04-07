import { ChannelType, SlashCommandBuilder } from '../lib/discord.js';
import { getGuildSettings, updateGuildSettings } from '../services/settingsStore.js';
import { createBrandEmbed } from '../utils/brand.js';
import { mutedEmbed, okEmbed } from '../utils/embed.js';
import { deleteMusicRequestController, syncMusicRequestController } from '../utils/musicRequestChannel.js';
import { getConfiguredAdminError, hasConfiguredAdminAccess } from '../utils/permissions.js';
import { replyWithEmbedFallback } from '../utils/replies.js';
import { isMessageContentIntentEnabled } from '../utils/runtimeConfig.js';

function buildControllerLink(guildId, channelId, messageId) {
  if (!guildId || !channelId || !messageId) {
    return 'Not posted yet';
  }

  return `[Open controller](https://discord.com/channels/${guildId}/${channelId}/${messageId})`;
}

function buildStatusEmbed(guildId, settings) {
  return createBrandEmbed({
    title: 'Music Request Channel',
    description: settings.musicRequestChannelId
      ? 'Normal messages in the configured channel will be treated as music requests.'
      : 'No dedicated music request channel is configured yet.',
    tone: settings.musicRequestChannelId ? 'support' : 'warm'
  }).addFields(
    {
      name: 'Request Channel',
      value: settings.musicRequestChannelId ? `<#${settings.musicRequestChannelId}>` : 'Not set'
    },
    {
      name: 'Controller',
      value: buildControllerLink(guildId, settings.musicRequestChannelId, settings.musicControllerMessageId)
    },
    {
      name: 'Message Requests',
      value: isMessageContentIntentEnabled()
        ? 'Enabled'
        : 'Disabled until `ENABLE_MESSAGE_CONTENT_INTENT=true` and the Message Content intent are enabled'
    },
    {
      name: 'Usage',
      value: 'Join a voice channel, then type a song name, URL, playlist link, or direct stream in the request channel.'
    }
  );
}

function getIntentWarning() {
  return isMessageContentIntentEnabled()
    ? ''
    : ' Message requests will start working after you enable `ENABLE_MESSAGE_CONTENT_INTENT=true` and the Message Content intent in the Discord Developer Portal.';
}

export const musicChannelCommand = {
  data: new SlashCommandBuilder()
    .setName('musicchannel')
    .setDescription('Configure a dedicated music request channel and controller')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set')
        .setDescription('Set the text channel where normal messages become music requests')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Text channel to use for music requests')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('refresh')
        .setDescription('Repost or refresh the controller message in the configured request channel')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('Disable the dedicated music request channel')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Show the current music request channel configuration')
    ),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guildId);
    if (!hasConfiguredAdminAccess(interaction.member, settings)) {
      return interaction.reply({ content: getConfiguredAdminError(), flags: 64 });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'status') {
      return replyWithEmbedFallback(interaction, buildStatusEmbed(interaction.guildId, settings), { flags: 64 });
    }

    if (subcommand === 'disable') {
      if (!settings.musicRequestChannelId) {
        return interaction.reply({
          embeds: [mutedEmbed('No music request channel is configured right now.')],
          flags: 64
        });
      }

      await deleteMusicRequestController(interaction.guild, settings).catch(() => {});
      await updateGuildSettings(interaction.guildId, {
        musicRequestChannelId: null,
        musicControllerMessageId: null
      });

      return interaction.reply({
        embeds: [okEmbed('✅ Disabled the music request channel and cleared the controller reference.')],
        flags: 64
      });
    }

    if (subcommand === 'refresh') {
      if (!settings.musicRequestChannelId) {
        return interaction.reply({
          embeds: [mutedEmbed('Set a music request channel first with `/musicchannel set`.')],
          flags: 64
        });
      }

      const result = await syncMusicRequestController(interaction.guild, { channel: interaction.channel, settings });
      if (!result.synced) {
        return interaction.reply({
          embeds: [mutedEmbed('The music request channel is saved, but I could not post or refresh the controller message there right now.')],
          flags: 64
        });
      }

      return interaction.reply({
        embeds: [okEmbed(`🔄 Refreshed the controller message in <#${settings.musicRequestChannelId}>.`)],
        flags: 64
      });
    }

    const channel = interaction.options.getChannel('channel', true);

    if (settings.musicRequestChannelId && settings.musicRequestChannelId !== channel.id) {
      await deleteMusicRequestController(interaction.guild, settings).catch(() => {});
    }

    const nextSettings = await updateGuildSettings(interaction.guildId, {
      musicRequestChannelId: channel.id,
      musicControllerMessageId: null
    });
    const result = await syncMusicRequestController(interaction.guild, {
      channel,
      settings: nextSettings
    });

    const detail = result.synced
      ? ` Posted a controller message in <#${channel.id}>.`
      : ` I saved <#${channel.id}> as the request channel, but I could not post the controller message there yet.`;

    return interaction.reply({
      embeds: [okEmbed(`✅ Music requests are now enabled in <#${channel.id}>.${detail}${getIntentWarning()}`)],
      flags: 64
    });
  }
};
