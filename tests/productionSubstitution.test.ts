import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProductionSchemaBranchFromTraceabilitySnapshot,
  mergeProductionSchemaBranches,
} from "../src/lib/productionSubstitution.ts";
import type {
  ProductSchemaNode,
  ProductionTraceabilitySnapshot,
  ProductType,
} from "../src/lib/traceabilityApi.ts";

const rootProductId = "00000000-0000-0000-0000-000000000001";
const flourId = "00000000-0000-0000-0000-000000000002";
const sugarId = "00000000-0000-0000-0000-000000000003";

function schemaNode(id: string, name: string, type: ProductType, children: ProductSchemaNode[] = []): ProductSchemaNode {
  const actor = { id: null, name: null, email: null };
  return {
    id,
    code: id,
    name,
    type,
    category: null,
    unit: "",
    recipeStatus: type === "raw" ? "not_required" : "active",
    componentCount: children.length,
    componentNames: children.map((child) => child.name),
    lotZone: null,
    lotCode: null,
    createdBy: actor,
    updatedBy: actor,
    schemaUpdatedBy: actor,
    schemaUpdatedAt: null,
    lastUpdated: "",
    stock: null,
    children,
  };
}

function snapshot(components: ProductionTraceabilitySnapshot["components"]): ProductionTraceabilitySnapshot {
  return {
    version: 1,
    root: {
      productId: rootProductId,
      productName: "Biscuit selectionne",
      productType: "semi_finished",
      lotNumber: "BIS-001",
    },
    components,
    diagram: { nodes: [], edges: [], viewport: null },
  };
}

test("recognizes SQL snapshots whose root children use the produced product id as parent", () => {
  const branch = buildProductionSchemaBranchFromTraceabilitySnapshot(snapshot([
    {
      nodeId: "root/flour",
      parentNodeId: rootProductId,
      productId: flourId,
      productName: "Farine",
      productType: "raw",
      depth: 1,
      lots: [],
    },
  ]));

  assert.deepEqual(branch.components.map((component) => component.name), ["Farine"]);
});

test("keeps the selected biscuit active recipe when its historical snapshot is empty", () => {
  const activeSchema = [schemaNode(flourId, "Farine", "raw")];
  const historicalBranch = buildProductionSchemaBranchFromTraceabilitySnapshot(snapshot([]));

  const merged = mergeProductionSchemaBranches(activeSchema, historicalBranch.components);

  assert.deepEqual(merged.map((component) => component.name), ["Farine"]);
});

test("overlays inherited lots without deleting active recipe components", () => {
  const activeSchema = [
    schemaNode(flourId, "Farine", "raw"),
    schemaNode(sugarId, "Sucre", "raw"),
  ];
  const historicalBranch = buildProductionSchemaBranchFromTraceabilitySnapshot(snapshot([
    {
      nodeId: "root/flour",
      parentNodeId: rootProductId,
      productId: flourId,
      productName: "Farine",
      productType: "raw",
      depth: 1,
      lots: [{
        lotId: "00000000-0000-0000-0000-000000000004",
        lotNumber: "F-LOT-1",
        supplierLot: "FOURN-1",
        sourceType: "reception",
        lotCreatedAt: "2026-07-29T08:00:00Z",
        productId: flourId,
        productName: "Farine",
        productType: "raw",
      }],
    },
  ]));

  const merged = mergeProductionSchemaBranches(activeSchema, historicalBranch.components);

  assert.deepEqual(merged.map((component) => component.name), ["Farine", "Sucre"]);
  assert.deepEqual(historicalBranch.lotDrafts[flourId].selectedLotIds, ["00000000-0000-0000-0000-000000000004"]);
});

test("retains historical-only nodes when the selected biscuit recipe changed later", () => {
  const activeSchema = [schemaNode(flourId, "Farine", "raw")];
  const historicalBranch = buildProductionSchemaBranchFromTraceabilitySnapshot(snapshot([
    {
      nodeId: "root/sugar",
      parentNodeId: rootProductId,
      productId: sugarId,
      productName: "Sucre",
      productType: "raw",
      depth: 1,
      lots: [],
    },
  ]));

  const merged = mergeProductionSchemaBranches(activeSchema, historicalBranch.components);

  assert.deepEqual(merged.map((component) => component.name), ["Farine", "Sucre"]);
});
