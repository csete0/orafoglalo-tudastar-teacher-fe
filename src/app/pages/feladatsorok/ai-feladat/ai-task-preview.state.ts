import { computed, Injectable, signal } from '@angular/core';
import { AiCodeTaskProposal, AiCodeTaskReport, AiCodeTaskResultDto, AiCodeTaskValidateResult, AiProposalSubtask } from '../../../models/ai-code-task.model';
import { byteSize } from '../../../shared/format/byte-size';
import { AiTaskTab, MAX_DATA_FILE_BYTES, MAX_SUBTASKS, sameProposal } from './ai-task.constants';

/**
 * Az AI-feladat előnézetének állapota: a generált, a szerkesztett és az utoljára ellenőrzött javaslat, az ellenőrzés
 * riportja, a fülek és a szerkesztő műveletek (megváltoztathatatlan frissítéssel, hogy a computed-ek újraszámoljanak).
 * HTTP-t nem hív - az újraellenőrzés és a mentés az `AiFeladatComponent`-é, amely ezt az állapotot adja (`providers`).
 */
@Injectable()
export class AiTaskPreviewState {
  /** A generált változat (a „Visszaállítás” ide tér vissza). */
  private readonly generatedResult = signal<AiCodeTaskResultDto | null>(null);
  /** Az utoljára hibátlanul (vagy nem) ellenőrzött, szerver által normalizált változat - mentéskor PONTOSAN ez megy. */
  private readonly validatedProposal = signal<AiCodeTaskProposal | null>(null);
  readonly generated = this.generatedResult.asReadonly();
  readonly validated = this.validatedProposal.asReadonly();
  /** A szerkesztett javaslat. */
  readonly proposal = signal<AiCodeTaskProposal | null>(null);
  readonly report = signal<AiCodeTaskReport | null>(null);

  readonly tab = signal<AiTaskTab>('feladat');
  readonly languageIndex = signal(0);
  readonly revalidateError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly dataFileError = signal<string | null>(null);

  readonly notes = computed(() => this.generatedResult()?.notes ?? null);
  readonly dirty = computed(() => !sameProposal(this.proposal(), this.validatedProposal()));
  readonly changedFromGenerated = computed(() => {
    const generated = this.generatedResult();
    return !!generated && !sameProposal(this.proposal(), generated.proposal);
  });
  readonly canSave = computed(() => !!this.report()?.canSave && !this.dirty() && !!this.validatedProposal());
  readonly pointsSum = computed(() => (this.proposal()?.subtasks ?? []).reduce((sum, s) => sum + (s.points ?? 0), 0));
  readonly dataFileInfo = computed(() => {
    const content = this.proposal()?.dataFile?.content;
    if (content == null) return null;
    const lines = content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
    return `${lines} sor, ${byteSize(new TextEncoder().encode(content).length)}`;
  });

  /** Kész job eredménye: hibás ellenőrzésnél az Ellenőrzés fül nyílik. */
  show(result: AiCodeTaskResultDto): void {
    this.generatedResult.set(result);
    this.proposal.set(result.proposal);
    this.validatedProposal.set(result.proposal);
    this.report.set(result.report);
    this.tab.set(result.report.status === 'ok' ? 'feladat' : 'ellenorzes');
    this.languageIndex.set(0);
    this.saveError.set(null);
    this.revalidateError.set(null);
    this.dataFileError.set(null);
  }

  reset(): void {
    this.generatedResult.set(null);
    this.proposal.set(null);
    this.validatedProposal.set(null);
    this.report.set(null);
    this.saveError.set(null);
    this.revalidateError.set(null);
  }

  /** Az újraellenőrzés válasza; ha a tanár közben nem módosított (`sent` még az aktuális), a normalizált változat kerül a szerkesztőbe. */
  applyValidation(sent: AiCodeTaskProposal, result: AiCodeTaskValidateResult): void {
    this.validatedProposal.set(result.proposal);
    this.report.set(result.report);
    if (this.proposal() === sent) this.proposal.set(result.proposal);
  }

