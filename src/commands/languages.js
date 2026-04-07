import { SlashCommandBuilder } from '../lib/discord.js';
import { languages } from '../utils/languages.js';
import { createBrandEmbed } from '../utils/brand.js';
import { replyWithEmbedFallback } from '../utils/replies.js';

export const languagesCommand = {
  data: new SlashCommandBuilder()
    .setName('languages')
    .setDescription('List all available TTS languages and voices'),

  async execute(interaction) {
    const embed = createBrandEmbed({
      title: 'Harmonia Languages',
      description: 'These are the real locales currently supported by Harmonia on the free TTS stack.',
      tone: 'support'
    });

    for (const category of Object.values(languages)) {
      const voiceList = category.options
        .map((option) => `• ${option.name} \`${option.code}\``)
        .join('\n');
      
      embed.addFields({
        name: `${category.emoji} ${category.label}`,
        value: voiceList
      });
    }

    await replyWithEmbedFallback(interaction, embed, { flags: 64 });
  }
};
