import { readFileSync } from "node:fs";
export const content = JSON.parse(readFileSync(new URL("../web/data/content.json", import.meta.url), "utf8"));
// Answers that must fail in EVERY scenario.
export const GENERIC_FAILS = [
  "Thanks for flagging. I'll eat a banana by 4 pm. Which banana?",  // polite words, zero relevance
  "Okay sure.",
  "Sorry sir, I tried my best.",
];
