export type PlanningFrequency = "once" | "daily" | "weekdays" | "every_n_days" | "specific_days";

export type PlanningSchedule = {
  frequency: PlanningFrequency;
  startDate: string;
  endDate: string;
  intervalDays?: number;
  daysOfWeek?: number[];
};

export type PlanningOccurrence = {
  id: string;
  productId: string;
  plannedDate: string;
};

export type PlanningDependencyCandidate = {
  occurrenceId: string;
  productId: string;
  plannedDate: string;
};

export type PlanningSourceStatus = "blocked" | "waiting" | "ready" | "overdue" | "recipe_changed" | "completed" | "cancelled";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const planningFrequencies = new Set<PlanningFrequency>(["once", "daily", "weekdays", "every_n_days", "specific_days"]);

function parseDateOnly(value: string) {
  if (!datePattern.test(value)) throw new Error(`Invalid date-only value: ${value}`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return date;
}

function formatDateOnly(value: Date) {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

export function countDateRangeDays(startDate: string, endDate: string) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function expandPlanningSchedule(schedule: PlanningSchedule, maximumRangeDays = 90) {
  if (!planningFrequencies.has(schedule.frequency)) {
    throw new Error(`Unsupported planning frequency: ${schedule.frequency}`);
  }

  const start = parseDateOnly(schedule.startDate);
  const end = parseDateOnly(schedule.endDate);
  const rangeDays = countDateRangeDays(schedule.startDate, schedule.endDate);

  if (rangeDays < 1) throw new Error("The planning end date must not be before its start date.");
  if (rangeDays > maximumRangeDays) {
    throw new Error(`The planning range cannot exceed ${maximumRangeDays} days.`);
  }

  const intervalDays = Math.max(1, Math.trunc(schedule.intervalDays ?? 1));
  const selectedDays = new Set(schedule.daysOfWeek ?? []);
  if ([...selectedDays].some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error("Planning weekdays must use values from 0 to 6.");
  }
  const dates: string[] = [];

  for (let cursor = start, dayIndex = 0; cursor <= end; cursor = addDays(cursor, 1), dayIndex += 1) {
    const weekday = cursor.getUTCDay();
    const matches =
      schedule.frequency === "once"
        ? dayIndex === 0
        : schedule.frequency === "daily"
          ? true
          : schedule.frequency === "weekdays"
            ? weekday >= 1 && weekday <= 5
            : schedule.frequency === "every_n_days"
              ? dayIndex % intervalDays === 0
              : selectedDays.has(weekday);

    if (matches) dates.push(formatDateOnly(cursor));
  }

  if (dates.length === 0) throw new Error("This schedule does not create any occurrence in the selected range.");
  return dates;
}

export function findLatestDependencyOccurrence(
  candidates: PlanningDependencyCandidate[],
  productId: string,
  parentDate: string,
) {
  return candidates
    .filter((candidate) => candidate.productId === productId && candidate.plannedDate <= parentDate)
    .sort((left, right) => right.plannedDate.localeCompare(left.plannedDate))[0] ?? null;
}

export function groupOccurrencesByDate<T extends { plannedDate: string }>(occurrences: T[]) {
  return occurrences.reduce<Record<string, T[]>>((groups, occurrence) => {
    const rows = groups[occurrence.plannedDate] ?? [];
    rows.push(occurrence);
    groups[occurrence.plannedDate] = rows;
    return groups;
  }, {});
}

export function isDateOnly(value: string) {
  return datePattern.test(value);
}

export function isPlanningSourceStatusUsable(status: PlanningSourceStatus | string) {
  return !["blocked", "recipe_changed", "cancelled"].includes(status);
}
