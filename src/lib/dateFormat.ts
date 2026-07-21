export function formatFrenchDate(value: Date | string) {
  return new Intl.DateTimeFormat("fr-FR").format(toDate(value));
}

export function formatFrenchDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(toDate(value));
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}
