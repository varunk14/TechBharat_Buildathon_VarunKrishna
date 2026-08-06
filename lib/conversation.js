// Builds the multi-turn message array for follow-up questions, answered against
// the already-captured page context. Pure and unit tested; the side panel holds
// the running history and streams the answers.

export const HISTORY_LIMIT = 6;

// Delimiters make the boundary between the captured page and the conversation
// explicit, so the model treats the page as data to answer from, not as
// instructions to follow.
export const CONTEXT_OPEN = "<<<CAPTURED CONTENT";
export const CONTEXT_CLOSE = "CAPTURED CONTENT>>>";

// A primed assistant turn tells the model it already holds the content, so it
// answers from it rather than asking for it.
export const PRIMED_REPLY =
  "I have read the captured content and will answer only from it.";

export function wrapContext(text) {
  return `${CONTEXT_OPEN}\n${text}\n${CONTEXT_CLOSE}`;
}

// Keep only the most recent turns, dropping the oldest, so the request stays
// bounded over a long conversation.
export function trimHistory(history, limit = HISTORY_LIMIT) {
  return history.length <= limit ? history : history.slice(history.length - limit);
}

// Assemble the turns to send: the captured content first, a primed reply, the
// recent history, and the new question last. An optional image is attached to
// the context turn for region captures.
export function buildMessages(contextText, history, question, image) {
  const contextParts = [];
  if (image) {
    contextParts.push({ inline_data: { mime_type: image.mimeType, data: image.data } });
  }
  contextParts.push({ text: wrapContext(contextText) });

  return [
    { role: "user", parts: contextParts },
    { role: "model", parts: [{ text: PRIMED_REPLY }] },
    ...trimHistory(history).map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
    { role: "user", parts: [{ text: question }] },
  ];
}
