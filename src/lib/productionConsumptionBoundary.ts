export type ProductionConsumptionBoundaryEntry = {
  parentNodeKey: string | null;
};

export function selectProductionConsumptionBoundary<T extends ProductionConsumptionBoundaryEntry>(entries: T[]) {
  return entries.filter((entry) => entry.parentNodeKey === null);
}
