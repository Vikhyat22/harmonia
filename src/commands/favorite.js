import { SlashCommandBuilder } from '../lib/discord.js';
import { getCurrentQueueItem } from '../services/queue.js';
import { addFavorite, hasFavorite, removeFavorite } from '../services/musicCatalog.js';
import { mutedEmbed, okEmbed } from '../utils/embed.js';

function getCurrentMusicItem(guildId) {
  const current = getCurrentQueueItem(guildId);
  if (!current || current.kind !== 'music') {
    return null;
  }

  return current;
}

export const favoriteCommand = {
  data: new SlashCommandBuilder()
    .setName('favorite')
    .setDescription('Save or remove the current song from your favorites')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Save the currently playing song to your favorites')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove the currently playing song from your favorites')
    ),

  async execute(interaction) {
    const current = getCurrentMusicItem(interaction.guildId);
    if (!current) {
      return interaction.reply({
        embeds: [mutedEmbed('Play a music track first, then save it with `/favorite add`.')],
        flags: 64
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'add') {
      if (hasFavorite(interaction.guildId, interaction.user.id, current)) {
        return interaction.reply({
          embeds: [mutedEmbed(`**${current.title}** is already in your favorites.`)],
          flags: 64
        });
      }

      const saved = addFavorite(interaction.guildId, interaction.user.id, current);
      return interaction.reply({
        embeds: [saved
          ? okEmbed(`⭐ Saved **${current.title}** to your favorites.`)
          : mutedEmbed('I could not save this track right now.')],
        flags: 64
      });
    }

    const removed = removeFavorite(interaction.guildId, interaction.user.id, current);
    return interaction.reply({
      embeds: [removed
        ? okEmbed(`🗑 Removed **${current.title}** from your favorites.`)
        : mutedEmbed(`**${current.title}** is not currently in your favorites.`)],
      flags: 64
    });
  }
};
