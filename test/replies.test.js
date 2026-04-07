import test from 'node:test';
import assert from 'node:assert/strict';
import { EmbedBuilder } from '../src/lib/discord.js';
import { renderEmbedAsPlainText, replyWithEmbedFallback } from '../src/utils/replies.js';

test('renderEmbedAsPlainText includes title, description, and fields', () => {
  const embed = new EmbedBuilder()
    .setTitle('Test Title')
    .setDescription('Test description')
    .addFields({ name: 'Field A', value: 'Value A' });

  const text = renderEmbedAsPlainText(embed);

  assert.match(text, /\*\*Test Title\*\*/);
  assert.match(text, /Test description/);
  assert.match(text, /Field A/);
  assert.match(text, /Value A/);
});

test('replyWithEmbedFallback retries as plain text when embed permissions are missing', async () => {
  const embed = new EmbedBuilder()
    .setTitle('Harmonia Help')
    .setDescription('Fallback test');

  const payloads = [];
  const interaction = {
    async reply(payload) {
      payloads.push(payload);

      if (payloads.length === 1) {
        const error = new Error('Missing Permissions');
        error.code = 50013;
        throw error;
      }

      return payload;
    }
  };

  const result = await replyWithEmbedFallback(interaction, embed, { flags: 64 });

  assert.equal(payloads.length, 2);
  assert.deepEqual(payloads[0], { embeds: [embed], flags: 64 });
  assert.deepEqual(result, payloads[1]);
  assert.equal(payloads[1].flags, 64);
  assert.match(payloads[1].content, /Harmonia Help/);
});
