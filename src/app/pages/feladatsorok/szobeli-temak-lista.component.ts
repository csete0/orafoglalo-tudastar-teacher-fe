import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { take } from 'rxjs';
import {
  ORAL_MODE_LABELS,
  ORAL_TOPIC_STATUS_LABELS,
  TeacherOralAssignmentDto,
  TeacherOralProfileOptionDto,
  TeacherOralTopicListItemDto,
} from '../../models/teacher-oral-exam.model';
import { isOralExamDisabled, TeacherOralExamService } from '../../services/teacher-oral-exam/teacher-oral-exam.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { parseUtc } from '../../shared/utc-date.util';
import { OralAssignTarget, SzobeliKiadasDialogComponent } from './szobeli-kiadas-dialog.component';
import { TartalomFulekComponent } from './tartalom-fulek.component';

/**
 * Szóbeli témák (Feladatsorok → „Szóbeli” fül): a tanár saját témái (MI-vázlat anyagból → szerkesztés → jóváhagyás), a kész
 * PaTricks-szóbelik (platform-profilok) kiadása és a kiadások listája az eredményekhez.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-szobeli-temak-lista',
  standalone: true,
  imports: [DatePipe, RouterLink, IconComponent, TartalomFulekComponent, SzobeliKiadasDialogComponent],
  template: `
    <div class="max-w-2xl mx-auto px-4 py-10">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 class="page-title">Szóbeli</h1>
          <p class="text-sm text-text-muted mt-1">Szóbeli témák a saját anyagodból, kiadás gyakorlásként vagy szóbeli dolgozatként</p>
        </div>
        @if (!disabled()) {
          <a routerLink="/feladatsorok/szobeli/uj" class="btn btn-primary shrink-0" data-testid="oral-new">Új szóbeli téma anyagból</a>
        }
      </div>

      <app-tartalom-fulek />

      @if (disabled()) {
        <p class="text-sm text-text-muted mt-6" data-testid="oral-disabled">A szóbeli vizsga még nem érhető el.</p>
      } @else {
        @if (error(); as err) {
          <p class="text-danger text-sm mt-4" role="alert" data-testid="oral-error">{{ err }}</p>
        }

        <h2 class="text-sm font-semibold text-text-muted uppercase tracking-wide mt-6 mb-2">Saját témáim</h2>
        @if (loading()) {
          <div class="space-y-2"><div class="skeleton h-20"></div><div class="skeleton h-20"></div></div>
        } @else {
          <ul class="space-y-3" data-testid="oral-topics">
            @for (t of topics(); track t.id) {
              <li>
                <a [routerLink]="['/feladatsorok/szobeli', t.id]" class="card-link block group" [class]="'accent-' + (t.id % 4)">
                  <div class="accent-bar"></div>
                  <div class="p-4 flex items-center gap-3">
                    <div class="icon-tile icon-tile-secondary shrink-0"><app-icon name="academic-cap" class="w-6 h-6 block" /></div>
                    <span class="min-w-0 flex-1">
                      <span class="font-bold block truncate">{{ t.title }}</span>
                      <span class="text-text-muted text-xs">{{ t.itemCount }} tétel · {{ t.assignmentCount }} kiadás</span>
                    </span>
                    <span class="badge shrink-0" [class]="t.status === 'approved' ? 'badge-success' : 'badge-warning'">{{ statusLabels[t.status] }}</span>
                  </div>
                </a>
              </li>
            } @empty {
              @if (!error()) {
                <li class="text-sm text-text-muted py-2">Még nincs szóbeli témád. Készíts egyet a tananyagodból az „Új szóbeli téma anyagból” gombbal.</li>
              }
            }
          </ul>
        }

        @if (profiles().length) {
          <h2 class="text-sm font-semibold text-text-muted uppercase tracking-wide mt-8 mb-2">Kész PaTricks-szóbelik</h2>
          <ul class="space-y-2" data-testid="oral-profiles">
            @for (p of profiles(); track p.slug) {
              <li class="card !rounded-xl px-3 py-2 text-sm flex items-center gap-3">
                <span class="min-w-0 flex-1">
                  <span class="font-medium block truncate">{{ p.title }}</span>
                  <span class="text-xs text-text-muted">{{ p.voiceMinuteOptions.join(' / ') }} perces felelet</span>
                </span>
                <button type="button" class="btn btn-ghost !px-2 !py-1 !text-xs shrink-0" (click)="openAssign(p)">Kiadás csoportnak</button>
              </li>
            }
          </ul>
        }

        <h2 class="text-sm font-semibold text-text-muted uppercase tracking-wide mt-8 mb-2">Kiadások</h2>
        <ul class="space-y-2" data-testid="oral-assignments">
          @for (a of assignments(); track a.id) {
            <li class="card !rounded-xl px-3 py-2 text-sm flex items-center gap-3 flex-wrap">
              <span class="min-w-0 flex-1">
                <span class="font-medium block truncate">{{ a.title }}
                  <span class="badge ml-1" [class]="a.mode === 'exam' ? 'badge-warning' : 'badge-neutral'">{{ modeLabels[a.mode] }}</span>
                </span>
                <span class="text-xs text-text-muted">
                  {{ a.groupName }} · {{ a.voiceMinutes }} perc · {{ a.studentCount }} diák indította
                  @if (a.dueAt) { · határidő: {{ utc(a.dueAt) | date: 'yyyy.MM.dd. HH:mm' }} }
                </span>
              </span>
              <a [routerLink]="['/feladatsorok/szobeli/kiadas', a.id]" class="btn btn-primary !px-2 !py-1 !text-xs shrink-0">Eredmények</a>
            </li>
          } @empty {
            <li class="text-sm text-text-muted py-2">Még nem adtál ki szóbelit.</li>
          }
        </ul>
      }
    </div>

    @if (assignTarget(); as target) {
      <app-szobeli-kiadas-dialog [target]="target" (closed)="assignTarget.set(null)" (assigned)="onAssigned($event)" />
    }
  `,
})
export class SzobeliTemakListaComponent implements OnInit {
  private readonly api = inject(TeacherOralExamService);

  readonly statusLabels = ORAL_TOPIC_STATUS_LABELS;
  readonly modeLabels = ORAL_MODE_LABELS;
  readonly utc = parseUtc;

  readonly topics = signal<TeacherOralTopicListItemDto[]>([]);
  readonly profiles = signal<TeacherOralProfileOptionDto[]>([]);
  readonly assignments = signal<TeacherOralAssignmentDto[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly disabled = signal(false);
  readonly assignTarget = signal<OralAssignTarget | null>(null);

  ngOnInit(): void {
    this.api.topics().pipe(take(1)).subscribe({
      next: (topics) => {
        this.topics.set(topics);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        if (isOralExamDisabled(err)) this.disabled.set(true);
        else this.error.set('A szóbeli témák betöltése sikertelen.');
      },
    });
    // A két mellék-lista hibája nem takarja el a témákat: a szakasz üres marad.
    this.api.profiles().pipe(take(1)).subscribe({ next: (p) => this.profiles.set(p), error: () => {} });
    this.api.assignments().pipe(take(1)).subscribe({ next: (a) => this.assignments.set(a), error: () => {} });
  }

  openAssign(profile: TeacherOralProfileOptionDto): void {
    this.assignTarget.set({
      topicId: null,
      profileSlug: profile.slug,
      title: profile.title,
      voiceMinuteOptions: profile.voiceMinuteOptions,
      defaultVoiceMinutes: profile.defaultVoiceMinutes,
    });
  }

  onAssigned(assignment: TeacherOralAssignmentDto): void {
    this.assignTarget.set(null);
    this.assignments.update((list) => [assignment, ...list]);
  }
}
