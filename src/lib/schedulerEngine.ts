export type ScheduleFrequency = "daily" | "weekdays" | "every_n_days" | "specific_days";

export type ScheduledRule = {
  id: string;
  productId: string;
  productName: string;
  productType: "semi_finished" | "finished";
  frequency: ScheduleFrequency;
  intervalDays?: number; // For "every_n_days"
  daysOfWeek?: number[]; // For "specific_days": 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  status: "active" | "paused";
  lastRunAt: string | null;
  lastRunStatus: "success" | "warning" | "error" | null;
  lastRunSummary: string | null;
  nextRunAt: string; // YYYY-MM-DD
  createdAt: string;
};

export type ExecutionLog = {
  id: string;
  ruleId: string;
  ruleName: string;
  productId: string;
  executedAt: string;
  status: "success" | "warning" | "error";
  summary: string;
  generatedLot: string | null;
  errorDetails: string | null;
};

export type AutomationNotification = {
  id: string;
  ruleId?: string;
  ruleName?: string;
  status: "success" | "warning" | "error" | "info";
  title: string;
  message: string;
  createdAt: string;
  dismissed: boolean;
};

export function computeNextRunAt(
  rule: Pick<ScheduledRule, "frequency" | "intervalDays" | "daysOfWeek" | "lastRunAt">,
  fromTime: Date = new Date(),
): string {
  const today = startOfLocalDay(fromTime);
  const candidate = new Date(today);

  if (rule.frequency === "daily") {
    return toDateKey(candidate);
  }

  if (rule.frequency === "weekdays") {
    while (candidate.getDay() === 0 || candidate.getDay() === 6) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return toDateKey(candidate);
  }

  if (rule.frequency === "every_n_days") {
    const interval = Math.max(1, rule.intervalDays ?? 2);
    if (!rule.lastRunAt) {
      return toDateKey(candidate);
    }
    const nextCandidate = startOfLocalDay(parseRuleDate(rule.lastRunAt));
    while (nextCandidate.getTime() < today.getTime()) {
      nextCandidate.setDate(nextCandidate.getDate() + interval);
    }
    return toDateKey(nextCandidate);
  }

  if (rule.frequency === "specific_days") {
    const targetDays = rule.daysOfWeek && rule.daysOfWeek.length > 0 ? rule.daysOfWeek : [1, 3, 5];
    let safetyCounter = 0;
    while (!targetDays.includes(candidate.getDay()) && safetyCounter < 14) {
      candidate.setDate(candidate.getDate() + 1);
      safetyCounter += 1;
    }
    return toDateKey(candidate);
  }

  return toDateKey(candidate);
}

export function findDueRules(rules: ScheduledRule[], now: Date = new Date()): ScheduledRule[] {
  const today = toDateKey(now);
  return rules.filter((rule) => rule.status === "active" && toRuleDateKey(rule.nextRunAt) <= today);
}

export function formatFrequencyLabel(rule: ScheduledRule): string {
  switch (rule.frequency) {
    case "daily":
      return "Chaque jour";
    case "weekdays":
      return "Lun-Ven";
    case "every_n_days":
      return `Tous les ${rule.intervalDays ?? 2} jours`;
    case "specific_days": {
      const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
      const days = (rule.daysOfWeek ?? []).map((day) => dayNames[day]).join(", ");
      return days || "Jours choisis";
    }
    default:
      return "Date planifiee";
  }
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function parseRuleDate(value: string) {
  const datePart = toRuleDateKey(value);
  const [year, month, day] = datePart.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toRuleDateKey(value: string) {
  const datePart = value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (datePart) return datePart;
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? "" : toDateKey(parsedDate);
}

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
