/**
 * @typedef {Object} Track
 * @property {string} id - Unique identifier
 * @property {string} guildId - Discord guild ID
 * @property {string} requesterId - Discord user ID who requested
 * @property {'speech' | 'music'} kind - Item type
 * @property {string} title - Display title
 * @property {string} [artist] - Artist/voice name
 * @property {number} [durationMs] - Duration in milliseconds
 * @property {string} source - 'slash', 'autoplay', 'search', etc.
 * @property {string} sourceType - 'tts', 'direct-url', 'youtube', etc.
 * @property {string|Buffer} playbackInput - File path, URL, or audio buffer
 * @property {Object} metadata - Additional source-specific data
 */

export function createSpeechTrack({
  guildId,
  requesterId,
  title,
  languageCode,
  voiceName,
  chunks = [],
  source = 'slash'
}) {
  if (!chunks || chunks.length === 0) {
    throw new Error('Speech track requires at least one text chunk');
  }

  return {
    id: generateTrackId(),
    guildId: guildId || 'unknown',
    requesterId: requesterId || 'unknown',
    kind: 'speech',
    title: title || 'Speech',
    artist: voiceName || 'Unknown',
    durationMs: estimateSpeechDuration(chunks),
    source,
    sourceType: 'tts',
    playbackInput: chunks[0],
    metadata: {
      languageCode: languageCode || 'en-US',
      voiceName: voiceName || 'Unknown',
      chunks,
      totalChunks: chunks.length
    }
  };
}

export function createMusicTrack({
  guildId,
  requesterId,
  title,
  artist,
  durationMs,
  sourceUrl,
  sourceType = 'direct-url',
  thumbnailUrl,
  source = 'slash'
}) {
  if (!title || !sourceUrl) {
    throw new Error('Music track requires title and sourceUrl');
  }

  return {
    id: generateTrackId(),
    guildId: guildId || 'unknown',
    requesterId: requesterId || 'unknown',
    kind: 'music',
    title,
    artist: artist || 'Unknown Artist',
    durationMs: durationMs || null,
    source,
    sourceType,
    playbackInput: sourceUrl,
    metadata: {
      thumbnailUrl: thumbnailUrl || null,
      artworkUrl: thumbnailUrl || null
    }
  };
}

function generateTrackId() {
  return `trk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function estimateSpeechDuration(chunks) {
  const totalChars = chunks.join('').length;
  return Math.round((totalChars / 5) * 60 * 1000 / 150);
}
