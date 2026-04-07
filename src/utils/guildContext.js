export async function resolveInteractionGuild(interaction) {
  if (interaction.guild) {
    return interaction.guild;
  }

  if (!interaction.guildId || !interaction.client?.guilds?.fetch) {
    return null;
  }

  try {
    return await interaction.client.guilds.fetch(interaction.guildId);
  } catch (error) {
    console.error('Guild lookup failed:', error);
    return null;
  }
}
