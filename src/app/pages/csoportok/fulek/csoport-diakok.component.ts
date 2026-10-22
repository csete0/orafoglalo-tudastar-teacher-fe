import { ChangeDetectionStrategy, Component, inject, input, OnInit, output } from '@angular/core';
import { GroupStore } from '../../../services/group/group.store';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { IconComponent } from '../../../shared/icon/icon.component';

/** Csoportoldal „Diákok” fül: a tagok listája, eltávolítással. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-csoport-diakok',
  imports: [IconComponent],
  template: `
    <ul class="space-y-2 max-w-4xl">
      @for (member of store.members(); track member.userId) {
        <li class="flex justify-between items-center card !rounded-xl p-3 text-sm">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-full bg-primary-subtle text-primary text-xs font-bold flex items-center justify-center shrink-0">
              {{ initials(member.name) }}</div>
            <div class="min-w-0">
              <p class="truncate">{{ member.name }}</p>
              <p class="text-xs text-text-muted truncate">{{ member.email }}</p>
            </div>
          </div>
          <button type="button" (click)="removeMember(member.userId, member.name)" class="text-danger hover:underline shrink-0">Eltávolítás</button>
        </li>
      } @empty {
        <li class="flex flex-col items-center py-10 gap-3">
          <div class="icon-tile icon-tile-neutral">
            <app-icon name="users" class="w-6 h-6 block" />
          </div>
          <p class="font-semibold">Még nincs tag a csoportban.</p>
          <p class="text-sm text-text-muted">Oszd meg a meghívó kódot a diákjaiddal.</p>
          <!-- UI-UX-K2: az üres állapot ne csak elmondja a következő lépést - vigyen is oda. -->
          <button type="button" (click)="openInvite.emit()" class="btn btn-primary">
            Meghívó kód megnyitása
          </button>
        </li>
      }
    </ul>
  `,
})
export class CsoportDiakokComponent implements OnInit {
  readonly groupId = input.required<number>();
  /** Az üres állapot gombja: a szülő a Beállítások → Meghívó kód szakaszra visz. */
  readonly openInvite = output<void>();

  readonly store = inject(GroupStore);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);

  ngOnInit(): void {
    this.store.loadMembers(this.groupId());
  }

  initials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  async removeMember(userId: number, memberName: string): Promise<void> {
    const ok = await this.confirmService.ask({
      message: `Biztosan eltávolítod ${memberName} diákot a csoportból?`,
      danger: true,
      confirmLabel: 'Eltávolítás',
    });
    if (!ok) return;
    this.store.removeMember(this.groupId(), userId, () => this.toastService.success('Diák eltávolítva a csoportból.'));
  }
}
