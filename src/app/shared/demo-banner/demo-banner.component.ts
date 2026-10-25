import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthStore } from '../../services/auth/store/auth.store';

/**
 * Vékony, nem eltakaró szalag demó-fiókban (PATRICKS-DEMO-KORNYEZET-TERV.md F6): „DEMÓ · {cím} · lejár: {dátum}”, a saját
 * demónál „minden éjjel alaphelyzetbe áll”.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-demo-banner',
  imports: [DatePipe],
  template: `
    @if (demo(); as d) {
      <div class="demo-banner print:hidden" role="status" data-testid="demo-banner">
        <span class="font-bold tracking-wide">DEMÓ</span>
        <span aria-hidden="true">·</span>
        <span class="truncate">{{ d.title }}</span>
        <span aria-hidden="true">·</span>
        @if (d.nightlyReset) {
          <span>minden éjjel alaphelyzetbe áll</span>
        } @else if (expires(); as at) {
          <span>lejár: {{ at | date: 'yyyy. MM. dd. HH:mm' }}</span>
        }
      </div>
    }
  `,
  styles: `
    .demo-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      min-width: 0;
      padding: 0.15rem 0.75rem;
      font-size: 0.75rem;
      line-height: 1.25rem;
      color: var(--color-warning);
      background-color: var(--color-warning-subtle);
      border-bottom: 1px solid var(--color-warning);
    }
  `,
})
export class DemoBannerComponent {
  private readonly authStore = inject(AuthStore);
  readonly demo = this.authStore.demo;
  /** A BE zóna nélkül küldött UTC időpontja helyi időre. */
  readonly expires = computed(() => {
    const at = this.demo()?.expiresAt;
    return at ? new Date(/[zZ]|[+-]\d\d:\d\d$/.test(at) ? at : `${at}Z`) : null;
  });
}
