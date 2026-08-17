import { z } from "zod";

/**
 * Tipos del ABM de recompensas del bar (LB-67). Espejo manual (sin import
 * cruzado, ver frontend.md §3) del modelo Mongoose en
 * apps/server/src/models/Reward.ts y del contrato de
 * apps/server/src/controllers/RewardController.ts. El canje en sí
 * (LB-68/LB-69) queda fuera de este alcance.
 */
export type RewardStatus = "active" | "inactive";

export interface Reward {
  id: string;
  bar: string;
  name: string;
  description?: string;
  pointsRequired: number;
  unlimitedStock: boolean;
  stock?: number;
  status: RewardStatus;
  createdAt: string;
  updatedAt: string;
}

const NAME_MAX_LENGTH = 60;
const DESCRIPTION_MAX_LENGTH = 200;

/**
 * Schema de validación del formulario de alta/edición, usado como resolver
 * de react-hook-form (frontend.md §2 — zod obligatorio). El refine cubre
 * la misma regla cross-field que el backend aplica en
 * RewardController (stock requerido salvo que la recompensa sea ilimitada).
 */
export const rewardFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "El nombre es requerido")
      .max(NAME_MAX_LENGTH, `Máximo ${NAME_MAX_LENGTH} caracteres`),
    description: z
      .string()
      .trim()
      .max(DESCRIPTION_MAX_LENGTH, `Máximo ${DESCRIPTION_MAX_LENGTH} caracteres`)
      .optional()
      .or(z.literal("")),
    // Sin z.coerce: los inputs numéricos usan `valueAsNumber` en el
    // `register()` de react-hook-form (BarRewardsView.tsx) para llegar acá
    // ya como `number`, evitando el desajuste de tipos input/output de
    // zodResolver que produce z.coerce (TFieldValues terminaría con
    // `unknown` en vez de `number`).
    pointsRequired: z
      .number()
      .int("Debe ser un número entero")
      .min(1, "Debe ser mayor a 0"),
    unlimitedStock: z.boolean(),
    stock: z
      .number()
      .int("Debe ser un número entero")
      .min(0, "No puede ser negativo")
      .optional(),
  })
  .refine((data) => data.unlimitedStock || data.stock !== undefined, {
    message: "Indicá el stock o marcá la recompensa como ilimitada",
    path: ["stock"],
  });

export type RewardFormData = z.infer<typeof rewardFormSchema>;

export interface CreateRewardInput {
  name: string;
  description?: string;
  pointsRequired: number;
  unlimitedStock?: boolean;
  stock?: number;
}

export interface UpdateRewardInput {
  name?: string;
  description?: string;
  pointsRequired?: number;
  unlimitedStock?: boolean;
  stock?: number;
  status?: RewardStatus;
}

/**
 * LB-72: respuesta de `GET /api/groups/:groupId/rewards`. `balance` es el
 * saldo de puntos del grupo disponible en el bar del check-in activo
 * (0 y `rewards: []` si no hay check-in activo).
 */
export interface GroupRewardsAvailability {
  rewards: Reward[];
  balance: number;
}
