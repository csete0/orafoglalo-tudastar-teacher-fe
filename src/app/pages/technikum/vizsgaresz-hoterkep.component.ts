import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EXAM_PART_LABEL, ExamPartKey, HeatmapCellDto, HeatmapStudentDto, TechnikumHeatmapDto } from '../../models/technikum.model';
import { HEAT_CLASS, Heat, heat } from './heat';

/**
 * A vizsgarész-térkép táblázata jelmagyarázattal: diák × az öt gyakorlati rész + az elméleti teszt. A dolgozatból jövő cella a beadott
 * változatot kéri a szülőtől (`snapshotOpen`), a gyakorlásból jövő a projekt osztály-nézetébe visz a diák kódjához.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-vizsgaresz-hoterkep',
  imports: [RouterLink],
  host: { class: 'block' },
  styleUrl: './heat-cell.css',
  template: `
    @let m = map();
    <div class="flex flex-wrap gap-3 text-xs mb-3" role="group" aria-label="Jelmagyarázat">
      @for (l of legend; track l.heat) {
        <span class="inline-flex items-center gap-1.5"><span [class]="'legend-dot ' + heatClass[l.heat]" aria-hidden="true"></span>{{ l.label }}</span>
      }
    </div>

    <!-- relative: a cellák .sr-only (abszolút) szövegei is a görgető dobozon belül maradnak, különben 390 px-en az egész lap
         vízszintesen görgethető lesz (a táblázat a saját dobozában görög). -->
    <div class="card relative max-w-full overflow-x-auto" data-testid="heatmap-scroll">
      <table class="w-full text-sm" data-testid="heatmap">
        <thead>
          <tr class="text-left border-b border-border-default">
            <th class="py-2 px-3">Diák</th>
            @for (p of m.parts; track p.key) {
              <th class="py-2 px-2 text-center text-xs font-semibold">{{ partLabel[p.key] }}<span class="block font-normal text-text-muted">{{ p.maxPoints }} pont</span></th>
            }
            <th class="py-2 px-2 text-center text-xs font-semibold">Elméleti teszt<span class="block font-normal text-text-muted">{{ m.theoryMaxPoints }} pont</span></th>
          </tr>
        </thead>
        <tbody>
          @for (s of m.students; track s.userId) {
            <tr class="border-b border-border-default last:border-b-0" [attr.data-testid]="'heat-row-' + s.userId">
              <th scope="row" class="py-2 px-3 font-semibold whitespace-nowrap text-left">{{ s.name }}
                @if (s.leftGroup) {
                  <span class="badge badge-neutral !text-[0.625rem] font-normal" [attr.data-testid]="'left-group-' + s.userId"
                        title="A diák azóta kilépett vagy kikerült a csoportból - csak a tagként írt dolgozatai látszanak, csak olvasva">kilépett a csoportból</span>
                }
              </th>
              @for (p of m.parts; track p.key) {
                <td class="py-1.5 px-1.5 text-center">
                  @if (cellOf(s, p.key); as c) {
                    @if (c.fromClassTest && c.sessionId) {
                      <button type="button" [class]="'heat-cell ' + heatClass[heat(c.ratio)]" [class.heat-cell--failed]="c.gradingFailed" [class.heat-cell--ai-na]="!!c.aiNotEvaluatedPoints" [attr.title]="cellTitle(c)"
                              [attr.data-testid]="'cell-' + s.userId + '-' + p.key" (click)="snapshotOpen.emit(c.sessionId)">{{ c.points }}/{{ c.maxPoints }}@if (c.gradingFailed) {<span aria-hidden="true"> !</span><span class="sr-only"> – bírálat sikertelen</span>}@if (c.aiNotEvaluatedPoints) {<span aria-hidden="true">*</span><span class="sr-only"> – {{ c.aiNotEvaluatedPoints }} pont MI-szempont nem értékelt</span>}</button>
                    } @else if (c.assignmentId) {
                      <a [class]="'heat-cell ' + heatClass[heat(c.ratio)]" [class.heat-cell--failed]="c.gradingFailed" [class.heat-cell--ai-na]="!!c.aiNotEvaluatedPoints" [attr.title]="cellTitle(c)"
                         [attr.data-testid]="'cell-' + s.userId + '-' + p.key"
                         [routerLink]="['/feladatsorok/projektek/kiadas', c.assignmentId]" [queryParams]="{ diak: s.userId }">{{ c.points }}/{{ c.maxPoints }}@if (c.gradingFailed) {<span class="sr-only"> – bírálat sikertelen</span>}@if (c.aiNotEvaluatedPoints) {<span aria-hidden="true">*</span><span class="sr-only"> – {{ c.aiNotEvaluatedPoints }} pont MI-szempont nem értékelt</span>}</a>
                    } @else {
                      <span [class]="'heat-cell ' + heatClass[heat(c.ratio)]" [class.heat-cell--failed]="c.gradingFailed" [class.heat-cell--ai-na]="!!c.aiNotEvaluatedPoints" [attr.title]="cellTitle(c)"
                            [attr.data-testid]="'cell-' + s.userId + '-' + p.key">{{ c.points }}/{{ c.maxPoints }}@if (c.gradingFailed) {<span class="sr-only"> – bírálat sikertelen</span>}@if (c.aiNotEvaluatedPoints) {<span aria-hidden="true">*</span><span class="sr-only"> – {{ c.aiNotEvaluatedPoints }} pont MI-szempont nem értékelt</span>}</span>
                    }
                  } @else {
                    <span class="heat-cell heat-cell--empty"><span aria-hidden="true">–</span><span class="sr-only">nincs eredmény</span></span>
                  }
                </td>
              }
              <td class="py-1.5 px-1.5 text-center">
                @if (s.theory; as t) {
                  <span [class]="'heat-cell ' + heatClass[heat(t.ratio)]" [attr.data-testid]="'theory-' + s.userId">{{ t.points }}/{{ t.maxPoints }}</span>
                } @else {
                  <span class="heat-cell heat-cell--empty"><span aria-hidden="true">–</span><span class="sr-only">nincs eredmény</span></span>
                }
              </td>
            </tr>
          } @empty {
            <tr><td class="py-3 px-3 text-text-muted" [attr.colspan]="m.parts.length + 2">A csoportnak még nincs tagja.</td></tr>
          }
        </tbody>
      </table>
    </div>
    <p class="text-xs text-text-muted mt-2">
      Részenként a legjobb bírált eredmény; ha a diák írt belőle dolgozatot ebben a csoportban, az számít. Kattints a cellára:
      a dolgozat beadott változata a bírálattal (soronként megjegyzést írhatsz, a diák a közzététel után látja), a gyakorlás a diák kódja megjegyzésekkel. A felkiáltójeles, piros keretes
      dolgozat-rész bírálata végleg sikertelen volt, ezért 0 pontnak számít. A csillagos, szaggatott keretes rész MI-szempontjait
      nem értékeltük (elfogyott MI-keret vagy MI-hiba): azok 0 pontot kaptak, a gépi tesztek pontja megmaradt - dolgozatnál a
      cellára kattintva látod, mely szempontok ezek, és kézzel pontozhatod őket.
    </p>
  `,
})
export class VizsgareszHoterkepComponent {
  readonly map = input.required<TechnikumHeatmapDto>();
  /** Dolgozat-cellára kattintva: a beadott dolgozat munkamenet-azonosítója. */
  readonly snapshotOpen = output<number>();

  readonly partLabel = EXAM_PART_LABEL;
  readonly heat = heat;
  readonly heatClass = HEAT_CLASS;
  readonly legend: { heat: Heat; label: string }[] = [
    { heat: 'fail', label: '40% alatt (nem felelt meg)' },
    { heat: 'low', label: '40–59%' },
    { heat: 'mid', label: '60–79%' },
    { heat: 'high', label: '80% és fölötte' },
  ];

  cellOf(s: HeatmapStudentDto, part: ExamPartKey): HeatmapCellDto | undefined {
    return s.cells.find((c) => c.partKey === part);
  }

  cellTitle(c: HeatmapCellDto): string {
    const source = c.fromClassTest ? 'dolgozat' : c.source === 'exam' ? 'próbavizsga' : 'gyakorlás';
    const failed = c.gradingFailed ? ' – a bírálat végleg sikertelen, 0 pontnak számít' : '';
    const ai = c.aiNotEvaluatedPoints ? ` – ${c.aiNotEvaluatedPoints} pont MI-szempont nem értékelt (MI-keret / MI-hiba), 0 pontnak számít` : '';
    return `${c.projectTitle} – ${source}, ${Math.round(c.ratio * 100)}%${failed}${ai}`;
  }
}
