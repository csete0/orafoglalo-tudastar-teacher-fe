import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GroupStore } from '../../services/group/group.store';
import { SchoolStore } from '../../services/school/school.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-csoportok-lista',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="max-w-2xl mx-auto px-4 py-10">
      <h1 class="text-xl font-semibold mb-6">Csoportjaim</h1>

      @if (store.error()) {
        <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
      }
      @if (store.loading()) {
        <p class="text-text-muted">Betöltés…</p>
      }

      <ul class="space-y-2 mb-8">
        @for (group of store.groups(); track group.id) {
          <li>
            <a [routerLink]="['/csoportok', group.id]"
              class="flex justify-between bg-bg-panel border border-border-default rounded-lg p-4 hover:border-primary">
              <span>
                {{ group.name }}
                @if (group.schoolName) {
                  <span class="text-text-muted text-sm"> · {{ group.schoolName }}</span>
                }
                @if (group.isArchived) {
                  <span class="text-text-muted text-sm"> (archivált)</span>
                }
              </span>
              <span class="text-sm text-text-muted">{{ group.memberCount }} tag</span>
            </a>
          </li>
        }
        @empty {
          <li class="text-text-muted">Még nincs csoportod.</li>
        }
      </ul>

      <form [formGroup]="createForm" (ngSubmit)="create()" class="bg-bg-panel border border-border-default rounded-lg p-4 space-y-3">
        <h2 class="font-medium">Új csoport</h2>
        <input formControlName="name" placeholder="Csoport neve (pl. 11.A)"
          class="w-full rounded border border-border-default bg-bg-element px-3 py-2" />

        @if (schoolStore.schools().length > 0) {
          <select formControlName="schoolId" class="w-full rounded border border-border-default bg-bg-element px-3 py-2">
            <option [ngValue]="null">Nincs intézményhez kötve (magántanár)</option>
            @for (school of schoolStore.schools(); track school.id) {
              <option [ngValue]="school.id">{{ school.name }}</option>
            }
          </select>
        }

        <button type="submit" [disabled]="createForm.invalid"
          class="rounded bg-primary hover:bg-primary-hover text-white px-4 py-2 disabled:opacity-50">
          Létrehozás
        </button>
      </form>
    </div>
  `,
})
export class CsoportokListaComponent {
  private readonly fb = inject(FormBuilder);
  readonly store = inject(GroupStore);
  readonly schoolStore = inject(SchoolStore);

  readonly createForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    schoolId: this.fb.control<number | null>(null),
  });

  constructor() {
    this.store.loadMine();
    this.schoolStore.loadMine();
  }

  create(): void {
    if (this.createForm.invalid) return;
    const raw = this.createForm.getRawValue();
    this.store.create({ name: raw.name, schoolId: raw.schoolId ?? undefined }, () => this.createForm.reset());
  }
}
