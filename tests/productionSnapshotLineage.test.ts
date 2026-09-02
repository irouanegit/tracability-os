import assert from "node:assert/strict";
import test from "node:test";
import {
  embedProductionSnapshotLineage,
  findMissingProductionSnapshotLineage,
} from "../src/lib/productionSnapshotLineage.ts";
import type {
  ProductionTraceabilityNode,
  ProductionTraceabilitySnapshot,
} from "../src/lib/traceabilityApi.ts";

function snapshot(
  rootProductId: string,
  rootName: string,
  components: ProductionTraceabilityNode[],
): ProductionTraceabilitySnapshot {
  return {
    version: 1,
    root: {
      productId: rootProductId,
      productName: rootName,
      productType: "semi_finished",
      lotNumber: `${rootName}-LOT`,
    },
    components,
    diagram: { nodes: [], edges: [], viewport: null },
  };
}

test("legacy leaf semi-finished lots are detected from their exact source batch", () => {
  const parent = snapshot("finished", "Baguette", [{
    nodeId: "pate-node",
    parentNodeId: "finished",
    productId: "pate",
    productName: "PATE SPECIAL",
    productType: "semi_finished",
    depth: 1,
    lots: [{
      lotId: "pate-lot",
      lotNumber: "PBC01-PSP-290726",
      supplierLot: null,
      sourceType: "fabrication",
      sourceId: "pate-batch",
      lotCreatedAt: "2026-07-29T08:00:00Z",
    }],
  }]);

  assert.deepEqual(findMissingProductionSnapshotLineage(parent), [{
    parentNodeId: "pate-node",
    parentLotId: "pate-lot",
    sourceBatchId: "pate-batch",
  }]);
});

test("child batch components are embedded below the preserved legacy parent node", () => {
  const parentNode: ProductionTraceabilityNode = {
    nodeId: "pate-node",
    parentNodeId: "finished",
    productId: "pate",
    productName: "PATE SPECIAL",
    productType: "semi_finished",
    depth: 1,
    lots: [],
  };
  const parent = snapshot("finished", "Baguette", [parentNode]);
  const child = snapshot("pate", "PATE SPECIAL", [{
    nodeId: "flour-node",
    parentNodeId: "pate",
    productId: "flour",
    productName: "Farine",
    productType: "raw",
    depth: 1,
    lots: [],
  }]);

  const enriched = embedProductionSnapshotLineage(
    parent,
    { parentNodeId: "pate-node", parentLotId: "pate-lot", sourceBatchId: "pate-batch" },
    child,
  );

  assert.equal(enriched.components.length, 2);
  assert.deepEqual(enriched.components[1], {
    ...child.components[0],
    nodeId: "pate-node/lot:pate-lot/flour-node",
    parentNodeId: "pate-node",
    depth: 2,
  });
  assert.deepEqual(parent.components, [parentNode]);
});

test("an already expanded semi-finished branch is left unchanged", () => {
  const parent = snapshot("finished", "Baguette", [{
    nodeId: "pate-node",
    parentNodeId: "finished",
    productId: "pate",
    productName: "PATE SPECIAL",
    productType: "semi_finished",
    depth: 1,
    lots: [{
      lotId: "pate-lot",
      lotNumber: "PBC01-PSP-290726",
      supplierLot: null,
      sourceType: "fabrication",
      sourceId: "pate-batch",
      lotCreatedAt: "2026-07-29T08:00:00Z",
    }],
  }, {
    nodeId: "flour-node",
    parentNodeId: "pate-node",
    productId: "flour",
    productName: "Farine",
    productType: "raw",
    depth: 2,
    lots: [],
  }]);

  assert.deepEqual(findMissingProductionSnapshotLineage(parent), []);
});
