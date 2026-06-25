export type SmsPurpose =
  | "transactional_acknowledgement"
  | "manual_reply"
  | "sequence_transactional"
  | "sequence_marketing"
  | "integration_test"
  | "staff_alert";

export type SmsTriggerFilter = {
  leadKind?: string;
  sourceChannel?: string;
  formId?: string;
  landingPageId?: string;
  workflowState?: string;
  requireSmsConsent?: boolean;
};

export function normalizeSmsPhone(value: string): string {
  const normalized = value.trim().replace(/[\s()-]/g, "");
  if (!/^\+\d{7,15}$/.test(normalized)) {
    throw new Error("Phone number must use international format, for example +41761234567.");
  }
  return normalized;
}

export function isSmsMarketingPurpose(purpose: SmsPurpose): boolean {
  return purpose === "sequence_marketing";
}

export function matchesSmsTriggerFilter(
  payload: Record<string, unknown>,
  filter: SmsTriggerFilter,
): boolean {
  if (filter.leadKind && payload["leadKind"] !== filter.leadKind) return false;
  if (filter.sourceChannel && payload["sourceChannel"] !== filter.sourceChannel) return false;
  if (filter.formId && payload["formId"] !== filter.formId) return false;
  if (filter.landingPageId && payload["landingPageId"] !== filter.landingPageId) return false;
  if (filter.workflowState && payload["workflowState"] !== filter.workflowState) return false;
  if (filter.requireSmsConsent && payload["smsConsent"] !== true) return false;
  return true;
}

function minutesOfDay(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours! < 0 ||
    hours! > 23 ||
    minutes! < 0 ||
    minutes! > 59
  ) {
    throw new Error(`Invalid quiet-hours value: ${value}`);
  }
  return hours! * 60 + minutes!;
}

export function localMinutesAt(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function isInsideQuietHours(input: {
  date: Date;
  timezone: string;
  start: string;
  end: string;
}): boolean {
  const current = localMinutesAt(input.date, input.timezone);
  const start = minutesOfDay(input.start);
  const end = minutesOfDay(input.end);
  if (start === end) return false;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function interpolateSmsTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = vars[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

export function classifySmsKeyword(body: string): "stop" | "start" | "help" | "message" {
  const normalized = body.trim().toUpperCase();
  if (["STOP", "UNSUBSCRIBE", "END", "QUIT", "STOPALL", "REVOKE", "OPTOUT"].includes(normalized)) {
    return "stop";
  }
  if (["START", "UNSTOP", "YES"].includes(normalized)) return "start";
  if (["HELP", "INFO"].includes(normalized)) return "help";
  return "message";
}
