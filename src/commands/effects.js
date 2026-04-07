import { SlashCommandBuilder, EmbedBuilder } from '../lib/discord.js';
import { getLavalinkPlayer } from '../services/voice.js';
import {
  applyEffectPreset,
  getActiveEffectStatus,
  getMusicEffectChoices,
  resetPlayerEffects
} from '../services/effects.js';

const COLOR_OK = 0x56c7a7;
const COLOR_ERR = 0xe37d6f;

export const effectsCommand = {
  data: new SlashCommandBuilder()
    .setName('effects')
    .setDescription('Apply or inspect music effect presets')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('apply')
        .setDescription('Apply a music effect preset to the current player')
        .addStringOption((option) =>
          option
            .setName('preset')
            .setDescription('Effect preset to apply')
            .setRequired(true)
            .addChoices(...getMusicEffectChoices())
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('Reset all active music effects')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Show the currently active music effect')
    ),

  async execute(interaction) {
    const player = getLavalinkPlayer(interaction.guildId);
    if (!player || !player.queue?.current) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERR).setDescription('❌ Nothing is playing right now.')],
        flags: 64
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'status') {
        const status = getActiveEffectStatus(player);
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(status.active ? COLOR_OK : COLOR_ERR)
            .setDescription(status.active
              ? `🎛 Active effect: **${status.label}**\n${status.detail}`
              : '🎛 No music effects are active.')],
          flags: 64
        });
      }

      if (subcommand === 'reset') {
        await resetPlayerEffects(player);
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(COLOR_OK)
            .setDescription('🎚 Reset all music effects for the current player.')],
          flags: 64
        });
      }

      const preset = interaction.options.getString('preset', true);
      const status = await applyEffectPreset(player, preset);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLOR_OK)
          .setDescription(`🎚 Applied **${status.label}**.\n${status.detail}`)],
        flags: 64
      });
    } catch (error) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLOR_ERR)
          .setDescription(`❌ ${error instanceof Error ? error.message : 'Failed to update music effects.'}`)],
        flags: 64
      });
    }
  }
};
