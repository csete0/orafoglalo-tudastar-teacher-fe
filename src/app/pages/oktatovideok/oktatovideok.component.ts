import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { TutorialVideo, TutorialVideoCategory, formatDuration } from '../../models/tutorial-video.model';
import { TutorialVideoService } from '../../services/tutorial-video/tutorial-video.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { AuthStore } from '../../services/auth/store/auth.store';

export const TUTORIAL_PREMIUM_MESSAGE =
  'Az oktatóvideók Prémium előfizetéssel érhetők el: rövid bemutatók a csoportokról, a kiadásról, az eredményekről és a feladatsorokról.';

type State = 'loading' | 'ready' | 'locked' | 'error';

/**
 * Oktatóvideók (csak Prémium tanárnak): kategóriánként kártyák, felül natív lejátszó. A lejátszási URL aláírt és rövid életű;
 * ha lejárt (pl. sokáig szüneteltetett videó tekerésénél), a lejátszó egyszer új URL-t kér, és ugyanonnan folytatja.
 * A `?v=<id>` lekérdezés-paraméter a videót nyitja meg (későbbi környezetfüggő „?” linkekhez).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-oktatovideok',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="max-w-5xl mx-auto px-4 py-10">
      <h1 class="page-title">Oktatóvideók</h1>
      <p class="text-sm text-text-muted mt-1">Rövid bemutatók a tanári felület használatához</p>
      <div class="hairline"></div>

      @switch (state()) {
        @case ('loading') {
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div class="skeleton aspect-video"></div>
            <div class="skeleton aspect-video"></div>
            <div class="skeleton aspect-video"></div>
          </div>
        }
        @case ('locked') {
          <div class="card p-6 flex flex-col sm:flex-row items-start gap-4" data-testid="tutorial-locked">
            <div class="icon-tile icon-tile-warning">
              <app-icon name="lock" class="w-6 h-6 block" />
            </div>
            <div class="space-y-3 min-w-0">
              <p class="font-bold">Prémium funkció</p>
              <p class="text-sm text-text-muted">{{ premiumMessage }}</p>
              @if (!isDemo()) {
                <a [href]="subscriptionUrl" target="_blank" rel="noopener" class="btn btn-primary">Prémium előfizetés</a>
              }
            </div>
          </div>
        }
        @case ('error') {
          <p class="text-danger text-sm" role="alert">Az oktatóvideók betöltése nem sikerült. Próbáld újra később.</p>
        }
        @default {
          @if (selected(); as video) {
            <section #player class="card overflow-hidden mb-8 scroll-mt-20" data-testid="tutorial-player" aria-labelledby="tutorial-player-title">
              <div class="bg-black aspect-video">
                @if (videoUrl(); as src) {
                  <video [src]="src" [attr.poster]="video.posterUrl" controls playsinline preload="metadata"
                    class="w-full h-full" (error)="onVideoError($event)">
                    A böngésződ nem tudja lejátszani ezt a videót.
                  </video>
                }
              </div>
              <div class="p-4 flex items-start gap-3">
                <div class="min-w-0 flex-1">
                  <h2 id="tutorial-player-title" class="font-bold">{{ video.title }}</h2>
                  @if (video.description) {
                    <p class="text-sm text-text-muted mt-1">{{ video.description }}</p>
                  }
                  @if (playError()) {
                    <p class="text-danger text-sm mt-2" role="alert">A videó nem tölthető be. Próbáld újra később.</p>
                  }
                </div>
                <button type="button" (click)="close()" aria-label="Lejátszó bezárása" title="Bezárás" class="btn btn-ghost !px-2 shrink-0">
                  <app-icon name="x" class="w-5 h-5 block" />
                </button>
              </div>
            </section>
          }

          @for (category of categories(); track category.name) {
            <section class="mb-8" [attr.aria-label]="category.name">
              <h2 class="text-lg font-bold mb-3">{{ category.name }}</h2>
              <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                @for (video of category.videos; track video.id) {
                  <li>
                    <button type="button" (click)="play(video)" [attr.aria-pressed]="selected()?.id === video.id"
                      class="card-link w-full h-full text-left flex flex-col group outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      [class.!border-primary]="selected()?.id === video.id" data-testid="tutorial-card">
                      <div class="relative aspect-video bg-bg-element flex items-center justify-center">
                        @if (video.posterUrl) {
                          <img [src]="video.posterUrl" alt="" loading="lazy" class="absolute inset-0 w-full h-full object-cover" />
                        }
                        <span class="relative w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-md transition-transform group-hover:scale-110">
                          <app-icon name="play" class="w-6 h-6 block" />
                        </span>
                        <span class="absolute bottom-2 right-2 badge badge-neutral !bg-bg-panel">{{ duration(video.durationSeconds) }}</span>
                      </div>
                      <div class="p-4 space-y-1">
                        <p class="font-bold">{{ video.title }}</p>
                        @if (video.description) {
                          <p class="text-sm text-text-muted line-clamp-2">{{ video.description }}</p>
                        }
                      </div>
                    </button>
                  </li>
                }
              </ul>
            </section>
          } @empty {
            <div class="flex flex-col items-center py-10 gap-3 text-center">
              <div class="icon-tile icon-tile-neutral">
                <app-icon name="play" class="w-6 h-6 block" />
              </div>
              <p class="font-semibold">Hamarosan érkeznek az első oktatóvideók.</p>
            </div>
          }
        }
      }
    </div>
  `,
})
export class OktatovideokComponent implements OnInit {
  private readonly api = inject(TutorialVideoService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  /** Demó-fiókban (PATRICKS-DEMO-KORNYEZET-TERV.md F6) nincs vásárlásra mutató link. */
  readonly isDemo = inject(AuthStore).isDemo;
  private readonly player = viewChild<ElementRef<HTMLElement>>('player');

  readonly premiumMessage = TUTORIAL_PREMIUM_MESSAGE;
  readonly subscriptionUrl = `${environment.studentAppUrl}/subscriptions`;
  readonly duration = formatDuration;

  readonly state = signal<State>('loading');
  readonly categories = signal<TutorialVideoCategory[]>([]);
  readonly selected = signal<TutorialVideo | null>(null);
  readonly videoUrl = signal<string | null>(null);
  readonly playError = signal(false);
  /** A lejárt jegy miatti újrakérés csak egyszer próbálkozik videónként (különben egy hibás fájl végtelen ciklust adna). */
  private retried = false;

  ngOnInit(): void {
    this.api.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (list) => {
        this.categories.set(list.categories);
        this.state.set('ready');
        const id = this.route.snapshot.queryParamMap.get('v');
        const video = id ? list.categories.flatMap((c) => c.videos).find((v) => v.id === id) : undefined;
        if (video) this.play(video);
      },
      error: (err: HttpErrorResponse) =>
        this.state.set(err.status === 403 && err.error?.errorType === 'SubscriptionRequired' ? 'locked' : 'error'),
    });
  }

  play(video: TutorialVideo): void {
    if (this.selected()?.id === video.id && this.videoUrl()) {
      this.scrollToPlayer();
      return;
    }
    this.selected.set(video);
    this.videoUrl.set(null);
    this.playError.set(false);
    this.retried = false;
    this.router.navigate([], { queryParams: { v: video.id }, replaceUrl: true });
    this.loadUrl(video.id, null);
  }

  close(): void {
    this.selected.set(null);
    this.videoUrl.set(null);
    this.router.navigate([], { queryParams: { v: null }, replaceUrl: true });
  }

  /** Lejárt / érvénytelen jegy: egyszer új URL, ugyanattól a ponttól folytatva. */
  onVideoError(event: Event): void {
    const video = this.selected();
    if (!video) return;
    if (this.retried) {
      this.playError.set(true);
      return;
    }
    this.retried = true;
    this.loadUrl(video.id, (event.target as HTMLVideoElement).currentTime || null);
  }

  private loadUrl(id: string, resumeAt: number | null): void {
    this.api.streamUrl(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (url) => {
        if (this.selected()?.id !== id) return;
        this.videoUrl.set(resumeAt ? `${url}#t=${resumeAt}` : url);
        this.scrollToPlayer();
      },
      error: () => {
        if (this.selected()?.id === id) this.playError.set(true);
      },
    });
  }

  private scrollToPlayer(): void {
    setTimeout(() => this.player()?.nativeElement.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  }
}
