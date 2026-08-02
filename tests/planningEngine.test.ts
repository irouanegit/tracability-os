import assert from "node:assert/strict";
import test from "node:test";
import {
  countDateRangeDays,
  expandPlanningSchedule,
  findLatestDependencyOccurrence,
  isPlanningSourceStatusUsable,
  isDateOnly,
} from "../src/lib/planningEngine.ts";

test("daily schedules stay date-only and include both range boundaries", () => {
  const dates = expandPlanningSchedule({
    frequency: "daily",
    startDate: "2026-07-27",
    endDate: "2026-07-30",
  });

  assert.deepEqual(dates, ["2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30"]);
  assert.ok(dates.every(isDateOnly));
  assert.equal(countDateRangeDays("2026-07-27", "2026-07-30"), 4);
});

test("weekday schedules exclude Saturday and Sunday", () => {
  const dates = expandPlanningSchedule({
    frequency: "weekdays",
    startDate: "2026-07-24",
    endDate: "2026-07-28",
  });

  assert.deepEqual(dates, ["2026-07-24", "2026-07-27", "2026-07-28"]);
});

test("specific weekday schedules use JavaScript weekday numbers", () => {
  const dates = expandPlanningSchedule({
    frequency: "specific_days",
    startDate: "2026-07-27",
    endDate: "2026-08-02",
    daysOfWeek: [1, 3, 5],
  });

  assert.deepEqual(dates, ["2026-07-27", "2026-07-29", "2026-07-31"]);
});

test("a one-time schedule creates exactly its start-date occurrence", () => {
  const dates = expandPlanningSchedule({
    frequency: "once",
    startDate: "2026-07-27",
    endDate: "2026-08-02",
  });

  assert.deepEqual(dates, ["2026-07-27"]);
});

test("specific weekday schedules reject an empty selection", () => {
  assert.throws(
    () =>
      expandPlanningSchedule({
        frequency: "specific_days",
        startDate: "2026-07-27",
        endDate: "2026-08-02",
        daysOfWeek: [],
      }),
    /does not create any occurrence/,
  );
});

test("specific weekday schedules reject invalid weekday numbers", () => {
  assert.throws(
    () =>
      expandPlanningSchedule({
        frequency: "specific_days",
        startDate: "2026-07-27",
        endDate: "2026-08-02",
        daysOfWeek: [1, 7],
      }),
    /values from 0 to 6/,
  );
});

test("planning schedules reject unsupported frequencies at runtime", () => {
  assert.throws(
    () =>
      expandPlanningSchedule({
        frequency: "monthly" as never,
        startDate: "2026-07-27",
        endDate: "2026-08-02",
      }),
    /Unsupported planning frequency/,
  );
});

test("an every-two-days semi-finished plan can serve daily parent occurrences", () => {
  const childDates = expandPlanningSchedule({
    frequency: "every_n_days",
    startDate: "2026-07-27",
    endDate: "2026-08-02",
    intervalDays: 2,
  });
  const candidates = childDates.map((plannedDate, index) => ({
    occurrenceId: `child-${index}`,
    productId: "pate-special",
    plannedDate,
  }));

  assert.equal(
    findLatestDependencyOccurrence(candidates, "pate-special", "2026-07-28")?.plannedDate,
    "2026-07-27",
  );
  assert.equal(
    findLatestDependencyOccurrence(candidates, "pate-special", "2026-07-31")?.plannedDate,
    "2026-07-31",
  );
});

test("a parent before the first child occurrence remains unresolved", () => {
  const candidate = findLatestDependencyOccurrence(
    [{ occurrenceId: "child-1", productId: "pate-special", plannedDate: "2026-07-28" }],
    "pate-special",
    "2026-07-27",
  );
  assert.equal(candidate, null);
});

test("dependency resolution ignores other products and uses the latest compatible date", () => {
  const candidate = findLatestDependencyOccurrence(
    [
      { occurrenceId: "wrong-product", productId: "pate-amande", plannedDate: "2026-07-30" },
      { occurrenceId: "older", productId: "pate-special", plannedDate: "2026-07-27" },
      { occurrenceId: "latest", productId: "pate-special", plannedDate: "2026-07-29" },
      { occurrenceId: "future", productId: "pate-special", plannedDate: "2026-07-31" },
    ],
    "pate-special",
    "2026-07-30",
  );

  assert.equal(candidate?.occurrenceId, "latest");
});

test("planning ranges are capped at 90 calendar days", () => {
  assert.throws(
    () =>
      expandPlanningSchedule({
        frequency: "daily",
        startDate: "2026-01-01",
        endDate: "2026-04-15",
      }),
    /cannot exceed 90 days/,
  );
});

test("invalid calendar dates are rejected instead of rolling into another month", () => {
  assert.throws(
    () =>
      expandPlanningSchedule({
        frequency: "daily",
        startDate: "2026-02-30",
        endDate: "2026-03-02",
      }),
    /Invalid calendar date/,
  );
});

test("only healthy or already completed plans can be used as semi-finished sources", () => {
  assert.equal(isPlanningSourceStatusUsable("waiting"), true);
  assert.equal(isPlanningSourceStatusUsable("ready"), true);
  assert.equal(isPlanningSourceStatusUsable("overdue"), true);
  assert.equal(isPlanningSourceStatusUsable("completed"), true);
  assert.equal(isPlanningSourceStatusUsable("blocked"), false);
  assert.equal(isPlanningSourceStatusUsable("recipe_changed"), false);
  assert.equal(isPlanningSourceStatusUsable("cancelled"), false);
});
