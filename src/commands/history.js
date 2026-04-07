import { SlashCommandBuilder } from '../lib/discord.js';
import { getGuildAnalytics } from '../services/analytics.js';
import { getGuildHistory } from '../services/historyStore.js';
import { createBrandEmbed } from '../utils/brand.js';
import { replyWithEmbedFallback } from '../utils/replies.js';

export const historyCommand = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('Show recent voice activity in this server')
    .addIntegerOption((option) =>
      option
        .setName('limit')
        .setDescription('Number of recent entries to show')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(15)
    ),

  async execute(interaction) {
    const limit = interaction.options.getInteger('limit') ?? 10;
    const history = await getGuildHistory(interaction.guildId, limit);
    const analytics = await getGuildAnalytics(interaction.guildId, { limit });

    const embed = createBrandEmbed({
      title: 'Harmonia History',
      description: 'Recent speaking activity and playback outcomes for this server.',
      tone: 'support'
    })
      .addFields({
        name: 'Summary',
        value: [
          `Entries: ${analytics.summary.totalEntries}`,
          `Last 24h: ${analytics.summary.last24Hours}`,
          `Top outcome: ${analytics.summary.outcomes[0]?.key ?? 'n/a'}`
        ].join('\n')
      });

    if (history.length === 0) {
      embed.setDescription('No recent voice activity recorded yet.');
      return replyWithEmbedFallback(interaction, embed, { flags: 64 });
    }

    embed.setDescription(
      history.map((entry, index) => {
        const source = entry.source === 'auto' ? 'auto' : entry.source === 'music' ? 'music' : 'slash';
        const label = entry.source === 'music' && entry.title
          ? `${entry.languageName} • ${entry.title}`
          : entry.languageName;
        return `${index + 1}. <@${entry.requesterId}> • ${label} • ${entry.status} • ${source}\n<t:${Math.floor(new Date(entry.timestamp).getTime() / 1000)}:R>`;
      }).join('\n\n')
    );

    return replyWithEmbedFallback(interaction, embed, { flags: 64 });
  }
};
