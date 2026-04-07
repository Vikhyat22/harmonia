import { SlashCommandBuilder, EmbedBuilder } from '../lib/discord.js';
import { getLavalinkPlayer } from '../services/voice.js';

const COLOR_OK  = 0x56c7a7;
const COLOR_ERR = 0xe37d6f;

const MODES = ['off', 'track', 'queue'];
const MODE_LABELS = {
  off:   '➡️ Loop **off**',
  track: '🔂 Looping **this track**',
  queue: '🔁 Looping **the queue**'
};

export const loopCommand = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set the loop/repeat mode for music playback')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Loop mode to set (cycles if omitted)')
        .setRequired(false)
        .addChoices(
          { name: 'Off', value: 'off' },
          { name: 'Loop track', value: 'track' },
          { name: 'Loop queue', value: 'queue' }
        )
    ),

  async execute(interaction) {
    const player = getLavalinkPlayer(interaction.guildId);

    if (!player) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERR).setDescription('❌ Nothing is playing right now.')],
        flags: 64
      });
    }

    const requested = interaction.options.getString('mode');
    let newMode;
    if (requested) {
      newMode = requested;
    } else {
      const current = player.repeatMode ?? 'off';
      newMode = MODES[(MODES.indexOf(current) + 1) % MODES.length];
    }

    try {
      await player.setRepeatMode(newMode);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_OK).setDescription(MODE_LABELS[newMode] ?? newMode)],
        flags: 64
      });
    } catch {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERR).setDescription('❌ Failed to set loop mode.')],
        flags: 64
      });
    }
  }
};
