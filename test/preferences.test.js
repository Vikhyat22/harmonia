import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getConfiguredAdminError,
  getManageGuildError,
  hasConfiguredAdminAccess,
  hasConfiguredDjAccess,
  hasManageGuildAccess
} from '../src/utils/permissions.js';
import { parseLanguageInput } from '../src/utils/languageAutocomplete.js';

test('guild settings permission helper requires Manage Server', () => {
  const member = {
    permissions: {
      has(flag) {
        return Boolean(flag);
      }
    }
  };

  assert.equal(hasManageGuildAccess(member), true);
  assert.match(getManageGuildError(), /Manage Server/);
});

test('language parsing still accepts supported locale names for defaults', () => {
  assert.equal(parseLanguageInput('Hindi')?.code, 'hi-IN');
  assert.equal(parseLanguageInput('French')?.code, 'fr-FR');
});

test('configured admin access accepts the configured role', () => {
  const member = {
    permissions: {
      has() {
        return false;
      }
    },
    roles: {
      cache: new Map([['role-1', { id: 'role-1' }]])
    }
  };

  assert.equal(hasConfiguredAdminAccess(member, { adminRoleId: 'role-1' }), true);
  assert.match(getConfiguredAdminError(), /bot admin role/);
});

test('guild settings permission helper accepts raw interaction permission bitfields', () => {
  const member = {
    permissions: String(BigInt(1) << BigInt(5))
  };

  assert.equal(hasManageGuildAccess(member), true);
});

test('configured admin access accepts raw interaction role arrays', () => {
  const member = {
    permissions: '0',
    roles: ['role-1', 'role-2']
  };

  assert.equal(hasConfiguredAdminAccess(member, { adminRoleId: 'role-1' }), true);
});

test('configured dj access accepts the configured dj role', () => {
  const member = {
    permissions: {
      has() {
        return false;
      }
    },
    roles: {
      cache: new Map([['dj-role', { id: 'dj-role' }]])
    }
  };

  assert.equal(hasConfiguredDjAccess(member, { djRoleId: 'dj-role' }), true);
});

test('configured dj access inherits configured admin access', () => {
  const member = {
    permissions: '0',
    roles: ['admin-role']
  };

  assert.equal(hasConfiguredDjAccess(member, { adminRoleId: 'admin-role', djRoleId: 'dj-role' }), true);
});
