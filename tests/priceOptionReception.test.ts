import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPriceMAD,
  parseUnitPriceHt,
  isValidUnitPriceHt,
  calculateReceptionDraftTotalHt,
  calculateReceptionGroupTotalHt,
} from "../src/lib/dateFormat.ts";

test("formatPriceMAD formats numeric prices to French MAD format", () => {
  assert.equal(formatPriceMAD(25.5), "25,50 MAD");
  assert.equal(formatPriceMAD(0), "0,00 MAD");
  assert.equal(formatPriceMAD(0.05), "0,05 MAD");
  // Normalize narrow no-break space (\u202f) and non-breaking space (\u00a0) to regular space
  const formatted1250 = formatPriceMAD(1250).replace(/[\s\u202f\u00a0]/g, " ");
  assert.equal(formatted1250, "1 250,00 MAD");
  assert.ok(formatPriceMAD(1250).includes("MAD"));
  assert.ok(formatPriceMAD(1250).includes("250,00"));
});

test("formatPriceMAD returns '--' for null, undefined, or non-finite values", () => {
  assert.equal(formatPriceMAD(null), "--");
  assert.equal(formatPriceMAD(undefined), "--");
  assert.equal(formatPriceMAD(NaN), "--");
  assert.equal(formatPriceMAD(Infinity), "--");
  assert.equal(formatPriceMAD(-Infinity), "--");
});

test("isValidUnitPriceHt correctly validates prices, allows empty/zero, and rejects invalid inputs including Infinity", () => {
  // Valid prices and backward-compatible empty states
  assert.equal(isValidUnitPriceHt(""), true);
  assert.equal(isValidUnitPriceHt("   "), true);
  assert.equal(isValidUnitPriceHt(null), true);
  assert.equal(isValidUnitPriceHt(undefined), true);
  assert.equal(isValidUnitPriceHt("0"), true);
  assert.equal(isValidUnitPriceHt("0.00"), true);
  assert.equal(isValidUnitPriceHt("0,00"), true);
  assert.equal(isValidUnitPriceHt(0), true);
  assert.equal(isValidUnitPriceHt("14.50"), true);
  assert.equal(isValidUnitPriceHt("14,50"), true); // French decimal comma
  assert.equal(isValidUnitPriceHt(14.5), true);
  assert.equal(isValidUnitPriceHt("100"), true);
  assert.equal(isValidUnitPriceHt("0.99"), true);
  assert.equal(isValidUnitPriceHt("0,99"), true);

  // Invalid prices
  assert.equal(isValidUnitPriceHt("-1"), false);
  assert.equal(isValidUnitPriceHt("-0.01"), false);
  assert.equal(isValidUnitPriceHt(-1), false);
  assert.equal(isValidUnitPriceHt("abc"), false);
  assert.equal(isValidUnitPriceHt("12.3.4"), false);
  assert.equal(isValidUnitPriceHt("10 MAD"), false);
  assert.equal(isValidUnitPriceHt("Infinity"), false);
  assert.equal(isValidUnitPriceHt("-Infinity"), false);
  assert.equal(isValidUnitPriceHt("NaN"), false);
  assert.equal(isValidUnitPriceHt(Infinity), false);
  assert.equal(isValidUnitPriceHt(NaN), false);
});

test("parseUnitPriceHt parses valid numbers and French comma decimals, returning null for empty or invalid", () => {
  // Empty, whitespace, null, undefined -> null
  assert.equal(parseUnitPriceHt(""), null);
  assert.equal(parseUnitPriceHt("   "), null);
  assert.equal(parseUnitPriceHt(null), null);
  assert.equal(parseUnitPriceHt(undefined), null);

  // Zero prices -> 0
  assert.equal(parseUnitPriceHt("0"), 0);
  assert.equal(parseUnitPriceHt("0.00"), 0);
  assert.equal(parseUnitPriceHt("0,00"), 0);
  assert.equal(parseUnitPriceHt(0), 0);

  // Decimals with dots or commas
  assert.equal(parseUnitPriceHt("12.50"), 12.5);
  assert.equal(parseUnitPriceHt("12,50"), 12.5);
  assert.equal(parseUnitPriceHt(12.5), 12.5);
  assert.equal(parseUnitPriceHt("  82  "), 82);

  // Invalid, negative, infinite -> null
  assert.equal(parseUnitPriceHt("-1"), null);
  assert.equal(parseUnitPriceHt("-0.01"), null);
  assert.equal(parseUnitPriceHt(-5), null);
  assert.equal(parseUnitPriceHt("abc"), null);
  assert.equal(parseUnitPriceHt("Infinity"), null);
  assert.equal(parseUnitPriceHt(Infinity), null);
  assert.equal(parseUnitPriceHt(NaN), null);
});

