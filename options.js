// Options page. Handles API key entry, read-back and deletion via lib/storage.js
// so nothing here touches chrome.storage directly. See PRD 9.3.

import { getApiKey, setApiKey, removeApiKey } from "./lib/storage.js";

const input = document.getElementById("api-key");
const status = document.getElementById("status");
const form = document.getElementById("key-form");
const toggle = document.getElementById("toggle-visibility");
const deleteButton = document.getElementById("delete");

function showStatus(message) {
  status.textContent = message;
}

// Read the stored key back on load so the user can see whether one is set and
// can edit rather than retype it.
async function load() {
  const key = await getApiKey();
  input.value = key;
  showStatus(key ? "A key is saved." : "No key saved yet.");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = input.value.trim();
  if (!value) {
    showStatus("Enter a key before saving.");
    return;
  }
  await setApiKey(value);
  showStatus("Key saved.");
});

deleteButton.addEventListener("click", async () => {
  await removeApiKey();
  input.value = "";
  showStatus("Key deleted.");
});

toggle.addEventListener("click", () => {
  const hidden = input.type === "password";
  input.type = hidden ? "text" : "password";
  toggle.textContent = hidden ? "Hide" : "Show";
});

load();
