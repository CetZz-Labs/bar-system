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
}

export interface MyBar extends Bar {
  role: "OWNER";
  registeredAt: string;
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
});

export type EditBarProfileFormData = z.infer<typeof editBarProfileSchema>;
