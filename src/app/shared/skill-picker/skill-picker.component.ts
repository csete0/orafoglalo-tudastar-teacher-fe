import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { MAX_REQUIRED_SKILLS, TeacherSkillDto } from '../../models/teacher-content.model';

const AREA_LABELS: Record<string, string> = { programozas: 'Programozás', adatbazis: 'SQL / adatbázis' };

/**
 * „Ajánlott előtte” témaválasztó: a tanár megjelöli, mely témákra épül a feladatsora. A diák a feladatsor
 * oldalán ezekhez kap gyakorló-ajánlást - ugyanúgy, mint a nyilvános érettségi/vizsga-soroknál. Nem kötelező.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-skill-picker',
  standalone: true,
  template: `
    <details class="rounded-lg border border-border-default" [open]="selected().length > 0">
      <summary class="cursor-pointer select-none px-3 py-2 text-sm">
        <span class="font-semibold">Ajánlott előtte</span>
        <span class="text-text-muted"> · {{ selected().length ? selected().length + ' téma kiválasztva' : 'elhagyható' }}</span>
      </summary>
      <div class="px-3 pb-3 space-y-3">
        <p class="text-xs text-text-muted">
          Mely témákra épül a feladatsor? A diákjaid a feladatsor megnyitásakor ezekhez kapnak gyakorló feladatsor-ajánlást.
          Legfeljebb {{ max }} téma.
        </p>
        @for (group of groups(); track group.area) {
          <fieldset>
            <legend class="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1">{{ group.label }}</legend>
            <div class="flex flex-wrap gap-2">
              @for (skill of group.skills; track skill.id) {
                <label class="inline-flex items-center gap-1.5 rounded-full border border-border-default px-2.5 py-1 text-sm"
                       [class.opacity-50]="!isSelected(skill.id) && full()" [title]="skill.description ?? ''">
                  <input type="checkbox" [checked]="isSelected(skill.id)" [disabled]="!isSelected(skill.id) && full()"
                         (change)="toggle(skill.id)" [attr.data-testid]="'skill-' + skill.id" />
                  {{ skill.name }}
                </label>
              }
            </div>
          </fieldset>
        }
      </div>
    </details>
  `,
})
export class SkillPickerComponent {
  readonly skills = input.required<TeacherSkillDto[]>();
  readonly selected = model<number[]>([]);
  readonly max = MAX_REQUIRED_SKILLS;

  readonly full = computed(() => this.selected().length >= this.max);
  readonly groups = computed(() => {
    const byArea = new Map<string, TeacherSkillDto[]>();
    for (const s of this.skills()) byArea.set(s.area, [...(byArea.get(s.area) ?? []), s]);
    return [...byArea.entries()].map(([area, skills]) => ({ area, label: AREA_LABELS[area] ?? area, skills }));
  });

  isSelected(id: number): boolean {
    return this.selected().includes(id);
  }

  toggle(id: number): void {
    this.selected.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < this.max ? [...ids, id] : ids));
  }
}
