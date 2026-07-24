import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SchoolStore } from '../../services/school/school.store';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { notBlankValidator } from '../../shared/validators/not-blank.validator';
import { ConfirmService } from '../../shared/confirm/confirm.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-intezmenyek-lista',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, IconComponent],
  template: `
    <div class="max-w-2xl mx-auto px-4 py-10">
      <h1 class="page-title">Intézményeim</h1>
      <p class="text-sm text-text-muted mt-1">Iskolák és szervezetek, ahol tanítasz</p>
      <div class="hairline"></div>

      @if (store.error()) {
        <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
      }

      @if (store.loading() && store.schools().length === 0) {
        <div class="space-y-2 mb-8">
          <div class="skeleton h-20"></div>
          <div class="skeleton h-20"></div>
          <div class="skeleton h-20"></div>
        </div>
      } @else {
        <ul class="space-y-3 mb-8">
          @for (school of store.schools(); track school.id) {
            <li>
              <a [routerLink]="['/intezmenyek', school.id]"
                class="card-link block group" [class]="'accent-' + (school.id % 4)">
                <div class="accent-bar"></div>
                <div class="p-4 flex items-center gap-3">
                  <div class="icon-tile icon-tile-primary">
                    <app-icon name="building" class="w-6 h-6 block" />
                  </div>
                  <span class="font-bold flex-1 truncate">{{ school.name }}</span>
                  <span class="badge shrink-0" [class]="school.myRole === 'Admin' ? 'badge-primary' : 'badge-neutral'">
                    {{ school.myRole === 'Admin' ? 'Igazgató' : 'Tanár' }}</span>
                  <app-icon name="arrow-right"
                    class="w-4 h-4 block text-text-muted transition-transform group-hover:translate-x-1 shrink-0" />
                </div>
              </a>
            </li>
          }
          @empty {
            <!-- UI-TT-32: sikertelen betöltésnél NE mutassuk a "hozz létre egyet" üres-állapotot
                 a fenti hibaüzenettel egyidejűleg. -->
            @if (!store.error()) {
              <li class="flex flex-col items-center py-10 gap-3">
                <div class="icon-tile icon-tile-neutral">
                  <app-icon name="building" class="w-6 h-6 block" />
                </div>
                <p class="font-semibold">Még nem tagja egyetlen intézménynek sem.</p>
                <p class="text-sm text-text-muted">Hozz létre egyet, vagy csatlakozz meghívó kóddal.</p>
              </li>
            }
          }
        </ul>
      }

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <form [formGroup]="createForm" (ngSubmit)="createSchool()" class="card p-5 space-y-2">
          <h2 class="font-bold">Új intézmény</h2>
          <input formControlName="name" placeholder="Intézmény neve" class="input" />
          @if (createForm.controls.name.hasError('blank')) {
            <p class="text-sm text-danger">Az intézmény neve nem állhat kizárólag szóközökből.</p>
          }
          <button type="submit" [disabled]="createForm.invalid || store.loading()" class="btn btn-primary !px-3 !py-1.5">
            Létrehozás
          </button>
        </form>

        <form [formGroup]="joinForm" (ngSubmit)="joinSchool()" class="card p-5 space-y-2">
          <h2 class="font-bold">Csatlakozás kóddal</h2>
          <input formControlName="code" placeholder="Meghívó kód" class="input" />
          <button type="submit" [disabled]="joinForm.invalid" class="btn btn-primary !px-3 !py-1.5">
            Csatlakozás
          </button>
        </form>
      </div>
    </div>
  `,
})
export class IntezmenyekListaComponent {
  private readonly fb = inject(FormBuilder);
  private readonly toastService = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);
  readonly store = inject(SchoolStore);

  readonly createForm = this.fb.nonNullable.group({ name: ['', [Validators.required, notBlankValidator()]] });
  readonly joinForm = this.fb.nonNullable.group({ code: ['', Validators.required] });

  constructor() {
    this.store.loadMine();
  }

  createSchool(): void {
    if (this.createForm.invalid || this.store.loading()) return;
    this.store.create({ name: this.createForm.getRawValue().name }, () => {
      this.createForm.reset();
      this.toastService.success('Intézmény létrehozva.');
    });
  }

  // UI-TT-102: a meghívó kóddal való csatlakozás a háttérben azonnal láthatóvá teszi a
  // tanár MÁR publikált feladatsorait az intézmény MEGLÉVŐ csoportjainak diákjai számára
  // (a jogosultságot a backend élőben, lekérdezéskor értékeli ki) — a testvér-műveletekhez
  // (changeSchool(), publish()) hasonlóan összemérhető láthatósági hatással jár, ezért ez is
  // megerősítést igényel a submit előtt. Az intézmény neve itt még NEM ismert — a form csak
  // a meghívó kódot veszi fel, a SchoolDto (és így a név) csak a sikeres store.join() válaszában
  // érkezik meg —, ezért a szöveg szándékosan nem nevez meg konkrét intézményt.
  async joinSchool(): Promise<void> {
    if (this.joinForm.invalid) return;

    const ok = await this.confirmService.ask({
      message:
        'Biztosan csatlakozol az intézményhez? A már publikált feladatsoraid azonnal láthatóvá válnak az intézmény meglévő csoportjainak diákjai számára.',
      confirmLabel: 'Csatlakozás',
    });
    if (!ok) return;

    this.store.join({ code: this.joinForm.getRawValue().code }, () => {
      this.joinForm.reset();
      this.toastService.success('Sikeresen csatlakoztál az intézményhez.');
    });
  }
}
