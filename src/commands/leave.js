import { SlashCommandBuilder } from '../lib/discord.js';
import { stopAndClearGuildQueue } from '../services/queue.js';
import { leaveChannel } from '../services/voice.js';
import { okEmbed, mutedEmbed } from '../utils/embed.js';

export const leaveCommand = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Make the bot leave the voice channel'),

  async execute(interaction) {
    const queueResult = await stopAndClearGuildQueue(interaction.guild.id);
    const left = leaveChannel(interaction.guild.id);

    if (left) {
      const extra = queueResult.cleared > 0 ? ` Cleared **${queueResult.cleared}** queued item(s).` : '';
      return interaction.reply({ embeds: [okEmbed(`👋 Left the voice channel.${extra}`)], flags: 64 });
    }
    return interaction.reply({ embeds: [mutedEmbed('I am not in a voice channel.')], flags: 64 });
  }
};
