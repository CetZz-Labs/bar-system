import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compone clases de Tailwind de forma condicional y resuelve conflictos de
 * utilidades (el ultimo gana). Es el helper canonico del design system para
 * combinar clases en primitivos y vistas — reemplaza los template literals.
 *
 *   cn("px-4 py-2", isActive && "bg-lime", className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
