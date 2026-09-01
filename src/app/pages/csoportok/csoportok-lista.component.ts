import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GroupStore } from '../../services/group/group.store';
import { SchoolStore } from '../../services/school/school.store';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { notBlankValidator } from '../../shared/validators/not-blank.validator';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-csoportok-lista',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, RouterLink, IconComponent],
  template: `
    <div class="max-w-2xl mx-auto px-4 py-10">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h1 class="page-title">Csoportjaim</h1>
          <p class="text-sm text-text-muted mt-1">Diák-csoportok meghívó kóddal és eredmény-riportokkal</p>
        </div>
        <!-- UI-UX-T6: a létrehozás ritkább művelet, mint a belépés - gombbal nyílik,
             a lista kerül felülre teljes egészében. -->
        <button type="button" (click)="createOpen.set(!createOpen())" class="btn btn-primary shrink-0">
          {{ createOpen() ? 'Mégse' : '+ Új csoport' }}
        </button>
      </div>
      <div class="hairline"></div>

      @if (createOpen()) {
        <form [formGroup]="createForm" (ngSubmit)="create()" class="card p-5 space-y-3 mb-6">
          <h2 class="font-bold">Új csoport</h2>
          <input formControlName="name" placeholder="Csoport neve (pl. 11.A)" maxlength="255" class="input" />
          @if (createForm.controls.name.hasError('blank')) {
            <p class="text-sm text-danger">A csoport neve nem állhat kizárólag szóközökből.</p>
          }
          @if (createForm.controls.name.hasError('maxlength')) {
            <p class="text-sm text-danger">A csoport neve legfeljebb 255 karakter hosszú lehet.</p>
          }
          @if (schoolStore.schools().length > 0) {
            <select formControlName="schoolId" class="input">
              <option [ngValue]="null">Nincs intézményhez kötve (magántanár)</option>
              @for (school of schoolStore.schools(); track school.id) {
                <option [ngValue]="school.id">{{ school.name }}</option>
              }
            </select>
          } @else if (schoolStore.error()) {
            <p class="text-danger text-sm">{{ schoolStore.error() }}</p>
          }
          <button type="submit" [disabled]="createForm.invalid || store.loading()" class="btn btn-primary">
            Létrehozás
          </button>
        </form>
      }

      <!-- UI-UX-T6: kliens-oldali keresés + archivált-szűrő - sok csoportnál a
           lista kezelhetetlenné válik nélkülük. -->
      @if (store.groups().length >= 8 || search()) {
        <input type="search" [ngModel]="search()" (ngModelChange)="search.set($event)"
          [ngModelOptions]="{ standalone: true }"
          placeholder="Keresés a csoportok között…" class="input mb-3"
          aria-label="Keresés a csoportok között" />
      }
      @if (hasArchived()) {
        <label class="flex items-center gap-2 text-sm text-text-muted mb-3">
          <input type="checkbox" [ngModel]="showArchived()" (ngModelChange)="showArchived.set($event)"
            [ngModelOptions]="{ standalone: true }" />
          Archivált csoportok mutatása
        </label>
      }

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
          @for (group of visibleGroups(); track group.id) {
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
                  } @else if (!group.isJoinEnabled) {
                    <span class="badge badge-neutral shrink-0">Jelentkezés letiltva</span>
                  }
                  <span class="text-sm text-text-muted shrink-0">{{ group.memberCount }} tag</span>
                  <app-icon name="arrow-right"
                    class="w-4 h-4 block text-text-muted transition-transform group-hover:translate-x-1 shrink-0" />
                </div>
              </a>
            </li>
          }
          @empty {
            <!-- UI-TT-32: sikertelen betöltésnél NE mutassuk a "hozz létre elsőt" üres-állapotot
                 a fenti hibaüzenettel egyidejűleg. -->
            @if (!store.error()) {
              <li class="flex flex-col items-center py-10 gap-3">
                <div class="icon-tile icon-tile-neutral">
                  <app-icon name="users" class="w-6 h-6 block" />
                </div>
                <p class="font-semibold">Még nincs csoportod.</p>
                <p class="text-sm text-text-muted">Hozd létre az elsőt a "+ Új csoport" gombbal.</p>
              </li>
            }
          }
        </ul>
      }

    </div>
  `,
})
export class CsoportokListaComponent {
  private readonly fb = inject(FormBuilder);
  private readonly toastService = inject(ToastService);
  readonly store = inject(GroupStore);
  readonly schoolStore = inject(SchoolStore);

  readonly createOpen = signal(false);
  readonly search = signal('');
  readonly showArchived = signal(false);

  readonly hasArchived = computed(() => this.store.groups().some((g) => g.isArchived));

  readonly visibleGroups = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.store.groups().filter((g) =>
      (this.showArchived() || !g.isArchived) &&
      (!term || g.name.toLowerCase().includes(term) || (g.schoolName ?? '').toLowerCase().includes(term)));
  });

  readonly createForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, notBlankValidator(), Validators.maxLength(255)]],
    schoolId: this.fb.control<number | null>(null),
  });

  constructor() {
    this.store.loadMine();
    this.schoolStore.loadMine();
  }

  create(): void {
    if (this.createForm.invalid || this.store.loading()) return;
    const raw = this.createForm.getRawValue();
    this.store.create({ name: raw.name, schoolId: raw.schoolId ?? undefined }, () => {
      this.createForm.reset();
      this.createOpen.set(false);
      this.toastService.success('Csoport létrehozva.');
    });
  }
}
