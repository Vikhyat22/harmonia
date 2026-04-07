import { SlashCommandBuilder } from '../lib/discord.js';
import { getAutoplayPreference, setAutoplayPreference } from '../services/autoplay.js';
import { okEmbed } from '../utils/embed.js';

const AUTOPLAY_MODE_CHOICES = [
  { name: 'Strict Original', value: 'strict-original' },
  { name: 'Artist Continuity', value: 'artist-continuity' },
  { name: 'Discovery', value: 'discovery' },
  { name: 'Radio', value: 'radio' }
];

function formatModeLabel(mode) {
  switch (mode) {
    case 'strict-original':
      return 'Strict Original';
    case 'artist-continuity':
      return 'Artist Continuity';
    case 'discovery':
      return 'Discovery';
    case 'radio':
      return 'Radio';
    default:
      return 'Artist Continuity';
  }
}

export const autoplayCommand = {
  data: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Configure autoplay behavior when the queue ends')
    .addStringOption((option) =>
      option
        .setName('state')
        .setDescription('Turn autoplay on or off (toggles if omitted)')
        .setRequired(false)
        .addChoices(
          { name: 'On', value: 'on' },
          { name: 'Off', value: 'off' }
        )
    )
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Choose how autoplay should pick the next song')
        .setRequired(false)
        .addChoices(...AUTOPLAY_MODE_CHOICES)
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
    const requestedMode = interaction.options.getString('mode');
    const requestedDebug = interaction.options.getString('debug');
    const current = getAutoplayPreference(guildId);

    const usedCompatibilityToggle = !requestedState && !requestedMode && !requestedDebug;
    const nextPreference = usedCompatibilityToggle
      ? {
          ...current,
          enabled: !current.enabled
        }
      : {
          ...current,
          enabled: requestedState ? requestedState === 'on' : current.enabled,
          mode: requestedMode ?? current.mode,
          debugEnabled: requestedDebug ? requestedDebug === 'on' : current.debugEnabled
        };

    setAutoplayPreference(guildId, nextPreference);

    const stateLabel = nextPreference.enabled ? 'on' : 'off';
    const modeLabel = formatModeLabel(nextPreference.mode);
    const debugLabel = nextPreference.debugEnabled ? 'On' : 'Off';
    const lead = nextPreference.enabled
      ? '🔄 Autoplay is **on**.'
      : '⏹ Autoplay is **off**.';

    const summary = [
      lead,
      `Mode: **${modeLabel}**`,
      `Debug logs: **${debugLabel}**`
    ];

    if (usedCompatibilityToggle) {
      summary.push('Toggle shortcut used: settings not specified, so only the on/off state changed.');
    } else {
      summary.push(`Status saved: **${stateLabel === 'on' ? 'On' : 'Off'}**`);
    }

    return interaction.reply({
      embeds: [okEmbed(summary.join('\n'))],
      flags: 64
    });
  }
};
