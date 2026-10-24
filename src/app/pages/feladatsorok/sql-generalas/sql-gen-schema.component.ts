import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReferenceSubtaskCheckDto, SqlGenerationResultDto } from '../../../models/teacher-content.model';

const REFERENCE_STATUS: Record<ReferenceSubtaskCheckDto['status'], { label: string; badge: string }> = {
  match: { label: 'ugyanazt adja, mint eddig', badge: 'badge-success' },
  ok: { label: 'lefutott', badge: 'badge-success' },
  different: { label: 'mást ad, mint eddig', badge: 'badge-warning' },
  error: { label: 'hiba', badge: 'badge-danger' },
  not_query: { label: 'nem lekérdezés', badge: 'badge-neutral' },
};

const TYPE_LABELS: Record<string, string> = {
  INTEGER: 'egész',
  DECIMAL: 'tizedes',
  TEXT: 'szöveg',
  DATE: 'dátum',
  DATETIME: 'dátum+idő',
  TIME: 'idő',
  BOOLEAN: 'logikai',
};

/**
 * A „Hiányzó SQL-fájl elkészítése” előnézetének csak olvasható része: az elkészült táblák (oszlopok, kulcsok, sorszámok)
 * és a feladatsor megoldásainak futtatása az új sémán.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-sql-gen-schema',
  standalone: true,
  host: { class: 'block space-y-4' },
  template: `
    <div>
      <h3 class="font-semibold text-sm mb-2">Táblák</h3>
      <div class="space-y-2">
        @for (t of result().tables; track t.name) {
          <div class="bg-bg-element rounded-xl p-3 text-sm" [attr.data-testid]="'sql-gen-table-' + t.name">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span class="font-mono font-semibold break-all">{{ t.name }}</span>
              <span class="text-xs text-text-muted">
                forrás: {{ t.source }} ·
                <span [class.text-danger]="t.actualRows !== null && t.actualRows !== t.expectedRows">
                  {{ t.actualRows ?? '–' }} / {{ t.expectedRows }} sor
                </span>
              </span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              @for (c of t.columns; track c.name) {
                <span class="badge badge-neutral !font-normal">
                  <span class="font-mono">{{ c.name }}</span>&nbsp;<span class="text-text-muted">{{ typeLabel(c.type) }}</span>
                  @if (c.primaryKey) { <span class="text-primary font-semibold">&nbsp;kulcs</span> }
                  @if (c.references) { <span class="text-secondary">&nbsp;→ {{ c.references }}</span> }
                </span>
              }
            </div>
          </div>
        }
      </div>
    </div>

    @if (result().referenceChecks.length > 0) {
      <div data-testid="sql-gen-reference-checks">
        <h3 class="font-semibold text-sm mb-1">A feladatsor megoldásai az új sémán</h3>
        <ul class="space-y-1 text-sm">
          @for (task of result().referenceChecks; track task.taskId) {
            @for (s of task.subtasks; track $index) {
              <li class="flex flex-wrap items-center gap-2">
                <span class="min-w-0">{{ task.taskTitle }} – {{ s.label }}</span>
                <span class="badge" [class]="referenceBadge(s)">{{ referenceLabel(s) }}</span>
                @if (s.rows !== null) { <span class="text-xs text-text-muted">{{ s.rows }} sor</span> }
                @if (s.message) { <span class="text-xs text-danger break-all">{{ s.message }}</span> }
              </li>
            }
          }
        </ul>
      </div>
    }
  `,
})
export class SqlGenSchemaComponent {
  readonly result = input.required<SqlGenerationResultDto>();

  typeLabel(type: string): string {
    return TYPE_LABELS[type] ?? type.toLowerCase();
  }

  referenceLabel(s: ReferenceSubtaskCheckDto): string {
    return REFERENCE_STATUS[s.status]?.label ?? s.status;
  }

  referenceBadge(s: ReferenceSubtaskCheckDto): string {
    return REFERENCE_STATUS[s.status]?.badge ?? 'badge-neutral';
  }
}
