const frenchDateFormatter = new Intl.DateTimeFormat("fr-FR");
const frenchDateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function fastFormatDateOnly(value: string): string | null {
  if (value.length === 10 && value.charCodeAt(4) === 45 && value.charCodeAt(7) === 45) {
    const y0 = value.charCodeAt(0);
    const y1 = value.charCodeAt(1);
    const y2 = value.charCodeAt(2);
    const y3 = value.charCodeAt(3);
    const m0 = value.charCodeAt(5);
    const m1 = value.charCodeAt(6);
    const d0 = value.charCodeAt(8);
    const d1 = value.charCodeAt(9);
    if (
      y0 >= 48 && y0 <= 57 && y1 >= 48 && y1 <= 57 && y2 >= 48 && y2 <= 57 && y3 >= 48 && y3 <= 57 &&
      m0 >= 48 && m0 <= 57 && m1 >= 48 && m1 <= 57 &&
      d0 >= 48 && d0 <= 57 && d1 >= 48 && d1 <= 57
    ) {
      return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
    }
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  }
  return null;
}

export function formatFrenchDate(value: Date | string): string {
  if (typeof value === "string") {
    const fast = fastFormatDateOnly(value);
    if (fast) return fast;
  }

  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }
  return frenchDateFormatter.format(date);
}

export function formatFrenchDateTime(value: Date | string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }
  return frenchDateTimeFormatter.format(date);
}

export function fastFormatTime(value: Date | string | null | undefined): string {
  if (!value) return "--:--";
  if (typeof value === "string") {
    if (value.length >= 16 && value.charCodeAt(10) === 84 /* 'T' */) {
      const h0 = value.charCodeAt(11);
      const h1 = value.charCodeAt(12);
      const m0 = value.charCodeAt(14);
      const m1 = value.charCodeAt(15);
      if (
        h0 >= 48 && h0 <= 57 && h1 >= 48 && h1 <= 57 &&
        value.charCodeAt(13) === 58 /* ':' */ &&
        m0 >= 48 && m0 <= 57 && m1 >= 48 && m1 <= 57
      ) {
        return value.slice(11, 16);
      }
    }
    if (value.length >= 5 && value.charCodeAt(2) === 58 /* ':' */) {
      const h0 = value.charCodeAt(0);
      const h1 = value.charCodeAt(1);
      const m0 = value.charCodeAt(3);
      const m1 = value.charCodeAt(4);
      if (
        h0 >= 48 && h0 <= 57 && h1 >= 48 && h1 <= 57 &&
        m0 >= 48 && m0 <= 57 && m1 >= 48 && m1 <= 57
      ) {
        return value.slice(0, 5);
      }
    }
  }

  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }
  return frenchDateTimeFormatter.format(date).slice(-5);
}

export function fastExtractDateKey(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length >= 10 && value.charCodeAt(4) === 45 && value.charCodeAt(7) === 45) {
    const y0 = value.charCodeAt(0);
    const y1 = value.charCodeAt(1);
    const y2 = value.charCodeAt(2);
    const y3 = value.charCodeAt(3);
    const m0 = value.charCodeAt(5);
    const m1 = value.charCodeAt(6);
    const d0 = value.charCodeAt(8);
    const d1 = value.charCodeAt(9);
    if (
      y0 >= 48 && y0 <= 57 && y1 >= 48 && y1 <= 57 && y2 >= 48 && y2 <= 57 && y3 >= 48 && y3 <= 57 &&
      m0 >= 48 && m0 <= 57 && m1 >= 48 && m1 <= 57 &&
      d0 >= 48 && d0 <= 57 && d1 >= 48 && d1 <= 57
    ) {
      return value.slice(0, 10);
    }
  }
  const dateOnly = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (dateOnly) return dateOnly[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

