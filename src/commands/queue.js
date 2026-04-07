import { ActionRowBuilder, SlashCommandBuilder, StringSelectMenuBuilder } from '../lib/discord.js';
import { getQueueSnapshot } from '../services/queue.js';
import { createBrandEmbed } from '../utils/brand.js';
import { replyWithEmbedFallback } from '../utils/replies.js';

function formatDuration(ms) {
  if (!ms || ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

function formatMusicItem(item) {
  const parts = [`**${item.label}**`];
  if (item.artist) parts.push(`by ${item.artist}`);
  const dur = formatDuration(item.durationMs);
  if (dur) parts.push(dur);
  return parts.join(' · ');
}

export const queueCommand = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current voice queue for this server'),

  async execute(interaction) {
    const snapshot = getQueueSnapshot(interaction.guildId);
    const embed = createBrandEmbed({ title: 'Queue', tone: 'support' });

    if (!snapshot.current && snapshot.queued.length === 0) {
      embed.setDescription('The queue is currently empty.');
      return replyWithEmbedFallback(interaction, embed);
    }

    if (snapshot.current) {
      const cur = snapshot.current;
      let nowValue;
      if (cur.kind === 'music') {
        nowValue = `${formatMusicItem(cur)}\n<@${cur.requesterId}>${cur.paused ? ' · ⏸ paused' : ''}`;
      } else {
        nowValue = `🗣️ <@${cur.requesterId}> · ${cur.label} · ${cur.totalChunks} chunk(s)${cur.paused ? ' · ⏸ paused' : ''}`;
      }
      embed.addFields({ name: '▶ Now Playing', value: nowValue });
    }

    const musicQueued = snapshot.queued.filter((i) => i.kind === 'music');
    const speechQueued = snapshot.queued.filter((i) => i.kind === 'speech');
    const LIMIT = 10;

    if (snapshot.queued.length > 0) {
      const lines = snapshot.queued.slice(0, LIMIT).map((item, index) => {
        if (item.kind === 'music') {
          return `${index + 1}. ${formatMusicItem(item)} · <@${item.requesterId}>`;
        }
        return `${index + 1}. 🗣️ <@${item.requesterId}> · ${item.label} · ${item.totalChunks} chunk(s)`;
      });

      if (snapshot.queued.length > LIMIT) {
        lines.push(`*…and ${snapshot.queued.length - LIMIT} more*`);
      }

      const totalMs = musicQueued.reduce((sum, i) => sum + (i.durationMs ?? 0), 0);
      const totalLabel = totalMs > 0 ? ` · ${formatDuration(totalMs)} total` : '';
      const countLabel = `${snapshot.queued.length} track${snapshot.queued.length !== 1 ? 's' : ''}${speechQueued.length > 0 ? ` + ${speechQueued.length} TTS` : ''}${totalLabel}`;

      embed.addFields({ name: `Up Next — ${countLabel}`, value: lines.join('\n') });
    }

    const components = [];
    if (musicQueued.length > 0) {
      const options = musicQueued.slice(0, 25).map((item) => {
        const pos = snapshot.queued.indexOf(item) + 1;
        const dur = formatDuration(item.durationMs);
        const label = `${pos}. ${item.label}`.slice(0, 100);
        const descParts = [item.artist, dur].filter(Boolean);
        const description = descParts.join(' · ').slice(0, 100) || undefined;
        return { label, value: String(pos), description };
      });

      const menu = new StringSelectMenuBuilder()
        .setCustomId('music:remove:ctrl')
        .setPlaceholder('Remove a queued music track...')
        .addOptions(options);

      components.push(new ActionRowBuilder().addComponents(menu));
    }

    return replyWithEmbedFallback(interaction, embed, components.length > 0 ? { components } : {});
  }
};
