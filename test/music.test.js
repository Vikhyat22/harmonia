import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMusicRequest } from '../src/services/music.js';

test('resolveMusicRequest accepts direct audio urls', () => {
  const result = resolveMusicRequest('https://example.com/audio/test-track.mp3');

  assert.equal(result.sourceUrl, 'https://example.com/audio/test-track.mp3');
  assert.equal(result.title, 'test track');
});

test('resolveMusicRequest prefers explicit titles', () => {
  const result = resolveMusicRequest('https://example.com/live-stream.m3u8', 'Lo-Fi Radio');

  assert.equal(result.title, 'Lo-Fi Radio');
});

test('resolveMusicRequest rejects plain text queries for phase 1', () => {
  assert.throws(
    () => resolveMusicRequest('shape of you'),
    /direct audio or stream urls only/i
  );
});

test('resolveMusicRequest rejects youtube page links', () => {
  assert.throws(
    () => resolveMusicRequest('https://youtu.be/AETFvQonfV8'),
    /does not support youtube, spotify, or soundcloud page links yet/i
  );
});

test('resolveMusicRequest rejects generic page urls without a playable extension', () => {
  assert.throws(
    () => resolveMusicRequest('https://example.com/watch/some-track'),
    /only supports direct audio or stream urls/i
  );
});
