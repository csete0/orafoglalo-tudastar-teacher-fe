import { computed, Signal } from '@angular/core';
import { GroupDto } from '../../../models/group.model';
import {
  QUIZ_DIFFICULTY_LABELS,
  QUIZ_FEEDBACK_MODE_LABELS,
  QUIZ_QUESTION_TYPE_LABELS,
  QuizDifficulty,
  QuizQuestionType,
} from '../../../models/teacher-quiz.model';

function labelOptions<T extends string>(labels: Record<T, string>): { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

/** A kvíz-szerkesztő legördülőinek opciói (a címkék a modell egyetlen forrásából). */
export const QUESTION_TYPE_OPTIONS = labelOptions(QUIZ_QUESTION_TYPE_LABELS);
export const FEEDBACK_MODE_OPTIONS = labelOptions(QUIZ_FEEDBACK_MODE_LABELS);
export const DIFFICULTY_OPTIONS = labelOptions(QUIZ_DIFFICULTY_LABELS);

export function typeLabel(type: QuizQuestionType): string {
  return QUIZ_QUESTION_TYPE_LABELS[type];
}

export function difficultyLabel(difficulty: QuizDifficulty): string {
  return QUIZ_DIFFICULTY_LABELS[difficulty];
}

/**
 * UI-TT-219: a `StudentGroups.Name`-en nincs unique constraint - egy tanárnak élőben
 * ténylegesen lehet két, egyaránt aktív, azonos nevű csoportja. A "Csoport" választó és a
 * kiadás-lista korábban KIZÁRÓLAG a nevet mutatta, így a két sor megkülönböztethetetlen
 * volt, és a tanár nem tudta megmondani, melyik "Visszavonás" gomb melyik csoportot
 * érinti. Csak akkor fűzünk hozzá invite-kódot, ha a név ténylegesen duplikált - a
 * megszokott (egyedi nevű csoportok) esetben a felület változatlan marad.
 */
export function groupLabeler(groups: Signal<GroupDto[]>): (groupId: number, groupName: string) => string {
  const duplicateNameCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const g of groups()) {
      counts.set(g.name, (counts.get(g.name) ?? 0) + 1);
    }
    return counts;
  });

  return (groupId, groupName) => {
    if ((duplicateNameCounts().get(groupName) ?? 0) <= 1) return groupName;
    const full = groups().find((g) => g.id === groupId);
    return full ? `${groupName} (kód: ${full.inviteCode})` : groupName;
  };
}
