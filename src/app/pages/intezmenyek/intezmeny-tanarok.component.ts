import { ChangeDetectionStrategy, Component, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SchoolStore } from '../../services/school/school.store';
import { SchoolDto, SchoolTeacherRole } from '../../models/school.model';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { CopyButtonComponent } from '../../shared/copy-button/copy-button.component';

/**
 * Intézmény „Tanárok” fül: tanári meghívó kód, tag-lista (szerepváltás, eltávolítás), az intézmény
 * átnevezése és törlése. Az igazgatói elemeket az `isSelectedAdmin` (a SchoolDto.myRole-ból) kapuzza,
 * SOSEM route-guard. Az átnevezés piszkozata a szülőben él (`model`), hogy fülváltás után is megmaradjon.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-intezmeny-tanarok',
  host: { class: 'block' },
  imports: [FormsModule, IconComponent, CopyButtonComponent],
  template: `
    @let s = school();
    @if (store.isSelectedAdmin() && s.teacherInviteCode) {
      <div class="card !rounded-xl bg-bg-element p-3 mb-4 flex justify-between items-center text-sm">
        <span class="flex items-center gap-2">
          <app-icon name="link" class="w-4 h-4 block text-primary" />
          Tanári meghívó kód: <code class="font-bold">{{ s.teacherInviteCode }}</code>
          <app-copy-button [value]="s.teacherInviteCode" label="Tanári meghívó kód" />
        </span>
        <button (click)="regenerateInvite(s.id)" [disabled]="store.loading()" class="text-primary hover:underline">Új kód generálása</button>
      </div>
    }

    <ul class="space-y-2 mb-6">
      @for (member of store.members(); track member.teacherProfileId) {
        <li class="flex justify-between items-center card !rounded-xl p-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-full bg-primary-subtle text-primary text-xs font-bold flex items-center justify-center shrink-0">
              {{ initials(member.displayName) }}</div>
            <div class="min-w-0">
              <p class="truncate">{{ member.displayName }}</p>
              <p class="text-xs text-text-muted">{{ member.groupCount }} csoport</p>
            </div>
          </div>
          <div class="flex items-center gap-2 text-sm shrink-0">
            <span class="badge" [class]="member.role === 'Admin' ? 'badge-primary' : 'badge-neutral'">
              {{ member.role === 'Admin' ? 'Igazgató' : 'Tanár' }}</span>
            @if (store.isSelectedAdmin()) {
              <button (click)="toggleRole(s.id, member.teacherProfileId, member.role, member.displayName)" class="text-primary hover:underline">
                {{ member.role === 'Admin' ? 'Lefokozás' : 'Igazgatóvá tétel' }}
              </button>
              <button (click)="removeMember(s.id, member.teacherProfileId, member.displayName)" class="text-danger hover:underline">Eltávolítás</button>
            }
          </div>
        </li>
      }
    </ul>

    @if (store.isSelectedAdmin()) {
      <div class="card p-5">
        <h2 class="font-bold mb-3">Intézmény szerkesztése</h2>
        <div class="flex gap-2 mb-3">
          <input [ngModel]="editName()" (ngModelChange)="editName.set($event)" placeholder="Név" maxlength="255" class="input flex-1" />
          <button (click)="saveEdit(s.id)" [disabled]="!editName().trim() || editName().length > 255" class="btn btn-primary">Mentés</button>
        </div>
        @if (editName().length > 255) {
          <p class="text-sm text-danger mb-3">Az intézmény neve legfeljebb 255 karakter hosszú lehet.</p>
        }
        <button (click)="deleteSchool(s.id, s.groupCount)" class="text-sm text-danger hover:underline">
          Intézmény törlése
        </button>
      </div>
    }
  `,
})
export class IntezmenyTanarokComponent {
  private readonly router = inject(Router);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
  readonly store = inject(SchoolStore);

  readonly school = input.required<SchoolDto>();
  /** Az átnevezés piszkozata (a szülő tartja, a betöltött névvel indul). */
  readonly editName = model.required<string>();

  initials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  async toggleRole(
    schoolId: number,
    teacherProfileId: number,
    currentRole: SchoolTeacherRole,
    displayName: string,
  ): Promise<void> {
    const newRole: SchoolTeacherRole = currentRole === 'Admin' ? 'Teacher' : 'Admin';
    const ok = await this.confirmService.ask({
      message:
        newRole === 'Admin'
          ? `Biztosan igazgatóvá teszed ${displayName} tanárt? Ezzel teljes intézmény-admin jogkört kap.`
          : `Biztosan lefokozod ${displayName} tanárt? Elveszíti az intézmény-admin jogkörét.`,
      danger: true,
      confirmLabel: newRole === 'Admin' ? 'Igazgatóvá tétel' : 'Lefokozás',
    });
    if (!ok) return;
    this.store.changeMemberRole(schoolId, teacherProfileId, { role: newRole }, () =>
      this.toastService.success('Szerepkör módosítva.'),
    );
  }

  async removeMember(schoolId: number, teacherProfileId: number, teacherName: string): Promise<void> {
    // UI-TT-140 (UI-TT-29 testvér-előfordulása): a megerősítő szöveg korábban sosem
    // nevezte meg az érintett tanárt - egy hosszú listán a tanár nem tudta a
    // dialógusból ellenőrizni, hogy valóban a kattintott sorra vonatkozik-e.
    const ok = await this.confirmService.ask({
      message: `Biztosan eltávolítod ${teacherName} tanárt az intézményből? A csoportjai lekerülnek az intézményről.`,
      danger: true,
      confirmLabel: 'Eltávolítás',
    });
    if (!ok) return;
    this.store.removeMember(schoolId, teacherProfileId, () =>
      this.toastService.success('Tanár eltávolítva az intézményből.'),
    );
  }

  saveEdit(schoolId: number): void {
    const name = this.editName();
    if (!name.trim() || name.length > 255) return;
    this.store.update(schoolId, { name: name.trim() }, () =>
      this.toastService.success('Intézmény átnevezve.'),
    );
  }

  async deleteSchool(schoolId: number, groupCount: number): Promise<void> {
    if (groupCount > 0) {
      this.toastService.warning('Az intézmény csak akkor törölhető, ha nincs hozzá kötött csoport.', 5000);
      return;
    }
    // UI-TT-35 (mis-triage correction): a BE (SchoolService.DeleteAsync) már értesíti a
    // többi aktív tanár-tagot a törlésről, de a megerősítő dialógus ezt eddig nem
    // nevezte meg - a szomszédos leave() explicit szól a következményről, ez a
    // törlés-ág viszont a generikus szöveget adta, függetlenül attól, van-e másik
    // aktív tag, aki elveszíti a tagságát.
    const otherActiveTeacherCount = (this.store.selectedSchool()?.teacherCount ?? 1) - 1;
    const message = otherActiveTeacherCount > 0
      ? `Biztosan törlöd az intézményt? A(z) ${otherActiveTeacherCount} másik aktív tanár kolléga is elveszíti a tagságát.`
      : 'Biztosan törlöd az intézményt?';
    const ok = await this.confirmService.ask({
      message,
      danger: true,
      confirmLabel: 'Törlés',
    });
    if (!ok) return;
    this.store.delete(schoolId, () => {
      this.toastService.success('Intézmény törölve.');
      this.router.navigateByUrl('/intezmenyek');
    });
  }

  regenerateInvite(schoolId: number): void {
    if (this.store.loading()) return;
    this.store.regenerateInvite(schoolId, () => this.toastService.success('Új tanári meghívó kód generálva.'));
  }
}
