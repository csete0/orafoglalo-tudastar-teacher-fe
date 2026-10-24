import { computed, Injectable, signal } from '@angular/core';
import { AiCodeTaskLanguage, AiCodeTaskLevel, AiCodeTaskMode, AiCodeTaskQuotaDto, AiCodeTaskStartRequest } from '../../../models/ai-code-task.model';
import { TeacherTaskDto } from '../../../models/teacher-content.model';
import { LANGUAGE_OPTIONS, MAX_IDEA, MAX_TOPIC } from './ai-task.constants';

/** Az AI-feladat kérés-lépésének állapota: havi keret, prémium-jelzés és az űrlap. Az `AiFeladatComponent` adja (`providers`). */
@Injectable()
export class AiTaskRequestState {
  readonly quota = signal<AiCodeTaskQuotaDto | null>(null);
  /** A szerver is mondhatja (pl. közben lejárt az előfizetés), nem csak a keret-lekérdezés. */
  private readonly premiumRejected = signal(false);
  readonly premiumRequired = computed(() => this.premiumRejected() || this.quota()?.isPremium === false);
  readonly quotaExhausted = computed(() => {
    const q = this.quota();
    return !!q && q.used >= q.limit;
  });

  readonly languages = signal<Set<AiCodeTaskLanguage>>(new Set(['python']));
  readonly regenerateSolution = signal(false);
  readonly topic = signal('');
  readonly level = signal<AiCodeTaskLevel>('kozep');
  readonly subtaskCount = signal(5);
  readonly idea = signal('');

  /** 2. mód: a téma megvan és a hosszak a BE-korláton belül. */
  readonly newTaskValid = computed(() => {
    const topic = this.topic().trim();
    return topic.length > 0 && topic.length <= MAX_TOPIC && this.idea().length <= MAX_IDEA;
  });

  rejectPremium(): void {
    this.premiumRejected.set(true);
  }

  /** A feladat meglévő összevont megoldásainak nyelvei alapból bejelölve (a Python mindig). */
  preselectLanguages(task: TeacherTaskDto): void {
    const existing = new Set(task.completeSolutionSnippets.map((s) => s.programmingLanguageId));
    this.languages.set(new Set(LANGUAGE_OPTIONS.filter((l) => l.key === 'python' || existing.has(l.platformId)).map((l) => l.key)));
  }

  toggleLanguage(key: AiCodeTaskLanguage): void {
    if (key === 'python') return;
    this.languages.update((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Az indító kérés: 1. módban a feladat azonosítójával, 2. módban a témával, szinttel, darabszámmal és ötlettel. */
  request(mode: AiCodeTaskMode, task: TeacherTaskDto | null): AiCodeTaskStartRequest {
    const languages = LANGUAGE_OPTIONS.filter((l) => this.languages().has(l.key)).map((l) => l.key);
    return mode === 'complete'
      ? { mode: 'complete', taskId: task!.id, regenerateSolution: this.regenerateSolution(), languages }
      : {
          mode: 'new',
          topic: this.topic().trim(),
          level: this.level(),
          subtaskCount: this.subtaskCount(),
          languages,
          idea: this.idea().trim() || null,
        };
  }
}
