import { SlashCommandBuilder, EmbedBuilder } from '../lib/discord.js';
import { getLavalinkPlayer } from '../services/voice.js';

const COLOR_OK  = 0x56c7a7;
const COLOR_ERR = 0xe37d6f;

export const volumeCommand = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set the playback volume (1–200, default is 100)')
    .addIntegerOption((option) =>
      option
        .setName('level')
        .setDescription('Volume level (1–200)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(200)
    ),

  async execute(interaction) {
    const level = interaction.options.getInteger('level', true);
    const player = getLavalinkPlayer(interaction.guildId);

    if (!player) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERR).setDescription('❌ Nothing is playing right now.')],
        flags: 64
      });
    }

    try {
      await player.setVolume(level, true);
      const bar = volumeBar(level);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_OK).setDescription(`🔊 Volume set to **${level}%**\n${bar}`)],
        flags: 64
      });
    } catch {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERR).setDescription('❌ Failed to set volume.')],
        flags: 64
      });
    }
  }
};

function volumeBar(level) {
  const filled = Math.round(level / 200 * 14);
  return '▓'.repeat(filled) + '░'.repeat(14 - filled);
}
