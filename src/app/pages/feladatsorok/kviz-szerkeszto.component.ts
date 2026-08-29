import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { GroupStore } from '../../services/group/group.store';
import { TeacherQuizService } from '../../services/teacher-quiz/teacher-quiz.service';
import { TeacherQuizStore } from '../../services/teacher-quiz/teacher-quiz.store';
import {
  CreateTeacherQuizQuestionRequest,
  QUIZ_DIFFICULTY_LABELS,
  QUIZ_FEEDBACK_MODE_LABELS,
  QUIZ_QUESTION_TYPE_LABELS,
  QuizDifficulty,
  QuizFeedbackMode,
  QuizExamLevel,
  QuizQuestionType,
  QuizTopicOptionDto,
  TeacherQuizQuestionDto,
} from '../../models/teacher-quiz.model';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { ToastService } from '../../shared/toast/toast.service';
import { notBlankValidator } from '../../shared/validators/not-blank.validator';

/**
 * Tanári kvíz-szerkesztő: beállítások, kérdések (típusonként eltérő űrlappal),
 * AI-generálás jóváhagyással, publikálás, csoportnak kiadás.
 *
 * A helyes válaszokat SZÁNDÉKOSAN nem szabad szövegként gépelteti be a tanárral: a
 * lehetőségeket soronként adja meg, és azok közül JELÖLI ki a helyeset. Egy elgépelt
 * "helyes válasz" különben olyan kérdést hozna létre, amit a diák sosem tudna eltalálni
 * (a kiértékelés szöveg-egyezésen alapul) - a backend ezt vissza is utasítja, de jobb, ha
 * a felület eleve nem engedi.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-kviz-szerkeszto',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, IconComponent, DatePipe],
  template: `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <div class="flex items-center gap-4">
        <a routerLink="/feladatsorok/kvizek" class="text-sm text-text-muted hover:underline">← Kvízeim</a>
        <a [routerLink]="['/feladatsorok', 'kvizek', quizId, 'eredmenyek']"
           class="text-sm text-text-muted hover:underline ml-auto">Eredmények →</a>
      </div>

      @if (store.error()) {
        <p class="text-danger text-sm mt-4">{{ store.error() }}</p>
      }

      @if (detail(); as quiz) {
        <div class="flex items-start gap-3 mt-3">
          <h1 class="page-title flex-1">{{ quiz.title }}</h1>
          <span class="badge shrink-0" [class]="badgeClass()">{{ badgeLabel() }}</span>
        </div>

        @if (quiz.takedownAt) {
          <p class="text-danger text-sm mt-2">
            Ezt a kvízt a platform-admin visszavonta{{ quiz.takedownReason ? ': ' + quiz.takedownReason : '' }}.
            A tartalma nem módosítható, és csak admin adhatja ki újra.
          </p>
        }

        <div class="hairline"></div>

        <!-- ── Publikálás ─────────────────────────────────────── -->
        <section class="card p-5 mb-6">
          <div class="flex items-center gap-3">
            <div class="flex-1">
              <h2 class="font-bold">Kiadásra kész?</h2>
              <p class="text-sm text-text-muted">
                {{ quiz.questionCount }} kérdés
                @if (quiz.pendingQuestionCount > 0) {
                  <span class="text-danger">, ebből {{ quiz.pendingQuestionCount }} jóváhagyásra vár</span>
                }
              </p>
            </div>
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="store.loading() || !!quiz.takedownAt"
              (click)="publish()"
            >
              {{ quiz.isPublished ? 'Újrapublikálás' : 'Publikálás' }}
            </button>
          </div>

          @if (store.publishResult(); as result) {
            @if (!result.success) {
              <ul class="mt-3 space-y-1">
                @for (error of result.errors; track error) {
                  <li class="text-sm text-danger">{{ error }}</li>
                }
              </ul>
            }
          }
        </section>

        <!-- ── Beállítások ────────────────────────────────────── -->
        <section class="card p-5 mb-6">
          <h2 class="font-bold mb-3">Beállítások</h2>
          <form [formGroup]="settingsForm" (ngSubmit)="saveSettings()" class="space-y-3">
            <input formControlName="title" placeholder="Cím" maxlength="200" class="input" />
            <textarea formControlName="description" placeholder="Leírás" rows="2" class="input"></textarea>

            <label class="block">
              <span class="text-sm text-text-muted">Mikor lássa a diák a megoldást?</span>
              <select formControlName="feedbackMode" class="input mt-1">
                @for (mode of feedbackModes; track mode.value) {
                  <option [value]="mode.value">{{ mode.label }}</option>
                }
              </select>
            </label>

            <label class="block">
              <span class="text-sm text-text-muted">Kérdésenkénti időkorlát (mp, üresen nincs korlát)</span>
              <input formControlName="secondsPerQuestion" type="number" min="1" class="input mt-1" />
            </label>

            <label class="block">
              <span class="text-sm text-text-muted">Hányszor írhatja meg (üresen korlátlan)</span>
              <input formControlName="maxAttempts" type="number" min="1" class="input mt-1" />
            </label>

            <label class="block">
              <span class="text-sm text-text-muted">Érettségi vizsgaszint</span>
              <select formControlName="examLevel" class="input mt-1">
                @for (level of examLevels; track level.value) {
                  <option [ngValue]="level.value">{{ level.label }}</option>
                }
              </select>
            </label>

            <label class="flex items-center gap-2 text-sm">
              <input formControlName="shuffleQuestions" type="checkbox" />
              Kérdések keverése
            </label>

            <label class="flex items-center gap-2 text-sm">
              <input formControlName="allowLateSubmission" type="checkbox" />
              Határidő után is beadható
            </label>

            <button type="submit" class="btn btn-primary" [disabled]="settingsForm.invalid || store.loading()">
              Mentés
            </button>
          </form>
        </section>

        <!-- ── Kérdések ───────────────────────────────────────── -->
        <section class="card p-5 mb-6">
          <h2 class="font-bold mb-3">Kérdések</h2>

          <ul class="space-y-3 mb-5">
            @for (question of quiz.questions; track question.id) {
              <li class="border border-border rounded p-3">
                <div class="flex items-start gap-2">
                  <span class="min-w-0 flex-1">
                    <span class="block font-semibold">{{ question.questionText }}</span>
                    <span class="text-xs text-text-muted">
                      {{ typeLabel(question.questionType) }} · {{ question.topicName }} ·
                      {{ difficultyLabel(question.difficulty) }}
                    </span>
                    <span class="block text-xs text-text-muted mt-1">
                      Helyes: {{ question.correctAnswers.join(', ') }}
                    </span>
                  </span>
                  @if (!question.isApproved) {
                    <span class="badge badge-warning shrink-0">Jóváhagyásra vár</span>
                  }
                </div>

                <div class="flex gap-2 mt-2">
                  <button
                    type="button"
                    class="btn btn-ghost"
                    [disabled]="$first || store.loading()"
                    (click)="moveQuestion(question, -1)"
                    aria-label="Feljebb"
                  >↑</button>
                  <button
                    type="button"
                    class="btn btn-ghost"
                    [disabled]="$last || store.loading()"
                    (click)="moveQuestion(question, 1)"
                    aria-label="Lejjebb"
                  >↓</button>
                  @if (!question.isApproved) {
                    <button type="button" class="btn btn-ghost" (click)="approve(question)">Jóváhagyom</button>
                  }
                  <button type="button" class="btn btn-ghost" (click)="startEdit(question)">Szerkesztés</button>
                  <button type="button" class="btn btn-ghost text-danger" (click)="deleteQuestion(question)">
                    Törlés
                  </button>
                </div>
              </li>
            } @empty {
              <li class="text-sm text-text-muted">Még nincs kérdés. Vegyél fel egyet, vagy generáltass AI-jal.</li>
            }
          </ul>

          <!-- Kérdés-űrlap -->
          <form [formGroup]="questionForm" (ngSubmit)="saveQuestion()" class="space-y-3 border-t border-border pt-4">
            <h3 class="font-semibold">{{ editingId() ? 'Kérdés szerkesztése' : 'Új kérdés' }}</h3>

            <label class="block">
              <span class="text-sm text-text-muted">Típus</span>
              <select formControlName="questionType" class="input mt-1">
                @for (type of questionTypes; track type.value) {
                  <option [value]="type.value">{{ type.label }}</option>
                }
              </select>
            </label>

            @if (questionType() === 'cloze') {
              <p class="text-xs text-text-muted">
                Jelöld a kihagyást három aláhúzással: <code>A ___ függvény keres értéket.</code>
              </p>
            }

            <textarea formControlName="questionText" placeholder="A kérdés szövege" rows="2" class="input"></textarea>

            <label class="block">
              <span class="text-sm text-text-muted">Témakör</span>
              <select formControlName="topicId" class="input mt-1">
                @for (topic of topics(); track topic.id) {
                  <option [value]="topic.id">{{ topic.name }}</option>
                }
              </select>
            </label>

            @if (questionType() === 'cloze') {
              <label class="block">
                <span class="text-sm text-text-muted">Elfogadott válaszok (soronként egy)</span>
                <textarea
                  formControlName="acceptedText"
                  rows="3"
                  class="input mt-1"
                  placeholder="XKERES&#10;XLOOKUP"
                ></textarea>
              </label>
              <p class="text-xs text-text-muted">
                Több sor esetén bármelyik elfogadott — hasznos, ha ugyanannak a fogalomnak több
                érvényes írásmódja van.
              </p>
            } @else {
              <label class="block">
                <span class="text-sm text-text-muted">Válaszlehetőségek (soronként egy)</span>
                <textarea
                  formControlName="optionsText"
                  rows="4"
                  class="input mt-1"
                  placeholder="XKERES&#10;SZUM&#10;HA&#10;DARAB"
                ></textarea>
              </label>

              <div>
                <span class="text-sm text-text-muted">
                  {{ questionType() === 'multi' ? 'Helyes válaszok (több is lehet)' : 'A helyes válasz' }}
                </span>
                @if (parsedOptions().length === 0) {
                  <p class="text-sm text-text-muted mt-1">Előbb add meg a válaszlehetőségeket.</p>
                } @else {
                  <ul class="mt-1 space-y-1">
                    @for (option of parsedOptions(); track option) {
                      <li>
                        <label class="flex items-center gap-2 text-sm">
                          <input
                            [type]="questionType() === 'multi' ? 'checkbox' : 'radio'"
                            [checked]="isSelected(option)"
                            (change)="toggleCorrect(option)"
                          />
                          {{ option }}
                        </label>
                      </li>
                    }
                  </ul>
                }
              </div>
            }

            <textarea
              formControlName="explanation"
              placeholder="Magyarázat (nem kötelező)"
              rows="2"
              class="input"
            ></textarea>

            <label class="block">
              <span class="text-sm text-text-muted">Nehézség</span>
              <select formControlName="difficulty" class="input mt-1">
                @for (level of difficulties; track level.value) {
                  <option [value]="level.value">{{ level.label }}</option>
                }
              </select>
            </label>

            <label class="block">
              <span class="text-sm text-text-muted">
                Időkorlát erre a kérdésre (mp, üresen a kvíz beállítása érvényes)
              </span>
              <input formControlName="secondsLimit" type="number" min="1" class="input mt-1" />
            </label>

            @if (formWarning(); as warning) {
              <p class="text-sm text-danger">{{ warning }}</p>
            }

            <div class="flex gap-2">
              <button type="submit" class="btn btn-primary" [disabled]="questionForm.invalid || store.loading() || !!formWarning()">
                {{ editingId() ? 'Mentés' : 'Hozzáadás' }}
              </button>
              @if (editingId()) {
                <button type="button" class="btn btn-ghost" (click)="cancelEdit()">Mégsem</button>
              }
            </div>
          </form>
        </section>

        <!-- ── AI-generálás ───────────────────────────────────── -->
        <section class="card p-5 mb-6">
          <h2 class="font-bold mb-1">Kérdések generálása AI-jal</h2>
          <p class="text-sm text-text-muted mb-3">
            A generált kérdések piszkozatként kerülnek be — átnézés és jóváhagyás után válnak
            a kvíz részévé. A kvíz addig nem publikálható, amíg van jóváhagyatlan kérdés.
          </p>

          <form [formGroup]="generateForm" (ngSubmit)="generate()" class="space-y-3">
            <label class="block">
              <span class="text-sm text-text-muted">Témakör</span>
              <select formControlName="topicId" class="input mt-1">
                @for (topic of topics(); track topic.id) {
                  <option [value]="topic.id">{{ topic.name }}</option>
                }
              </select>
            </label>

            <label class="block">
              <span class="text-sm text-text-muted">Darabszám</span>
              <input formControlName="count" type="number" min="1" max="20" class="input mt-1" />
            </label>

            <button
              type="submit"
              class="btn btn-primary"
              [disabled]="generateForm.invalid || store.generating() || topics().length === 0 || !!quiz.takedownAt"
            >
              {{ store.generating() ? 'Generálás folyamatban…' : 'Generálás' }}
            </button>
          </form>
        </section>

        <!-- ── Kiadás csoportnak ──────────────────────────────── -->
        <section class="card p-5">
          <h2 class="font-bold mb-3">Kiadás csoportnak</h2>

          <ul class="space-y-2 mb-4">
            @for (assignment of activeAssignments(); track assignment.id) {
              <li class="flex items-center gap-2 text-sm">
                <app-icon name="users" class="w-4 h-4 block text-text-muted" />
                <span class="flex-1">
                  {{ groupLabel(assignment.groupId, assignment.groupName) }}
                  @if (assignment.dueAt) {
                    <span class="text-text-muted">· határidő: {{ assignment.dueAt | date: 'yyyy.MM.dd. HH:mm' }}</span>
                  }
                </span>
                <button type="button" class="btn btn-ghost text-danger" (click)="revoke(assignment.id)">
                  Visszavonás
                </button>
              </li>
            } @empty {
              <li class="text-sm text-text-muted">Még nincs kiadva egyetlen csoportnak sem.</li>
            }
          </ul>

          @if (!quiz.isPublished) {
            <p class="text-sm text-text-muted">Előbb publikáld a kvízt, utána adhatod ki csoportoknak.</p>
          } @else {
            <form [formGroup]="assignForm" (ngSubmit)="assign()" class="space-y-3 border-t border-border pt-4">
              <label class="block">
                <span class="text-sm text-text-muted">Csoport</span>
                <select formControlName="groupId" class="input mt-1">
                  @for (group of assignableGroups(); track group.id) {
                    <option [value]="group.id">{{ groupLabel(group.id, group.name) }}</option>
                  }
                </select>
              </label>

              <label class="block">
                <span class="text-sm text-text-muted">Határidő (nem kötelező)</span>
                <input formControlName="dueAt" type="datetime-local" class="input mt-1" />
              </label>

              <button
                type="submit"
                class="btn btn-primary"
                [disabled]="assignForm.invalid || store.loading() || assignableGroups().length === 0"
              >
                Kiadás
              </button>
              @if (assignableGroups().length === 0) {
                <p class="text-sm text-text-muted">Minden csoportod megkapta már ezt a kvízt.</p>
              }
            </form>
          }
        </section>
      } @else if (store.loading()) {
        <div class="space-y-2 mt-6">
          <div class="skeleton h-24"></div>
          <div class="skeleton h-48"></div>
        </div>
      }
    </div>
  `,
})
export class KvizSzerkesztoComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly quizService = inject(TeacherQuizService);
  private readonly toastService = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);
  private readonly groupStore = inject(GroupStore);
  readonly store = inject(TeacherQuizStore);

  readonly quizId = Number(this.route.snapshot.paramMap.get('id'));
  readonly detail = computed(() => {
    const detail = this.store.selectedDetail();
    // A store `providedIn: 'root'`: navigáció után átmenetileg még az ELŐZŐ kvíz adata
    // ülhet benne. Csak a saját id-nkhez tartozót jelenítjük meg.
    return detail?.id === this.quizId ? detail : null;
  });

  readonly questionTypes = (Object.keys(QUIZ_QUESTION_TYPE_LABELS) as QuizQuestionType[]).map((value) => ({
    value,
    label: QUIZ_QUESTION_TYPE_LABELS[value],
  }));
  readonly feedbackModes = (Object.keys(QUIZ_FEEDBACK_MODE_LABELS) as QuizFeedbackMode[]).map((value) => ({
    value,
    label: QUIZ_FEEDBACK_MODE_LABELS[value],
  }));
  readonly difficulties = (Object.keys(QUIZ_DIFFICULTY_LABELS) as QuizDifficulty[]).map((value) => ({
    value,
    label: QUIZ_DIFFICULTY_LABELS[value],
  }));

  // catchError NÉLKÜL a toSignal() a hibát minden KÖVETKEZŐ olvasáskor újra-dobná, és
  // mivel a témalistát a sablon feltétel nélkül olvassa, egy hibás GET a TELJES oldal
  // renderelését döntené el (UI-TT-133 ugyanezen tanulsága).
  readonly topics = toSignal(
    this.quizService.getTopics().pipe(
      map((groups) => groups.flatMap((g) => g.topics)),
      catchError(() => of([] as QuizTopicOptionDto[])),
    ),
    { initialValue: [] as QuizTopicOptionDto[] },
  );

  /**
   * Az emelt szint követelményei TARTALMAZZÁK a középszintűeket, ezért a `kozep` jelentése
   * "középtől felfelé kell" - nem kell külön "mindkettő" érték. A `null` = nem érettségi
   * anyag.
   */
  readonly examLevels: { value: QuizExamLevel; label: string }[] = [
    { value: null, label: 'Nem érettségi anyag' },
    { value: 'kozep', label: 'Középszint (emelten is kell)' },
    { value: 'emelt', label: 'Csak emelt szint' },
  ];

  readonly editingId = signal<number | null>(null);
  private readonly selectedCorrect = signal<string[]>([]);

  readonly settingsForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, notBlankValidator(), Validators.maxLength(200)]],
    description: [''],
    feedbackMode: ['after' as QuizFeedbackMode, Validators.required],
    secondsPerQuestion: this.fb.control<number | null>(null),
    maxAttempts: this.fb.control<number | null>(null),
    shuffleQuestions: [true],
    allowLateSubmission: [true],
    examLevel: this.fb.control<QuizExamLevel>(null),
  });

  // UI-TT-209: a gombok `[disabled]`-je korábban NEM nézte a form `invalid` állapotát,
  // csak a store-t és a saját figyelmeztetéseket. A `topicId`/`groupId` legördülők
  // kezdőértéke `null` és `Validators.required`-esek - ha a tanár nem nyúlt hozzájuk
  // explicit, a form érvénytelen maradt, a gomb viszont AKTÍVNAK látszott, és a metódus
  // első sora (`if (form.invalid) return;`) némán, hálózati forgalom nélkül visszatért.
  // A kattintás semmit nem csinált és semmit nem üzent.
  readonly questionForm = this.fb.nonNullable.group({
    questionType: ['single' as QuizQuestionType, Validators.required],
    questionText: ['', [Validators.required, notBlankValidator()]],
    topicId: this.fb.control<number | null>(null, Validators.required),
    optionsText: [''],
    acceptedText: [''],
    explanation: [''],
    difficulty: ['Medium' as QuizDifficulty, Validators.required],
    secondsLimit: this.fb.control<number | null>(null),
  });

  readonly generateForm = this.fb.nonNullable.group({
    topicId: this.fb.control<number | null>(null, Validators.required),
    count: [5, [Validators.required, Validators.min(1), Validators.max(20)]],
  });

  readonly assignForm = this.fb.nonNullable.group({
    groupId: this.fb.control<number | null>(null, Validators.required),
    dueAt: [''],
  });

  private readonly questionTypeSignal = toSignal(this.questionForm.controls.questionType.valueChanges, {
    initialValue: this.questionForm.controls.questionType.value,
  });
  private readonly optionsTextSignal = toSignal(this.questionForm.controls.optionsText.valueChanges, {
    initialValue: this.questionForm.controls.optionsText.value,
  });
  // A formWarning() `computed`, ezért MINDEN általa olvasott form-értéknek signalnak kell
  // lennie. Egy sima `control.value` olvasás nem váltana újraszámolást: a figyelmeztetés
  // bent ragadna azután is, hogy a tanár kijavította a hibát (pl. beírta a ___ jelölést).
  private readonly questionTextSignal = toSignal(this.questionForm.controls.questionText.valueChanges, {
    initialValue: this.questionForm.controls.questionText.value,
  });
  private readonly acceptedTextSignal = toSignal(this.questionForm.controls.acceptedText.valueChanges, {
    initialValue: this.questionForm.controls.acceptedText.value,
  });

  readonly questionType = computed(() => this.questionTypeSignal());

  /** A soronként megadott lehetőségek — üres sorok nélkül, trimmelve. */
  readonly parsedOptions = computed(() =>
    (this.optionsTextSignal() ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );

  readonly activeAssignments = computed(() => this.detail()?.assignments.filter((a) => !a.revokedAt) ?? []);

  /** Csak azok a csoportok, amelyek MÉG NEM kapták meg — a backend is elutasítaná a duplát. */
  readonly assignableGroups = computed(() => {
    const assigned = new Set(this.activeAssignments().map((a) => a.groupId));
    return this.groupStore.groups().filter((g) => !assigned.has(g.id));
  });

  /**
   * UI-TT-219: a `StudentGroups.Name`-en nincs unique constraint - egy tanárnak élőben
   * ténylegesen lehet két, egyaránt aktív, azonos nevű csoportja. A "Csoport" választó és a
   * kiadás-lista korábban KIZÁRÓLAG a nevet mutatta, így a két sor megkülönböztethetetlen
   * volt, és a tanár nem tudta megmondani, melyik "Visszavonás" gomb melyik csoportot
   * érinti. Csak akkor fűzünk hozzá invite-kódot, ha a név ténylegesen duplikált - a
   * megszokott (egyedi nevű csoportok) esetben a felület változatlan marad.
   */
  private readonly duplicateGroupNameCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const g of this.groupStore.groups()) {
      counts.set(g.name, (counts.get(g.name) ?? 0) + 1);
    }
    return counts;
  });

  groupLabel(groupId: number, groupName: string): string {
    if ((this.duplicateGroupNameCounts().get(groupName) ?? 0) <= 1) return groupName;
    const full = this.groupStore.groups().find((g) => g.id === groupId);
    return full ? `${groupName} (kód: ${full.inviteCode})` : groupName;
  }

  /**
   * Beküldés előtti, felhasználóbarát ellenőrzés. A backend ugyanezeket kikényszeríti —
   * ez csak azért van itt, hogy a tanár ne egy hibaüzenetből tudja meg.
   */
  readonly formWarning = computed(() => {
    const type = this.questionType();
    const correct = this.selectedCorrect();

    if (type === 'cloze') {
      if (this.acceptedAnswers().length === 0) return 'Adj meg legalább egy elfogadott választ.';
      if (!(this.questionTextSignal() ?? '').includes('___')) {
        return 'Jelöld a kihagyást három aláhúzással (___) a kérdés szövegében.';
      }
      return null;
    }

    const options = this.parsedOptions();
    if (options.length < 2) return 'Adj meg legalább két válaszlehetőséget.';
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
      return 'A válaszlehetőségek nem ismétlődhetnek.';
    }
    if (correct.length === 0) return 'Jelöld ki a helyes választ.';
    if (type === 'single' && correct.length !== 1) return 'Egyválasztósnál pontosan egy helyes válasz lehet.';
    return null;
  });

  constructor() {
    this.store.loadDetail(this.quizId, () => this.syncSettingsForm());
    this.groupStore.loadMine();
  }

  private syncSettingsForm(): void {
    const quiz = this.detail();
    if (!quiz) return;

    this.settingsForm.patchValue({
      title: quiz.title,
      description: quiz.description ?? '',
      feedbackMode: quiz.feedbackMode,
      secondsPerQuestion: quiz.secondsPerQuestion ?? null,
      maxAttempts: quiz.maxAttempts ?? null,
      shuffleQuestions: quiz.shuffleQuestions,
      allowLateSubmission: quiz.allowLateSubmission,
      examLevel: quiz.examLevel ?? null,
    });
  }

  /** Signalból olvas, hogy a formWarning() computed újraszámoljon gépelés közben is. */
  private acceptedAnswers(): string[] {
    return (this.acceptedTextSignal() ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  typeLabel(type: QuizQuestionType): string {
    return QUIZ_QUESTION_TYPE_LABELS[type];
  }

  difficultyLabel(difficulty: QuizDifficulty): string {
    return QUIZ_DIFFICULTY_LABELS[difficulty];
  }

  badgeLabel(): string {
    const quiz = this.detail();
    if (!quiz) return '';
    if (quiz.takedownAt) return 'Admin visszavonta';
    return quiz.isPublished ? 'Publikált' : 'Piszkozat';
  }

  badgeClass(): string {
    const quiz = this.detail();
    if (!quiz) return '';
    if (quiz.takedownAt) return 'badge-danger';
    return quiz.isPublished ? 'badge-success' : 'badge-warning';
  }

  isSelected(option: string): boolean {
    return this.selectedCorrect().includes(option);
  }

  toggleCorrect(option: string): void {
    if (this.questionType() === 'multi') {
      this.selectedCorrect.update((list) =>
        list.includes(option) ? list.filter((o) => o !== option) : [...list, option],
      );
    } else {
      this.selectedCorrect.set([option]);
    }
  }

  saveSettings(): void {
    if (this.settingsForm.invalid || this.store.loading()) return;

    const raw = this.settingsForm.getRawValue();
    this.store.updateQuiz(
      this.quizId,
      {
        title: raw.title,
        description: raw.description || null,
        feedbackMode: raw.feedbackMode,
        secondsPerQuestion: raw.secondsPerQuestion || null,
        maxAttempts: raw.maxAttempts || null,
        shuffleQuestions: raw.shuffleQuestions,
        allowLateSubmission: raw.allowLateSubmission,
        examLevel: raw.examLevel,
      },
      () => this.toastService.success('Beállítások mentve.'),
    );
  }

  publish(): void {
    this.store.clearPublishResult();
    this.store.publish(this.quizId, () => this.toastService.success('Kvíz publikálva.'));
  }

  /**
   * UI-TT-218: minden kérdés UGYANAZT a questionForm-ot/editingId signalt osztja - ha a
   * tanár egy másik kérdést épp szerkeszt és MÓDOSÍTOTT (de még nem mentett), egy másik
   * kérdés "Szerkesztés" gombjára kattintva a patchValue korábban figyelmeztetés nélkül,
   * nyomtalanul eldobta az el nem mentett szöveget.
   */
  async startEdit(question: TeacherQuizQuestionDto): Promise<void> {
    if (this.editingId() !== null && this.questionForm.dirty) {
      const confirmed = await this.confirmService.ask({
        title: 'Nem mentett módosítás',
        message: 'A jelenleg szerkesztett kérdésen el nem mentett módosításaid vannak - másik kérdésre váltva ezek elvesznek.',
        confirmLabel: 'Váltás mentés nélkül',
        cancelLabel: 'Mégsem',
        danger: true,
      });
      if (!confirmed) return;
    }

    this.editingId.set(question.id);
    this.questionForm.patchValue({
      questionType: question.questionType,
      questionText: question.questionText,
      topicId: question.topicId,
      optionsText: question.options.join('\n'),
      acceptedText: question.questionType === 'cloze' ? question.correctAnswers.join('\n') : '',
      explanation: question.explanation ?? '',
      difficulty: question.difficulty,
      secondsLimit: question.secondsLimit ?? null,
    });
    this.selectedCorrect.set(question.questionType === 'cloze' ? [] : [...question.correctAnswers]);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.questionForm.reset({ questionType: 'single', difficulty: 'Medium' });
    this.selectedCorrect.set([]);
  }

  saveQuestion(): void {
    if (this.questionForm.invalid || this.formWarning() || this.store.loading()) return;

    const raw = this.questionForm.getRawValue();
    const type = raw.questionType;

    const request: CreateTeacherQuizQuestionRequest = {
      topicId: Number(raw.topicId),
      questionType: type,
      questionText: raw.questionText,
      options: type === 'cloze' ? [] : this.parsedOptions(),
      correctAnswers: type === 'cloze' ? this.acceptedAnswers() : this.selectedCorrect(),
      explanation: raw.explanation || null,
      difficulty: raw.difficulty,
      secondsLimit: raw.secondsLimit || null,
    };

    const editingId = this.editingId();
    const done = () => {
      this.toastService.success(editingId ? 'Kérdés mentve.' : 'Kérdés hozzáadva.');
      this.cancelEdit();
    };

    if (editingId) {
      this.store.updateQuestion(this.quizId, editingId, request, done);
    } else {
      this.store.addQuestion(this.quizId, request, done);
    }
  }

  /**
   * Kérdés mozgatása a sorrendben. A két érintett kérdés DisplayOrder-jét CSERÉLJÜK,
   * nem "beszúrunk" - így nem kell az egész listát újraszámozni, és két gyors kattintás
   * sem tud lyukat hagyni a sorszámozásban.
   *
   * UI-TT-213: korábban két külön updateQuestion()-hívással történt (a második csak az
   * első sikere UTÁN indult) - ha a MÁSODIK hívás hálózati/átmeneti hibával elbukott, a
   * szerveren két kérdés maradt UGYANAZZAL a DisplayOrder-rel, a hibaüzenet pedig nem
   * jelezte, hogy az állapot félig módosult. A dedikált reorderQuestion() végpont mindkét
   * kérdés DisplayOrder-jét EGYETLEN, atomi BE-hívással cseréli.
   */
  moveQuestion(question: TeacherQuizQuestionDto, direction: -1 | 1): void {
    const questions = this.detail()?.questions ?? [];
    const index = questions.findIndex((q) => q.id === question.id);
    const neighbour = questions[index + direction];
    if (!neighbour || this.store.loading()) return;

    this.store.reorderQuestion(this.quizId, question.id, neighbour.id);
  }

  approve(question: TeacherQuizQuestionDto): void {
    this.store.approveQuestion(this.quizId, question.id, () => this.toastService.success('Kérdés jóváhagyva.'));
  }

  async deleteQuestion(question: TeacherQuizQuestionDto): Promise<void> {
    const confirmed = await this.confirmService.ask({
      title: 'Kérdés törlése',
      message: `Biztosan törlöd? „${question.questionText}"`,
      confirmLabel: 'Törlés',
      cancelLabel: 'Mégsem',
      danger: true,
    });
    if (!confirmed) return;

    this.store.deleteQuestion(this.quizId, question.id, () => this.toastService.success('Kérdés törölve.'));
  }

  generate(): void {
    if (this.generateForm.invalid || this.store.generating()) return;

    const raw = this.generateForm.getRawValue();
    this.store.generateQuestions(
      this.quizId,
      { topicId: Number(raw.topicId), count: Number(raw.count), difficulty: 'Medium' },
      (count) => this.toastService.success(`${count} kérdés generálva — nézd át és hagyd jóvá őket.`),
    );
  }

  assign(): void {
    if (this.assignForm.invalid || this.store.loading()) return;

    const raw = this.assignForm.getRawValue();
    this.store.assignToGroup(
      this.quizId,
      {
        groupId: Number(raw.groupId),
        // A datetime-local érték helyi idő, időzóna-jelölés nélkül - ISO-alakra váltjuk,
        // hogy a szerver ne értelmezhesse félre.
        dueAt: raw.dueAt ? new Date(raw.dueAt).toISOString() : null,
      },
      () => {
        this.toastService.success('Kvíz kiadva.');
        this.assignForm.reset();
      },
    );
  }

  async revoke(assignmentId: number): Promise<void> {
    const confirmed = await this.confirmService.ask({
      title: 'Kiadás visszavonása',
      message: 'A diákok nem indíthatják többé. A már megírt eredmények megmaradnak.',
      confirmLabel: 'Visszavonás',
      cancelLabel: 'Mégsem',
      danger: true,
    });
    if (!confirmed) return;

    this.store.revokeAssignment(this.quizId, assignmentId, () => this.toastService.success('Kiadás visszavonva.'));
  }
}
