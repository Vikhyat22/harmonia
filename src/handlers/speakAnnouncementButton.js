import { createBrandEmbed } from '../utils/brand.js';
import { getSpeakRevealRecord } from '../services/speakRevealStore.js';
import { parseSpeakRevealCustomId } from '../utils/speakAnnouncements.js';

const MAX_REVEAL_LENGTH = 3800;

function buildRevealDescription(text) {
  if (text.length <= MAX_REVEAL_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_REVEAL_LENGTH - 3)}...`;
}

export async function handleSpeakAnnouncementButton(interaction) {
  if (!interaction.isButton()) {
    return false;
  }

  const action = parseSpeakRevealCustomId(interaction.customId);
  if (!action) {
    return false;
  }

  const record = getSpeakRevealRecord(action.revealId);
  if (!record) {
    await interaction.reply({
      content: '❌ This speech reveal has expired. Ask them to run `/speak` again if needed.',
      flags: 64
    });
    return true;
  }

  const embed = createBrandEmbed({
    title: 'Harmonia Message Text',
    description: buildRevealDescription(record.text),
    tone: 'support'
  }).addFields(
    {
      name: 'Speaker',
      value: `<@${record.requesterId}>`,
      inline: true
    },
    {
      name: 'Language',
      value: record.languageName,
      inline: true
    }
  );

  await interaction.reply({
    embeds: [embed],
    flags: 64
  });
  return true;
}
