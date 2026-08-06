// Local summary history: pure list operations, unit tested. The side panel
// persists the list through lib/storage.js under the "history" key.

export const HISTORY_CAP = 200;

// Newest first, capped so storage cannot grow without bound.
export function addEntry(list, entry, cap = HISTORY_CAP) {
  return [entry, ...(list || [])].slice(0, cap);
}

// Case-insensitive substring match across title, url and summary body.
export function searchEntries(list, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return list || [];
  return (list || []).filter((entry) => {
    const body = Object.values(entry.sections || {}).join("\n");
    return `${entry.title}\n${entry.url}\n${body}`.toLowerCase().includes(q);
  });
}
