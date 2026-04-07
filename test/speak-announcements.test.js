import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSpeakAnnouncement,
  buildSpeakAnnouncementComponents,
  parseSpeakRevealCustomId,
  sendSpeakAnnouncement
} from '../src/utils/speakAnnouncements.js';

test('buildSpeakAnnouncement includes requester, language, channel, and hidden-text marker', () => {
  const message = buildSpeakAnnouncement({
    requesterId: 'user-1',
    languageName: 'English (India)',
    voiceChannelId: 'voice-1',
    position: 1
  });

  assert.match(message, /<@user-1>/);
  assert.match(message, /English \(India\)/);
  assert.match(message, /<#voice-1>/);
  assert.match(message, /Text hidden/);
});

test('buildSpeakAnnouncement mentions queue position when not first', () => {
  const message = buildSpeakAnnouncement({
    requesterId: 'user-1',
    languageName: 'English (India)',
    voiceChannelId: 'voice-1',
    position: 3
  });

  assert.match(message, /Queue #3/);
});

test('buildSpeakAnnouncementComponents creates a reveal button', () => {
  const components = buildSpeakAnnouncementComponents('reveal-1');
  const row = components[0].toJSON();

  assert.equal(row.components[0].custom_id, 'speak_reveal:reveal-1');
  assert.equal(row.components[0].label, 'View Message');
  assert.equal(row.components[0].style, 2);
});

test('parseSpeakRevealCustomId parses reveal ids', () => {
  assert.deepEqual(parseSpeakRevealCustomId('speak_reveal:abc123'), { revealId: 'abc123' });
  assert.equal(parseSpeakRevealCustomId('language_page:abc123:1'), null);
});

test('sendSpeakAnnouncement posts to the request text channel when available', async () => {
  const sentPayloads = [];
  const guild = {
    channels: {
      cache: new Map([
        ['text-1', {
          id: 'text-1',
          isTextBased: () => true,
          async send(payload) {
            sentPayloads.push(payload);
          }
        }]
      ])
    }
  };

  const result = await sendSpeakAnnouncement({
    guild,
    textChannelId: 'text-1',
    requesterId: 'user-1',
    languageName: 'English (India)',
    text: 'Hello from Harmonia',
    voiceChannelId: 'voice-1',
    position: 1
  });

  assert.equal(result, true);
  assert.equal(sentPayloads.length, 1);
  assert.match(sentPayloads[0].content, /Text hidden/);
  assert.equal(sentPayloads[0].embeds, undefined);
  assert.equal(sentPayloads[0].components.length, 1);
});
