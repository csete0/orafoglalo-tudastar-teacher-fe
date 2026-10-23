import { TeacherTaskDto } from '../../../models/teacher-content.model';
import { IconName } from '../../../shared/icon/icon.component';

/** A kódrészlet-szerkesztő nyelvei (backend nyelv-id-k). */
export const LANGUAGES: readonly { id: number; name: string }[] = [
  { id: 2, name: 'Python' },
  { id: 5, name: 'C#' },
  { id: 7, name: 'JavaScript' },
  { id: 8, name: 'C++' },
  { id: 10, name: 'Java' },
  { id: 6, name: 'SQL' },
  { id: 12, name: 'C' },
];
export const SQL_LANGUAGE_ID = 6;

/** A tanár által létrehozható feladattípusok (TaskTypes tábla). Az irodai típusokat a gépi
 *  javítás a beadott fájlból ellenőrzi (szempontlista gépi szabályaival), nem futtatással. */
export const TASK_TYPES: readonly { id: number; label: string; icon: IconName }[] = [
  { id: 6, label: 'Programozás', icon: 'code' },
  { id: 5, label: 'SQL', icon: 'database' },
  { id: 1, label: 'Szövegszerkesztés', icon: 'document' },
  { id: 2, label: 'Táblázatkezelés', icon: 'chart' },
  { id: 3, label: 'Prezentáció', icon: 'academic-cap' },
  { id: 4, label: 'Grafika', icon: 'eye' },
  { id: 7, label: 'Weblap', icon: 'link' },
  { id: 9, label: 'Asztali alkalmazás', icon: 'code' },
];
/** Fájlos beadású típusok (az asztali alkalmazás is: zip + képernyőképek, MI-értékelés a szempontlista szerint). */
const OFFICE_TASK_TYPE_IDS = new Set([1, 2, 3, 4, 7, 9]);
export const SQL_TASK_TYPE_ID = 5;
const PROGRAMMING_TASK_TYPE_ID = 6;

export function isOfficeType(typeId: number): boolean {
  return OFFICE_TASK_TYPE_IDS.has(typeId);
}

/** Irodai feladat: pontosan egy, irodai típus. Ennél nincs kódrészlet/referencia-kód, a
 *  javítás a tanár feltöltött megoldásfájljából készült szempontlistával történik. */
export function isOfficeTask(task: TeacherTaskDto): boolean {
  return task.taskTypeIds.length === 1 && isOfficeType(task.taskTypeIds[0]);
}

export function isSqlTask(task: TeacherTaskDto): boolean {
  return task.taskTypeIds.includes(SQL_TASK_TYPE_ID);
}

/** Programozási feladat (nem irodai, nem SQL): ehhez adható meg tárolt billentyűzetes bemenet. */
export function isCodeTask(task: TeacherTaskDto): boolean {
  return !isOfficeTask(task) && !isSqlTask(task);
}

/** Csak a Programozás típusú (nem SQL, nem irodai, nem vegyes) feladatokhoz kérhető AI-kiegészítés. */
export function isProgrammingTask(task: TeacherTaskDto): boolean {
  return task.taskTypeIds.length === 1 && task.taskTypeIds[0] === PROGRAMMING_TASK_TYPE_ID;
}
