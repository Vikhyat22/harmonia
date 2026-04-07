import { hasConfiguredDjAccess } from './permissions.js';

export function isDjModeEnabled(settings) {
  return Boolean(settings?.djRoleId);
}

export function getPlaybackControlDecision(member, userId, settings, options = {}) {
  if (!isDjModeEnabled(settings)) {
    return { allowed: true, reason: 'open' };
  }

  if (hasConfiguredDjAccess(member, settings)) {
    return { allowed: true, reason: 'dj' };
  }

  const requesterId = options.requesterId ?? null;
  if (options.allowRequester && requesterId && requesterId === userId) {
    return { allowed: true, reason: 'requester' };
  }

  return {
    allowed: false,
    reason: options.allowRequester ? 'not-requester-or-dj' : 'not-dj'
  };
}

export function getPlaybackControlError(settings, options = {}) {
  if (!isDjModeEnabled(settings)) {
    return '❌ You are not allowed to control playback right now.';
  }

  if (options.allowRequester) {
    return '❌ Only the current requester or a DJ/admin can do that.';
  }

  return '❌ Only a DJ/admin can do that.';
}