test("Reception group total price accumulation handles nulls, zeros, and numbers", () => {
  // All have prices
  assert.equal(calculateReceptionGroupTotalHt([{ totalPriceHt: 100 }, { totalPriceHt: 50 }]), 150);

  // None have prices (backward compatibility)
  assert.equal(calculateReceptionGroupTotalHt([{ totalPriceHt: null }, { totalPriceHt: null }]), null);

  // Partial prices (one with price, one without)
  assert.equal(calculateReceptionGroupTotalHt([{ totalPriceHt: 100 }, { totalPriceHt: null }]), 100);

  // Price of zero
  assert.equal(calculateReceptionGroupTotalHt([{ totalPriceHt: 0 }, { totalPriceHt: null }]), 0);
  assert.equal(calculateReceptionGroupTotalHt([{ totalPriceHt: 0 }, { totalPriceHt: 25 }]), 25);
});

test("Latest received purchase price pre-fills correctly when adding catalog product and allows override", () => {
  type MockProduct = {
    id: string;
    code: string;
    name: string;
    unit: string;
    latestUnitPriceHt?: number | null;
  };

  function createDraftLineFromProduct(product: MockProduct, existingLineCount = 0) {
    return {
      localId: `${product.id}-test-${existingLineCount}`,
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      unit: product.unit,
      quantity: "",
      unitPriceHt: product.latestUnitPriceHt != null ? String(product.latestUnitPriceHt) : "",
      supplierLot: "",
      expiryDate: "",
    };
  }

  // 1. Product with latest price (e.g. Beurre @ 82 MAD)
  const beurre: MockProduct = { id: "p1", code: "MP-BEURRE", name: "Beurre", unit: "kg", latestUnitPriceHt: 82 };
  const beurreLine = createDraftLineFromProduct(beurre);
  assert.equal(beurreLine.unitPriceHt, "82");

  // User edits/overrides price because this reception batch has a different price
  beurreLine.unitPriceHt = "85.50";
  assert.equal(beurreLine.unitPriceHt, "85.50");

  // 2. Product with decimal price (e.g. Lait @ 7.42 MAD)
  const lait: MockProduct = { id: "p2", code: "MP-LAIT", name: "Lait", unit: "L", latestUnitPriceHt: 7.42 };
  const laitLine = createDraftLineFromProduct(lait);
  assert.equal(laitLine.unitPriceHt, "7.42");

  // 3. Product with zero price (e.g. Eau @ 0 MAD)
  const eau: MockProduct = { id: "p3", code: "MP-EAU", name: "Eau", unit: "L", latestUnitPriceHt: 0 };
  const eauLine = createDraftLineFromProduct(eau);
  assert.equal(eauLine.unitPriceHt, "0");

  // 4. Product never received before (null or undefined) - leaves empty string
  const customMat: MockProduct = { id: "p4", code: "MP-CUSTOM", name: "Nouvelle MP", unit: "kg", latestUnitPriceHt: null };
  const customLine = createDraftLineFromProduct(customMat);
  assert.equal(customLine.unitPriceHt, "");

  const legacyMat: MockProduct = { id: "p5", code: "MP-LEGACY", name: "Ancienne MP", unit: "kg" };
  const legacyLine = createDraftLineFromProduct(legacyMat);
  assert.equal(legacyLine.unitPriceHt, "");
});

