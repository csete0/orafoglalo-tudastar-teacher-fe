import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, take } from 'rxjs';
import {
  ORAL_TOPIC_QUESTIONS_PER_ITEM,
  ORAL_TOPIC_STATUS_LABELS,
  ORAL_TOPIC_VOICE_MINUTE_OPTIONS,
  OralTopicError,
  oralTopicErrors,
  TeacherOralAssignmentDto,
  TeacherOralRubricItemDto,
  TeacherOralTopicDto,
  TeacherOralTopicUpdateRequest,
} from '../../models/teacher-oral-exam.model';
import { TeacherOralExamService } from '../../services/teacher-oral-exam/teacher-oral-exam.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { ToastService } from '../../shared/toast/toast.service';
import { OralAssignTarget, SzobeliKiadasDialogComponent } from './szobeli-kiadas-dialog.component';

/** Szerkeszthető kérdés: az elvárt elemek soronként egy. */
interface EditQuestion {
  readonly text: string;
  readonly expected: string;
}

/** Szerkeszthető tétel: a kulcsszavak vesszővel elválasztva. */
interface EditItem {
  readonly slug: string | null;
  readonly title: string;
  readonly keywords: string;
  readonly questions: readonly EditQuestion[];
}

/** A szerkesztett másolat: immutábilis - minden módosítás új objektumot ad a `model` signalba. */
interface EditModel {
  readonly title: string;
  readonly voiceMinutes: ReadonlySet<number>;
  readonly defaultVoiceMinutes: number;
  readonly items: readonly EditItem[];
  readonly rubric: readonly Readonly<TeacherOralRubricItemDto>[];
}

/** A lista `index`-edik elemét cseréli `fn` eredményére (új tömb). */
function replaceAt<T>(list: readonly T[], index: number, fn: (value: T) => T): T[] {
  return list.map((value, i) => (i === index ? fn(value) : value));
}

function toModel(topic: TeacherOralTopicDto): EditModel {
  return {
    title: topic.title,
    voiceMinutes: new Set(topic.voiceMinuteOptions),
    defaultVoiceMinutes: topic.defaultVoiceMinutes,
    items: topic.items.map((item) => ({
      slug: item.slug,
      title: item.title,
      keywords: item.keywords.join(', '),
      questions: item.questions.map((q) => ({ text: q.text, expected: q.expected.join('\n') })),
    })),
    rubric: topic.rubric.map((r) => ({ ...r })),
  };
}

/** A szerkesztett modell a PUT törzseként (teljes csere; a hosszak rendezve, az üres sorok kihagyva). */
export function toUpdateRequest(model: EditModel): TeacherOralTopicUpdateRequest {
  const parts = (value: string, separator: RegExp) => value.split(separator).map((s) => s.trim()).filter(Boolean);
  return {
    title: model.title.trim(),
    voiceMinuteOptions: [...model.voiceMinutes].sort((a, b) => a - b),
    defaultVoiceMinutes: model.defaultVoiceMinutes,
    items: model.items.map((item) => ({
      slug: item.slug,
      title: item.title.trim(),
      keywords: parts(item.keywords, /,/),
      questions: item.questions.map((q) => ({ text: q.text.trim(), expected: parts(q.expected, /\n/) })),
    })),
    rubric: model.rubric.map((r) => ({ key: r.key, title: r.title.trim(), points: Number(r.points), description: r.description.trim() })),
  };
}

