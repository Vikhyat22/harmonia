import { SlashCommandBuilder } from '../lib/discord.js';
import { getGuildAnalytics } from '../services/analytics.js';
import { getMetricsSnapshot } from '../services/metrics.js';
import { getQueueSnapshot } from '../services/queue.js';
import { createBrandEmbed } from '../utils/brand.js';
import { replyWithEmbedFallback } from '../utils/replies.js';

export const statsCommand = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show bot activity stats for this runtime'),

  async execute(interaction) {
    const metrics = getMetricsSnapshot();
    const queue = getQueueSnapshot(interaction.guildId);
    const analytics = await getGuildAnalytics(interaction.guildId, { limit: 25 });

    const embed = createBrandEmbed({
      title: 'Harmonia Stats',
      description: 'Runtime health, queue load, and recent usage trends.',
      tone: 'warm'
    })
      .addFields(
        {
          name: 'Requests',
          value: [
            `Enqueued: ${metrics.enqueued}`,
            `Started: ${metrics.started}`,
            `Completed: ${metrics.completed}`
          ].join('\n')
        },
        {
          name: 'Playback Outcomes',
          value: [
            `Failed: ${metrics.failed}`,
            `Skipped: ${metrics.skipped}`,
            `Stopped: ${metrics.stopped}`
          ].join('\n')
        },
        {
          name: 'Current Server Queue',
          value: queue.current || queue.queued.length > 0
            ? `Playing: ${queue.current ? 'yes' : 'no'}\nQueued: ${queue.queued.length}`
            : 'Idle'
        },
        {
          name: 'Recent Server Trends',
          value: [
            `History Entries: ${analytics.summary.totalEntries}`,
            `Last 24h: ${analytics.summary.last24Hours}`,
            `Top Language: ${analytics.summary.languages[0]?.key ?? 'n/a'}`
          ].join('\n')
        }
      );

    await replyWithEmbedFallback(interaction, embed, { flags: 64 });
  }
};
