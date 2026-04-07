const activeGuilds = new Set();

export function claimGuildPlayback(guildId) {
  if (activeGuilds.has(guildId)) {
    return false;
  }

  activeGuilds.add(guildId);
  return true;
}

export function releaseGuildPlayback(guildId) {
  activeGuilds.delete(guildId);
}

export function hasGuildPlayback(guildId) {
  return activeGuilds.has(guildId);
}

export function resetPlaybackRegistry() {
  activeGuilds.clear();
}
