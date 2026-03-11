const SG_TIMEZONE = "Asia/Singapore";

const toDate = (value: string | number | Date) => {
  if (value instanceof Date) return value;

  if (typeof value === "string") {
    const raw = value.trim();
    // SQLite often returns "YYYY-MM-DD HH:MM:SS" without timezone.
    // Treat it as UTC to avoid browser local-time ambiguity.
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
      return new Date(raw.replace(" ", "T") + "Z");
    }
    // ISO without explicit timezone: assume UTC as well.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw)) {
      return new Date(raw + "Z");
    }
  }

  return new Date(value);
};

export const formatSgDateTime = (value: string | number | Date) => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-SG", {
    timeZone: SG_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

export const formatSgDate = (value: string | number | Date) => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-SG", {
    timeZone: SG_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

export const sgDateKey = (value: string | number | Date) => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SG_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
};
