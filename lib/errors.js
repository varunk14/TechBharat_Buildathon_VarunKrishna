// Typed failure classification for the whole extension. Every user-facing error
// is a { code, message } object drawn from the table in PRD 7.8, produced here
// so the messages live in one place and the classification is unit tested.

export const MIN_TEXT_CHARS = 200;

const RESTRICTED_SCHEMES = ["chrome:", "edge:", "about:", "devtools:"];

const MESSAGES = {
  RESTRICTED_SCHEME:
    "Chrome blocks all extensions from reading internal browser pages. This " +
    "is a browser security rule, not a limitation of this extension.",
  WEBSTORE: "Chrome blocks extensions from running on the Web Store.",
  NOT_WEB: "This extension only works on http and https pages.",
  NO_KEY: "No API key set. Open settings to add one.",
  AUTH: "Your API key was rejected. Check it in settings.",
  RATE_LIMIT: "Rate limited by the API. Wait a few seconds and retry.",
  NETWORK: "Could not reach the API. Check your internet connection.",
  MODEL_DECLINED:
    "The page content was too fragmentary to summarize. Reason shown below.",
};

const TITLES = {
  RESTRICTED_SCHEME: "Browser page",
  WEBSTORE: "Web Store",
  NOT_WEB: "Not a web page",
  NO_TEXT: "No readable text",
  NO_KEY: "No API key",
  AUTH: "Key rejected",
  RATE_LIMIT: "Rate limited",
  NETWORK: "Connection problem",
  SERVER: "Server error",
  HTTP_ERROR: "Request failed",
  MODEL_DECLINED: "Could not summarize",
  REGION_TOO_SMALL: "Region too small",
  NO_TAB: "No page",
};

export function messageFor(code) {
  return MESSAGES[code] || "Something went wrong.";
}

export function titleFor(code) {
  return TITLES[code] || "Something went wrong";
}

// Classify a tab URL before any capture. Returns null when the page can be
// summarized, otherwise the typed reason it cannot.
export function preflight(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { code: "NOT_WEB", message: MESSAGES.NOT_WEB };
  }

  if (RESTRICTED_SCHEMES.includes(url.protocol)) {
    return { code: "RESTRICTED_SCHEME", message: MESSAGES.RESTRICTED_SCHEME };
  }
  if (url.protocol === "http:" || url.protocol === "https:") {
    const host = url.hostname;
    const isWebStore =
      host === "chromewebstore.google.com" ||
      (host === "chrome.google.com" && url.pathname.startsWith("/webstore"));
    if (isWebStore) return { code: "WEBSTORE", message: MESSAGES.WEBSTORE };
    return null;
  }
  return { code: "NOT_WEB", message: MESSAGES.NOT_WEB };
}

// Map an HTTP status from the model API to a typed error. The response body is
// consulted for the one case where the status alone is ambiguous: an invalid
// API key returns 400 (INVALID_ARGUMENT), not 401, on the Gemini API.
export function statusToError(status, detail = "") {
  if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(detail)) {
    return { code: "AUTH", message: MESSAGES.AUTH };
  }
  if (status === 401 || status === 403) {
    return { code: "AUTH", message: MESSAGES.AUTH };
  }
  if (status === 429) {
    return { code: "RATE_LIMIT", message: MESSAGES.RATE_LIMIT };
  }
  if (status >= 500) {
    return {
      code: "SERVER",
      message: `The API had a server error (${status}). Try again shortly.`,
    };
  }
  return {
    code: "HTTP_ERROR",
    message: `The API returned an unexpected status (${status}).`,
  };
}

// Reject pages with too little readable text, offering a visual fallback.
export function textError(chars, threshold = MIN_TEXT_CHARS) {
  if (chars >= threshold) return null;
  return {
    code: "NO_TEXT",
    message:
      `Only ${chars} characters of readable text found. This page is likely ` +
      "canvas or image based. Summarize it visually instead?",
  };
}
