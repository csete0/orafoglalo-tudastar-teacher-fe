import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TeacherFileKind } from '../../../models/teacher-content.model';
import { IconComponent } from '../../../shared/icon/icon.component';
import { FILE_KINDS, isSchemaKind, OFFICE_FILE_ACCEPT, TaskSetFilesState } from './taskset-files.state';

/** A szerkesztő „Fájlok” része: a feladatsor-szintű fájlok listája és feltöltő kártyái, valamint az irodai feladatok fájljai. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-files-section',
  standalone: true,
  host: { class: 'block' },
  imports: [FormsModule, IconComponent],
  templateUrl: './files-section.component.html',
})
export class FilesSectionComponent {
  readonly taskSetId = input.required<number>();

  protected readonly files = inject(TaskSetFilesState);
  protected readonly fileKinds = FILE_KINDS;
  protected readonly isSchemaKind = isSchemaKind;
  protected readonly officeFileAccept = OFFICE_FILE_ACCEPT;
  protected readonly officeFileAcceptLabel = OFFICE_FILE_ACCEPT.split(',').join(', ');
  protected readonly officeFileSlots: { kind: TeacherFileKind; label: string; help: string }[] = [
    { kind: 'OfficeSource', label: 'Forrásfájlok', help: 'Amit a diák a feladathoz megkap (pl. nyers szöveg, adatfájl, képek).' },
    { kind: 'OfficeSolution', label: 'Megoldásod', help: 'A kész, hibátlan megoldásod – a diákok nem látják, ehhez méri a rendszer a beadásokat.' },
  ];
}
