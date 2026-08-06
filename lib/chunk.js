// Token estimation and paragraph-boundary chunking for pages longer than what
// we want to send in a single request. Pure functions, unit tested. The side
// panel decides when to chunk and runs the map-reduce.

// Rough token count. English averages about four characters per token, so this
// slightly overestimates for space-heavy text, which is the safe direction: it
// makes chunking more conservative rather than overflowing a request.
export function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

// Split text into chunks that break only on blank-line paragraph boundaries,
// never mid-paragraph. Each new chunk is seeded with the tail of the previous
// one so a claim spanning a boundary is not lost to the reduce step.
export function chunkText(text, maxChars = 12000, overlap = 500) {
  const paragraphs = (text || "").split(/\n{2,}/);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    // Only break when the running chunk already holds something; a single
    // paragraph longer than the limit stays whole, since splitting it would
    // break the paragraph-boundary guarantee.
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      const tail = overlap > 0 ? current.slice(-overlap) : "";
      current = tail ? `${tail}\n\n${paragraph}` : paragraph;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
