import 'dotenv/config';
import { REST, Routes } from './lib/discord.js';
import { commands } from './commands/index.js';

if (!process.env.DISCORD_BOT_TOKEN || !process.env.CLIENT_ID) {
  console.error('Missing required environment variables: DISCORD_BOT_TOKEN, CLIENT_ID');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('Deploying commands...');
    const body = commands.map((command) => command.data.toJSON());

    await rest.put(
      process.env.GUILD_ID
        ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
        : Routes.applicationCommands(process.env.CLIENT_ID),
      { body }
    );
    console.log('✅ Commands deployed successfully!');
  } catch (error) {
    console.error('❌ Failed to deploy commands:', error);
    process.exitCode = 1;
  }
})();
