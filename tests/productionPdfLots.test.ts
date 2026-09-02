import assert from "node:assert/strict";
import test from "node:test";
import {
  exactProductionNodeLotLabel,
  exactProductionNodeMaterialName,
  indexConfirmedProductionLotsByNodeId,
} from "../src/lib/productionPdfLots.ts";
import type {
  ProductionConsumptionDetail,
  ProductionTraceabilityNode,
} from "../src/lib/traceabilityApi.ts";

const oilProductId = "00000000-0000-0000-0000-000000000001";

function consumption(
  componentNodeKey: string,
  supplierLot: string,
  lotNumber: string,
  productName = "Huile",
): ProductionConsumptionDetail {
  return {
    id: componentNodeKey + "-" + lotNumber,
    batchId: "00000000-0000-0000-0000-000000000010",
    componentNodeKey,
    parentComponentNodeKey: null,
    componentDepth: 2,
    selectedComponentProductId: oilProductId,
    expectedProductId: oilProductId,
    expectedProductCode: "HUILE",
    expectedProductName: "Huile",
    expectedProductType: "raw",
    expectedCategory: null,
    lotId: componentNodeKey + "-lot",
    lotNumber,
    productId: oilProductId,
    productCode: "HUILE",
    productName,
    productType: "raw",
    category: null,
    supplierLot,
    supplierName: "Fournisseur",
    sourceType: "reception",
    lotCreatedAt: "2026-08-01T08:00:00Z",
    linkedAt: "2026-08-20T08:00:00Z",
  };
}

function snapshotNode(nodeId: string, snapshotLot: string): ProductionTraceabilityNode {
  return {
    nodeId,
    parentNodeId: "root",
    productId: oilProductId,
    productName: "Huile snapshot",
    productType: "raw",
    depth: 2,
    lots: [{
      lotId: nodeId + "-snapshot-lot",
      lotNumber: snapshotLot,
      supplierLot: snapshotLot,
      sourceType: "reception",
      lotCreatedAt: "2026-07-01T08:00:00Z",
    }],
  };
}

test("PDF lot resolution keeps repeated products isolated by confirmed node key", () => {
  const croquantOilNode = "root/croquant/oil";
  const pralineOilNode = "root/praline/oil";
  const rows = [
    consumption(croquantOilNode, "CROQUANT-EXACT", "CROQUANT-INTERNAL"),
    consumption(pralineOilNode, "PRALINE-EXACT", "PRALINE-INTERNAL"),
  ];
  const confirmedRowsByNodeId = indexConfirmedProductionLotsByNodeId(rows);

  assert.equal(
    exactProductionNodeLotLabel(snapshotNode(croquantOilNode, "WRONG-SNAPSHOT-C"), confirmedRowsByNodeId),
    "CROQUANT-EXACT",
  );
  assert.equal(
    exactProductionNodeLotLabel(snapshotNode(pralineOilNode, "WRONG-SNAPSHOT-P"), confirmedRowsByNodeId),
    "PRALINE-EXACT",
  );
});

test("confirmed consumption rows override stale snapshot names and lots", () => {
  const nodeId = "root/praline/noisette";
  const confirmedRowsByNodeId = indexConfirmedProductionLotsByNodeId([
    consumption(nodeId, "NOISETTE-EXACT", "NOISETTE-INTERNAL", "Noisette confirmee"),
  ]);
  const node = snapshotNode(nodeId, "NOISETTE-STALE");

  assert.equal(exactProductionNodeLotLabel(node, confirmedRowsByNodeId), "NOISETTE-EXACT");
  assert.equal(exactProductionNodeMaterialName(node, confirmedRowsByNodeId), "Noisette confirmee");
});

test("embedded child snapshots remain the fallback when the parent has no direct consumption row", () => {
  const node = snapshotNode("root/substitution/child", "CHILD-SNAPSHOT-LOT");
  const confirmedRowsByNodeId = indexConfirmedProductionLotsByNodeId([]);

  assert.equal(exactProductionNodeLotLabel(node, confirmedRowsByNodeId), "CHILD-SNAPSHOT-LOT");
  assert.equal(exactProductionNodeMaterialName(node, confirmedRowsByNodeId), "Huile snapshot");
});
