export function splitTextIntoChunks(text, maxLength = 280) {
  const normalized = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');

  if (!normalized) {
    return [];
  }

  const sentenceMatches = normalized.match(/[^.!?]+[.!?]?/g) ?? [normalized];
  const chunks = [];
  let current = '';

  function pushCurrent() {
    if (current.trim()) {
      chunks.push(current.trim());
      current = '';
    }
  }

  for (const sentence of sentenceMatches.map((part) => part.trim()).filter(Boolean)) {
    if (sentence.length > maxLength) {
      pushCurrent();

      const words = sentence.split(/\s+/);
      let oversizedChunk = '';

      for (const word of words) {
        const candidate = oversizedChunk ? `${oversizedChunk} ${word}` : word;

        if (candidate.length <= maxLength) {
          oversizedChunk = candidate;
          continue;
        }

        if (oversizedChunk) {
          chunks.push(oversizedChunk);
        }

        if (word.length <= maxLength) {
          oversizedChunk = word;
          continue;
        }

        for (let index = 0; index < word.length; index += maxLength) {
          chunks.push(word.slice(index, index + maxLength));
        }
        oversizedChunk = '';
      }

      if (oversizedChunk) {
        chunks.push(oversizedChunk);
      }

      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxLength) {
      pushCurrent();
      current = sentence;
    } else {
      current = candidate;
    }
  }

  pushCurrent();
  return chunks;
}
