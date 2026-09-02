import type {
  ProductionTraceabilityNode,
  ProductionTraceabilitySnapshot,
} from "./traceabilityApi";

export type MissingProductionSnapshotLineage = {
  parentNodeId: string;
  parentLotId: string;
  sourceBatchId: string;
};

export function findMissingProductionSnapshotLineage(
  snapshot: ProductionTraceabilitySnapshot,
): MissingProductionSnapshotLineage[] {
  const parentNodeIds = new Set(snapshot.components.map((node) => node.parentNodeId));

  return snapshot.components.flatMap((node) => {
    if (node.productType !== "semi_finished" || parentNodeIds.has(node.nodeId)) return [];

    const fabricationLot = node.lots.find(
      (lot) => lot.sourceType === "fabrication" && lot.sourceId,
    );
    if (!fabricationLot?.sourceId) return [];

    return [{
      parentNodeId: node.nodeId,
      parentLotId: fabricationLot.lotId,
      sourceBatchId: fabricationLot.sourceId,
    }];
  });
}

export function embedProductionSnapshotLineage(
  parentSnapshot: ProductionTraceabilitySnapshot,
  lineage: MissingProductionSnapshotLineage,
  childSnapshot: ProductionTraceabilitySnapshot,
): ProductionTraceabilitySnapshot {
  if (parentSnapshot.components.some((node) => node.parentNodeId === lineage.parentNodeId)) {
    return parentSnapshot;
  }

  const parentNode = parentSnapshot.components.find((node) => node.nodeId === lineage.parentNodeId);
  if (!parentNode) return parentSnapshot;

  const childRootParentIds = new Set([childSnapshot.root.productId, ""]);
  const prefix = `${lineage.parentNodeId}/lot:${lineage.parentLotId}/`;
  const prefixedNodeIdByOriginal = new Map(
    childSnapshot.components.map((node) => [node.nodeId, `${prefix}${node.nodeId}`]),
  );
  const inheritedComponents = childSnapshot.components.map<ProductionTraceabilityNode>((node) => ({
    ...node,
    nodeId: prefixedNodeIdByOriginal.get(node.nodeId)!,
    parentNodeId: childRootParentIds.has(node.parentNodeId)
      ? lineage.parentNodeId
      : prefixedNodeIdByOriginal.get(node.parentNodeId) ?? `${prefix}${node.parentNodeId}`,
    depth: parentNode.depth + Math.max(1, node.depth),
  }));

  if (inheritedComponents.length === 0) return parentSnapshot;

  return {
    ...parentSnapshot,
    components: [...parentSnapshot.components, ...inheritedComponents],
  };
}
