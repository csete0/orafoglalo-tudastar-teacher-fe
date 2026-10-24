import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CodeSuggestion, TeamRepoReview } from '../../models/team.model';

/** Egy MI-repóátnézés kártyája a csapat „MI-átnézés” fülén: állapot, értékelési szempontok, dokumentáció-lista, soronkénti javaslatok. */
@Component({
  selector: 'app-csapat-atnezes',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // block: a szülő „space-y-3” térköze a host elemre esik
  host: { class: 'block' },
  template: `
    @let x = review();
    <article class="card p-3 space-y-2 text-sm min-w-0" [attr.data-testid]="'review-' + x.id">
      <h3 class="font-bold break-words">{{ x.createdAt | date: 'yyyy.MM.dd. HH:mm' }} · ág: {{ x.branch }}{{ x.requestedByName ? ' · ' + x.requestedByName : '' }}
        @if (notCounted(x)) { <span class="badge badge-neutral font-normal">nem számít bele a keretbe</span> }</h3>
      @if (x.status === 'queued') { <p role="status">Sorban áll…</p> }
      @else if (x.status === 'running') { <p role="status">Az MI átnézi a tárolót…</p> }
      @else {
        @if (x.error) { <p class="text-danger">{{ x.error }}</p> }
        @if (x.result; as res) {
          @if (res.summary) { <p>{{ res.summary }}</p> }
          <ul class="list-disc pl-5">@for (c of res.criteria; track c.key) { <li><strong>{{ c.label }}: {{ c.score }}/5</strong> – {{ c.text }}</li> }</ul>
          @if (res.docsChecklist; as docs) {
            <p class="font-semibold">Dokumentáció – a 7 kötelező elem</p>
            <ul class="break-words" data-testid="review-docs">
              @for (i of docs; track i.key) {
                <li><span [class]="i.present ? 'text-success' : 'text-danger'" aria-hidden="true">{{ i.present ? '✔' : '✘' }}</span> {{ i.label }} – {{ i.present ? 'megvan' : 'hiányzik' }}
                  @if (i.note) { <span class="block text-xs text-text-muted">{{ i.note }}</span> }</li>
              }
            </ul>
          }
          @for (s of res.suggestions; track $index) {
            <p class="break-words" [class.text-danger]="s.severity === 'hiba'"><code>{{ s.path }}:{{ s.line }}</code> {{ severityLabel(s) }}: {{ s.text }}</p>
          }
          <p class="text-xs text-text-muted">Átnézett fájlok: {{ res.reviewedPaths.length }}{{ res.truncatedPaths.length ? ' (ebből ' + res.truncatedPaths.length + ' csak részben)' : '' }};
            kihagyva (függőség, generált, bináris, keret): {{ res.skippedFiles }}.</p>
        } @else if (!x.error) { <p class="text-danger">Az átnézés nem sikerült.</p> }
      }
    </article>
  `,
})
export class CsapatAtnezesComponent {
  readonly review = input.required<TeamRepoReview>();

  /** A sikertelen / csonka (és a BE szerint nem számolt) befejezett átnézés sem a csapat, sem a tanár keretéből nem fogy. */
  notCounted(x: TeamRepoReview): boolean {
    return x.status !== 'queued' && x.status !== 'running' && (x.status === 'failed' || x.status === 'truncated' || !x.counted);
  }
  severityLabel(s: CodeSuggestion): string { return s.severity === 'hiba' ? 'Hiba' : s.severity === 'dicséret' ? 'Dicséret' : 'Javaslat'; }
}
