import api from '@/libs/axios'
import { throwStandardError } from '@/utils/apiError'
import type { Promo, PromoFilterType } from '@/types/promo'

export async function getPromos(filter?: PromoFilterType): Promise<Promo[]> {
  try {
    const url = '/promos'
    const params = filter && filter !== 'todos' ? { category: filter } : {}
    const { data } = await api.get<Promo[]>(url, { params })
    return data
  } catch (error) {
    throwStandardError(error)
    return []
  }
}
