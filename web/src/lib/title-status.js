export const TITLE_STATUS_LABELS = {
  clean: "Clean title",
  rebuilt: "Rebuilt title",
  "not-provided": "Not provided",
};

export function classifyTitleStatus(value) {
  const status = String(value ?? "").trim();

  if (
    !status
    || status === "—"
    || /^(not disclosed|not recorded|no info given|unavailable|unknown)\b/i.test(status)
  ) {
    return "not-provided";
  }
  if (/^clean\b/i.test(status)) return "clean";
  if (/^rebuilt\b/i.test(status)) return "rebuilt";
  return "other";
}
