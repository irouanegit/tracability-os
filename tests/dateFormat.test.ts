import assert from "node:assert/strict";
import test from "node:test";
import { fastFormatDateOnly, formatFrenchDate, formatFrenchDateTime } from "../src/lib/dateFormat.ts";

test("fastFormatDateOnly correctly parses YYYY-MM-DD", () => {
  assert.equal(fastFormatDateOnly("2026-08-19"), "19/08/2026");
  assert.equal(fastFormatDateOnly("2026-01-05"), "05/01/2026");
  assert.equal(fastFormatDateOnly("2026-12-31"), "31/12/2026");
  assert.equal(fastFormatDateOnly("invalid"), null);
  assert.equal(fastFormatDateOnly("2026/08/19"), null);
});

test("formatFrenchDate handles strings, Date objects, and invalid inputs", () => {
  assert.equal(formatFrenchDate("2026-08-19"), "19/08/2026");
  assert.equal(formatFrenchDate(new Date(2026, 7, 19)), "19/08/2026");
  assert.equal(formatFrenchDate("not-a-date"), "not-a-date");
});

test("formatFrenchDateTime formats dates with 2-digit time", () => {
  const date = new Date("2026-09-02T14:30:00.000Z");
  const formatted = formatFrenchDateTime(date);
  assert.ok(formatted.includes("02/09/26") || formatted.includes("02/09/2026"));
  assert.ok(formatted.includes(":"));
});

