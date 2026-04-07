import { SlashCommandBuilder } from '../lib/discord.js';
import { getAutoplayPreference, setAutoplayPreference } from '../services/autoplay.js';
import { okEmbed } from '../utils/embed.js';

export const radioCommand = {
  data: new SlashCommandBuilder()
    .setName('radio')
    .setDescription('Quickly switch autoplay into Radio mode')
    .addStringOption((option) =>
      option
        .setName('state')
        .setDescription('Turn radio autoplay on or off (defaults to on)')
        .setRequired(false)
        .addChoices(
          { name: 'On', value: 'on' },
          { name: 'Off', value: 'off' }
        )
    )
    .addStringOption((option) =>
      option
        .setName('debug')
        .setDescription('Enable or disable verbose autoplay decision logs')
        .setRequired(false)
        .addChoices(
          { name: 'On', value: 'on' },
          { name: 'Off', value: 'off' }
        )
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const requestedState = interaction.options.getString('state');
    const requestedDebug = interaction.options.getString('debug');
    const current = getAutoplayPreference(guildId);

    const nextPreference = {
      ...current,
      enabled: requestedState ? requestedState === 'on' : true,
      mode: 'radio',
      debugEnabled: requestedDebug ? requestedDebug === 'on' : current.debugEnabled
    };

    setAutoplayPreference(guildId, nextPreference);

    const stateLabel = nextPreference.enabled ? 'on' : 'off';
    const debugLabel = nextPreference.debugEnabled ? 'On' : 'Off';
    const lead = nextPreference.enabled
      ? '📻 Radio autoplay is **on**.'
      : '📻 Radio mode is saved, and autoplay is **off**.';

    return interaction.reply({
      embeds: [okEmbed([
        lead,
        'Mode: **Radio**',
        `Debug logs: **${debugLabel}**`,
        `Status saved: **${stateLabel === 'on' ? 'On' : 'Off'}**`
      ].join('\n'))],
      flags: 64
    });
  }
};
