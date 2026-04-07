function truncateReplyText(text, maxLength = 1900) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

export function renderEmbedAsPlainText(embed) {
  const data = typeof embed?.toJSON === 'function' ? embed.toJSON() : embed?.data ?? embed;
  if (!data) {
    return 'I could not render that response.';
  }

  const parts = [];

  if (data.author?.name) {
    parts.push(data.author.name);
  }

  if (data.title) {
    parts.push(`**${data.title}**`);
  }

  if (data.description) {
    parts.push(data.description);
  }

  for (const field of data.fields ?? []) {
    parts.push(`${field.name}\n${field.value}`);
  }

  if (data.footer?.text) {
    parts.push(data.footer.text);
  }

  return truncateReplyText(parts.filter(Boolean).join('\n\n'));
}

function canFallbackToPlainText(error) {
  return [
    50001,
    50013
  ].includes(error?.code) || /Missing Permissions|Missing Access|Invalid Form Body/i.test(error?.message ?? '');
}

export async function replyWithEmbedFallback(interaction, embed, options = {}) {
  const payload = {
    embeds: [embed],
    ...options
  };

  try {
    return await interaction.reply(payload);
  } catch (error) {
    if (!canFallbackToPlainText(error)) {
      throw error;
    }

    return interaction.reply({
      ...options,
      content: renderEmbedAsPlainText(embed)
    });
  }
}
