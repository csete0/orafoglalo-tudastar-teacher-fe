import { Injectable } from '@angular/core';
import { StudentTaskSetResultRowDto, TeacherTaskSetResultsDto } from '../../models/report.model';
import { TeacherQuizResultsDto, TeacherQuizStudentResultDto } from '../../models/teacher-quiz.model';

/**
 * Magyar területi beállítású Excel a pontosvesszőt várja mezőelválasztóként —
 * pontosan azért, mert a tizedeselválasztó nála a vessző. A kettő együtt jár:
 * ha ezt vesszőre cserélnéd, a százalék-oszlop tizedesei szétesnének.
 */
const SEPARATOR = ';';

/**
 * UTF-8 BOM. Enélkül az Excel ANSI-ként nyitja meg a UTF-8 CSV-t, és a magyar
 * `ő`/`ű` elromlik — ugyanaz a hibaosztály, amit az éles adatbázisban is
 * javítanunk kellett (UI-TS-61 / UI-TS-218). A tanár ezt a fájlt hetente nyitja
 * meg, úgyhogy itt nem engedhetjük vissza.
 */
const UTF8_BOM = '﻿';

/** A felülbírált cellák jelölése — enélkül az információ némán elveszne az exportban. */
const OVERRIDE_MARKER = '*';

/** Nincs adat. Sosem `0`: a "nincs értékelve" és a "0 pontot ért el" két külön állapot. */
const NO_VALUE = '–';

/**
 * A diák elkezdte, de még nem fejezte be a feladatsort. Ugyanaz a szó, amit a
 * mátrix is kiír (`feladatsor-eredmenyek.component.ts`, UI-TT-49 badge), hogy a
 * képernyő és az export ne mondjon mást ugyanarról a diákról.
 */
const IN_PROGRESS = 'folyamatban';

@Injectable({ providedIn: 'root' })
export class ResultsCsvExportService {
  /** Letölti az eredmény-mátrixot CSV-ként. */
  exportTaskSetResults(results: TeacherTaskSetResultsDto): void {
    const csv = this.buildCsv(results);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    this.triggerDownload(blob, this.buildFileName(results.title));
  }

  /**
   * UI-UX-T5: a kvíz-eredmények exportja - ugyanaz a naplózási munkafolyamat, mint a
   * feladatsoroké (azonos elválasztó/BOM/fájlnév-konvenció). A `viewSuffix` az
   * aktuálisan szűrt nézetet nevezi meg a fájlnévben (mind / elo / onallo / játék),
   * hogy két export ne legyen összetéveszthető.
   */
  exportQuizResults(results: TeacherQuizResultsDto, viewSuffix: string): void {
    const header = [
      'Diák', 'Csoport', 'Kitöltések', 'Ebből élő', 'Legjobb eredmény', 'Százalék',
      'Legjobb mód', 'Legjobb élő pontszám', 'Utolsó kitöltés', 'Késett',
    ];

    const rows = results.students.map((s) => this.buildQuizRow(s));
    const csv = UTF8_BOM + [header, ...rows]
      .map((cells) => cells.map((c) => this.escapeCell(c)).join(SEPARATOR))
      .join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    this.triggerDownload(blob, this.buildFileName(`${results.title}-${viewSuffix}`));
  }

  private buildQuizRow(s: TeacherQuizStudentResultDto): string[] {
    return [
      s.name,
      s.groupName,
      String(s.attemptCount),
      String(s.liveAttemptCount),
      s.bestScore != null ? `${s.bestScore} / ${s.totalQuestions}` : NO_VALUE,
      this.formatPercent(s.bestScore ?? undefined, s.totalQuestions),
      s.bestScoreMode === 'live' ? 'élő' : s.bestScoreMode === 'solo' ? 'önálló' : NO_VALUE,
      s.bestLivePoints != null ? String(s.bestLivePoints) : NO_VALUE,
      s.lastCompletedAt ? new Date(s.lastCompletedAt).toLocaleString('hu-HU') : NO_VALUE,
      s.completedLate ? 'igen' : '',
    ];
  }

  /**
   * A CSV tartalma. Külön metódus, hogy a tesztek a DOM/Blob megkerülésével
   * közvetlenül a kimenetet vizsgálhassák.
   */
  buildCsv(results: TeacherTaskSetResultsDto): string {
    const header = [
      'Diák',
      'Összesen',
      'Százalék',
      ...results.tasks.map((t) => `${t.taskOrder}. ${t.title} (max ${t.maxPoints})`),
    ];

    const rows = results.students.map((student) => this.buildRow(student, results));

    return UTF8_BOM + [header, ...rows].map((cells) => cells.map((c) => this.escapeCell(c)).join(SEPARATOR)).join('\r\n');
  }

