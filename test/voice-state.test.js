import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMemberVoiceChannel } from '../src/utils/voiceState.js';

test('resolveMemberVoiceChannel finds the user from voice channel membership', async () => {
  const interaction = {
    user: { id: 'user-1' },
    guild: {
      voiceStates: {
        cache: new Map()
      },
      channels: {
        cache: {
          find(predicate) {
            const channels = [
              { id: 'text-1', isVoiceBased: () => false, members: new Map() },
              {
                id: 'voice-1',
                isVoiceBased: () => true,
                members: new Map([['user-1', { id: 'user-1' }]])
              }
            ];

            return channels.find(predicate) ?? null;
          }
        }
      }
    }
  };

  const channel = await resolveMemberVoiceChannel(interaction);
  assert.equal(channel?.id, 'voice-1');
});
