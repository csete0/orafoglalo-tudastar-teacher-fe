import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { VizsgareszTerkepComponent } from '../../technikum/vizsgaresz-terkep.component';
import { CsoportCsapatokComponent } from '../../csapatok/csoport-csapatok.component';
import { VideoHelpComponent } from '../../../shared/video-help/video-help.component';

/**
 * Csoportoldal „Technikum” fül: felül a vizsgarész-térkép, alul a vizsgaremek-csapatok - mindkettő változatlanul
 * hosztolva. Hogy melyik látszik, a szülő dönti el (a fül maga is eltűnik, ha egyik sem elérhető).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-csoport-technikum',
  imports: [VizsgareszTerkepComponent, CsoportCsapatokComponent, VideoHelpComponent],
  template: `
    <div class="space-y-10">
      @if (showTerkep()) {
        <section aria-labelledby="vizsgaresz-terkep">
          <div class="flex items-center gap-1 mb-3">
            <h2 id="vizsgaresz-terkep" class="text-lg font-bold scroll-mt-20">Vizsgarész-térkép</h2>
            <app-video-help video="technikum" />
          </div>
          <app-vizsgaresz-terkep [groupId]="groupId()" (unavailable)="terkepUnavailable.emit()" />
        </section>
      }
      @if (showCsapatok()) {
        <section aria-labelledby="csapatok">
          <div class="flex items-center gap-1 mb-3">
            <h2 id="csapatok" class="text-lg font-bold scroll-mt-20">Csapatok</h2>
            <app-video-help video="csapatok" />
          </div>
          <app-csoport-csapatok [groupId]="groupId()" (unavailable)="csapatokUnavailable.emit()" />
        </section>
      }
    </div>
  `,
})
export class CsoportTechnikumComponent {
  readonly groupId = input.required<number>();
  readonly showTerkep = input(false);
  readonly showCsapatok = input(false);
  /** A térkép / a csapatok késői 404 FeatureDisabled-je - a szülő elrejti az adott blokkot. */
  readonly terkepUnavailable = output<void>();
  readonly csapatokUnavailable = output<void>();
}
