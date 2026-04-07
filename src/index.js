import 'dotenv/config';
import { ActivityType, Client, GatewayIntentBits, Collection } from './lib/discord.js';
import { commands } from './commands/index.js';
import { handleLanguageSelect } from './handlers/selectMenu.js';
import { handleSpeakAnnouncementButton } from './handlers/speakAnnouncementButton.js';
import { handleMusicControls } from './handlers/musicControls.js';
import { handleMessageCreate } from './handlers/messageCreate.js';
import { startHealthServer } from './services/healthServer.js';
import { acquireProcessLock } from './services/processLock.js';
import { shutdownVoiceSystem } from './services/voice.js';
import { setupLavalink, activateLavalink, shutdownLavalink } from './services/lavalink.js';
import { getBrandPresence } from './utils/brand.js';
import { isHttpServerEnabled, isMessageContentIntentEnabled } from './utils/runtimeConfig.js';
import { getHostingInfo, getHostingWarnings } from './utils/hosting.js';
import { getTtsProviderOrder } from './services/tts.js';

function getInteractionErrorMessage(error) {
  if ([50001, 50013].includes(error?.code) || /Missing Permissions|Missing Access/i.test(error?.message ?? '')) {
    return '❌ Harmonia is missing permissions in this channel. Please allow `Send Messages`, `Embed Links`, `Connect`, and `Speak`.';
  }

  return '❌ An error occurred executing this command!';
}

function isUnknownInteractionError(error) {
  return error?.code === 10062 || /Unknown interaction/i.test(error?.message ?? '');
}

if (!process.env.DISCORD_BOT_TOKEN) {
  console.error('Missing required environment variable: DISCORD_BOT_TOKEN');
  process.exit(1);
}

const processLock = await acquireProcessLock();
if (!processLock.success) {
  console.error(processLock.error);
  process.exit(1);
}

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildVoiceStates
];

const messageContentIntentEnabled = isMessageContentIntentEnabled();
const httpServerEnabled = isHttpServerEnabled();
if (messageContentIntentEnabled) {
  intents.push(GatewayIntentBits.MessageContent);
}

const client = new Client({ intents });
let isShuttingDown = false;

client.commands = new Collection();
for (const command of commands) {
  client.commands.set(command.data.name, command);
}

client.once('clientReady', async () => {
  try {
    await activateLavalink(client.user);
  } catch (error) {
    console.error('Lavalink activation error:', error);
  }
  const hosting = getHostingInfo();
  client.user.setPresence({
    activities: getBrandPresence().activities.map((activity) => ({
      ...activity,
      type: ActivityType.Listening
    })),
    status: getBrandPresence().status
  });
  console.log(`🤖 Bot logged in as ${client.user.tag}`);
  console.log(`ℹ️ Ready on ${client.guilds.cache.size} guild(s) with ws ping ${client.ws.ping}ms.`);
  console.log(
    `ℹ️ Runtime: platform=${hosting.platform} dyno=${hosting.herokuDyno ?? 'n/a'} http=${httpServerEnabled ? 'on' : 'off'} tts=${getTtsProviderOrder().join(' -> ')}`
  );
  if (!messageContentIntentEnabled) {
    console.log('ℹ️ Auto-TTS is disabled. Set ENABLE_MESSAGE_CONTENT_INTENT=true and enable the Message Content intent in the Discord Developer Portal to use /autotts.');
  }
  if (!httpServerEnabled) {
    console.log('ℹ️ HTTP server is disabled for this process.');
  }

  for (const warning of getHostingWarnings()) {
    console.log(`ℹ️ ${warning}`);
  }
});

client.on('shardDisconnect', (event, shardId) => {
  console.warn(`Gateway disconnected on shard ${shardId} with code ${event.code}.`);
});

client.on('shardResume', (shardId, replayedEvents) => {
  console.log(`Gateway resumed on shard ${shardId} after replaying ${replayedEvents} event(s).`);
});

client.on('shardError', (error, shardId) => {
  console.error(`Gateway error on shard ${shardId}:`, error);
});

client.on('interactionCreate', async (interaction) => {
  try {
    const interactionLabel = interaction.isChatInputCommand()
      ? `/${interaction.commandName}`
      : interaction.isAutocomplete()
        ? `autocomplete:${interaction.commandName}`
        : interaction.customId ?? interaction.type;
    console.log(
      `Interaction received: ${interactionLabel} guild=${interaction.guildId ?? 'dm'} user=${interaction.user?.id ?? 'unknown'}`
    );

    if (interaction.isStringSelectMenu() || interaction.isButton()) {
      const handledSpeakButton = await handleSpeakAnnouncementButton(interaction);
      if (handledSpeakButton) {
        return;
      }

      const handledMusicControl = await handleMusicControls(interaction);
      if (handledMusicControl) {
        return;
      }

      await handleLanguageSelect(interaction);
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command?.autocomplete) return;

      await command.autocomplete(interaction);
      return;
    }

    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) return;

      await command.execute(interaction);
    }
  } catch (error) {
    console.error('Interaction error:', error);

    if (interaction.isAutocomplete()) {
      if (isUnknownInteractionError(error)) {
        return;
      }

      try {
        await interaction.respond([]);
      } catch {
        // Ignore autocomplete acknowledgement failures.
      }
      return;
    }

    const errorMessage = getInteractionErrorMessage(error);

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: errorMessage,
        flags: 64
      }).catch(() => {});
      return;
    }

    await interaction.reply({
      content: errorMessage,
      flags: 64
    }).catch(() => {});
  }
});

if (messageContentIntentEnabled) {
  client.on('messageCreate', async (message) => {
    try {
      await handleMessageCreate(message);
    } catch (error) {
      console.error('Message handler error:', error);
    }
  });
}

const healthServer = httpServerEnabled ? startHealthServer({ client }) : null;

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Shutting down after ${signal}...`);

  try {
    await shutdownLavalink();
  } catch (error) {
    console.error('Lavalink shutdown error:', error);
  }

  try {
    shutdownVoiceSystem();
  } catch (error) {
    console.error('Voice shutdown error:', error);
  }

  if (healthServer) {
    await new Promise((resolve) => {
      healthServer.close(() => resolve());
    }).catch(() => {});
  }

  await client.destroy();
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    shutdown(signal)
      .then(() => process.exit(0))
      .catch((error) => {
        console.error('Shutdown error:', error);
        process.exit(1);
      });
  });
}

await client.login(process.env.DISCORD_BOT_TOKEN);

try {
  setupLavalink(client);
} catch (error) {
  console.error('Lavalink setup error:', error);
}
