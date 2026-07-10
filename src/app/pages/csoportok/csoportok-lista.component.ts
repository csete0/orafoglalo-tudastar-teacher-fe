import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GroupStore } from '../../services/group/group.store';
import { SchoolStore } from '../../services/school/school.store';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-csoportok-lista',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, IconComponent],
  template: `
    <div class="max-w-2xl mx-auto px-4 py-10">
      <h1 class="page-title">Csoportjaim</h1>
      <p class="text-sm text-text-muted mt-1">Diák-csoportok meghívó kóddal és eredmény-riportokkal</p>
      <div class="hairline"></div>

      @if (store.error()) {
        <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
      }

      @if (store.loading() && store.groups().length === 0) {
        <div class="space-y-2 mb-8">
          <div class="skeleton h-20"></div>
          <div class="skeleton h-20"></div>
          <div class="skeleton h-20"></div>
        </div>
      } @else {
        <ul class="space-y-3 mb-8">
          @for (group of store.groups(); track group.id) {
            <li>
              <a [routerLink]="['/csoportok', group.id]"
                class="card-link block group" [class]="'accent-' + (group.id % 4)">
                <div class="accent-bar"></div>
                <div class="p-4 flex items-center gap-3">
                  <div class="icon-tile icon-tile-secondary">
                    <app-icon name="users" class="w-6 h-6 block" />
                  </div>
                  <span class="min-w-0 flex-1">
                    <span class="font-bold block truncate">{{ group.name }}</span>
                    @if (group.schoolName) {
                      <span class="text-text-muted text-xs block truncate">{{ group.schoolName }}</span>
                    }
                  </span>
                  @if (group.isArchived) {
                    <span class="badge badge-neutral shrink-0">Archivált</span>
                  }
                  <span class="text-sm text-text-muted shrink-0">{{ group.memberCount }} tag</span>
                  <app-icon name="arrow-right"
                    class="w-4 h-4 block text-text-muted transition-transform group-hover:translate-x-1 shrink-0" />
                </div>
              </a>
            </li>
          }
          @empty {
            <li class="flex flex-col items-center py-10 gap-3">
              <div class="icon-tile icon-tile-neutral">
                <app-icon name="users" class="w-6 h-6 block" />
              </div>
              <p class="font-semibold">Még nincs csoportod.</p>
              <p class="text-sm text-text-muted">Hozd létre az elsőt az alábbi űrlappal.</p>
            </li>
          }
        </ul>
      }

      <form [formGroup]="createForm" (ngSubmit)="create()" class="card p-5 space-y-3">
        <h2 class="font-bold">Új csoport</h2>
        <input formControlName="name" placeholder="Csoport neve (pl. 11.A)" class="input" />

        @if (schoolStore.schools().length > 0) {
          <select formControlName="schoolId" class="input">
            <option [ngValue]="null">Nincs intézményhez kötve (magántanár)</option>
            @for (school of schoolStore.schools(); track school.id) {
              <option [ngValue]="school.id">{{ school.name }}</option>
            }
          </select>
        }

        <button type="submit" [disabled]="createForm.invalid" class="btn btn-primary">
          Létrehozás
        </button>
      </form>
    </div>
  `,
})
export class CsoportokListaComponent {
  private readonly fb = inject(FormBuilder);
  private readonly toastService = inject(ToastService);
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
    this.store.create({ name: raw.name, schoolId: raw.schoolId ?? undefined }, () => {
      this.createForm.reset();
      this.toastService.success('Csoport létrehozva.');
    });
  }
}
