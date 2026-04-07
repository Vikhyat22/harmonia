import { SlashCommandBuilder } from '../lib/discord.js';
import { getManageGuildError, hasManageGuildAccess } from '../utils/permissions.js';
import { updateGuildSettings } from '../services/settingsStore.js';

export const setDjRoleCommand = {
  data: new SlashCommandBuilder()
    .setName('setdjrole')
    .setDescription('Set or clear a Discord role that can manage music playback controls')
    .addRoleOption((option) =>
      option
        .setName('role')
        .setDescription('Role to allow for DJ playback controls. Leave blank to clear.')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!hasManageGuildAccess(interaction.member)) {
      return interaction.reply({ content: getManageGuildError(), flags: 64 });
    }

    const role = interaction.options.getRole('role');
    await updateGuildSettings(interaction.guildId, {
      djRoleId: role?.id ?? null
    });

    return interaction.reply({
      content: role
        ? `✅ DJ role set to ${role}.`
        : '✅ Cleared the DJ role. Playback controls are open again unless other rules apply.',
      flags: 64
    });
  }
};
