import { TestBed } from '@angular/core/testing';
import { AiCodeTaskProposal, AiCodeTaskReport } from '../../../models/ai-code-task.model';
import { AiTaskDataFileTabComponent, head } from './ai-task-data-file-tab.component';
import { AiTaskPreviewState } from './ai-task-preview.state';

const proposal = (): AiCodeTaskProposal => ({
  title: 't',
  description: 'd',
  subtasks: [{ subTaskId: null, label: '1.', text: 'x', points: 1, existing: false, pointsExisting: false }],
  dataFile: { fileName: 'adat.txt', generatorPython: 'print(1)', content: 'a\nb\n' },
  existingInputFiles: [],
  stdin: null,
  stdinExisting: false,
  languages: [{ language: 'python', solution: 's', solutionExisting: false, snippets: [] }],
});

const report: AiCodeTaskReport = { status: 'ok', canSave: true, errors: [], warnings: [], dataFile: null, languages: [] };

describe('AiTaskDataFileTabComponent', () => {
  function create() {
    TestBed.configureTestingModule({ imports: [AiTaskDataFileTabComponent], providers: [AiTaskPreviewState] });
    const state = TestBed.inject(AiTaskPreviewState);
    state.show({ proposal: proposal(), report, model: 'm', notes: null, reasked: false });
    const fixture = TestBed.createComponent(AiTaskDataFileTabComponent);
    fixture.componentRef.setInput('mode', 'new');
    fixture.componentRef.setInput('proposal', state.proposal()!);
    fixture.componentRef.setInput('report', report);
    fixture.detectChanges();
    return { fixture, state };
  }

  function upload(fixture: ReturnType<typeof create>['fixture'], file: File): HTMLInputElement {
    const inputEl = fixture.nativeElement.querySelector('[data-testid="ai-task-df-upload"]') as HTMLInputElement;
    Object.defineProperty(inputEl, 'files', { value: [file], configurable: true });
    inputEl.dispatchEvent(new Event('change'));
    return inputEl;
  }

  it('saját változat betöltése: a tartalom a javaslatba kerül (és módosítottnak számít)', async () => {
    const { fixture, state } = create();
    upload(fixture, new File(['x 1\ny 2\n'], 'adat.txt', { type: 'text/plain' }));
    await vi.waitFor(() => expect(state.proposal()!.dataFile!.content).toBe('x 1\ny 2\n'));
    expect(state.dirty()).toBe(true);
    expect(state.dataFileError()).toBeNull();
  });

  it('1 MB fölötti fájlt nem tölt be, hibát mutat', async () => {
    const { fixture, state } = create();
    upload(fixture, new File([new Uint8Array(1024 * 1024 + 1)], 'nagy.txt'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(state.dataFileError()).toBe('A fájl legfeljebb 1 MB lehet.');
    expect(state.proposal()!.dataFile!.content).toBe('a\nb\n');
    expect(fixture.nativeElement.textContent).toContain('A fájl legfeljebb 1 MB lehet.');
  });

  it('a fájl elejéből legfeljebb 40 sort mutat, a többit összegzi', () => {
    const many = Array.from({ length: 45 }, (_, i) => `${i}`).join('\n');
    expect(head(many).split('\n')).toHaveLength(41);
    expect(head(many)).toContain('… (további 5 sor)');
    expect(head('a\nb')).toBe('a\nb');
  });
});