  private buildRow(student: StudentTaskSetResultRowDto, results: TeacherTaskSetResultsDto): string[] {
    const cells: string[] = [student.name];

    if (!student.hasSession) {
      cells.push('nem kezdte el', NO_VALUE);
    } else if (!student.isCompleted) {
      // A még folyamatban lévő diák összesítője FÉLKÉSZ: a mátrix ezért ír mellé
      // "folyamatban" badge-et (UI-TT-49). A képernyőn a szám és a figyelmeztetés
      // egyszerre látszik, egy CSV-cellában viszont a szám magában marad — és ez az
      // a fájl, amiből a tanár a naplóba másol. Egy "0" vagy egy részleges "3,3%"
      // itt kész érdemjegynek látszik, ezért az összesítő helyett a státuszt írjuk ki.
      // A részeredmény NEM vész el: a feladat-oszlopok cellánként továbbra is
      // pontosan mutatják, mit ért el eddig.
      cells.push(IN_PROGRESS, NO_VALUE);
    } else {
      const earned = student.totalEarnedPoints;
      const max = student.totalMaxPoints;
      cells.push(`${earned ?? NO_VALUE} / ${max ?? NO_VALUE}`);
      cells.push(this.formatPercent(earned, max));
    }

    // A feladat-oszlopok sorrendje a fejléccel egyezik: a fejléc a `results.tasks`
    // sorrendjét követi, ezért itt is taskId szerint keresünk, nem a cella-tömb
    // pozíciója szerint — így egy eltérő sorrendű `taskResults` sem csúsztatja el
    // az oszlopokat.
    for (const task of results.tasks) {
      const cell = student.taskResults.find((c) => c.taskId === task.taskId);
      if (!cell || cell.attemptId == null) {
        cells.push(NO_VALUE);
        continue;
      }
      const earned = cell.earnedPoints ?? NO_VALUE;
      const max = cell.maxPoints ?? NO_VALUE;
      cells.push(`${earned}/${max}${cell.isOverridden ? OVERRIDE_MARKER : ''}`);
    }

    return cells;
  }

  /** Magyar tizedesvessző, hogy az Excel valódi számként olvassa. */
  private formatPercent(earned: number | undefined, max: number | undefined): string {
    if (earned == null || max == null || max === 0) return NO_VALUE;
    return (Math.round((earned / max) * 1000) / 10).toString().replace('.', ',');
  }

  /**
   * CSV-escape + képlet-injekció elleni védelem.
   *
   * A diáknevek felhasználó által megadott szövegek. Egy `=`, `+`, `-` vagy `@`
   * karakterrel kezdődő cella az Excelben KÉPLETKÉNT fut le — a TANÁR gépén, az ő
   * jogosultságával. Ezért az ilyen értékeket aposztróffal előzzük meg, ami az
   * Excelben "ez szöveg" jelentésű. A tab/CR kezdet ugyanezt a célt szolgálja
   * (egyes Excel-verziók ezeken keresztül is képletet nyitnak).
   */
  private escapeCell(value: string): string {
    let cell = value;

    if (/^[=+\-@\t\r]/.test(cell)) {
      cell = `'${cell}`;
    }

    if (cell.includes(SEPARATOR) || cell.includes('"') || cell.includes('\n') || cell.includes('\r')) {
      cell = `"${cell.replace(/"/g, '""')}"`;
    }

    return cell;
  }

  private buildFileName(title: string): string {
    // Ugyanaz az engedélyezőlista-regex, mint a diák-app exam-export.service.ts-ében:
    // a feladatsor címe szabad szöveg, és a fájlnévbe kerülő "/" vagy ".." útvonal-
    // navigációként értelmeződhet.
    const safeTitle = title.replace(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ_\- ]/g, '').trim() || 'feladatsor';
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    return `${safeTitle}_eredmenyek_${stamp}.csv`;
  }

  private triggerDownload(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    // A diák-app helperje közvetlenül a click() után revokeol. Kis fájlnál működik,
    // de egy nagy osztály exportjánál a böngésző még olvashatja az URL-t, amikor az
    // már érvénytelen — ezért a következő eseményciklusra halasztjuk.
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
