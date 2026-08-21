import api from "@/libs/axios";
import { throwStandardError } from "@/utils/apiError";
import type {
  DrinkCategory,
  DrinkCategoryListResponse,
  CreateDrinkCategoryFormData,
  EditDrinkCategoryFormData,
} from "@/types/drinkCategory";

export async function listDrinkCategories(barId: string) {
  try {
    const { data } = await api.get<DrinkCategoryListResponse>(
      `/bar/${barId}/categories`
    );
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function createDrinkCategory(
  barId: string,
  body: CreateDrinkCategoryFormData
) {
  try {
    const { data } = await api.post<DrinkCategory>(
      `/bar/${barId}/categories`,
      body
    );
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function updateDrinkCategory(
  barId: string,
  categoryId: string,
  body: EditDrinkCategoryFormData
) {
  try {
    const { data } = await api.put<DrinkCategory>(
      `/bar/${barId}/categories/${categoryId}`,
      body
    );
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function toggleDrinkCategoryStatus(
  barId: string,
  categoryId: string,
  status: "active" | "inactive"
) {
  try {
    const { data } = await api.patch<DrinkCategory>(
      `/bar/${barId}/categories/${categoryId}/status`,
      { status }
    );
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function deleteDrinkCategory(barId: string, categoryId: string) {
  try {
    const { data } = await api.delete<{ message: string }>(
      `/bar/${barId}/categories/${categoryId}`
    );
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}
