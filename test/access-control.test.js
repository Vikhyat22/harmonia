import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSpeakerAccessDecision,
  getSpeakerAccessError,
  isSpeakerBlocked
} from '../src/utils/accessControl.js';

test('speaker access check blocks configured users and roles', () => {
  const member = {
    roles: {
      cache: new Map([['role-2', { id: 'role-2' }]])
    }
  };

  assert.equal(
    isSpeakerBlocked(member, 'user-1', {
      blockedUserIds: ['user-1'],
      blockedRoleIds: []
    }),
    true
  );

  assert.equal(
    isSpeakerBlocked(member, 'user-3', {
      blockedUserIds: [],
      blockedRoleIds: ['role-2']
    }),
    true
  );
});

test('speaker access check tolerates missing settings arrays', () => {
  assert.equal(isSpeakerBlocked(null, 'user-1', {}), false);
});

test('speaker access check enforces allowlist mode when configured', () => {
  const member = {
    roles: {
      cache: new Map([['role-9', { id: 'role-9' }]])
    }
  };

  const denied = getSpeakerAccessDecision(member, 'user-1', {
    accessMode: 'allowlist',
    allowedUserIds: [],
    allowedRoleIds: []
  });
  assert.equal(denied.allowed, false);
  assert.match(getSpeakerAccessError(denied), /allowlist mode/i);

  const allowed = getSpeakerAccessDecision(member, 'user-1', {
    accessMode: 'allowlist',
    allowedUserIds: [],
    allowedRoleIds: ['role-9']
  });
  assert.equal(allowed.allowed, true);
});
