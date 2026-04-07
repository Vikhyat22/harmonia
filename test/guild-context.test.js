import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInteractionGuild } from '../src/utils/guildContext.js';

test('resolveInteractionGuild returns interaction.guild when present', async () => {
  const guild = { id: 'guild-1' };
  const result = await resolveInteractionGuild({
    guild,
    guildId: 'guild-1'
  });

  assert.equal(result, guild);
});

test('resolveInteractionGuild fetches the guild when interaction.guild is null', async () => {
  let fetchedGuildId = null;
  const guild = { id: 'guild-1' };
  const result = await resolveInteractionGuild({
    guild: null,
    guildId: 'guild-1',
    client: {
      guilds: {
        async fetch(guildId) {
          fetchedGuildId = guildId;
          return guild;
        }
      }
    }
  });

  assert.equal(fetchedGuildId, 'guild-1');
  assert.equal(result, guild);
});