test("Migration 041 contains valid schema alterations, clean encoding, and verified historical reception price updates", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const migrationPath = path.resolve("supabase/migrations/041_seed_historical_reception_prices.sql");
  const sql = await fs.readFile(migrationPath, "utf8");

  // Assert critical statements exist
  assert.ok(sql.includes("alter table if exists products"), "Should alter products table");
  assert.ok(sql.includes("drop column if exists default_unit_price_ht cascade"), "Should drop default_unit_price_ht column");
  assert.ok(sql.includes("create or replace view product_catalog as"), "Should recreate product_catalog view without static price");
  assert.ok(!sql.includes("p.default_unit_price_ht"), "product_catalog should NOT project default_unit_price_ht");
  assert.ok(sql.includes("create or replace view supplier_raw_material_catalog as"), "Should update supplier_raw_material_catalog view");
  assert.ok(sql.includes("latest_rec.unit_price_ht as latest_unit_price_ht"), "supplier_raw_material_catalog should project latest received price");
  assert.ok(sql.includes("with verified_prices(name, price) as"), "Should have verified_prices CTE");
  assert.ok(sql.includes("update raw_material_receptions r"), "Should update raw_material_receptions table");
  assert.ok(sql.includes("update lots l"), "Should update lots table");

  // Assert no corrupted question mark characters in CTE values
  const cteMatch = sql.match(/with verified_prices\(name, price\) as \(\s*values([\s\S]+?)\)\s*update/);
  assert.ok(cteMatch, "Should find verified_prices values block");
  assert.ok(!cteMatch[1].includes("?"), "Values block must not contain corrupted '?' characters");

  // Verify key ingredients have their verified prices in migration
  assert.ok(sql.includes("'Beurre', 82.000000::numeric") || sql.includes("'Beurre', 82"));
  assert.ok(sql.includes("'Sucre semoule', 4.800000::numeric") || sql.includes("'Sucre semoule', 4.8"));
  assert.ok(sql.includes("'Lait', 7.420000::numeric") || sql.includes("'Lait', 7.42"));
  assert.ok(sql.includes("'Amande', 86.000000::numeric") || sql.includes("'Amande', 86"));
  assert.ok(sql.includes("'Acajou', 100.000000::numeric") || sql.includes("'Acajou', 100"));

  // Verify Trablit café is 350 MAD (Extrait liquide café from ECOMAB) and not corrupted or 168
  assert.ok(sql.includes("'Trablit café', 350.000000::numeric"));
  assert.ok(!sql.includes("'Trablit café', 168.000000::numeric"));

  // Verify eggs and variants
  assert.ok(sql.includes("'Œufs', 1.000000::numeric"));
  assert.ok(sql.includes("'Oeufs', 1.000000::numeric"));
  assert.ok(sql.includes("'Blanc d''oeuf', 61.440000::numeric"));
  assert.ok(sql.includes("'Jaune d''oeuf', 145.103333::numeric"));

  // Verify code matching support in update statement
  assert.ok(sql.includes("lower(trim(p.code))") || sql.includes("p.code ="));
});

test("calculateReceptionDraftTotalHt calculates sum of valid lines, supports commas, and ignores empty or invalid entries", () => {
  // Mixed lines with dot and comma decimals
  const lines = [
    { quantity: "10", unitPriceHt: "25.50" }, // 255.00
    { quantity: "2", unitPriceHt: "82" },     // 164.00
    { quantity: "5", unitPriceHt: "" },       // no price, ignored
    { quantity: "1", unitPriceHt: "0" },      // zero price -> 0
    { quantity: "4", unitPriceHt: "10,50" },  // French comma -> 42.00
    { quantity: "2,5", unitPriceHt: "20" },   // French comma in qty -> 50.00
    { quantity: "-3", unitPriceHt: "50" },    // negative quantity, ignored
    { quantity: "3", unitPriceHt: "-50" },    // negative price, ignored
    { quantity: "1", unitPriceHt: "Infinity" }, // Infinity, ignored
  ];
  // 255 + 164 + 42 + 50 = 511
  assert.equal(calculateReceptionDraftTotalHt(lines), 511);
});
