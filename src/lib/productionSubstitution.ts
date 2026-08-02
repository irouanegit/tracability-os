import type {
  AvailableLotOption,
  ProductSchemaNode,
  ProductionTraceabilityLot,
  ProductionTraceabilityNode,
  ProductionTraceabilitySnapshot,
  ProductType,
} from "./traceabilityApi";

export type InheritedProductionLotDraft = {
  lots: AvailableLotOption[];
  selectedProductId: string;
  selectedProductName: string;
  selectedLotIds: string[];
  status: "ready";
};

export function buildProductionSchemaBranchFromTraceabilitySnapshot(snapshot: ProductionTraceabilitySnapshot) {
  const childrenByParentNodeId = snapshot.components.reduce<Map<string, ProductionTraceabilityNode[]>>((groups, node) => {
    const parentNodeId = node.parentNodeId || "";
    groups.set(parentNodeId, [...(groups.get(parentNodeId) ?? []), node]);
    return groups;
  }, new Map());
  const auditActor = { id: null, name: null, email: null };
  const lotDrafts: Record<string, InheritedProductionLotDraft> = {};

  function toAvailableLot(node: ProductionTraceabilityNode, lot: ProductionTraceabilityLot): AvailableLotOption {
    return {
      id: lot.lotId,
      productId: lot.productId ?? node.productId,
      productName: lot.productName ?? node.productName,
      productType: lot.productType ?? node.productType,
      productCategory: lot.productCategory ?? null,
      lotNumber: lot.lotNumber,
      supplierLot: lot.supplierLot,
      supplierName: null,
      sourceType: lot.sourceType,
      sourceId: null,
      createdAt: lot.lotCreatedAt,
      responsibleName: null,
    };
  }

  function toSchemaNode(node: ProductionTraceabilityNode): ProductSchemaNode {
    const children = orderNodes((childrenByParentNodeId.get(node.nodeId) ?? []).map(toSchemaNode));
    const lots = node.lots.map((lot) => toAvailableLot(node, lot));
    const selectedProductId = lots[0]?.productId ?? node.productId;
    const selectedProductName = lots[0]?.productName ?? node.productName;

    lotDrafts[node.productId] = {
      lots,
      selectedProductId,
      selectedProductName,
      selectedLotIds: lots.map((lot) => lot.id),
      status: "ready",
    };

    return {
      id: node.productId,
      code: node.productId,
      name: node.productName,
      type: node.productType,
      category: lots[0]?.productCategory ?? null,
      unit: "",
      recipeStatus: node.productType === "raw" ? "not_required" : children.length > 0 ? "active" : "missing",
      componentCount: children.length,
      componentNames: children.map((child) => child.name),
      lotZone: null,
      lotCode: null,
      createdBy: auditActor,
      updatedBy: auditActor,
      schemaUpdatedBy: auditActor,
      schemaUpdatedAt: null,
      lastUpdated: lots[0]?.createdAt ?? "",
      stock: null,
      children,
    };
  }

  const rootNodes = [
    ...(childrenByParentNodeId.get(snapshot.root.productId) ?? []),
    ...(childrenByParentNodeId.get("") ?? []),
  ];
  const components = orderNodes(
    [...new Map(rootNodes.map((node) => [node.nodeId, node])).values()].map(toSchemaNode),
  );

  return { components, lotDrafts };
}

export function mergeProductionSchemaBranches(
  schemaNodes: ProductSchemaNode[],
  snapshotNodes: ProductSchemaNode[],
): ProductSchemaNode[] {
  const unusedSnapshotNodes = [...snapshotNodes];
  const mergedSchemaNodes = schemaNodes.map((schemaNode) => {
    const snapshotIndex = unusedSnapshotNodes.findIndex((snapshotNode) => snapshotNode.id === schemaNode.id);
    if (snapshotIndex < 0) return schemaNode;

    const [snapshotNode] = unusedSnapshotNodes.splice(snapshotIndex, 1);
    return {
      ...schemaNode,
      name: snapshotNode.name || schemaNode.name,
      type: snapshotNode.type,
      category: snapshotNode.category ?? schemaNode.category,
      children: mergeProductionSchemaBranches(schemaNode.children, snapshotNode.children),
    };
  });

  return orderNodes([...mergedSchemaNodes, ...unusedSnapshotNodes]);
}

function orderNodes(nodes: ProductSchemaNode[]) {
  return [...nodes].sort((left, right) => typeOrder(left.type) - typeOrder(right.type));
}

function typeOrder(type: ProductType) {
  if (type === "raw") return 0;
  if (type === "semi_finished") return 1;
  return 2;
}
