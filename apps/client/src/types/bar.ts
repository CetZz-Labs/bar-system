import { z } from "zod";

export type BarStatus = "pending" | "active" | "rejected";

export interface BarAddress {
  street: string;
  number: string;
  neighborhood?: string;
  city: string;
}

export interface BarScheduleSlot {
  day: number;
  open: string;
  close: string;
}

/**
 * Puntos por asistencia otorgados por día de la semana (LB-59). 0 = ese día
 * no acredita nada. Espejo manual (sin import cruzado, ver frontend.md §3)
 * de `IAttendancePointsByDay` en apps/server/src/models/Bar.ts.
 */
export interface AttendancePointsByDay {
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  saturday: number;
  sunday: number;
}

export interface Bar {
  id: string;
  name: string;
  slug: string;
  address: BarAddress;
  phone: string;
  schedule: BarScheduleSlot[];
  description?: string;
  status: BarStatus;
  logoUrl?: string;
  coverUrl?: string;
  attendancePointsByDay: AttendancePointsByDay;
}

export interface MyBar extends Bar {
  role: "OWNER";
  registeredAt: string;
}

/** Shape returned by GET /bar/activos, used to populate bar selectors. */
export interface ActiveBar {
  id: string;
  name: string;
  slug: string;
  address: BarAddress;
  logoUrl?: string;
  coverUrl?: string;
  schedule: BarScheduleSlot[];
  description?: string;
}

export interface RegisterBarResponse {
  message: string;
  bar: {
    id: string;
    name: string;
    slug: string;
    status: BarStatus;
  };
}

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const createBarSchema = z.object({
  name: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(60, "Máximo 60 caracteres"),
  address: z.object({
    street: z.string().min(1, "La calle es requerida"),
    number: z.string().min(1, "El número es requerido"),
    neighborhood: z.string().optional().or(z.literal("")),
    city: z.string().min(1, "La ciudad es requerida"),
  }),
  phone: z.string().min(1, "El teléfono es requerido"),
  schedule: z
    .array(
      z.object({
        day: z.number().min(0, "Día inválido").max(6, "Día inválido"),
        open: z.string().regex(TIME_REGEX, "Formato inválido (HH:MM)"),
        close: z.string().regex(TIME_REGEX, "Formato inválido (HH:MM)"),
      })
    )
    .min(1, "Agregá al menos un horario"),
  description: z
    .string()
    .max(120, "Máximo 120 caracteres")
    .optional()
    .or(z.literal("")),
});

export type CreateBarFormData = z.infer<typeof createBarSchema>;

export const DAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

const attendancePointsDaySchema = z
  .number()
  .int("Debe ser un número entero")
  .min(0, "No puede ser negativo")
  .max(1000, "Máximo 1000 puntos");

export const attendancePointsByDaySchema = z.object({
  monday: attendancePointsDaySchema,
  tuesday: attendancePointsDaySchema,
  wednesday: attendancePointsDaySchema,
  thursday: attendancePointsDaySchema,
  friday: attendancePointsDaySchema,
  saturday: attendancePointsDaySchema,
  sunday: attendancePointsDaySchema,
});

/** Orden de despliegue pedido por LB-59: lunes a domingo (distinto del
 * índice 0=Domingo usado por `DAY_NAMES`/`schedule`, que es el del backend). */
export const ATTENDANCE_POINTS_DAYS: { key: keyof AttendancePointsByDay; label: string }[] = [
  { key: "monday", label: "Lunes" },
  { key: "tuesday", label: "Martes" },
  { key: "wednesday", label: "Miércoles" },
  { key: "thursday", label: "Jueves" },
  { key: "friday", label: "Viernes" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
];

export const editBarProfileSchema = z.object({
  name: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(60, "Máximo 60 caracteres"),
  description: z
    .string()
    .max(120, "Máximo 120 caracteres")
    .optional()
    .or(z.literal("")),
  phone: z.string().min(1, "El teléfono es requerido"),
  attendancePointsByDay: attendancePointsByDaySchema,
});

export type EditBarProfileFormData = z.infer<typeof editBarProfileSchema>;
