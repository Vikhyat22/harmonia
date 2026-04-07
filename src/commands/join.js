import { ChannelType, SlashCommandBuilder } from '../lib/discord.js';
import { getGuildSettings, getVoiceSessionOptions } from '../services/settingsStore.js';
import { joinChannel } from '../services/voice.js';
import { resolveInteractionGuild } from '../utils/guildContext.js';
import { resolveMemberVoiceChannel } from '../utils/voiceState.js';
import { okEmbed, errEmbed } from '../utils/embed.js';

export const joinCommand = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Make the bot join your current voice channel')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Optional voice channel to join directly.')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const selectedChannel = interaction.options.getChannel('channel');
    const voiceChannel = selectedChannel ?? await resolveMemberVoiceChannel(interaction);
    if (!voiceChannel) {
      return interaction.editReply({ embeds: [errEmbed('❌ Join a voice channel first, or pass the optional `channel` argument.')] });
    }

    const settings = await getGuildSettings(interaction.guildId);
    const guild = await resolveInteractionGuild(interaction);
    const result = await joinChannel({
      guild,
      voiceChannel,
      ...getVoiceSessionOptions(settings)
    });

    if (!result.success) {
      return interaction.editReply({ embeds: [errEmbed(`❌ ${result.error}`)] });
    }

    return interaction.editReply({ embeds: [okEmbed(`✅ Joined **${voiceChannel.name}**.`)] });
  }
};
