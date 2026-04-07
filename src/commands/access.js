import { SlashCommandBuilder } from '../lib/discord.js';
import { getGuildSettings, updateGuildSettings } from '../services/settingsStore.js';
import { getConfiguredAdminError, hasConfiguredAdminAccess } from '../utils/permissions.js';

function uniqueIds(ids) {
  return [...new Set(ids)];
}

export const accessCommand = {
  data: new SlashCommandBuilder()
    .setName('access')
    .setDescription('Manage moderation, blocklists, and allowlists for TTS')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('mode')
        .setDescription('Choose whether TTS is open to everyone or allowlist-only')
        .addStringOption((option) =>
          option
            .setName('value')
            .setDescription('Access mode')
            .setRequired(true)
            .addChoices(
              { name: 'Open', value: 'open' },
              { name: 'Allowlist only', value: 'allowlist' }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('block-user')
        .setDescription('Block a user from speaking through the bot')
        .addUserOption((option) =>
          option.setName('user').setDescription('User to block').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('unblock-user')
        .setDescription('Remove a user block')
        .addUserOption((option) =>
          option.setName('user').setDescription('User to unblock').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('block-role')
        .setDescription('Block a role from using TTS')
        .addRoleOption((option) =>
          option.setName('role').setDescription('Role to block').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('unblock-role')
        .setDescription('Remove a blocked role')
        .addRoleOption((option) =>
          option.setName('role').setDescription('Role to unblock').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('allow-user')
        .setDescription('Allow a user when the server is in allowlist mode')
        .addUserOption((option) =>
          option.setName('user').setDescription('User to allow').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('unallow-user')
        .setDescription('Remove a user from the allowlist')
        .addUserOption((option) =>
          option.setName('user').setDescription('User to remove').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('allow-role')
        .setDescription('Allow a role when the server is in allowlist mode')
        .addRoleOption((option) =>
          option.setName('role').setDescription('Role to allow').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('unallow-role')
        .setDescription('Remove a role from the allowlist')
        .addRoleOption((option) =>
          option.setName('role').setDescription('Role to remove').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Show blocked users, allowed users, and access mode')
    ),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guildId);
    if (!hasConfiguredAdminAccess(interaction.member, settings)) {
      return interaction.reply({ content: getConfiguredAdminError(), flags: 64 });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'list') {
      const allowedUsers = settings.allowedUserIds.length > 0
        ? settings.allowedUserIds.map((id) => `<@${id}>`).join('\n')
        : 'None';
      const allowedRoles = settings.allowedRoleIds.length > 0
        ? settings.allowedRoleIds.map((id) => `<@&${id}>`).join('\n')
        : 'None';
      const blockedUsers = settings.blockedUserIds.length > 0
        ? settings.blockedUserIds.map((id) => `<@${id}>`).join('\n')
        : 'None';
      const blockedRoles = settings.blockedRoleIds.length > 0
        ? settings.blockedRoleIds.map((id) => `<@&${id}>`).join('\n')
        : 'None';

      return interaction.reply({
        content: [
          `🔐 Access Mode: ${settings.accessMode === 'allowlist' ? 'Allowlist only' : 'Open'}`,
          '',
          `✅ Allowed Users:\n${allowedUsers}`,
          '',
          `✅ Allowed Roles:\n${allowedRoles}`,
          '',
          `🚫 Blocked Users:\n${blockedUsers}`,
          '',
          `🚫 Blocked Roles:\n${blockedRoles}`
        ].join('\n'),
        flags: 64
      });
    }

    if (subcommand === 'mode') {
      const value = interaction.options.getString('value', true);
      await updateGuildSettings(interaction.guildId, { accessMode: value });
      return interaction.reply({
        content: `✅ Access mode set to ${value === 'allowlist' ? '`allowlist only`' : '`open`'}.`,
        flags: 64
      });
    }

    if (subcommand === 'block-user') {
      const user = interaction.options.getUser('user', true);
      await updateGuildSettings(interaction.guildId, {
        blockedUserIds: uniqueIds([...settings.blockedUserIds, user.id])
      });
      return interaction.reply({ content: `✅ Blocked ${user} from using TTS.`, flags: 64 });
    }

    if (subcommand === 'unblock-user') {
      const user = interaction.options.getUser('user', true);
      await updateGuildSettings(interaction.guildId, {
        blockedUserIds: settings.blockedUserIds.filter((id) => id !== user.id)
      });
      return interaction.reply({ content: `✅ Unblocked ${user}.`, flags: 64 });
    }

    if (subcommand === 'allow-user') {
      const user = interaction.options.getUser('user', true);
      await updateGuildSettings(interaction.guildId, {
        allowedUserIds: uniqueIds([...settings.allowedUserIds, user.id])
      });
      return interaction.reply({ content: `✅ Allowed ${user} for allowlist mode.`, flags: 64 });
    }

    if (subcommand === 'unallow-user') {
      const user = interaction.options.getUser('user', true);
      await updateGuildSettings(interaction.guildId, {
        allowedUserIds: settings.allowedUserIds.filter((id) => id !== user.id)
      });
      return interaction.reply({ content: `✅ Removed ${user} from the allowlist.`, flags: 64 });
    }

    if (subcommand === 'block-role') {
      const role = interaction.options.getRole('role', true);
      await updateGuildSettings(interaction.guildId, {
        blockedRoleIds: uniqueIds([...settings.blockedRoleIds, role.id])
      });
      return interaction.reply({ content: `✅ Blocked ${role} from using TTS.`, flags: 64 });
    }

    if (subcommand === 'allow-role') {
      const role = interaction.options.getRole('role', true);
      await updateGuildSettings(interaction.guildId, {
        allowedRoleIds: uniqueIds([...settings.allowedRoleIds, role.id])
      });
      return interaction.reply({ content: `✅ Allowed ${role} for allowlist mode.`, flags: 64 });
    }

    if (subcommand === 'unallow-role') {
      const role = interaction.options.getRole('role', true);
      await updateGuildSettings(interaction.guildId, {
        allowedRoleIds: settings.allowedRoleIds.filter((id) => id !== role.id)
      });
      return interaction.reply({ content: `✅ Removed ${role} from the allowlist.`, flags: 64 });
    }

    const role = interaction.options.getRole('role', true);
    await updateGuildSettings(interaction.guildId, {
      blockedRoleIds: settings.blockedRoleIds.filter((id) => id !== role.id)
    });
    return interaction.reply({ content: `✅ Unblocked ${role}.`, flags: 64 });
  }
};
