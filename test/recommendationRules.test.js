import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanonicalKey, normalizeArtist } from '../src/services/recommendationIdentity.js';
import {
  buildSongFamilyKey,
  isCanonicalOriginalTrack,
  isSameSongFamily,
  isUnwantedVariant
} from '../src/services/recommendationRules.js';

test('recommendation identity builds canonical keys from provider ids and fallback metadata', () => {
  assert.equal(
    buildCanonicalKey({ metadata: { spotifyTrackId: '1234567890123456789012' } }),
    'spotify:1234567890123456789012'
  );
  assert.equal(
    buildCanonicalKey({ metadata: { identifier: 'abc123xyz', canonicalSourceType: 'youtube' } }),
    'youtube:abc123xyz'
  );
  assert.equal(
    buildCanonicalKey({ metadata: { identifier: 'sc-track-42', canonicalSourceType: 'soundcloud' } }),
    'soundcloud:sc-track-42'
  );
  assert.equal(
    buildCanonicalKey({ metadata: { identifier: 'dz-track-9', canonicalSourceType: 'deezer' } }),
    'deezer:dz-track-9'
  );
  assert.equal(
    buildCanonicalKey({ title: 'Hoshwalon Ko Khabar Kya', artist: 'Jagjit Singh' }),
    'fallback:jagjit singh|hoshwalon ko khabar kya'
  );
});

test('recommendation rules reject edited variants and prefer canonical original-looking uploads', () => {
  assert.equal(
    isUnwantedVariant(
      { title: 'Tumko Dekha (Edited)' },
      { title: 'Tumko Dekha To Yeh Khayal Aaya' }
    ),
    true
  );
  assert.equal(
    isCanonicalOriginalTrack({
      title: 'Hothon Se Chhu Lo Tum (From "Prem Geet")',
      artist: 'Jagjit Singh - Topic'
    }),
    true
  );
  assert.equal(
    isCanonicalOriginalTrack({
      title: 'Ed Sheeran - Perfect (Official Music Video)',
      artist: 'Bad Boy Edd'
    }),
    false
  );
  assert.equal(
    isCanonicalOriginalTrack({
      title: 'British Guy REACTS to Anuv Jain X Lost Stories "Arz Kiya Hai" | Official Video | Coke Studio Bharat',
      artist: 'G.O.T Extra'
    }),
    false
  );
  assert.equal(
    isCanonicalOriginalTrack({
      title: 'Arz kiya hai (official video)',
      artist: 'Shopiment'
    }),
    false
  );
  assert.equal(
    isUnwantedVariant(
      { title: 'Perfect (For Cello and Piano)' },
      { title: 'Perfect' }
    ),
    true
  );
  assert.equal(
    isUnwantedVariant(
      { title: 'Anuv Jain Top 7 Best Songs | Best of Anuv Jain' },
      { title: 'Baarishein' }
    ),
    true
  );
  assert.equal(
    isUnwantedVariant(
      { title: 'Anuv Jain x Lost Stories - Arz Kiya Hai | Behind The Scenes - Part 1' },
      { title: 'Baarishein' }
    ),
    true
  );
  assert.equal(
    buildSongFamilyKey('Tumko Dekha (Edited)'),
    buildSongFamilyKey('Tumko Dekha')
  );
  assert.equal(
    buildSongFamilyKey('Ed Sheeran - Perfect (Official Music Video)', 'Bad Boy Edd'),
    buildSongFamilyKey('Perfect', 'One Direction')
  );
});

test('recommendation identity canonicalizes channel labels and song-family matching ignores minor title variants', () => {
  assert.equal(normalizeArtist('Ed Sheeran - Topic'), 'ed sheeran');
  assert.equal(normalizeArtist('Ed Sheeran VEVO'), 'ed sheeran');
  assert.equal(normalizeArtist('S. P. Balasubrahmanyam'), 's p balasubrahmanyam');
  assert.equal(normalizeArtist('S.P. Balasubrahmanyam'), 's p balasubrahmanyam');
  assert.equal(
    isSameSongFamily(
      { title: 'Tum Itna Jo Muskura Rahe Ho (Live)' },
      { title: 'Tum Itna Jo Muskura Rahe Ho' }
    ),
    true
  );
});