/**
 * Szóbeli téma szerkesztője: tételek (cím, kulcsszavak, kérdések az elvárt elemekkel), szempontlista (összeggel), választható
 * felelési hosszak; „Mentés” (a szerver hibalistája a mezők mellett), „Jóváhagyás”, „Kiadás csoportnak” (jóváhagyott témánál).
 * Ha a témából már indult szóbeli, csak olvasható.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-szobeli-tema-szerkeszto',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  standalone: true,
  imports: [FormsModule, RouterLink, LocalSpinnerComponent, SzobeliKiadasDialogComponent],
  template: `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <a routerLink="/feladatsorok/szobeli" class="text-sm text-text-muted hover:underline">← Vissza a szóbeli témákhoz</a>

      @if (loadError(); as err) {
        <p class="text-danger text-sm mt-4" role="alert" data-testid="oral-topic-load-error">{{ err }}</p>
      } @else if (!topic()) {
        <app-local-spinner />
      } @else if (model(); as m) {
        <div class="flex items-start justify-between gap-3 flex-wrap mt-3">
          <div class="min-w-0">
            <h1 class="page-title break-words">{{ topic()!.title }}</h1>
            <span class="badge mt-2" [class]="topic()!.status === 'approved' ? 'badge-success' : 'badge-warning'" data-testid="oral-topic-status">
              {{ statusLabels[topic()!.status] }}
            </span>
          </div>
          <div class="flex flex-wrap gap-2 shrink-0">
            @if (topic()!.status === 'approved') {
              <button type="button" class="btn btn-primary" [disabled]="dirty()" (click)="openAssign()" data-testid="oral-topic-assign">Kiadás csoportnak</button>
            }
            @if (!readOnly()) {
              <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="remove()" data-testid="oral-topic-delete">Törlés</button>
            }
          </div>
        </div>
        <div class="hairline"></div>

        @if (readOnly()) {
          <p class="bg-bg-element rounded-xl p-3 text-sm text-text-muted mb-4" data-testid="oral-topic-readonly">
            Ebből a témából már indult szóbeli, ezért nem szerkeszthető.
          </p>
        }

        <fieldset [disabled]="readOnly()" class="space-y-6 min-w-0">
          <label class="block text-sm">Cím
            <input class="input mt-1" maxlength="200" [ngModel]="m.title" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ title: $event })"
              data-testid="oral-topic-title" />
          </label>

          <section>
            <h2 class="font-bold mb-1">Választható felelési hosszak</h2>
            <div class="flex flex-wrap gap-x-4 gap-y-1">
              @for (min of minuteOptions; track min) {
                <label class="flex items-center gap-2 text-sm">
                  <input type="checkbox" [checked]="m.voiceMinutes.has(min)" (change)="toggleMinutes(min)" [attr.data-testid]="'oral-topic-minutes-' + min" />
                  {{ min }} perc
                </label>
              }
            </div>
            <label class="block text-sm mt-2 max-w-xs">Alapértelmezett
              <select class="input mt-1" [ngModel]="m.defaultVoiceMinutes" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ defaultVoiceMinutes: $event })"
                data-testid="oral-topic-default-minutes">
                @for (min of selectedMinutes(); track min) { <option [ngValue]="min">{{ min }} perc</option> }
              </select>
            </label>
          </section>

          <section>
            <h2 class="font-bold mb-2">Tételek ({{ m.items.length }})</h2>
            <ol class="space-y-4">
              @for (item of m.items; track $index; let i = $index) {
                <li class="card p-4 space-y-3" [attr.data-testid]="'oral-item-' + i">
                  <div class="flex items-start gap-2">
                    <label class="block text-sm flex-1 min-w-0">{{ i + 1 }}. tétel címe
                      <input class="input mt-1" [ngModel]="item.title" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchItem(i, { title: $event })" />
                    </label>
                    <button type="button" class="btn btn-ghost !px-2 !py-1 !text-xs mt-5" (click)="removeItem(i)"
                      [attr.aria-label]="(i + 1) + '. tétel törlése'">Tétel törlése</button>
                  </div>
                  <label class="block text-sm">Kulcsszavak (vesszővel elválasztva)
                    <input class="input mt-1" [ngModel]="item.keywords" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchItem(i, { keywords: $event })" />
                  </label>
                  @for (e of itemErrors(i); track $index) { <p class="text-xs text-danger" data-testid="oral-field-error">{{ e }}</p> }

                  <ol class="space-y-3">
                    @for (q of item.questions; track $index; let qi = $index) {
                      <li class="bg-bg-element rounded-xl p-3 space-y-2" [attr.data-testid]="'oral-question-' + i + '-' + qi">
                        <div class="flex items-start gap-2">
                          <label class="block text-sm flex-1 min-w-0">{{ qi + 1 }}. kérdés
                            <textarea rows="2" class="input mt-1" [ngModel]="q.text" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchQuestion(i, qi, { text: $event })"></textarea>
                          </label>
                          <button type="button" class="btn btn-ghost !px-2 !py-1 !text-xs mt-5" (click)="removeQuestion(i, qi)"
                            [attr.aria-label]="(qi + 1) + '. kérdés törlése'">Törlés</button>
                        </div>
                        <label class="block text-sm">Elvárt elemek (soronként egy)
                          <textarea rows="3" class="input mt-1 !text-sm" [ngModel]="q.expected" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchQuestion(i, qi, { expected: $event })"></textarea>
                        </label>
                        @for (e of questionErrors(i, qi); track $index) { <p class="text-xs text-danger" data-testid="oral-field-error">{{ e }}</p> }
                      </li>
                    }
                  </ol>
                  @if (item.questions.length < questionRange.max) {
                    <button type="button" class="btn btn-ghost !px-2 !py-1 !text-xs" (click)="addQuestion(i)" [attr.data-testid]="'oral-add-question-' + i">+ Új kérdés</button>
                  }
                </li>
              }
            </ol>
            <button type="button" class="btn btn-ghost mt-3" (click)="addItem()" data-testid="oral-add-item">+ Új tétel</button>
          </section>

          <section>
            <h2 class="font-bold mb-2">Szempontlista <span class="text-sm font-normal text-text-muted" data-testid="oral-rubric-sum">(összesen {{ rubricSum() }} pont)</span></h2>
            <ul class="space-y-3">
              @for (r of m.rubric; track $index; let ri = $index) {
                <li class="card p-3 space-y-2" [attr.data-testid]="'oral-rubric-' + ri">
                  <div class="grid grid-cols-[1fr_6rem_auto] gap-2 items-end">
                    <label class="block text-sm min-w-0">Szempont
                      <input class="input mt-1" [ngModel]="r.title" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchRubric(ri, { title: $event })" />
                    </label>
                    <label class="block text-sm">Pont
                      <input type="number" min="1" class="input mt-1" [ngModel]="r.points" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchRubric(ri, { points: $event })" />
                    </label>
                    <button type="button" class="btn btn-ghost !px-2 !py-1 !text-xs" (click)="removeRubric(ri)" [attr.aria-label]="r.title + ' törlése'">Törlés</button>
                  </div>
                  <label class="block text-sm">Leírás
                    <textarea rows="2" class="input mt-1 !text-sm" [ngModel]="r.description" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchRubric(ri, { description: $event })"></textarea>
                  </label>
                  @for (e of rubricErrors(ri); track $index) { <p class="text-xs text-danger" data-testid="oral-field-error">{{ e }}</p> }
                </li>
              }
            </ul>
            <button type="button" class="btn btn-ghost mt-3" (click)="addRubric()" data-testid="oral-add-rubric">+ Új szempont</button>
          </section>
        </fieldset>

        @if (error(); as err) {
          <div class="bg-danger-subtle border border-danger/40 rounded-xl p-3 text-sm text-danger mt-6" role="alert" data-testid="oral-topic-error">
            <p>{{ err }}</p>
            @if (generalErrors().length) {
              <ul class="list-disc pl-5 mt-1 space-y-0.5">
                @for (e of generalErrors(); track $index) { <li class="break-words">{{ e.path ? e.path + ': ' : '' }}{{ e.message }}</li> }
              </ul>
            }
          </div>
        }

        @if (!readOnly()) {
          <div class="flex flex-wrap justify-end items-center gap-2 mt-6 sticky bottom-0 bg-bg-base/90 py-3">
            @if (dirty()) { <span class="text-xs text-text-muted">Mentetlen módosítások</span> }
            <button type="button" class="btn" [disabled]="busy() || !dirty()" (click)="save()" data-testid="oral-topic-save">Mentés</button>
            @if (topic()!.status === 'draft') {
              <button type="button" class="btn btn-primary" [disabled]="busy() || dirty()" (click)="approve()"
                [title]="dirty() ? 'Előbb mentsd a módosításokat.' : ''" data-testid="oral-topic-approve">Jóváhagyás</button>
            }
          </div>
        }
      }
    </div>

    @if (assignTarget(); as target) {
      <app-szobeli-kiadas-dialog [target]="target" (closed)="assignTarget.set(null)" (assigned)="onAssigned($event)" />
    }
  `,
})
export class SzobeliTemaSzerkesztoComponent implements OnInit {
  private readonly api = inject(TeacherOralExamService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly statusLabels = ORAL_TOPIC_STATUS_LABELS;
  readonly minuteOptions = ORAL_TOPIC_VOICE_MINUTE_OPTIONS;
  readonly questionRange = ORAL_TOPIC_QUESTIONS_PER_ITEM;

  private readonly topicId = Number(this.route.snapshot.paramMap.get('id'));
  readonly topic = signal<TeacherOralTopicDto | null>(null);
  /** A szerkesztett másolat (immutábilis: a mezők a `patch*` metódusokon át új modellt adnak). */
  readonly model = signal<EditModel | null>(null);
  readonly dirty = signal(false);
  readonly busy = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly errors = signal<OralTopicError[]>([]);
  readonly assignTarget = signal<OralAssignTarget | null>(null);

  readonly readOnly = computed(() => this.topic()?.hasSessions ?? false);
  readonly selectedMinutes = computed(() => [...(this.model()?.voiceMinutes ?? [])].sort((a, b) => a - b));
  readonly rubricSum = computed(() => (this.model()?.rubric ?? []).reduce((sum, r) => sum + (Number(r.points) || 0), 0));
  /** A tételhez / kérdéshez / szemponthoz nem köthető hibák (a hibasávban, útvonallal). */
  readonly generalErrors = computed(() => this.errors().filter((e) => !/^(items|rubric)\[\d+\]/.test(e.path)));

  ngOnInit(): void {
    this.api.topic(this.topicId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (topic) => this.apply(topic),
      error: (err) => this.loadError.set(extractErrorMessage(err, 'A téma betöltése sikertelen.')),
    });
  }

  /** Route canDeactivate: mentetlen módosításnál megerősítést kér. */
  canLeave(): boolean | Promise<boolean> {
    if (!this.dirty()) return true;
    return this.confirm.ask({
      title: 'Elveted a módosításokat?',
      message: 'A téma mentetlen módosításai elvesznek.',
      confirmLabel: 'Elvetem',
      cancelLabel: 'Maradok',
      danger: true,
    });
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.dirty()) return;
    event.preventDefault();
    event.returnValue = '';
  }

  itemErrors(i: number): string[] {
    return this.messages((p) => (p === `items[${i}]` || p.startsWith(`items[${i}].`)) && !p.startsWith(`items[${i}].questions[`));
  }

  questionErrors(i: number, q: number): string[] {
    return this.messages((p) => p.startsWith(`items[${i}].questions[${q}]`));
  }

  rubricErrors(r: number): string[] {
    return this.messages((p) => p.startsWith(`rubric[${r}]`));
  }

  patch(changes: Partial<Pick<EditModel, 'title' | 'defaultVoiceMinutes'>>): void {
    this.edit((m) => ({ ...m, ...changes }));
  }

  patchItem(i: number, changes: Partial<Pick<EditItem, 'title' | 'keywords'>>): void {
    this.edit((m) => ({ ...m, items: replaceAt(m.items, i, (item) => ({ ...item, ...changes })) }));
  }

  patchQuestion(i: number, q: number, changes: Partial<EditQuestion>): void {
    this.edit((m) => ({
      ...m,
      items: replaceAt(m.items, i, (item) => ({ ...item, questions: replaceAt(item.questions, q, (question) => ({ ...question, ...changes })) })),
    }));
  }

  patchRubric(r: number, changes: Partial<Omit<TeacherOralRubricItemDto, 'key'>>): void {
    this.edit((m) => ({ ...m, rubric: replaceAt(m.rubric, r, (item) => ({ ...item, ...changes })) }));
  }

  toggleMinutes(min: number): void {
    this.edit((m) => {
      const voiceMinutes = new Set(m.voiceMinutes);
      if (!voiceMinutes.delete(min)) voiceMinutes.add(min);
      const keepDefault = voiceMinutes.has(m.defaultVoiceMinutes) || !voiceMinutes.size;
      return { ...m, voiceMinutes, defaultVoiceMinutes: keepDefault ? m.defaultVoiceMinutes : Math.min(...voiceMinutes) };
    });
  }

  addItem(): void {
    this.restructure((m) => ({ ...m, items: [...m.items, { slug: null, title: '', keywords: '', questions: [{ text: '', expected: '' }] }] }));
  }

  removeItem(i: number): void {
    this.restructure((m) => ({ ...m, items: m.items.filter((_, idx) => idx !== i) }));
  }

  addQuestion(i: number): void {
    this.restructure((m) => ({ ...m, items: replaceAt(m.items, i, (item) => ({ ...item, questions: [...item.questions, { text: '', expected: '' }] })) }));
  }

  removeQuestion(i: number, q: number): void {
    this.restructure((m) => ({
      ...m,
      items: replaceAt(m.items, i, (item) => ({ ...item, questions: item.questions.filter((_, idx) => idx !== q) })),
    }));
  }

  addRubric(): void {
    this.restructure((m) => {
      const keys = new Set(m.rubric.map((r) => r.key));
      let n = 1;
      while (keys.has(`szempont-${n}`)) n++;
      return { ...m, rubric: [...m.rubric, { key: `szempont-${n}`, title: '', points: 1, description: '' }] };
    });
  }

  removeRubric(r: number): void {
    this.restructure((m) => ({ ...m, rubric: m.rubric.filter((_, idx) => idx !== r) }));
  }

  save(): void {
    const model = this.model();
    if (!model || this.busy()) return;
    this.busy.set(true);
    this.api
      .updateTopic(this.topicId, toUpdateRequest(model))
      .pipe(take(1), finalize(() => this.busy.set(false)))
      .subscribe({
        next: (topic) => {
          this.apply(topic);
          this.toast.success('A téma mentve.');
        },
        error: (err) => this.fail(err, 'A mentés nem sikerült.'),
      });
  }

  approve(): void {
    if (this.busy() || this.dirty()) return;
    this.busy.set(true);
    this.api
      .approveTopic(this.topicId)
      .pipe(take(1), finalize(() => this.busy.set(false)))
      .subscribe({
        next: (topic) => {
          this.apply(topic);
          this.toast.success('A téma jóváhagyva - most már kiadhatod.');
        },
        error: (err) => this.fail(err, 'A jóváhagyás nem sikerült.'),
      });
  }

  async remove(): Promise<void> {
    if (this.busy()) return;
    const ok = await this.confirm.ask({
      title: 'Téma törlése',
      message: `Biztosan törlöd a(z) „${this.topic()!.title}” témát? Kiadott téma nem törölhető.`,
      confirmLabel: 'Törlés',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.api
      .deleteTopic(this.topicId)
      .pipe(take(1), finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.toast.success('A téma törölve.');
          this.dirty.set(false);
          void this.router.navigate(['/feladatsorok/szobeli']);
        },
        error: (err) => this.fail(err, 'A törlés nem sikerült.'),
      });
  }

  openAssign(): void {
    const topic = this.topic()!;
    this.assignTarget.set({
      topicId: topic.id,
      profileSlug: null,
      title: topic.title,
      voiceMinuteOptions: topic.voiceMinuteOptions,
      defaultVoiceMinutes: topic.defaultVoiceMinutes,
    });
  }

  onAssigned(assignment: TeacherOralAssignmentDto): void {
    this.assignTarget.set(null);
    this.toast.success(`Kiadva: ${assignment.groupName}.`);
  }

  private apply(topic: TeacherOralTopicDto): void {
    this.topic.set(topic);
    this.model.set(toModel(topic));
    this.dirty.set(false);
    this.error.set(null);
    this.errors.set([]);
  }

  private fail(err: unknown, fallback: string): void {
    this.error.set(extractErrorMessage(err, fallback));
    this.errors.set(oralTopicErrors(err));
  }

  /** Mezőszerkesztés: új modell (a régit nem mutáljuk), és mentetlen állapot. */
  private edit(change: (model: EditModel) => EditModel): void {
    this.model.update((m) => (m ? change(m) : m));
    this.dirty.set(true);
  }

  /** Tétel / kérdés / szempont felvétele vagy törlése: a régi hibák útvonalai elcsúsznának, ezért törlődnek. */
  private restructure(change: (model: EditModel) => EditModel): void {
    this.errors.set([]);
    this.edit(change);
  }

  private messages(match: (path: string) => boolean): string[] {
    return this.errors().filter((e) => match(e.path)).map((e) => e.message);
  }
}
