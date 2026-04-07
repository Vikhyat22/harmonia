import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { commands } from '../src/commands/index.js';

test('command registry includes every command module with unique slash names', () => {
  const commandFiles = readdirSync(new URL('../src/commands/', import.meta.url))
    .filter((file) => file.endsWith('.js') && file !== 'index.js');

  assert.equal(commands.length, commandFiles.length);

  const names = commands.map((command) => command.data?.toJSON?.().name);
  assert.equal(new Set(names).size, names.length);

  for (const command of commands) {
    assert.ok(command?.data, 'command is missing slash-command metadata');
    assert.equal(typeof command.execute, 'function');

    const json = command.data.toJSON();
    assert.equal(typeof json.name, 'string');
    assert.ok(json.name.length > 0);
    assert.equal(typeof json.description, 'string');
    assert.ok(json.description.length > 0);
  }
});
