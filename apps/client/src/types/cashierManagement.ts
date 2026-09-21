import { z } from "zod";

/**
 * ABM de cajeros del bar (LB-115). Espejo manual (sin import cruzado, ver
 * frontend.md §3) del `CashierDTO` de
 * apps/server/src/controllers/CashierManagementController.ts. Distinto del
 * dominio de sesión/turno de cajero en apps/client/src/types/cashier.ts
 * (login, shift, resúmenes) — acá es exclusivamente el ABM que el OWNER usa
 * para dar de alta/editar/desactivar el vínculo BarUser{role:CASHIER}.
 */
export interface CashierUser {
  id: string;
  name: string;
  lastName: string;
  email: string;
  /** Estado de la cuenta `User` en sí (pendiente de activar por el propio
   * cajero vs. ya activa) — distinto de `Cashier.isActive`, que es el
   * estado del vínculo BarUser con este bar puntual. */
  accountActive: boolean;
}

export interface Cashier {
  id: string;
  bar: string;
  role: "CASHIER";
  isActive: boolean;
  user: CashierUser;
  createdAt: string;
  updatedAt: string;
}

const NAME_MIN_LENGTH = 3;
const NAME_MAX_LENGTH = 60;

export const createCashierFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(NAME_MIN_LENGTH, `Mínimo ${NAME_MIN_LENGTH} caracteres`)
    .max(NAME_MAX_LENGTH, `Máximo ${NAME_MAX_LENGTH} caracteres`),
  lastName: z
    .string()
    .trim()
    .min(NAME_MIN_LENGTH, `Mínimo ${NAME_MIN_LENGTH} caracteres`)
    .max(NAME_MAX_LENGTH, `Máximo ${NAME_MAX_LENGTH} caracteres`),
  email: z.string().trim().email("Email inválido"),
});

export type CreateCashierFormData = z.infer<typeof createCashierFormSchema>;

export interface CreateCashierInput {
  name: string;
  lastName: string;
  email: string;
}

export interface UpdateCashierInput {
  isActive: boolean;
}
