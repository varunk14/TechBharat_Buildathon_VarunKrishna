import { describe, it, expect } from "vitest";
import { addEntry, searchEntries } from "../lib/history.js";

function entry(i, extra = {}) {
  return {
    id: `id-${i}`,
    title: `Title ${i}`,
    url: `https://example.com/${i}`,
    timestamp: i,
    sections: { "TL;DR": `summary body ${i}` },
    ...extra,
  };
}

describe("addEntry", () => {
  it("prepends the newest entry and caps the list at the documented maximum", () => {
    let list = [];
    for (let i = 0; i < 205; i += 1) list = addEntry(list, entry(i), 200);
    expect(list).toHaveLength(200);
    expect(list[0].id).toBe("id-204");
    // The oldest entries fell off the end.
    expect(list.some((e) => e.id === "id-0")).toBe(false);
  });
});

describe("searchEntries", () => {
  const list = [
    entry(1, { title: "Transformer paper" }),
    entry(2, { url: "https://eenadu.net/news" }),
    entry(3, { sections: { "TL;DR": "about quarterly LIC profit" } }),
  ];

  it("matches against title, url and summary body", () => {
    expect(searchEntries(list, "transformer")).toHaveLength(1);
    expect(searchEntries(list, "eenadu")).toHaveLength(1);
    expect(searchEntries(list, "lic profit")).toHaveLength(1);
  });

  it("returns everything for an empty query and nothing for a miss", () => {
    expect(searchEntries(list, "")).toHaveLength(3);
    expect(searchEntries(list, "zzz-no-match")).toHaveLength(0);
  });
});
