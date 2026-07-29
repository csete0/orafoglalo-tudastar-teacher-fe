export interface PublicCategoryDto {
  id: number;
  name: string;
  slug: string;
  description: string;

  /**
   * BE-TASKSET-LEVEL-CATEGORY-MISMATCH: a kategóriához javasolt szint azonosítója.
   * TANÁCSADÓ jelzés — a backend SEHOL nem utasít el eltérő szint/kategória párost,
   * az űrlap csak elvethető megerősítést kér. null = a kategória jogosan átfoghat
   * több szintet, ilyenkor sosem kérdezünk.
   */
  suggestedLevelId: number | null;
}
