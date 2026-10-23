import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { KahootHostStore } from '../../../services/kahoot-host/kahoot-host.store';
import { CopyButtonComponent } from '../../../shared/copy-button/copy-button.component';
import { QrCodeComponent } from '../../../shared/qr-code/qr-code.component';

/** Az élő játék lobbyja a vezérlő-képernyőn: kivetíthető játék-kód (QR-ral), a csatlakozók és az Indítás. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-kahoot-lobby',
  host: { class: 'block' },
  standalone: true,
  imports: [CopyButtonComponent, QrCodeComponent],
  template: `
    <div class="card p-8 text-center mb-6">
      <p class="text-sm text-text-muted mb-2">Csatlakozás a diák-appban: Kvíz → Élő játék</p>
      @if (store.joinCode(); as code) {
        <p class="text-xs uppercase tracking-widest text-text-muted mb-1">Játék-kód</p>
        <p class="text-5xl font-black tracking-[0.3em] mb-1 select-all">{{ code }}</p>
        <div class="flex items-center justify-center gap-2 mb-4">
          <app-copy-button [value]="code" label="Játék-kód" />
          <button type="button" (click)="qrVisible.set(!qrVisible())"
            class="btn btn-ghost !px-2 !py-1 !text-xs">
            {{ qrVisible() ? 'QR elrejtése' : 'QR-kód kivetítéshez' }}
          </button>
        </div>
        <!-- UI-UX-T1: a QR a diák-app kvíz-oldalára visz - ott az "Élő játék most"
             blokk egy kattintás (a belépést a csoporttagság kapuzza, a kód csak
             keresés-könnyítés). -->
        @if (qrVisible()) {
          <div class="flex justify-center mb-4">
            <app-qr-code [value]="studentQuizUrl" [size]="280" />
          </div>
        }
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
  `,
})
export class KahootLobbyComponent {
  readonly store = inject(KahootHostStore);

  readonly qrVisible = signal(false);
  readonly studentQuizUrl = environment.studentAppUrl + '/quiz';

  start(): void {
    void this.store.start();
  }
}
