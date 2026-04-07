import { EmbedBuilder } from '../lib/discord.js';

export const HARMONIA = Object.freeze({
  name: 'Harmonia',
  tagline: 'A melodic voice for every server',
  statusText: '/speak for live voice',
  footerText: 'Harmonia • Free Discord TTS',
  colors: {
    primary: 0x56c7a7,
    support: 0x6ebfd9,
    warm: 0xe4b86a,
    alert: 0xe37d6f,
    neutral: 0x91a7bf
  }
});

function getToneColor(tone = 'primary') {
  return HARMONIA.colors[tone] ?? HARMONIA.colors.primary;
}

export function createBrandEmbed({ title, description = null, tone = 'primary' }) {
  const embed = new EmbedBuilder()
    .setColor(getToneColor(tone))
    .setAuthor({
      name: HARMONIA.name
    })
    .setFooter({
      text: HARMONIA.footerText
    })
    .setTimestamp();

  if (title) {
    embed.setTitle(title);
  }

  if (description) {
    embed.setDescription(description);
  }

  return embed;
}

export function getBrandPresence() {
  return {
    activities: [
      {
        name: HARMONIA.statusText,
        type: 2
      }
    ],
    status: 'online'
  };
}
