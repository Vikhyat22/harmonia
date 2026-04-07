import { PermissionFlagsBits } from '../lib/discord.js';

function hasPermission(member, permissionFlag) {
  const permissions = member?.permissions;
  if (!permissions) {
    return false;
  }

  if (typeof permissions.has === 'function') {
    return permissions.has(permissionFlag);
  }

  try {
    const mask = typeof permissions === 'string' || typeof permissions === 'number' || typeof permissions === 'bigint'
      ? BigInt(permissions)
      : BigInt(permissions.bitfield ?? 0n);
    const required = BigInt(permissionFlag);
    return (mask & required) === required;
  } catch {
    return false;
  }
}

function hasRole(member, roleId) {
  if (!roleId || !member?.roles) {
    return false;
  }

  if (typeof member.roles.cache?.has === 'function') {
    return member.roles.cache.has(roleId);
  }

  if (Array.isArray(member.roles)) {
    return member.roles.includes(roleId);
  }

  return false;
}

export function hasManageGuildAccess(member) {
  return hasPermission(member, PermissionFlagsBits.ManageGuild);
}

export function getManageGuildError() {
  return '❌ You need the `Manage Server` permission to change server-wide bot settings.';
}

export function hasConfiguredAdminAccess(member, guildSettings) {
  if (hasManageGuildAccess(member)) {
    return true;
  }

  if (!guildSettings?.adminRoleId) {
    return false;
  }

  return hasRole(member, guildSettings.adminRoleId);
}

export function hasConfiguredDjAccess(member, guildSettings) {
  if (hasConfiguredAdminAccess(member, guildSettings)) {
    return true;
  }

  if (!guildSettings?.djRoleId) {
    return false;
  }

  return hasRole(member, guildSettings.djRoleId);
}

export function getConfiguredAdminError() {
  return '❌ You need the configured bot admin role or `Manage Server` permission to change server-wide bot settings.';
}
