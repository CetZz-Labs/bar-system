import { z } from "zod";

export type DrinkCategoryStatus = "active" | "inactive" | "deleted";

export interface DrinkCategory {
  id: string;
  barId: string;
  name: string;
  price?: number;
  status: DrinkCategoryStatus;
  createdAt: string;
}

export interface DrinkCategoryListResponse {
  categories: DrinkCategory[];
  warning?: string;
}

export const createDrinkCategorySchema = z.object({
  name: z
    .string()
    .min(1, "El nombre es requerido")
    .max(100, "Máximo 100 caracteres"),
  price: z
    .number()
    .min(0, "El precio no puede ser negativo")
    .optional()
    .catch(undefined),
});

export type CreateDrinkCategoryFormData = z.infer<typeof createDrinkCategorySchema>;

export const editDrinkCategorySchema = z.object({
  name: z
    .string()
    .min(1, "El nombre es requerido")
    .max(100, "Máximo 100 caracteres"),
  price: z
    .number()
    .min(0, "El precio no puede ser negativo")
    .optional()
    .catch(undefined),
});

export type EditDrinkCategoryFormData = z.infer<typeof editDrinkCategorySchema>;
