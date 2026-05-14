const DEFAULT_LOCALE = "zh-CN";
const DEFAULT_TIME_ZONE = "Asia/Shanghai";

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: Date | string | null | undefined) {
  const date = normalizeDate(value);
  if (!date) return "-";

  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone: DEFAULT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatDate(value: Date | string | null | undefined) {
  const date = normalizeDate(value);
  if (!date) return "-";

  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone: DEFAULT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function toDateInputValue(value: Date | string | null | undefined) {
  const date = normalizeDate(value);
  if (!date) return "";

  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: DEFAULT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

export function parseDateInput(value: string | null | undefined) {
  if (!value) return null;
  const normalized = `${value}T00:00:00+08:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getTimeZoneLabel() {
  return "Asia/Shanghai";
}
