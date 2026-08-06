// Google Gemini Flash streaming adapter. All Gemini-specific request shapes,
// header names and response parsing live here and nowhere else (D3). Satisfies
// the streamModel interface consumed through lib/providers/index.js.

// gemini-flash-lite-latest is granted on the free tier (unlike gemini-2.0-flash,
// which returns a hard limit of 0) and, being the lite Flash model, barely
// reasons at thinkingLevel low, so its first byte lands in under a second. That
// keeps the whole flow inside the 3s budget while staying free. The full
// gemini-flash-latest works too but thinks for ~3s before answering.
const MODEL = "gemini-flash-lite-latest";

// alt=sse switches the streaming endpoint from a JSON array to a line-based
// Server-Sent Events stream, which can be parsed incrementally as bytes arrive.
const ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/` +
  `${MODEL}:streamGenerateContent?alt=sse`;

// Build the request body. Kept pure and exported so its shape can be asserted
// in a unit test without a network call.
export function buildRequestBody({ systemPrompt, userText, maxTokens = 1500 }) {
  return {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      // The free-tier Flash model reasons before answering; keep that at the
      // lowest level so it spends as little as possible before the first token.
      thinkingConfig: { thinkingLevel: "low" },
    },
  };
}

// A stateful parser that turns a sequence of raw byte chunks into text deltas.
// It holds an incomplete trailing line until the newline arrives in a later
// chunk, so a JSON payload split across two network chunks still parses once.
export function createSSEParser() {
  let buffer = "";
  // { stream: true } makes the decoder hold an incomplete multi-byte sequence
  // until the rest of its bytes arrive, instead of emitting a replacement
  // character. Without it, Telugu and other multi-byte text corrupts at chunk
  // boundaries.
  const decoder = new TextDecoder();

  function extractText(payload) {
    if (payload === "[DONE]") return "";
    const json = JSON.parse(payload);
    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    return parts.map((part) => part.text ?? "").join("");
  }

  return {
    push(chunk) {
      buffer += decoder.decode(chunk, { stream: true });
      const deltas = [];
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("data:")) continue;
        const text = extractText(line.slice(5).trim());
        if (text) deltas.push(text);
      }
      return deltas;
    },
  };
}

function providerError(status) {
  if (status === 401 || status === 403) {
    return { code: "AUTH", message: "Your API key was rejected. Check it in settings." };
  }
  if (status === 429) {
    return { code: "RATE_LIMIT", message: "Rate limited by the API. Wait a few seconds and retry." };
  }
  return { code: "NETWORK", message: `The API returned an unexpected status (${status}).` };
}

// The streamModel interface: given a key, prompt and page text, yield summary
// text deltas as they stream in. Consumers iterate with `for await`.
export async function* streamModel({
  apiKey,
  systemPrompt,
  userText,
  maxTokens = 1500,
  signal,
}) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Key travels in a header rather than the URL so it does not land in
      // request logs or the browser history.
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(buildRequestBody({ systemPrompt, userText, maxTokens })),
    signal,
  });

  if (!response.ok) {
    // Surface the provider's own explanation to the console so a 429 or 4xx can
    // be diagnosed (which quota, whether the free tier is available) rather than
    // guessed at from the status code alone.
    const detail = await response.text().catch(() => "");
    console.error("Gemini API error", response.status, detail);
    throw providerError(response.status);
  }

  const reader = response.body.getReader();
  const parser = createSSEParser();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const delta of parser.push(value)) {
      yield delta;
    }
  }
}
