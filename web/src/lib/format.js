export const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const integer = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : shortDate.format(date);
}

export function normalizeTier(value = "") {
  const tier = value.toLowerCase();
  if (tier.includes("strong")) return "strong";
  if (tier.includes("worth")) return "worth";
  if (tier.includes("marginal")) return "marginal";
  if (tier.includes("needs")) return "needs";
  return "neutral";
}

export function scoreLabel(listing) {
  if (listing.score == null) return "—";
  return String(listing.score);
}

export function vehicleName(listing) {
  return [listing.year, listing.make, listing.model].filter(Boolean).join(" ");
}

export function formatPoints(points) {
  if (points > 0) return `+${points}`;
  return String(points);
}
