import assert from "node:assert/strict";
import test from "node:test";
import { selectProductionConsumptionBoundary } from "../src/lib/productionConsumptionBoundary.ts";

test("only direct blueprint components are consumed by a new production", () => {
  const entries = [
    { nodeKey: "root/butter", parentNodeKey: null, name: "Beurre" },
    { nodeKey: "root/croquant", parentNodeKey: null, name: "Croquant noisette" },
    { nodeKey: "root/croquant/oil", parentNodeKey: "root/croquant", name: "Huile historique" },
    { nodeKey: "root/praline", parentNodeKey: null, name: "Praline noisette" },
    { nodeKey: "root/praline/oil", parentNodeKey: "root/praline", name: "Huile historique" },
  ];

  assert.deepEqual(
    selectProductionConsumptionBoundary(entries).map((entry) => entry.nodeKey),
    ["root/butter", "root/croquant", "root/praline"],
  );
});
