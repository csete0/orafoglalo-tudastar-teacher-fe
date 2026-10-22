import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TeacherOralExamService } from '../../services/teacher-oral-exam/teacher-oral-exam.service';

/**
 * Fülsáv a tanári tartalom fajtái között (feladatsorok, kvízek, Projektműhely-projektek, szóbeli témák).
 * A „Szóbeli” fül csak bekapcsolt szóbeli funkciónál látszik (`TeacherOralExamService.available`).
 *
 * A bal oldali menüben mindhárom saját menüpontot kap; a fülsáv azért marad, mert a
 * tartalom-oldalakon belül egy kattintással vált a rokon listák között (összecsukott
 * ikonsávnál és mobilon, a drawer megnyitása nélkül is).
 *
 * A `routerLinkActive` a feladatsor-fülön `[routerLinkActiveOptions]="{ exact: true }"`-t
 * használ: enélkül a `/feladatsorok` prefix a `/feladatsorok/kvizek` útvonalon is aktívnak
 * jelölné, tehát MINDKÉT fül egyszerre látszana kiválasztottnak.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-tartalom-fulek',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="flex gap-4 mt-4 border-b border-border-default overflow-x-auto" aria-label="Tartalom típusa">
      <a routerLink="/feladatsorok" routerLinkActive="tab-btn-active" [routerLinkActiveOptions]="{ exact: true }"
         ariaCurrentWhenActive="page" class="tab-btn">Feladatsorok</a>
      <a routerLink="/feladatsorok/kvizek" routerLinkActive="tab-btn-active" ariaCurrentWhenActive="page" class="tab-btn">Kvízek</a>
      <a routerLink="/feladatsorok/projektek" routerLinkActive="tab-btn-active" ariaCurrentWhenActive="page" class="tab-btn">Projektek</a>
      @if (oral.available()) {
        <a routerLink="/feladatsorok/szobeli" routerLinkActive="tab-btn-active" ariaCurrentWhenActive="page" class="tab-btn">Szóbeli</a>
      }
    </nav>
  `,
})
export class TartalomFulekComponent {
  readonly oral = inject(TeacherOralExamService);
}
