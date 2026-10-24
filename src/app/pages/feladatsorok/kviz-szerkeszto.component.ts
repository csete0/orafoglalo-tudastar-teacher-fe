import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { QuizAuthoringScope, QuizTopicOptionDto } from '../../models/teacher-quiz.model';
import { GroupStore } from '../../services/group/group.store';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { TeacherQuizService } from '../../services/teacher-quiz/teacher-quiz.service';
import { TeacherQuizStore } from '../../services/teacher-quiz/teacher-quiz.store';
import { QuizAiComponent } from './kviz-szerkeszto/quiz-ai.component';
import { QuizAssignComponent } from './kviz-szerkeszto/quiz-assign.component';
import { QuizBankSearchComponent } from './kviz-szerkeszto/quiz-bank-search.component';
import { QuizLiveComponent } from './kviz-szerkeszto/quiz-live.component';
import { QuizPublishComponent } from './kviz-szerkeszto/quiz-publish.component';
import { QuizQuestionFormComponent } from './kviz-szerkeszto/quiz-question-form.component';
import { QuizQuestionListComponent } from './kviz-szerkeszto/quiz-question-list.component';
import { QuizSettingsComponent } from './kviz-szerkeszto/quiz-settings.component';

/**
 * Tanári kvíz-szerkesztő: beállítások, kérdések (típusonként eltérő űrlappal),
 * AI-generálás jóváhagyással, publikálás, csoportnak kiadás. Az oldal a fejlécet, a
 * szekció-navigációt és a szekció-kereteket adja; a szekciók tartalma a
 * `kviz-szerkeszto/` alkomponensekben van.
 *
 * C5: admin-scope-ban (`/admin/kvizek/:id/szerkesztes`, route `data: { scope: 'admin' }`)
 * ugyanez a szerkesztő a platform-kvízeket kezeli. A különbség csak annyi, aminek a
 * platform-kvíznél nincs értelme: nincs csoport, tehát nincs Kiadás és Élő játék szekció
 * (és a csoport-lista betöltése sem indul), nincs Eredmények-link; a publikálás mellett
 * viszont van Visszavonás (a diákok elől). A tanári nézet DOM-ja bitre változatlan.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-kviz-szerkeszto',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  standalone: true,
  imports: [RouterLink, QuizSettingsComponent, QuizQuestionListComponent, QuizQuestionFormComponent,
    QuizBankSearchComponent, QuizAiComponent, QuizPublishComponent, QuizLiveComponent, QuizAssignComponent],
  template: `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <div class="flex items-center gap-4">
        <a [routerLink]="listLink" class="text-sm text-text-muted hover:underline">{{ isAdmin ? '← Platform-kvízek' : '← Kvízeim' }}</a>
        @if (!isAdmin) {
          <a [routerLink]="['/feladatsorok', 'kvizek', quizId, 'eredmenyek']"
             class="text-sm text-text-muted hover:underline ml-auto">Eredmények →</a>
        }
      </div>

      @if (store.error()) {
        <p class="text-danger text-sm mt-4">{{ store.error() }}</p>
      }

      @if (detail(); as quiz) {
        <div class="flex flex-wrap items-start gap-3 mt-3">
          <h1 class="page-title flex-1 min-w-48 break-words">{{ quiz.title }}</h1>
          <span class="badge shrink-0" [class]="badgeClass()">{{ badgeLabel() }}</span>
          <button type="button" class="btn btn-ghost text-sm shrink-0" [disabled]="store.loading()"
                  (click)="cloneQuiz()" title="Kvíz másolása piszkozatként">
            ⧉ Klónozás
          </button>
        </div>

        @if (quiz.takedownAt) {
          <p class="text-danger text-sm mt-2">
            Ezt a kvízt a platform-admin visszavonta{{ quiz.takedownReason ? ': ' + quiz.takedownReason : '' }}.
            A tartalma nem módosítható, és csak admin adhatja ki újra.
          </p>
        }

        <div class="hairline"></div>

        <!-- ── UI-UX-T8: ragadós szekció-navigáció - 10+ kérdésnél a lap hosszú,
             a lap alji Kiadás/Élő szekciók e nélkül "eltűnnek". A sorrend a
             munkafolyamatot követi: tartalom → publikálás → kiadás. -->
        <nav class="sticky top-14 lg:top-0 z-20 -mx-4 px-4 py-2 mb-6 flex gap-1 overflow-x-auto
                    bg-bg-panel/95 backdrop-blur border-b border-border-default text-sm"
             aria-label="Szekciók">
          @for (anchor of sectionAnchors; track anchor.id) {
            <button type="button" (click)="scrollToSection(anchor.id)"
               class="px-3 py-1 rounded-lg whitespace-nowrap text-text-muted hover:text-text-primary hover:bg-bg-element cursor-pointer">
              {{ anchor.label }}</button>
          }
        </nav>

        <!-- ── Beállítások ────────────────────────────────────── -->
        <section id="beallitasok" aria-label="Beállítások" class="card p-5 mb-6 scroll-mt-24">
          <app-quiz-settings [quizId]="quizId" [quiz]="quiz" [isAdmin]="isAdmin" />
        </section>

        <!-- ── Kérdések ───────────────────────────────────────── -->
        <section id="kerdesek" aria-label="Kérdések" class="card p-5 mb-6 scroll-mt-24">
          <h2 class="font-bold mb-3">Kérdések</h2>
          <app-quiz-question-list [quizId]="quizId" [questions]="quiz.questions"
                                  (edit)="questionForm()?.startEdit($event)" />
          <app-quiz-question-form [quizId]="quizId" [topics]="topics()" />
          <app-quiz-bank-search [quizId]="quizId" [topics]="topics()" />
        </section>

        <!-- ── AI-generálás ───────────────────────────────────── -->
        <section id="ai" aria-label="AI-generálás" class="card p-5 mb-6 scroll-mt-24">
          <app-quiz-ai [quizId]="quizId" [quiz]="quiz" [topics]="topics()" [isAdmin]="isAdmin" />
        </section>

        <!-- ── Publikálás ─────────────────────────────────────── -->
        <section id="publikalas" aria-label="Publikálás" class="card p-5 mb-6 scroll-mt-24">
          <app-quiz-publish [quizId]="quizId" [quiz]="quiz" [isAdmin]="isAdmin" />
        </section>

        @if (!isAdmin) {
        <!-- ── Élő játék (Kahoot-mód) ─────────────────────────── -->
        <section id="elo" aria-label="Élő játék" class="card p-5 mb-6 scroll-mt-24">
          <app-quiz-live [quizId]="quizId" [quiz]="quiz" />
        </section>

        <!-- ── Kiadás csoportnak ──────────────────────────────── -->
        <section id="kiadas" aria-label="Kiadás csoportnak" class="card p-5 scroll-mt-24">
          <app-quiz-assign [quizId]="quizId" [quiz]="quiz" />
        </section>
        }
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
  private readonly route = inject(ActivatedRoute);
  private readonly quizService = inject(TeacherQuizService);
  private readonly groupStore = inject(GroupStore);
  private readonly confirmService = inject(ConfirmService);
  readonly store = inject(TeacherQuizStore);

  readonly quizId = Number(this.route.snapshot.paramMap.get('id'));
  /** C5: a route `data.scope`-ja dönti el, tanári vagy admin (platform-kvíz) nézet-e. */
  readonly scope: QuizAuthoringScope = this.route.snapshot.data?.['scope'] ?? 'teacher';
  readonly isAdmin = this.scope === 'admin';
  readonly listLink = this.isAdmin ? '/admin/kvizek' : '/feladatsorok/kvizek';
  readonly detail = computed(() => {
    const detail = this.store.selectedDetail();
    // A store `providedIn: 'root'`: navigáció után átmenetileg még az ELŐZŐ kvíz adata
    // ülhet benne. Csak a saját id-nkhez tartozót jelenítjük meg.
    return detail?.id === this.quizId ? detail : null;
  });

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

  /** A „Szerkesztés” a kérdéslistából a kérdés-űrlapba tölt. */
  protected readonly questionForm = viewChild(QuizQuestionFormComponent);
  private readonly settings = viewChild(QuizSettingsComponent);

  // ── UI-UX-T8 ── (C5: admin-scope-ban a csoport-függő Élő játék/Kiadás szekció nincs)
  readonly sectionAnchors = [
    { id: 'beallitasok', label: 'Beállítások' },
    { id: 'kerdesek', label: 'Kérdések' },
    { id: 'ai', label: 'AI' },
    { id: 'publikalas', label: 'Publikálás' },
    ...(this.isAdmin ? [] : [
      { id: 'elo', label: 'Élő játék' },
      { id: 'kiadas', label: 'Kiadás' },
    ]),
  ];

  constructor() {
    this.store.setScope(this.scope);
    // A betöltés végén a beállítás-űrlap a friss adatokkal töltődik (ha a szekció már
    // látszott egy korábbi, ugyanehhez a kvízhez tartozó állapotból; különben a szekció
    // létrejöttekor maga tölti fel magát).
    this.store.loadDetail(this.quizId, () => {
      const quiz = this.detail();
      if (quiz) this.settings()?.sync(quiz);
    });
    // Platform-kvíznek nincs csoportja - a /api/groups tanári végpont, admin-only fióknál
    // csak egy fölösleges (és hibázó) hívás lenne.
    if (!this.isAdmin) this.groupStore.loadMine();
  }

  /**
   * UI-TT-245: mentetlen beállítás vagy kérdés-piszkozat (a testvér-szerkesztők mintájára). Betöltött kvíz nélkül
   * (pl. a sikeres törlés után, amely a store-ból is kiveszi) nincs mit elveszíteni - a listára visszavivő navigáció ne kérdezzen.
   */
  hasUnsavedChanges(): boolean {
    if (!this.detail()) return false;
    return !!this.settings()?.settingsForm.dirty || !!this.questionForm()?.questionForm.dirty;
  }

  /** Route canDeactivate: mentetlen módosításnál megerősítés (SPA-navigáció). */
  canLeave(): boolean | Promise<boolean> {
    if (!this.hasUnsavedChanges()) return true;
    return this.confirmService.ask({
      title: 'Elveted a módosításokat?',
      message: 'A kvízen mentetlen módosításaid vannak (beállítás vagy kérdés). Ha most továbblépsz, elvesznek.',
      confirmLabel: 'Elvetem',
      cancelLabel: 'Maradok',
      danger: true,
    });
  }

  /** Újratöltés / lap bezárása: a böngésző saját megerősítése. */
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
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

  cloneQuiz(): void {
    this.store.cloneQuiz(this.quizId, (newId) => {
      // router.navigate újrahasználná a komponens-példányt (stale readonly quizId) — full reload kell.
      window.location.href = `/feladatsorok/kvizek/${newId}/szerkesztes`;
    });
  }

  /**
   * BUG UI-TT-228: a fülek korábban plain `<a [href]="'#' + anchor.id">` linkek voltak - az
   * `index.html`-ben deklarált `<base href="/">` és az üres-path `{ path: '', redirectTo:
   * '/dashboard' }` route kombinációja miatt egy `href="#kerdesek"` kattintás NEM lapon
   * belüli görgetést váltott ki, hanem a böngésző a fragmentet `/`-re oldotta fel, amit az
   * üres-path route AZONNAL `/dashboard`-ra irányított - a teljes szerkesztő megsemmisült,
   * egy még be nem küldött kérdés-piszkozattal együtt, figyelmeztetés nélkül. Kézi görgetés,
   * navigáció nélkül - így a `<base href>` sosem kerül képbe.
   */
  scrollToSection(sectionId: string): void {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
