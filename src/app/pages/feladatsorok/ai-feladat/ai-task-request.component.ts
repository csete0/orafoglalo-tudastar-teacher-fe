import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AiCodeTaskJobDto, AiCodeTaskLevel, AiCodeTaskMode } from '../../../models/ai-code-task.model';
import { IconComponent } from '../../../shared/icon/icon.component';
import { LANGUAGE_OPTIONS, MAX_IDEA, MAX_TOPIC, PREMIUM_REQUIRED_MESSAGE } from './ai-task.constants';
import { AiTaskRequestState } from './ai-task-request.state';

/** Az AI-feladat 1. lépése: keret, félbehagyott job felkínálása, a kérés űrlapja (1. mód: kiegészítés, 2. mód: új feladat). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ai-task-request',
  standalone: true,
  host: { class: 'block' },
  imports: [FormsModule, IconComponent],
  templateUrl: './ai-task-request.component.html',
})
export class AiTaskRequestComponent {
  readonly request = inject(AiTaskRequestState);

  readonly mode = input.required<AiCodeTaskMode>();
  /** 1. mód: a kiegészítendő feladat részfeladatainak száma (0-nál nem indítható). */
  readonly taskSubtaskCount = input(0);
  /** A tanár elkészült, még nem mentett jobja egy MÁSIK célra - megnyitható. */
  readonly otherJob = input<AiCodeTaskJobDto | null>(null);
  readonly otherJobTitle = input<string | null>(null);
  readonly canStart = input(false);
  readonly starting = input(false);
  readonly startError = input<string | null>(null);

  readonly start = output<void>();
  readonly cancel = output<void>();
  readonly resume = output<number>();

  readonly languageOptions = LANGUAGE_OPTIONS;
  readonly levels: { value: AiCodeTaskLevel; label: string }[] = [
    { value: 'kozep', label: 'Középszint' },
    { value: 'emelt', label: 'Emelt szint' },
  ];
  readonly subtaskCounts = [3, 4, 5, 6, 7, 8];
  readonly maxTopic = MAX_TOPIC;
  readonly maxIdea = MAX_IDEA;
  readonly premiumMessage = PREMIUM_REQUIRED_MESSAGE;
}
