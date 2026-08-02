export function filterByNameOrCode<T extends { code: string; name: string }>(items: T[], query: string) {
  const normalizedQuery = normalizeProductSearchText(query);
  if (!normalizedQuery) return items;

  return items.filter((item) => normalizeProductSearchText(item.name).includes(normalizedQuery));
}

function normalizeProductSearchText(value: string | number | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
