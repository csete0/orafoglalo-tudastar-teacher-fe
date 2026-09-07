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

  /**
   * BE-TEACHERCONTENT-OFFICIAL-EXAM-CATEGORY: KÉNYSZER, nem tanácsadó (ellentétben a
   * `suggestedLevelId`-vel). false = a hivatalos érettségi feladatsorok kategóriája,
   * ide a tanár nem sorolhat be saját feladatsort — a backend el is utasítja. Az űrlap
   * ezért ki sem ajánlja, hogy a tanár ne egy hibaüzenetből tudja meg.
   */
  isTeacherSelectable: boolean;
}
