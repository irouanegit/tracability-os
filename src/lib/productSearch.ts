export function filterByNameOrCode<T extends { code: string; name: string }>(items: T[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return items;

  return items.filter((item) => item.name.toLowerCase().includes(normalizedQuery) || item.code.toLowerCase().includes(normalizedQuery));
}
