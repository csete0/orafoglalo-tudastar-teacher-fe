import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { KahootHostStore } from '../../services/kahoot-host/kahoot-host.store';
import { IconComponent } from '../../shared/icon/icon.component';

/**
 * Élő (Kahoot-módú) játék vezérlő-képernyője - kivetítésre tervezve: nagy
 * join-kód a lobbyban, nagy kérdés/opciók játék közben. A teljes állapot a
 * KahootHostStore-ban él (hub-események + csatlakozási snapshot); a gombok a
 * hubon vezérelnek, a szerver atomi állapot-claimje a valódi védelem.
 *
 * Fázisok: lobby (kód + csatlakozók) → kérdés (élő válasz-számláló, kézi
 * zárás) → eredmény (helyes válasz, hisztogram, élmezőny, továbblépés) → vége
 * (dobogó + teljes lista + link az eredmény-oldalra).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-kahoot-host',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="max-w-4xl mx-auto px-4 py-8">

      @if (store.isReconnecting()) {
        <div class="card p-3 mb-4 flex items-center gap-2 text-sm text-warning">
          <span class="inline-block w-3.5 h-3.5 rounded-full border-2 border-warning border-t-transparent animate-spin"></span>
          Kapcsolat helyreállítása…
        </div>
      }

      <!-- ── Csatlakozás / hiba ─────────────────────────────── -->
      @if (store.phase() === 'connecting' || store.phase() === 'idle') {
        <div class="card p-10 text-center text-text-muted">Csatlakozás a játékhoz…</div>
      } @else if (store.phase() === 'error') {
        <div class="card p-10 text-center">
          <p class="text-danger font-medium mb-4">{{ store.error() }}</p>
          <a [routerLink]="['/feladatsorok', 'kvizek', quizId, 'szerkesztes']" class="btn btn-primary">
            Vissza a szerkesztőhöz
          </a>
        </div>
      } @else {

        <!-- ── Fejléc ─────────────────────────────────────────── -->
        <div class="flex items-center justify-between gap-3 mb-4">
          <div class="min-w-0">
            <h1 class="page-title truncate">{{ store.quizTitle() }}</h1>
            <p class="text-sm text-text-muted">
              {{ store.groupName() }} · élő játék · {{ store.questionCount() }} kérdés
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="badge badge-primary">
              <app-icon name="users" class="w-3.5 h-3.5 inline-block mr-1" />
              {{ store.participantCount() }}
            </span>
            @if (store.phase() !== 'ended') {
              <button type="button" class="btn btn-ghost text-danger" (click)="endGame()"
                      [disabled]="store.actionPending()">
                Játék befejezése
              </button>
            }
          </div>
        </div>

        @if (store.actionError(); as err) {
          <div class="card p-3 mb-4 text-sm text-danger">{{ err }}</div>
        }

        <!-- ── Lobby ──────────────────────────────────────────── -->
        @if (store.phase() === 'lobby') {
          <div class="card p-8 text-center mb-6">
            <p class="text-sm text-text-muted mb-2">Csatlakozás a diák-appban: Kvíz → Élő játék</p>
            @if (store.joinCode(); as code) {
              <p class="text-xs uppercase tracking-widest text-text-muted mb-1">Játék-kód</p>
              <p class="text-5xl font-black tracking-[0.3em] mb-4 select-all">{{ code }}</p>
            }
            <button type="button" class="btn btn-primary text-base px-8 py-3"
                    (click)="start()"
                    [disabled]="store.actionPending() || store.participantCount() === 0">
              Indítás
            </button>
            @if (store.participantCount() === 0) {
              <p class="text-sm text-text-muted mt-3">Várakozás az első csatlakozóra…</p>
            }
          </div>

          <div class="card p-5">
            <h2 class="font-bold mb-3">Csatlakozott diákok ({{ store.participantCount() }})</h2>
            <div class="flex flex-wrap gap-2">
              @for (name of store.participantNames(); track name) {
                <span class="badge badge-primary">{{ name }}</span>
              } @empty {
                <span class="text-sm text-text-muted">Még senki.</span>
              }
            </div>
          </div>
        }

        <!-- ── Futó kérdés ────────────────────────────────────── -->
        @if (store.phase() === 'question' && store.currentQuestion(); as q) {
          <div class="card p-6 mb-4">
            <div class="flex items-center justify-between mb-4">
              <span class="badge badge-primary">{{ q.index + 1 }} / {{ q.total }}. kérdés</span>
              <span class="text-3xl font-black tabular-nums"
                    [class.text-danger]="store.timeLeftSeconds() <= 5"
                    [class.text-warning]="store.timeLeftSeconds() > 5 && store.timeLeftSeconds() <= 10">
                {{ store.timeLeftSeconds() }}
              </span>
            </div>

            <h2 class="text-2xl font-bold leading-snug mb-6">{{ q.questionText }}</h2>

            @if (q.options.length) {
              <div class="grid gap-3 sm:grid-cols-2">
                @for (option of q.options; track option) {
                  <div class="rounded-xl border border-border-default px-4 py-3 text-base font-medium">
                    {{ option }}
                  </div>
                }
              </div>
            } @else {
              <p class="text-sm text-text-muted">
                Hiányos kitöltés — a diákok begépelik a hiányzó részt.
              </p>
            }
          </div>

          <div class="card p-5 flex items-center justify-between gap-4">
            <div>
              <p class="text-2xl font-black tabular-nums">
                {{ store.answeredCount() }} / {{ store.participantCount() }}
              </p>
              <p class="text-xs text-text-muted">válaszolt</p>
            </div>
            <button type="button" class="btn btn-primary" (click)="closeQuestion()"
                    [disabled]="store.actionPending()">
              Kérdés lezárása most
            </button>
          </div>
        }

        <!-- ── Eredmény (kérdés-zárás) ────────────────────────── -->
        @if (store.phase() === 'reveal') {
          @if (store.questionClosed(); as closed) {
            <div class="card p-6 mb-4">
              <div class="flex items-center justify-between mb-4">
                <span class="badge badge-success">
                  Helyes: {{ closed.correctAnswers.join(', ') }}
                </span>
                <span class="text-sm text-text-muted">
                  {{ closed.answerCount }} / {{ closed.participantCount }} válaszolt
                </span>
              </div>

              @if (closed.explanation) {
                <p class="text-sm text-text-muted mb-4">{{ closed.explanation }}</p>
              }

              @if (closed.optionCounts.length) {
                <ul class="space-y-2 mb-2">
                  @for (oc of closed.optionCounts; track oc.option) {
                    <li>
                      <div class="flex justify-between text-sm mb-0.5">
                        <span [class.text-success]="isCorrectOption(oc.option)"
                              [class.font-bold]="isCorrectOption(oc.option)">
                          @if (isCorrectOption(oc.option)) {
                            <app-icon name="check" class="w-4 h-4 inline-block mr-1" />
                          }
                          {{ oc.option }}
                        </span>
                        <span class="text-text-muted tabular-nums">{{ oc.count }}</span>
                      </div>
                      <div class="h-2.5 rounded-full bg-bg-element overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-500"
                             [class.bg-success]="isCorrectOption(oc.option)"
                             [class.bg-border-default]="!isCorrectOption(oc.option)"
                             [style.width.%]="optionPercent(closed, oc.count)"></div>
                      </div>
                    </li>
                  }
                </ul>
              }
            </div>

            @if (closed.top.length) {
              <div class="card p-5 mb-4">
                <h2 class="font-bold mb-3">Élmezőny</h2>
                <ol class="space-y-1.5">
                  @for (entry of closed.top; track entry.userId) {
                    <li class="flex items-center gap-3 text-sm">
                      <span class="w-6 text-center font-bold text-text-muted">{{ entry.rank }}.</span>
                      <span class="flex-1 truncate">{{ entry.name }}</span>
                      <span class="font-bold tabular-nums">{{ entry.totalPoints }}</span>
                    </li>
                  }
                </ol>
              </div>
            }
          } @else {
            <!-- F5 a reveal alatt: a zárás-payload nem őrződik, de a játék folytatható. -->
            <div class="card p-6 mb-4 text-center text-sm text-text-muted">
              Eredményhirdetés — a részletek a következő kérdésnél folytatódnak.
            </div>
          }

          <div class="flex justify-end gap-3">
            <button type="button" class="btn btn-primary text-base px-8 py-3"
                    (click)="next()" [disabled]="store.actionPending()">
              {{ store.hasNextQuestion() ? 'Következő kérdés' : 'Eredményhirdetés' }}
            </button>
          </div>
        }

        <!-- ── Játék vége ─────────────────────────────────────── -->
        @if (store.phase() === 'ended') {
          <div class="card p-8 text-center mb-4">
            <h2 class="text-2xl font-black mb-1">Vége a játéknak!</h2>
            <p class="text-sm text-text-muted">
              {{ store.finalLeaderboard().length }} résztvevő
            </p>
          </div>

          @if (store.finalLeaderboard().length) {
            <div class="card p-5 mb-6">
              <h2 class="font-bold mb-3">Végeredmény</h2>
              <ol class="space-y-1.5">
                @for (entry of store.finalLeaderboard(); track entry.userId) {
                  <li class="flex items-center gap-3 text-sm rounded-lg px-2 py-1.5"
                      [class.bg-primary-subtle]="entry.rank <= 3">
                    <span class="w-7 text-center font-bold"
                          [class.text-warning]="entry.rank <= 3"
                          [class.text-text-muted]="entry.rank > 3">
                      @if (entry.rank === 1) {
                        <app-icon name="trophy" class="w-4 h-4 inline-block" />
                      } @else { {{ entry.rank }}. }
                    </span>
                    <span class="flex-1 truncate font-medium">{{ entry.name }}</span>
                    <span class="text-xs text-text-muted">{{ entry.correctAnswers }} helyes</span>
                    <span class="font-bold tabular-nums w-14 text-right">{{ entry.totalPoints }}</span>
                  </li>
                }
              </ol>
            </div>
          }

          <div class="flex justify-end gap-3">
            <a [routerLink]="['/feladatsorok', 'kvizek', quizId, 'szerkesztes']" class="btn btn-ghost">
              Vissza a szerkesztőhöz
            </a>
            <a [routerLink]="['/feladatsorok', 'kvizek', quizId, 'eredmenyek']" class="btn btn-primary">
              Eredmények megnyitása
            </a>
          </div>
        }
      }
    </div>
  `,
})
export class KahootHostComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(KahootHostStore);

  readonly quizId = Number(this.route.snapshot.paramMap.get('id'));

  ngOnInit(): void {
    const kahootSessionId = Number(this.route.snapshot.paramMap.get('kahootSessionId'));
    if (!Number.isFinite(kahootSessionId) || kahootSessionId <= 0) {
      void this.router.navigate(['/feladatsorok', 'kvizek']);
      return;
    }
    void this.store.join(kahootSessionId);
  }

  ngOnDestroy(): void {
    void this.store.leave();
  }

  start(): void {
    void this.store.start();
  }

  next(): void {
    void this.store.next();
  }

  closeQuestion(): void {
    void this.store.closeQuestion();
  }

  endGame(): void {
    void this.store.endGame();
  }

  isCorrectOption(option: string): boolean {
    const closed = this.store.questionClosed();
    return !!closed?.correctAnswers.some(
      (c) => c.trim().toLowerCase() === option.trim().toLowerCase(),
    );
  }

  optionPercent(closed: { answerCount: number }, count: number): number {
    return closed.answerCount > 0 ? Math.round((count / closed.answerCount) * 100) : 0;
  }
}
