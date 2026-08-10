import { z } from "zod";

export const OUTING_STATUSES = ["PENDING", "ACTIVE", "CANCELLED", "COMPLETED"] as const;
export type OutingStatus = typeof OUTING_STATUSES[number];

export const OUTING_NOTE_MAX_LENGTH = 200;
export const OUTING_MAX_DAYS_AHEAD = 30;

export interface OutingBarAddress {
  street: string;
  number: string;
  neighborhood?: string;
  city: string;
}

export interface OutingBar {
  _id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  address?: OutingBarAddress;
}

export interface OutingCreator {
  _id: string;
  name: string;
  lastName: string;
  avatarUrl?: string;
}

export interface Outing {
  _id: string;
  group: string;
  bar: OutingBar;
  createdBy: OutingCreator;
  scheduledFor: string;
  note?: string;
  status: OutingStatus;
  invitees: string[];
  canceledBy?: string;
  canceledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOutingInput {
  barId: string;
  scheduledFor: string;
  note?: string;
  inviteeIds?: string[];
}

export type UpdateOutingInput = Partial<CreateOutingInput>;

/** Bounds (as JS Dates) within which a scheduledFor value must fall. */
export function getOutingDateTimeBounds(now: Date = new Date()) {
  const min = now;
  const max = new Date(now.getTime() + OUTING_MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000);
  return { min, max };
}

// Small buffer so validation doesn't reject "right now" due to the few ms/seconds
// that elapse between opening the form and submitting it.
const PAST_TOLERANCE_MS = 60 * 1000;

const scheduledForSchema = z
  .string()
  .min(1, "Seleccioná fecha y hora")
  .refine((val) => !Number.isNaN(Date.parse(val)), "Fecha inválida")
  .refine(
    (val) => new Date(val).getTime() >= Date.now() - PAST_TOLERANCE_MS,
    "La fecha debe ser hoy o en el futuro"
  )
  .refine(
    (val) =>
      new Date(val).getTime() <=
      Date.now() + OUTING_MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000,
    `La fecha no puede superar los ${OUTING_MAX_DAYS_AHEAD} días desde hoy`
  );

export const outingFormSchema = z.object({
  barId: z.string().min(1, "Seleccioná un bar"),
  scheduledFor: scheduledForSchema,
  note: z
    .string()
    .max(OUTING_NOTE_MAX_LENGTH, `Máximo ${OUTING_NOTE_MAX_LENGTH} caracteres`)
    .optional()
    .or(z.literal("")),
  inviteeIds: z.array(z.string()),
});

export type OutingFormData = z.infer<typeof outingFormSchema>;

/** Converts an ISO date string to the value expected by <input type="datetime-local">. */
export function isoToDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** Converts a <input type="datetime-local"> value (local time, no timezone) to an ISO string. */
export function datetimeLocalToIso(value: string): string {
  return new Date(value).toISOString();
}
