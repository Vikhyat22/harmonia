import test from 'node:test';
import assert from 'node:assert/strict';
import { effectsCommand } from '../src/commands/effects.js';

function createInteraction(subcommand = 'status') {
  let replyPayload = null;

  return {
    guildId: 'guild-effects',
    options: {
      getSubcommand() {
        return subcommand;
      },
      getString() {
        return null;
      }
    },
    async reply(payload) {
      replyPayload = payload;
    },
    get replyPayload() {
      return replyPayload;
    }
  };
}

test('effects command exposes apply, reset, and status subcommands', () => {
  const payload = effectsCommand.data.toJSON();
  const options = payload.options ?? [];

  assert.deepEqual(
    options.map((option) => option.name),
    ['apply', 'reset', 'status']
  );
  assert.deepEqual(
    options.find((option) => option.name === 'apply')?.options?.[0]?.choices?.map((choice) => choice.value),
    ['bassboost', 'rock', 'pop', 'electronic', 'nightcore', 'vaporwave', 'karaoke', '8d']
  );
});

test('effects command reports when nothing is playing', async () => {
  const interaction = createInteraction();

  await effectsCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Nothing is playing right now/);
});
