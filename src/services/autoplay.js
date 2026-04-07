// src/services/autoplay.js
// Orchestrates autoplay: builds seed inputs, delegates recommendation work to
// the shared pipeline, and packages the winning track into a queue item.

import { getAutoplayPreference, setAutoplayPreference } from './musicCatalog.js';
import { getAutoplayMemorySnapshot } from './autoplayMemory.js';
import { getRecentSuccessfulTracks } from './playHistory.js';
import { buildCanonicalKey, normalizeArtist } from './recommendationIdentity.js';
import { buildSongSignature } from './recommendationRules.js';
import {
  buildRecommendationSeeds,
  getRecommendationForSeed,
  getSeedSpotifyTrackId,
  getTrackAlbum
} from './recommendationPipeline.js';

function formatAutoplayDuration(ms) {
  if (!ms || ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

// Tracks recently autoplayed per guild — prevents immediate repeats.
const recentAutoplay = new Map();
const recentAutoplayArtists = new Map();
const autoplayAnchors = new Map();
const autoplaySeedSessions = new Map();
const MAX_RECENT = 20;

function pushRecent(guildId, track) {
  const canonicalKey = buildCanonicalKey(track);
  if (!canonicalKey) {
    return;
  }

  let list = recentAutoplay.get(guildId);
  if (!list) { list = []; recentAutoplay.set(guildId, list); }
  list.push(canonicalKey);
  if (list.length > MAX_RECENT) list.shift();
}

function getRecentAutoplayArtists(guildId) {
  return recentAutoplayArtists.get(guildId) ?? [];
}

function pushRecentArtist(guildId, artist) {
  const normalizedArtist = normalizeArtist(artist);
  if (!normalizedArtist) {
    return;
  }

  let list = recentAutoplayArtists.get(guildId);
  if (!list) { list = []; recentAutoplayArtists.set(guildId, list); }
  list.push(normalizedArtist);
  if (list.length > MAX_RECENT) list.shift();
}

function initializeAutoplaySeedSession(guildId, track) {
  const canonicalKey = buildCanonicalKey(track);
  const artistKey = normalizeArtist(track?.artist);
  const titleFamily = buildSongSignature(track?.title, track?.artist);
  if (!guildId || !canonicalKey || !artistKey) {
    return;
  }

  autoplaySeedSessions.set(guildId, {
    canonicalKey,
    artistKey,
    sameArtistHits: 0,
    hasDiversifiedAwayFromSeedArtist: false,
    spotifyNativeRecommendationsFailed: false,
    recentTitleFamilies: titleFamily ? [titleFamily] : [],
    autoplayStep: 0,
    selectionSalt: Date.now()
  });
}

function getAutoplaySeedSession(guildId) {
  return autoplaySeedSessions.get(guildId) ?? null;
}

function updateAutoplaySeedSession(guildId, seedTrack, chosenTrack) {
  if (!guildId || !seedTrack || !chosenTrack) {
    return;
  }

  const seedCanonicalKey = buildCanonicalKey(seedTrack);
  const seedArtistKey = normalizeArtist(seedTrack.artist);
  if (!seedCanonicalKey || !seedArtistKey) {
    return;
  }

  const existing = autoplaySeedSessions.get(guildId);
  const session = existing?.canonicalKey === seedCanonicalKey
    ? { ...existing }
    : {
        canonicalKey: seedCanonicalKey,
        artistKey: seedArtistKey,
        sameArtistHits: 0,
        hasDiversifiedAwayFromSeedArtist: false,
        spotifyNativeRecommendationsFailed: false,
        recentTitleFamilies: [],
        autoplayStep: 0,
        selectionSalt: Date.now()
      };

  const chosenArtistKey = normalizeArtist(chosenTrack.artist);
  if (chosenArtistKey === seedArtistKey) {
    session.sameArtistHits += 1;
  } else if (chosenArtistKey) {
    session.hasDiversifiedAwayFromSeedArtist = true;
  }

  const titleFamily = buildSongSignature(chosenTrack?.title, chosenTrack?.artist);
  if (titleFamily) {
    const recentTitleFamilies = Array.isArray(session.recentTitleFamilies)
      ? [...session.recentTitleFamilies]
      : [];
    recentTitleFamilies.push(titleFamily);
    session.recentTitleFamilies = recentTitleFamilies.slice(-8);
  }

  session.autoplayStep = Math.max(0, Number(session.autoplayStep) || 0) + 1;

  autoplaySeedSessions.set(guildId, session);
}

/**
 * Called by queue.js when the queue is empty and a music track just finished.
 * Returns a fully-formed queue item or null if autoplay is disabled / no match.
 */
export async function tryAutoplay(guildId, lastItem) {
  const pref = getAutoplayPreference(guildId);
  if (!pref.enabled) return null;

  if (lastItem?.kind === 'music' && lastItem.source !== 'autoplay') {
    setAutoplayAnchor(guildId, lastItem);
    initializeAutoplaySeedSession(guildId, lastItem);
  }

  const historyTracks = getRecentSuccessfulTracks(guildId, 20);
  const memoryContext = {
    ...getAutoplayMemorySnapshot(guildId, 50),
    seedSession: getAutoplaySeedSession(guildId)
  };
  const seedCandidates = buildRecommendationSeeds({
    guildId,
    lastItem,
    anchorSeed: autoplayAnchors.get(guildId),
    historyTracks,
    mode: pref.mode
  });
  const recentCanonicalKeys = getRecentCanonicalKeys(guildId);
  const recentAutoplayArtists = getRecentAutoplayArtists(guildId);
  let seedTrack = null;
  let track = null;

  for (const candidate of seedCandidates) {
    const recommended = await getRecommendationForSeed({
      seed: candidate,
      recentCanonicalKeys,
      recentTracks: historyTracks,
      recentAutoplayArtists,
      memoryContext
    });
    if (recommended) {
      seedTrack = candidate;
      track = recommended;
      break;
    }
  }

  if (!track || !seedTrack) return null;

  logAutoplayDecision(track.metadata?.autoplayDebugTrace, pref.debugEnabled);

  // Copy runtime context from the last played item.
  track.guild = lastItem.guild;
  track.voiceChannelId = lastItem.voiceChannelId;
  track.textChannel = lastItem.textChannel ?? null;
  track.idleDisconnectMs = lastItem.idleDisconnectMs;
  track.stayConnected = Boolean(lastItem.stayConnected);
  track.source = 'autoplay';
  const seedSourceTrack = seedTrack.track ?? seedTrack;
  track.metadata = {
    ...track.metadata,
    autoplay: true,
    autoplaySeed: {
      title: seedTrack.title ?? null,
      artist: seedTrack.artist ?? null,
      playbackInput: seedSourceTrack.playbackInput ?? seedSourceTrack.sourceUrl ?? null,
      seedType: seedSourceTrack.metadata?.autoplaySeedType ?? null,
      canonicalUrl: seedSourceTrack.metadata?.canonicalUrl ?? null,
      spotifyUri: seedSourceTrack.metadata?.spotifyUri ?? null,
      spotifyTrackId: getSeedSpotifyTrackId(seedSourceTrack),
      spotifyArtistNames: Array.isArray(seedSourceTrack.metadata?.spotifyArtistNames)
        ? [...seedSourceTrack.metadata.spotifyArtistNames]
        : null,
      spotifyAlbum: getTrackAlbum(seedSourceTrack),
      spotifyIsrc: seedSourceTrack.metadata?.spotifyIsrc
        ?? seedSourceTrack.metadata?.lavalinkTrack?.info?.isrc
        ?? seedSourceTrack.metadata?.lavalinkTrack?.pluginInfo?.isrc
        ?? null,
      sourceType: seedSourceTrack.sourceType ?? null,
      providerSourceType: seedSourceTrack.metadata?.canonicalSourceType
        ?? seedSourceTrack.metadata?.sourceName
        ?? seedSourceTrack.sourceType
        ?? null,
      identifier: seedSourceTrack.metadata?.identifier ?? null,
      sourceName: seedSourceTrack.metadata?.sourceName ?? null,
      canonicalSourceType: seedSourceTrack.metadata?.canonicalSourceType ?? null,
    }
  };

  // Send a public "Now Playing" card to the same text channel the user used.
  // Dynamic imports avoid a circular dependency: autoplay → musicControls → queue → autoplay.
  let nowPlayingMsg = null;
  let EmbedBuilderRef = null;

  function makeCard(color, description) {
    return new EmbedBuilderRef().setColor(color).setDescription(description);
  }

  async function editAutoplayCard(embeds) {
    if (!nowPlayingMsg) return;
    try {
      await nowPlayingMsg.edit({ embeds, components: [] });
    } catch { /* message deleted or no perms */ }
  }

  track.notifications = {
    onStart: async ({ title, artist, thumbnailUrl, durationMs, playbackUrl }) => {
      const channel = track.textChannel;
      if (!channel?.send) return;

      const [{ EmbedBuilder }, { buildMusicControlRow, setActiveMusicControlMessage }] = await Promise.all([
        import('../lib/discord.js'),
        import('../utils/musicControls.js')
      ]);
      EmbedBuilderRef = EmbedBuilder;

      const linkedTitle = playbackUrl ? `[${title}](${playbackUrl})` : title;
      const lines = [`▶ **${linkedTitle}**`];
      if (artist) lines.push(`by **${artist}**`);

      const meta = [];
      const dur = durationMs > 0 ? formatAutoplayDuration(durationMs) : null;
      if (dur) meta.push(dur);
      meta.push('🔄 Autoplay');
      lines.push(meta.join(' · '));

      const embed = new EmbedBuilder().setColor(0x56c7a7).setDescription(lines.join('\n'));
      if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);

      nowPlayingMsg = await channel.send({ embeds: [embed], components: [buildMusicControlRow(false)] }).catch(() => null);
      setActiveMusicControlMessage(guildId, nowPlayingMsg?.id);
    },
    onComplete: async ({ title }) => {
      const { clearActiveMusicControlMessage } = await import('../utils/musicControls.js');
      await editAutoplayCard([makeCard(0x4f545c, `✅ **${title}**`)]);
      clearActiveMusicControlMessage(guildId, nowPlayingMsg?.id);
    },
    onStopped: async ({ skipped, title }) => {
      const { clearActiveMusicControlMessage } = await import('../utils/musicControls.js');
      const desc = skipped ? `⏭ **${title}** was skipped` : `⏹ Stopped **${title ?? 'playback'}**`;
      await editAutoplayCard([makeCard(0x4f545c, desc)]);
      clearActiveMusicControlMessage(guildId, nowPlayingMsg?.id);
    },
    onError: async ({ message }) => {
      const { clearActiveMusicControlMessage } = await import('../utils/musicControls.js');
      await editAutoplayCard([makeCard(0xe37d6f, `❌ ${message}`)]);
      clearActiveMusicControlMessage(guildId, nowPlayingMsg?.id);
    },
    onCancelled: async () => {}
  };

  pushRecent(guildId, track);
  pushRecentArtist(guildId, track.artist);
  updateAutoplaySeedSession(guildId, seedTrack.track ?? seedTrack, track);
  return track;
}

// Re-export for use by /autoplay command
export { getAutoplayPreference, setAutoplayPreference };

function setAutoplayAnchor(guildId, track) {
  if (!guildId || !track) return;

  autoplayAnchors.set(guildId, {
    ...track,
    metadata: {
      ...track.metadata,
    },
    source: 'music'
  });
}

function getRecentCanonicalKeys(guildId) {
  return recentAutoplay.get(guildId) ?? [];
}

function logAutoplayDecision(trace, debugEnabled) {
  if (!trace?.winner) {
    return;
  }

  const reasonSummary = Array.isArray(trace.winner.reasonSummary) && trace.winner.reasonSummary.length > 0
    ? trace.winner.reasonSummary.join(' ')
    : 'none';

  console.info(
    `[Autoplay] mode=${trace.mode} seed="${formatTraceLabel(trace.seed)}" winner="${formatTraceLabel(trace.winner)}" source=${trace.winner.provenance?.source ?? 'unknown'} total=${trace.winner.scoreBreakdown?.total ?? 0} reasons=${reasonSummary}`
  );

  if (!debugEnabled) {
    return;
  }

  console.info(
    `[AutoplayDebug] seed=${trace.seed?.canonicalKey ?? 'unknown'} mode=${trace.mode}`
  );
  console.info(
    `winner: ${formatTraceLabel(trace.winner)} total=${trace.winner.scoreBreakdown?.total ?? 0} provenance=${trace.winner.provenance?.source ?? 'unknown'} reasons=${reasonSummary}`
  );

  for (const candidate of trace.rejectedTopCandidates ?? []) {
    console.info(
      `rejected: ${formatTraceLabel(candidate)} total=${candidate.scoreBreakdown?.total ?? 0} reasons=${(candidate.rejectionReasons ?? []).join(',') || 'none'}`
    );
  }
}

function formatTraceLabel(candidate) {
  const title = candidate?.title ?? 'unknown title';
  const artist = candidate?.artist ?? 'unknown artist';
  return `${title}|${artist}`;
}
