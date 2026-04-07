export async function resolveMemberVoiceChannel(interaction) {
  const directChannel = interaction.member?.voice?.channel;
  if (directChannel) {
    return directChannel;
  }

  const userId = interaction.user?.id ?? interaction.member?.user?.id;
  const cachedChannel = interaction.guild?.voiceStates?.cache?.get(userId)?.channel;
  if (cachedChannel) {
    return cachedChannel;
  }

  const scannedChannel = interaction.guild?.channels?.cache?.find(
    (channel) => channel.isVoiceBased?.() && channel.members?.has(userId)
  );
  if (scannedChannel) {
    return scannedChannel;
  }

  if (!interaction.guild?.members?.fetch || !userId) {
    return null;
  }

  try {
    const member = await interaction.guild.members.fetch({
      user: userId,
      force: true
    });
    return member.voice?.channel ?? null;
  } catch (error) {
    console.error('Voice state lookup failed:', error);
    return null;
  }
}
