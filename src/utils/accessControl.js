export function getSpeakerAccessDecision(member, userId, settings, options = {}) {
  const blockedUserIds = settings?.blockedUserIds ?? [];
  const blockedRoleIds = settings?.blockedRoleIds ?? [];
  const allowedUserIds = settings?.allowedUserIds ?? [];
  const allowedRoleIds = settings?.allowedRoleIds ?? [];
  const accessMode = settings?.accessMode ?? 'open';
  const bypass = Boolean(options.bypass);

  if (bypass) {
    return { allowed: true, reason: 'bypass' };
  }

  if (blockedUserIds.includes(userId)) {
    return { allowed: false, reason: 'blocked_user' };
  }

  const memberRoles = member?.roles?.cache;
  if (memberRoles && blockedRoleIds.some((roleId) => memberRoles.has(roleId))) {
    return { allowed: false, reason: 'blocked_role' };
  }

  if (accessMode !== 'allowlist') {
    return { allowed: true, reason: 'open' };
  }

  if (allowedUserIds.includes(userId)) {
    return { allowed: true, reason: 'allowed_user' };
  }

  if (memberRoles && allowedRoleIds.some((roleId) => memberRoles.has(roleId))) {
    return { allowed: true, reason: 'allowed_role' };
  }

  return { allowed: false, reason: 'not_allowlisted' };
}

export function isSpeakerBlocked(member, userId, settings, options = {}) {
  const decision = getSpeakerAccessDecision(member, userId, settings, options);
  return !decision.allowed;
}

export function getSpeakerAccessError(decision) {
  if (!decision || decision.allowed) {
    return null;
  }

  if (decision.reason === 'not_allowlisted') {
    return '❌ This server is in allowlist mode, and you are not on the allowed user/role list.';
  }

  return '❌ You are not allowed to use TTS in this server.';
}