  /** A generált változat vissza; ha a szerver legutóbb is azt ellenőrizte, a generáláskori eredmény ismét érvényes. */
  restore(): void {
    const generated = this.generatedResult();
    if (!generated) return;
    this.proposal.set(generated.proposal);
    if (sameProposal(generated.proposal, this.validatedProposal())) this.report.set(generated.report);
    this.dataFileError.set(null);
  }

  // ── Szerkesztés ──
  private update(fn: (p: AiCodeTaskProposal) => AiCodeTaskProposal): void {
    const current = this.proposal();
    if (current) this.proposal.set(fn(current));
  }

  setField(field: 'title' | 'description', value: string): void {
    this.update((p) => ({ ...p, [field]: value }));
  }

  setSubtask(index: number, patch: Partial<Pick<AiProposalSubtask, 'label' | 'text' | 'points'>>): void {
    this.update((p) => ({ ...p, subtasks: p.subtasks.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  }

  /**
   * 2. mód: a részfeladatok új sorrendje (régi index, vagy null = új, üres részfeladat). A címkék 1., 2., … szerint újraszámozódnak
   * (a kimenet „N. feladat” része a címkéből jön), a kódrészletek együtt mozognak - csak azoknál a nyelveknél, ahol vannak (a nem
   * Python nyelveknél a BE üres listát ad: ott vagy egy sincs, vagy részfeladatonként egy).
   */
  private reorderSubtasks(order: (number | null)[]): void {
    this.update((p) => ({
      ...p,
      subtasks: order.map((from, i) => ({
        ...(from === null ? { subTaskId: null, text: '', points: 1, existing: false, pointsExisting: false } : p.subtasks[from]),
        label: `${i + 1}.`,
      })),
      languages: p.languages.map((l) =>
        l.snippets.length === 0 ? l : { ...l, snippets: order.map((from) => (from === null ? undefined : l.snippets[from]) ?? { code: '', existing: false }) },
      ),
    }));
  }

  private subtaskIndices(): number[] {
    return (this.proposal()?.subtasks ?? []).map((_, i) => i);
  }

  addSubtask(): void {
    const order: (number | null)[] = this.subtaskIndices();
    if (order.length < MAX_SUBTASKS) this.reorderSubtasks([...order, null]);
  }

  removeSubtask(index: number): void {
    const order = this.subtaskIndices();
    if (order.length > 1) this.reorderSubtasks(order.filter((i) => i !== index));
  }

  moveSubtask(index: number, delta: -1 | 1): void {
    const order = this.subtaskIndices();
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    this.reorderSubtasks(order);
  }

  setDataFileName(fileName: string): void {
    this.update((p) => (p.dataFile ? { ...p, dataFile: { ...p.dataFile, fileName } } : p));
  }

  /** Átírt szkript: a tartalom törlődik, az újraellenőrzés futtatja le újra a generátort. */
  setGenerator(generatorPython: string): void {
    this.update((p) => (p.dataFile ? { ...p, dataFile: { ...p.dataFile, generatorPython, content: null } } : p));
  }

  /** Saját (kézzel szerkesztett) adatfájl betöltése, legfeljebb 1 MB. */
  async loadDataFile(file: File): Promise<void> {
    this.dataFileError.set(null);
    if (file.size > MAX_DATA_FILE_BYTES) {
      this.dataFileError.set('A fájl legfeljebb 1 MB lehet.');
      return;
    }
    const content = await file.text();
    this.update((p) => (p.dataFile ? { ...p, dataFile: { ...p.dataFile, content } } : p));
  }

  setStdin(stdin: string): void {
    this.update((p) => ({ ...p, stdin: stdin === '' ? null : stdin }));
  }

  setSolution(languageIndex: number, solution: string): void {
    this.update((p) => ({ ...p, languages: p.languages.map((l, i) => (i === languageIndex ? { ...l, solution } : l)) }));
  }

  setSnippet(languageIndex: number, snippetIndex: number, code: string): void {
    this.update((p) => ({
      ...p,
      languages: p.languages.map((l, i) =>
        i === languageIndex ? { ...l, snippets: l.snippets.map((s, j) => (j === snippetIndex ? { ...s, code } : s)) } : l,
      ),
    }));
  }
}
