import { speakCommand } from './speak.js';
import { playCommand } from './play.js';
import { insertCommand } from './insert.js';
import { pauseCommand } from './pause.js';
import { previousCommand } from './previous.js';
import { restartCommand } from './restart.js';
import { rewindCommand } from './rewind.js';
import { forwardCommand } from './forward.js';
import { resumeCommand } from './resume.js';
import { nowPlayingCommand } from './nowplaying.js';
import { languagesCommand } from './languages.js';
import { leaveCommand } from './leave.js';
import { joinCommand } from './join.js';
import { stopCommand } from './stop.js';
import { skipCommand } from './skip.js';
import { skipToCommand } from './skipto.js';
import { queueCommand } from './queue.js';
import { shuffleCommand } from './shuffle.js';
import { unshuffleCommand } from './unshuffle.js';
import { clearQueueCommand } from './clearqueue.js';
import { removeCommand } from './remove.js';
import { moveCommand } from './move.js';
import { settingsCommand } from './settings.js';
import { setLanguageCommand } from './setlanguage.js';
import { twentyFourSevenCommand } from './247.js';
import { setIdleCommand } from './setidle.js';
import { helpCommand } from './help.js';
import { setMyLanguageCommand } from './setmylanguage.js';
import { dequeueCommand } from './dequeue.js';
import { setChunkCommand } from './setchunk.js';
import { resetSettingsCommand } from './resetsettings.js';
import { statsCommand } from './stats.js';
import { setAdminRoleCommand } from './setadminrole.js';
import { setDjRoleCommand } from './setdjrole.js';
import { autoTtsCommand } from './autotts.js';
import { musicChannelCommand } from './musicchannel.js';
import { filterCommand } from './filter.js';
import { historyCommand } from './history.js';
import { accessCommand } from './access.js';
import { volumeCommand } from './volume.js';
import { seekCommand } from './seek.js';
import { loopCommand } from './loop.js';
import { autoplayCommand } from './autoplay.js';
import { radioCommand } from './radio.js';
import { effectsCommand } from './effects.js';
import { favoriteCommand } from './favorite.js';
import { favoritesCommand } from './favorites.js';
import { lyricsCommand } from './lyrics.js';
import { playlistCommand } from './playlist.js';

export const commands = [
  speakCommand,
  playCommand,
  insertCommand,
  pauseCommand,
  previousCommand,
  restartCommand,
  rewindCommand,
  forwardCommand,
  resumeCommand,
  nowPlayingCommand,
  helpCommand,
  languagesCommand,
  leaveCommand,
  joinCommand,
  stopCommand,
  skipCommand,
  skipToCommand,
  volumeCommand,
  seekCommand,
  loopCommand,
  effectsCommand,
  radioCommand,
  favoriteCommand,
  favoritesCommand,
  lyricsCommand,
  playlistCommand,
  shuffleCommand,
  unshuffleCommand,
  clearQueueCommand,
  moveCommand,
  removeCommand,
  dequeueCommand,
  queueCommand,
  historyCommand,
  statsCommand,
  settingsCommand,
  autoTtsCommand,
  musicChannelCommand,
  accessCommand,
  filterCommand,
  twentyFourSevenCommand,
  setMyLanguageCommand,
  setLanguageCommand,
  setIdleCommand,
  setChunkCommand,
  setAdminRoleCommand,
  setDjRoleCommand,
  resetSettingsCommand,
  autoplayCommand
];
