import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SchoolStore } from '../../services/school/school.store';

/**
 * Placeholder-lista — a Fázis 8 építi ki a teljes UI-t (kártyák, iskola-
 * választó dizájn). A store és a valós HTTP-hívások már itt élesben mennek.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-intezmenyek-lista',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="max-w-2xl mx-auto px-4 py-10">
      <h1 class="text-xl font-semibold mb-6">Intézményeim</h1>

      @if (store.loading()) {
        <p class="text-text-muted">Betöltés…</p>
      }
      @if (store.error()) {
        <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
      }

      <ul class="space-y-2 mb-8">
        @for (school of store.schools(); track school.id) {
          <li>
            <a [routerLink]="['/intezmenyek', school.id]"
              class="flex justify-between items-center bg-bg-panel border border-border-default rounded-lg p-4 hover:border-primary">
              <span>{{ school.name }}</span>
              <span class="text-sm text-text-muted">{{ school.myRole === 'Admin' ? 'Igazgató' : 'Tanár' }}</span>
            </a>
          </li>
        }
        @empty {
          <li class="text-text-muted">Még nem tagja egyetlen intézménynek sem.</li>
        }
      </ul>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <form [formGroup]="createForm" (ngSubmit)="createSchool()" class="bg-bg-panel border border-border-default rounded-lg p-4 space-y-2">
          <h2 class="font-medium">Új intézmény</h2>
          <input formControlName="name" placeholder="Intézmény neve"
            class="w-full rounded border border-border-default bg-bg-element px-3 py-2" />
          <button type="submit" [disabled]="createForm.invalid"
            class="rounded bg-primary hover:bg-primary-hover text-white px-3 py-1.5 disabled:opacity-50">
            Létrehozás
          </button>
        </form>

        <form [formGroup]="joinForm" (ngSubmit)="joinSchool()" class="bg-bg-panel border border-border-default rounded-lg p-4 space-y-2">
          <h2 class="font-medium">Csatlakozás kóddal</h2>
          <input formControlName="code" placeholder="Meghívó kód"
            class="w-full rounded border border-border-default bg-bg-element px-3 py-2" />
          <button type="submit" [disabled]="joinForm.invalid"
            class="rounded bg-primary hover:bg-primary-hover text-white px-3 py-1.5 disabled:opacity-50">
            Csatlakozás
          </button>
        </form>
      </div>
    </div>
  `,
})
export class IntezmenyekListaComponent {
  private readonly fb = inject(FormBuilder);
  readonly store = inject(SchoolStore);

  readonly createForm = this.fb.nonNullable.group({ name: ['', Validators.required] });
  readonly joinForm = this.fb.nonNullable.group({ code: ['', Validators.required] });

  constructor() {
    this.store.loadMine();
  }

  createSchool(): void {
    if (this.createForm.invalid) return;
    this.store.create({ name: this.createForm.getRawValue().name }, () => this.createForm.reset());
  }

  joinSchool(): void {
    if (this.joinForm.invalid) return;
    this.store.join({ code: this.joinForm.getRawValue().code }, () => this.joinForm.reset());
  }
}
