import type {
  ProductionConsumptionDetail,
  ProductionTraceabilityNode,
} from "./traceabilityApi";

export function indexConfirmedProductionLotsByNodeId(rows: ProductionConsumptionDetail[]) {
  return rows.reduce<Map<string, ProductionConsumptionDetail[]>>((groups, row) => {
    if (!row.componentNodeKey) return groups;
    groups.set(row.componentNodeKey, [...(groups.get(row.componentNodeKey) ?? []), row]);
    return groups;
  }, new Map());
}

export function exactProductionNodeLotLabel(
  node: ProductionTraceabilityNode,
  confirmedRowsByNodeId: ReadonlyMap<string, ProductionConsumptionDetail[]>,
) {
  const confirmedRows = confirmedRowsByNodeId.get(node.nodeId) ?? [];
  const confirmedLots = confirmedRows.map((row) => row.supplierLot ?? row.lotNumber);
  const snapshotLots = node.lots.map((lot) => lot.supplierLot ?? lot.lotNumber);
  return uniqueNonEmpty(confirmedLots.length > 0 ? confirmedLots : snapshotLots).join(", ");
}

export function exactProductionNodeMaterialName(
  node: ProductionTraceabilityNode,
  confirmedRowsByNodeId: ReadonlyMap<string, ProductionConsumptionDetail[]>,
) {
  const confirmedNames = (confirmedRowsByNodeId.get(node.nodeId) ?? []).map((row) => row.productName);
  return uniqueNonEmpty(confirmedNames).join(", ") || node.lots[0]?.productName || node.productName;
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
