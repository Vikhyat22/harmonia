import { ChannelType, SlashCommandBuilder } from '../lib/discord.js';
import { getGuildSettings, getVoiceSessionOptions, updateGuildSettings } from '../services/settingsStore.js';
import { joinChannel, updateConnectionPersistence } from '../services/voice.js';
import { createBrandEmbed } from '../utils/brand.js';
import { errEmbed, okEmbed } from '../utils/embed.js';
import { resolveInteractionGuild } from '../utils/guildContext.js';
import { getConfiguredAdminError, hasConfiguredAdminAccess } from '../utils/permissions.js';
import { replyWithEmbedFallback } from '../utils/replies.js';
import { resolveMemberVoiceChannel } from '../utils/voiceState.js';

function buildStatusEmbed(settings) {
  return createBrandEmbed({
    title: '24/7 Mode',
    description: settings.stayConnected
      ? '24/7 mode is **on**. Harmonia will stay connected after playback until you use `/leave` or disable `/247`.'
      : `24/7 mode is **off**. Harmonia will idle disconnect after **${Math.round(settings.idleDisconnectMs / 1000)} seconds** of inactivity.`,
    tone: settings.stayConnected ? 'support' : 'warm'
  });
}

export const twentyFourSevenCommand = {
  data: new SlashCommandBuilder()
    .setName('247')
    .setDescription('Enable or disable 24/7 stay-connected mode for this server')
    .addStringOption((option) =>
      option
        .setName('state')
        .setDescription('Turn 24/7 mode on or off')
        .setRequired(false)
        .addChoices(
          { name: 'On', value: 'on' },
          { name: 'Off', value: 'off' }
        )
    )
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Optional voice channel to join immediately when enabling 24/7 mode')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(false)
    ),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guildId);
    if (!hasConfiguredAdminAccess(interaction.member, settings)) {
      return interaction.reply({ content: getConfiguredAdminError(), flags: 64 });
    }

    const requestedState = interaction.options.getString('state');
    if (!requestedState) {
      return replyWithEmbedFallback(interaction, buildStatusEmbed(settings), { flags: 64 });
    }

    const stayConnected = requestedState === 'on';
    const nextSettings = await updateGuildSettings(interaction.guildId, {
      stayConnected
    });
    updateConnectionPersistence(interaction.guildId, getVoiceSessionOptions(nextSettings));

    if (!stayConnected) {
      return interaction.reply({
        embeds: [okEmbed(`⏱ Disabled 24/7 mode. Harmonia will now idle disconnect after **${Math.round(nextSettings.idleDisconnectMs / 1000)} seconds** when nothing is playing.`)],
        flags: 64
      });
    }

    const selectedChannel = interaction.options.getChannel('channel');
    const voiceChannel = selectedChannel ?? await resolveMemberVoiceChannel(interaction);
    if (!voiceChannel) {
      return interaction.reply({
        embeds: [okEmbed('✅ Enabled 24/7 mode. Harmonia will stay connected the next time it joins a voice channel.')],
        flags: 64
      });
    }

    const guild = await resolveInteractionGuild(interaction);
    if (!guild) {
      return interaction.reply({
        embeds: [okEmbed('✅ Enabled 24/7 mode. I could not join immediately because the server context was unavailable, but the setting is saved.')],
        flags: 64
      });
    }

    const result = await joinChannel({
      guild,
      voiceChannel,
      ...getVoiceSessionOptions(nextSettings)
    });

    if (!result.success) {
      return interaction.reply({
        embeds: [errEmbed(`❌ 24/7 mode was enabled, but I could not join **${voiceChannel.name}** right now: ${result.error}`)],
        flags: 64
      });
    }

    return interaction.reply({
      embeds: [okEmbed(`✅ Enabled 24/7 mode and joined **${voiceChannel.name}**. I’ll stay connected until you use \`/leave\` or disable \`/247\`.`)],
      flags: 64
    });
  }
};
