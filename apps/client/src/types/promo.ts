export interface Promo {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  category?: string;
  validFrom?: string;
  validUntil?: string;
}

export type PromoFilterType = 'todos' | string;
