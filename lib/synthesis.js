// Cross-tab synthesis: combine the stored summaries of up to three tabs into
// one model input for a comparative summary. Pure and unit tested.

export const MAX_SYNTHESIS_TABS = 3;

// Render one source's stored sections as compact markdown.
function sectionsToMarkdown(sections) {
  return Object.entries(sections || {})
    .map(([name, body]) => `### ${name}\n${body}`)
    .join("\n");
}

// Number each source and separate them clearly so the model can attribute
// agreements and differences to the right tab.
export function buildSynthesisInput(entries) {
  return (entries || [])
    .slice(0, MAX_SYNTHESIS_TABS)
    .map(
      (entry, index) =>
        `Source ${index + 1}: ${entry.title}\n${entry.url}\n` +
        sectionsToMarkdown(entry.sections)
    )
    .join("\n\n=====\n\n");
}
