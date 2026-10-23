import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../icon/icon.component';

/**
 * A tanári oktatóvideók, amelyekre a képernyők „?” súgója mutat (id = a manifest bejegyzése, `/srv/patricks/tutorial-videos/manifest.json`;
 * a cím csak az akadálymentes névhez kell). Új videónál ide kell felvenni, és a megfelelő képernyőre tenni egy `<app-video-help>`-et.
 */
export const HELP_VIDEOS = {
  csoportok: { id: 't1-csoport-letrehozasa', title: 'Csoport létrehozása és diákok meghívása' },
  kiadas: { id: 't2-kiadas-es-dolgozat', title: 'Feladatsor és dolgozat kiadása' },
  eredmenyek: { id: 't3-eredmenyek-kozzetetel', title: 'Eredmények, dolgozat-áttekintés, közzététel' },
  katalogus: { id: 't4-katalogus-masolas', title: 'Saját feladatsor a katalógusból' },
  irodai: { id: 't5-irodai-megoldasbol', title: 'Irodai feladat a megoldott fájlból' },
  eloJatek: { id: 't6-elo-jatek', title: 'Élő játék indítása' },
  technikum: { id: 't7-technikum-probavizsga', title: 'Technikumi próbavizsga – tanári nézet' },
  csapatok: { id: 't8-csapatok-github', title: 'Csapatok és GitHub-tükrözés' },
} as const;

export type HelpVideoKey = keyof typeof HELP_VIDEOS;

/**
 * Kis, környezetfüggő „?” súgó-link: az Oktatóvideók oldalt nyitja a képernyőhöz tartozó videóval (`?v=<id>`). Prémium nélkül az
 * oldal fizetőfalat mutat. Akadálymentes név és tooltip: „Oktatóvideó: <cím>”.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-video-help',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <a routerLink="/oktatovideok" [queryParams]="{ v: entry().id }" [attr.aria-label]="label()" [title]="label()"
      class="inline-flex items-center justify-center w-7 h-7 shrink-0 rounded-full text-text-muted hover:text-primary hover:bg-bg-element outline-none focus-visible:ring-2 focus-visible:ring-primary align-middle"
      data-testid="video-help">
      <app-icon name="question" class="w-5 h-5 block" />
    </a>
  `,
})
export class VideoHelpComponent {
  readonly video = input.required<HelpVideoKey>();
  readonly entry = computed(() => HELP_VIDEOS[this.video()]);
  readonly label = computed(() => `Oktatóvideó: ${this.entry().title}`);
}
