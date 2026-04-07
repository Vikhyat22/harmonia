import { SlashCommandBuilder } from '../lib/discord.js';
import { createBrandEmbed, HARMONIA } from '../utils/brand.js';
import { replyWithEmbedFallback } from '../utils/replies.js';

export const helpCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show the main bot commands and how to use them'),

  async execute(interaction) {
    const embed = createBrandEmbed({
      title: 'Harmonia Help',
      description: `${HARMONIA.tagline}. Use these commands to speak, moderate, and monitor your server's voice activity.`,
      tone: 'primary'
    })
      .addFields(
        {
          name: 'Music Phase 1',
          value: [
            '`/play query` Play a direct audio or stream URL in your voice channel',
            '`/insert query` Insert a song or playlist so it plays next',
            '`/pause` Pause current playback',
            '`/previous` Replay the previously played song',
            '`/restart` Restart the current song from the beginning',
            '`/rewind` Jump backward within the current song',
            '`/forward` Jump forward within the current song',
            '`/resume` Resume paused playback',
            '`/nowplaying` Show the current playback item',
            '`/volume` Set playback volume',
            '`/seek` Seek within the current track',
            '`/loop` Loop the current track or queue',
            '`/autoplay` Configure queue-end recommendations',
            '`/radio` Turn on loose radio-style autoplay quickly',
            '`/effects` Apply music effect presets',
            '`/shuffle` Shuffle queued music tracks',
            '`/unshuffle` Restore the queue order from before the last shuffle',
            '`/favorite` Save or unsave the current song',
            '`/favorites` List, replay, and remove saved songs',
            '`/lyrics` Show lyrics for the current song or a query',
            '`/playlist` Save, edit, replay, and delete named playlists'
          ].join('\n')
        },
        {
          name: 'Speaking',
          value: [
            '`/speak text [language]` Speak text in your voice channel',
            '`/autotts` Manage channels where normal messages are read automatically (requires Message Content intent)',
            '`/join` Join your current voice channel',
            '`/leave` Leave the channel and clear queued items'
          ].join('\n')
        },
        {
          name: 'Queue Control',
          value: [
            '`/queue` Show now playing and queued items',
            '`/history` Show recent voice activity in this server',
            '`/stats` Show bot activity for this runtime',
            '`/dashboard` and `/dashboard.json` Show the hosted analytics dashboard and JSON snapshot',
            '`/skip` Skip the current message',
            '`/skipto` Skip ahead to a queued position',
            '`/stop` Stop playback and clear the queue',
            '`/clearqueue` Clear upcoming queued items without stopping playback',
            '`/dequeue` Remove your own queued messages',
            '`/move` Reorder queued items by position',
            '`/remove` Remove a queued item by position'
          ].join('\n')
        },
        {
          name: 'Preferences',
          value: [
            '`/setmylanguage` Save your default language',
            '`/settings` Show current server settings',
            '`/languages` Show the supported language catalog'
          ].join('\n')
        },
        {
          name: 'Admin',
          value: [
            '`/setlanguage` Set the server default language',
            '`/setidle` Change idle disconnect time',
            '`/247` Toggle 24/7 stay-connected mode',
            '`/musicchannel` Configure a dedicated song-request channel and controller',
            '`/setchunk` Change automatic chunk length',
            '`/access` Manage access mode, blocks, and allowlists for users and roles',
            '`/filter` Manage blocked words and phrases',
            '`/setadminrole` Allow a role to manage bot settings',
            '`/setdjrole` Allow a role to manage playback controls',
            '`/resetsettings` Reset server bot settings'
          ].join('\n')
        }
      );

    await replyWithEmbedFallback(interaction, embed, { flags: 64 });
  }
};
