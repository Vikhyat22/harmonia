import test from 'node:test';
import assert from 'node:assert/strict';
import { autoTtsCommand } from '../src/commands/autotts.js';

test('autotts command explains the required privileged intent when disabled', async () => {
  const previous = process.env.ENABLE_MESSAGE_CONTENT_INTENT;
  process.env.ENABLE_MESSAGE_CONTENT_INTENT = 'false';
  let replyPayload = null;

  const interaction = {
    async reply(payload) {
      replyPayload = payload;
    }
  };

  await autoTtsCommand.execute(interaction);

  assert.deepEqual(replyPayload, {
    content: '❌ Auto-TTS is disabled. Set `ENABLE_MESSAGE_CONTENT_INTENT=true` in your environment and enable the Message Content intent in the Discord Developer Portal first.',
    flags: 64
  });

  if (previous === undefined) {
    delete process.env.ENABLE_MESSAGE_CONTENT_INTENT;
  } else {
    process.env.ENABLE_MESSAGE_CONTENT_INTENT = previous;
  }
});
