import { describe, it, expect } from "vitest";
import { selectMode } from "../lib/modes.js";

describe("selectMode", () => {
  it("selects the correct mode for a representative URL of each kind", () => {
    expect(
      selectMode("https://github.com/anthropics/claude-agent-sdk-python/pull/1076")
    ).toBe("github-pr");
    expect(selectMode("https://mail.google.com/mail/u/0/")).toBe("gmail");
    expect(selectMode("https://acme.atlassian.net/browse/ABC-12")).toBe("jira");
    expect(selectMode("https://arxiv.org/pdf/1706.03762")).toBe("paper");
    expect(selectMode("https://docs.python.org/3.13/library/sched.html")).toBe(
      "docs"
    );
    expect(selectMode("https://www.thehindu.com/")).toBe("news");
    expect(selectMode("https://www.eenadu.net/")).toBe("news");
  });

  it("falls back to generic for an unmatched URL", () => {
    expect(selectMode("https://www.seangoedecke.com/x")).toBe("generic");
    expect(selectMode("not a url")).toBe("generic");
  });

  it("does not treat a non-PR github page as a pull request", () => {
    expect(selectMode("https://github.com/anthropics/repo")).toBe("generic");
  });
});
