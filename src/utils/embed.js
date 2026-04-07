import { EmbedBuilder } from '../lib/discord.js';

export const C = { ok: 0x56c7a7, err: 0xe37d6f, muted: 0x4f545c };

export const okEmbed    = (text) => new EmbedBuilder().setColor(C.ok).setDescription(text);
export const errEmbed   = (text) => new EmbedBuilder().setColor(C.err).setDescription(text);
export const mutedEmbed = (text) => new EmbedBuilder().setColor(C.muted).setDescription(text);
