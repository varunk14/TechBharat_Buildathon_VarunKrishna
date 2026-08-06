// Provider selection. Exposes the active provider behind the streamModel
// interface so the rest of the codebase never references a provider by name
// (PRD 9.2). Swapping providers means changing only this import.

import { streamModel } from "./gemini.js";

export { streamModel };
