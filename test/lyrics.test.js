import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkLyricsForEmbeds,
  cleanLyricsArtist,
  cleanLyricsTitle,
  fetchLyrics,
  parseLyricsQuery
} from '../src/services/lyrics.js';

test('cleanLyricsTitle strips presentation noise from track names', () => {
  assert.equal(
    cleanLyricsTitle('Khuda Jaane | Full Song | Bachna Ae Haseeno | Ranbir Kapoor, Deepika'),
    'Khuda Jaane'
  );
  assert.equal(
    cleanLyricsTitle('Aahista Aahista (From "Bachna Ae Haseeno")'),
    'Aahista Aahista'
  );
});

test('cleanLyricsArtist strips topic and feature suffixes', () => {
  assert.equal(cleanLyricsArtist('Arijit Singh - Topic'), 'Arijit Singh');
  assert.equal(cleanLyricsArtist('Artist Name feat. Guest Artist'), 'Artist Name');
});

test('parseLyricsQuery can split artist-title pairs', () => {
  assert.deepEqual(parseLyricsQuery('Arijit Singh - Tum Hi Ho'), {
    artist: 'Arijit Singh',
    title: 'Tum Hi Ho',
    query: 'Arijit Singh - Tum Hi Ho'
  });
});

test('fetchLyrics resolves direct artist-title lookups and preserves line breaks', async () => {
  const originalFetch = global.fetch;
  const requestedUrls = [];

  global.fetch = async (url) => {
    requestedUrls.push(String(url));
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          lyrics: 'Line 1\nLine 2\n\nLine 3'
        };
      }
    };
  };

  try {
    const result = await fetchLyrics({
      title: 'Tum Hi Ho',
      artist: 'Arijit Singh'
    });

    assert.equal(requestedUrls.length, 1);
    assert.match(requestedUrls[0], /\/v1\/Arijit%20Singh\/Tum%20Hi%20Ho$/);
    assert.equal(result.title, 'Tum Hi Ho');
    assert.equal(result.artist, 'Arijit Singh');
    assert.equal(result.lyrics, 'Line 1\nLine 2\n\nLine 3');
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchLyrics falls back to suggestion search for loose text queries', async () => {
  const originalFetch = global.fetch;
  const requestedUrls = [];

  global.fetch = async (url) => {
    const value = String(url);
    requestedUrls.push(value);

    if (value.includes('/suggest/')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            data: [
              {
                title: 'Tum Hi Ho',
                artist: { name: 'Arijit Singh' }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          lyrics: 'Falling back through suggest works'
        };
      }
    };
  };

  try {
    const result = await fetchLyrics({
      query: 'tum hi ho'
    });

    assert.ok(requestedUrls.some((url) => url.includes('/suggest/tum%20hi%20ho')));
    assert.ok(requestedUrls.some((url) => url.includes('/v1/Arijit%20Singh/Tum%20Hi%20Ho')));
    assert.equal(result.title, 'Tum Hi Ho');
    assert.equal(result.artist, 'Arijit Singh');
  } finally {
    global.fetch = originalFetch;
  }
});

test('chunkLyricsForEmbeds splits long lyrics into readable chunks', () => {
  const chunks = chunkLyricsForEmbeds(`Verse one\n\n${'la '.repeat(1500)}\n\nVerse two`, 500);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 500));
});
