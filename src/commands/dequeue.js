import { SlashCommandBuilder } from '../lib/discord.js';
import { removeQueuedItemsForUser } from '../services/queue.js';
import { okEmbed, mutedEmbed } from '../utils/embed.js';

export const dequeueCommand = {
  data: new SlashCommandBuilder()
    .setName('dequeue')
    .setDescription('Remove your queued TTS messages from this server')
    .addIntegerOption((option) =>
      option
        .setName('count')
        .setDescription('How many of your queued items to remove')
        .setMinValue(1)
        .setMaxValue(25)
        .setRequired(false)
    ),

  async execute(interaction) {
    const count = interaction.options.getInteger('count') ?? 1;
    const removed = await removeQueuedItemsForUser(interaction.guildId, interaction.user.id, count);

    return interaction.reply({
      embeds: [removed > 0
        ? okEmbed(`🗑 Removed **${removed}** queued item(s).`)
        : mutedEmbed('You have no queued items to remove.')],
      flags: 64
    });
  }
};
