import { describe, it, expect } from "vitest";
import { preflight, statusToError, textError } from "../lib/errors.js";

describe("preflight", () => {
  it("returns RESTRICTED_SCHEME for chrome, edge, about and devtools URLs", () => {
    for (const url of [
      "chrome://settings",
      "edge://extensions",
      "about:blank",
      "devtools://devtools/bundled/inspector.html",
    ]) {
      expect(preflight(url).code).toBe("RESTRICTED_SCHEME");
    }
  });

  it("returns WEBSTORE for the Chrome Web Store origins", () => {
    expect(preflight("https://chromewebstore.google.com/detail/abc").code).toBe(
      "WEBSTORE"
    );
    expect(preflight("https://chrome.google.com/webstore/category/extensions").code).toBe(
      "WEBSTORE"
    );
  });

  it("returns NOT_WEB for file and ftp schemes", () => {
    expect(preflight("file:///Users/x/page.html").code).toBe("NOT_WEB");
    expect(preflight("ftp://example.com/file").code).toBe("NOT_WEB");
  });

  it("returns null (ok) for http and https pages", () => {
    expect(preflight("http://example.com")).toBeNull();
    expect(preflight("https://www.seangoedecke.com/x")).toBeNull();
  });
});

describe("statusToError", () => {
  it("maps 401, 403, 429 and 500 to codes", () => {
    expect(statusToError(401).code).toBe("AUTH");
    expect(statusToError(403).code).toBe("AUTH");
    expect(statusToError(429).code).toBe("RATE_LIMIT");
    expect(statusToError(500).code).toBe("SERVER");
  });

  it("maps a 400 invalid-key body to AUTH, other 400s to a generic error", () => {
    const badKey = '{"error":{"message":"API key not valid.","status":"INVALID_ARGUMENT"}}';
    expect(statusToError(400, badKey).code).toBe("AUTH");
    expect(statusToError(400, "malformed request").code).toBe("HTTP_ERROR");
  });
});

describe("textError", () => {
  it("produces NO_TEXT below the threshold and null above it", () => {
    expect(textError(50).code).toBe("NO_TEXT");
    expect(textError(50).message).toContain("50 characters");
    expect(textError(300)).toBeNull();
  });
});
