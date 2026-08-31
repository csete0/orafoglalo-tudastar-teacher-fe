import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ToastService } from '../toast/toast.service';

/**
 * UI-UX-T1: vágólapra másoló gomb. A meghívó kódokat/linkeket korábban kézzel
 * kellett kijelölni-másolni - az osztálytermi fő eset (kivetített kód, sietség)
 * mellett ez felesleges súrlódás volt.
 *
 * A navigator.clipboard biztonságos kontextust (HTTPS/localhost) kér - a staging
 * és az éles is HTTPS, de hiba esetén (régi böngésző, engedély-megtagadás) beszédes
 * toast megy ki, nem néma no-op.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-copy-button',
  standalone: true,
  template: `
    <button type="button" (click)="copy()" class="btn btn-ghost !px-2 !py-1 !text-xs shrink-0"
      [attr.aria-label]="label() + ' másolása vágólapra'" [title]="label() + ' másolása'">
      Másolás
    </button>
  `,
})
export class CopyButtonComponent {
  private readonly toastService = inject(ToastService);

  /** A vágólapra kerülő szöveg. */
  readonly value = input.required<string>();
  /** Mi kerül a toastba/aria-labelbe (pl. "Meghívó kód"). */
  readonly label = input('Szöveg');

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.value());
      this.toastService.success(`${this.label()} a vágólapra másolva.`);
    } catch {
      this.toastService.danger('A másolás nem sikerült — jelöld ki és másold kézzel.');
    }
  }
}
