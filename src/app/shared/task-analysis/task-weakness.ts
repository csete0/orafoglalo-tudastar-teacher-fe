/**
 * Osztály-szintű gyengepont-elemzés a tanári eredmény-mátrixból.
 *
 * A mátrix megmutatja az adatot, de nem MONDJA MEG, hogy "a 4. feladatot 20
 * diákból 18 elrontotta" — pedig a tanár pont ezért néz rá: mit kell újratanítani.
 *
 * Tiszta függvény, szándékosan a komponensen kívül: az itteni nevezők
 * megválasztása a funkció lényege (ld. lent), és ezt DOM nélkül kell tudni
 * tesztelni. Nulla backend-munka — a `GET /teacher/task-sets/{id}/results` válasza
 * már minden diákot és feladatot tartalmaz.
 */

import {
  TeacherTaskColumnDto,
  TeacherTaskSetResultsDto,
} from '../../models/report.model';

/**
 * Ez alatt számít egy beadás "gyengének" a "X / Y diák küszöb alatt" számlálóhoz.
 * Nevesített konstans, hogy egy helyen legyen hangolható.
 */
export const WEAK_THRESHOLD_PERCENT = 50;

/** Ennyi leggyengébb feladatot mutatunk. */
export const WEAKEST_TASKS_SHOWN = 3;

export interface TaskWeakness {
  taskId: number;
  taskOrder: number;
  title: string;
  /** Az értékelt beadások átlagos százaléka. Sosem `NaN` és sosem hamis `0`. */
  averagePercent: number;
  /** Hány értékelt beadás alapján — ez a szám adja az átlag súlyát. */
  evaluatedCount: number;
  /** Ebből hány maradt a küszöb alatt. */
  belowThresholdCount: number;
}

/**
 * Egyetlen feladat átlaga, vagy `null`, ha nincs miből számolni.
 *
 * A HÁROM NEVEZŐ-SZABÁLY — ez a függvény lényege, nem a formázás:
 *
 * 1. **Be nem fejezett beadás nem nulla pont.** Csak `isCompleted` cella kerül be.
 *    Enélkül minden feladat mesterségesen gyengének látszana, és a tanár olyat
 *    tanítana újra, amit valójában senki nem rontott el — csak még nem ért oda.
 *    Ugyanaz a nevező-hiba, amit a backendben `BE-LEADERBOARD-NOSOLUTION-DENOMINATOR-GAP`
 *    néven már javítottak.
 *
 * 2. **`earnedPoints == null` kimarad, nem nulla.** Ilyenkor az AI nem értékelt
 *    (napi token-limit, vagy lejáratkor auto-beadott üres munka) — a pontszám
 *    ISMERETLEN, nem rossz. Nullaként bevéve egy technikai hiányt tanulási
 *    kudarcnak mutatnánk (EXAM-11/EXAM-16 osztály, a megjelenítési fele UI-TS-229).
 *
 * 3. **Nulla nevező → `null`, sosem `NaN` és sosem `0`.** `maxPoints == 0` vagy
 *    nulla értékelt beadás esetén nincs információ. Egy `NaN%` élesben is kiment
 *    már ebben a kódbázisban pontosan ilyen résen keresztül.
 */
export function computeTaskWeakness(
  task: TeacherTaskColumnDto,
  results: TeacherTaskSetResultsDto,
): TaskWeakness | null {
  let percentSum = 0;
  let evaluatedCount = 0;
  let belowThresholdCount = 0;

  for (const student of results.students) {
    const cell = student.taskResults.find((c) => c.taskId === task.taskId);
    if (!cell) continue;

    // (1) csak befejezett beadás
    if (!cell.isCompleted) continue;

    // (2) `!= null` és nem `!== null`: a hiányzó kulcs `undefined`-ként érkezik,
    // és `undefined !== null` igaz — a szigorú összehasonlítás átengedné, majd az
    // aritmetika `NaN`-t adna. Ez a UI-TS-4/UI-TS-50 csapda.
    if (cell.earnedPoints == null) continue;

    // (3) nevező cellánként: a `maxPoints` a cellán is hiányozhat, ilyenkor a
    // feladat oszlop-definíciójára esünk vissza; ha az is 0, nincs mit számolni.
    const maxPoints = cell.maxPoints ?? task.maxPoints;
    if (!maxPoints || maxPoints <= 0) continue;

    const percent = (cell.earnedPoints / maxPoints) * 100;
    percentSum += percent;
    evaluatedCount++;
    if (percent < WEAK_THRESHOLD_PERCENT) belowThresholdCount++;
  }

  // (3) nulla értékelt beadás → nincs információ. "0%" itt hazugság lenne.
  if (evaluatedCount === 0) return null;

  return {
    taskId: task.taskId,
    taskOrder: task.taskOrder,
    title: task.title,
    averagePercent: Math.round(percentSum / evaluatedCount),
    evaluatedCount,
    belowThresholdCount,
  };
}

/**
 * A leggyengébben teljesített feladatok, növekvő átlag szerint.
 *
 * Üres tömb = nincs egyetlen értékelt beadás sem; ilyenkor a hívónak EL KELL
 * REJTENIE a blokkot. Egy vadonatúj feladatsor beadás nélkül a szeptemberi
 * alapeset, nem határeset — ott "0%"-ot mutatni rosszabb a semminél.
 */
export function weakestTasks(
  results: TeacherTaskSetResultsDto | null,
  limit: number = WEAKEST_TASKS_SHOWN,
): TaskWeakness[] {
  if (!results) return [];

  return results.tasks
    .map((task) => computeTaskWeakness(task, results))
    .filter((w): w is TaskWeakness => w !== null)
    .sort((a, b) => a.averagePercent - b.averagePercent || a.taskOrder - b.taskOrder)
    .slice(0, limit);
}
