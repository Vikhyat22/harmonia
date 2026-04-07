import { SlashCommandBuilder } from '../lib/discord.js';
import { getManageGuildError, hasManageGuildAccess } from '../utils/permissions.js';
import { updateGuildSettings } from '../services/settingsStore.js';

export const setAdminRoleCommand = {
  data: new SlashCommandBuilder()
    .setName('setadminrole')
    .setDescription('Set or clear a Discord role that can manage bot server settings')
    .addRoleOption((option) =>
      option
        .setName('role')
        .setDescription('Role to allow for bot admin commands. Leave blank to clear.')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!hasManageGuildAccess(interaction.member)) {
      return interaction.reply({ content: getManageGuildError(), flags: 64 });
    }

    const role = interaction.options.getRole('role');
    await updateGuildSettings(interaction.guildId, {
      adminRoleId: role?.id ?? null
    });

    return interaction.reply({
      content: role
        ? `✅ Bot admin role set to ${role}.`
        : '✅ Cleared the bot admin role. `Manage Server` is now required for server settings.',
      flags: 64
    });
  }
};
