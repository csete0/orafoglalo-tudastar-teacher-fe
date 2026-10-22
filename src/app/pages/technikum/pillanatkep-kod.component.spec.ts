import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { PillanatkepKodComponent, desktopFileRank } from './pillanatkep-kod.component';
import { TeacherTechnikumService } from '../../services/technikum/teacher-technikum.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ExamCodeCommentDto, ExamSessionSnapshotDto } from '../../models/technikum.model';

const part = (partKey: ExamSessionSnapshotDto['session']['parts'][number]['partKey']) => ({ partKey, title: partKey, maxPoints: 10, result: null });

const snapshot: ExamSessionSnapshotDto = {
  sessionId: 31, assignmentId: 7, userId: 55, studentName: 'Kiss Anna', projectSlug: 'konyvtar', projectTitle: 'Könyvtár', runtime: 'judge0-aspnet',
  files: {
    'console/Program.cs': 'var a = 1;\nvar b = 2;\nConsole.WriteLine(a + b);',
    'console/adatok.txt': '1;Egri',
    'backend/Program.cs': '// API',
    'db/schema.sql': 'CREATE TABLE x();',
  },
  readOnlyPaths: ['console/adatok.txt', 'db/schema.sql'],
  partRoots: { console: 'console/', api: 'backend/', web: 'frontend/web/', client: 'frontend/client/' },
  gui: { uploadId: 3, uploadedAt: '2026-10-10T11:00:00', files: { 'Kolcsonzes/Form1.cs': 'class Form1\n{\n}' }, imageCount: 2 },
  session: {
    id: 31, projectSlug: 'konyvtar', assignmentId: 7, status: 'graded', startedAt: '', deadline: '', submittedAt: null, remainingSeconds: 0,
    resultsVisible: true, totalPoints: null, maxPoints: 65, passed: null, parts: [part('console'), part('gui'), part('web'), part('api'), part('client')],
  },
};

const comment = (over: Partial<ExamCodeCommentDto>): ExamCodeCommentDto => ({
  id: 1, partKey: 'console', path: 'console/Program.cs', line: 2, lineText: 'var b = 2;', body: 'Miért 2?', authorName: 'Kovács tanár',
  createdAt: '2026-10-10T12:00:00', updatedAt: null, ...over,
});

describe('PillanatkepKodComponent', () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));

  async function setup(existing: ExamCodeCommentDto[] = [comment({})], sn: ExamSessionSnapshotDto = snapshot) {
    let nextId = 100;
    const api = {
      comments: vi.fn(() => of(existing)),
      guiImage: vi.fn(() => of(new Blob(['png'], { type: 'image/png' }))),
      createComment: vi.fn((_s: number, partKey: string, path: string, line: number, body: string) =>
        of(comment({ id: nextId++, partKey: partKey as ExamCodeCommentDto['partKey'], path, line, body }))),
      updateComment: vi.fn((_s: number, id: number, body: string) => of(comment({ id, body, updatedAt: '2026-10-10T13:00:00' }))),
      deleteComment: vi.fn(() => of(undefined)),
      commentSuggestions: vi.fn(() => of({
        suggestions: [{ path: 'console/Program.cs', line: 3, lineText: 'Console.WriteLine(a + b);', severity: 'javaslat' as const, text: 'Formázd a kimenetet.' }],
        reviewedPaths: ['console/Program.cs'], truncatedPaths: [], skippedFiles: [], droppedCount: 0, model: 'm', quota: { used: 1, limit: 200 },
      })),
    };
    const confirm = { ask: vi.fn(async () => true) };
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:kep'), revokeObjectURL: vi.fn() }));
    TestBed.configureTestingModule({
      imports: [PillanatkepKodComponent],
      providers: [{ provide: TeacherTechnikumService, useValue: api }, { provide: ConfirmService, useValue: confirm }],
    });
    const fixture = TestBed.createComponent(PillanatkepKodComponent);
    fixture.componentRef.setInput('snapshot', sn);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, api, confirm };
  }

  const click = (el: HTMLElement, selector: string) => el.querySelector<HTMLElement>(selector)!.click();
  const lineButton = (el: HTMLElement, n: number) =>
    [...el.querySelectorAll<HTMLButtonElement>('.code-ln--action')].find((b) => b.textContent!.trim() === String(n))!;

  afterEach(() => vi.unstubAllGlobals());

  it('vizsgarészenkénti fülek, a konzolos rész fájljai; a megjegyzés a sora alatt, a fülön a darabszám', async () => {
    const { el, api } = await setup();
    expect(api.comments).toHaveBeenCalledWith(31);
    const tabs = [...el.querySelectorAll('[role="tab"]')].map((t) => t.textContent!.trim());
    expect(tabs[0]).toContain('Konzolos alkalmazás');
    expect(tabs[0]).toContain('1');
    expect(tabs.at(-1)).toBe('Egyéb fájlok');
    const view = el.querySelector('[data-testid="code-view"]')!;
    expect(view.textContent).toContain('var b = 2;');
    expect(el.querySelector('[data-testid="comment-1"]')!.textContent).toContain('Miért 2?');
    // A rész fájllistájában csak a rész fájljai (a backend nem).
    expect(el.textContent).not.toContain('backend/Program.cs');
  });

  it('sorszámra kattintva új megjegyzés a rész, a fájl és a sor megadásával; szerkesztés és törlés', async () => {
    const { fixture, el, api, confirm } = await setup();
    lineButton(el, 3).click();
    fixture.detectChanges();
    const box = el.querySelector<HTMLTextAreaElement>('[data-testid="new-comment"] textarea')!;
    box.value = 'Kerekítés?';
    el.querySelector<HTMLFormElement>('[data-testid="new-comment"]')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.createComment).toHaveBeenCalledWith(31, 'console', 'console/Program.cs', 3, 'Kerekítés?');
    expect(el.querySelector('[data-testid="comment-100"]')!.textContent).toContain('Kerekítés?');

    click(el, '[data-testid="comment-edit-1"]');
    fixture.detectChanges();
    el.querySelector<HTMLTextAreaElement>('#comment-edit-1')!.value = 'Miért pont 2?';
    el.querySelector<HTMLFormElement>('[data-testid="comment-1"] form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.updateComment).toHaveBeenCalledWith(31, 1, 'Miért pont 2?');
    expect(el.querySelector('[data-testid="comment-1"]')!.textContent).toContain('szerkesztve');

    click(el, '[data-testid="comment-delete-1"]');
    await settle();
    fixture.detectChanges();
    expect(confirm.ask).toHaveBeenCalled();
    expect(api.deleteComment).toHaveBeenCalledWith(31, 1);
    expect(el.querySelector('[data-testid="comment-1"]')).toBeNull();
  });

  it('a régi dolgozatra küldött megjegyzés válasza nem kerül a közben megnyitott másik dolgozatba', async () => {
    const { fixture, el, api } = await setup([]);
    const pending = new Subject<ExamCodeCommentDto>();
    api.createComment.mockReturnValueOnce(pending);
    lineButton(el, 1).click();
    fixture.detectChanges();
    el.querySelector<HTMLTextAreaElement>('[data-testid="new-comment"] textarea')!.value = 'Régi';
    el.querySelector<HTMLFormElement>('[data-testid="new-comment"]')!.dispatchEvent(new Event('submit'));
    fixture.componentRef.setInput('snapshot', { ...snapshot, sessionId: 32 });
    fixture.detectChanges();
    pending.next(comment({ id: 900, line: 1, body: 'Régi' }));
    pending.complete();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="comment-900"]')).toBeNull();
    expect(api.comments).toHaveBeenLastCalledWith(32);
  });

  it('kilépett diák dolgozata: a megjegyzések látszanak, de új, szerkesztés, törlés és MI-javaslat nincs', async () => {
    const { el } = await setup([comment({})], { ...snapshot, leftGroup: true });
    expect(el.querySelector('[data-testid="comment-1"]')!.textContent).toContain('Miért 2?');
    expect(el.querySelector('.code-ln--action')).toBeNull();
    expect(el.querySelector('[data-testid="comment-edit-1"]')).toBeNull();
    expect(el.querySelector('[data-testid="comment-delete-1"]')).toBeNull();
    expect(el.querySelector('[data-testid="suggest-part"]')).toBeNull();
  });

  it('a hivatalos (csak olvasható) fájl és az egyéb fájlok nem megjegyezhetők', async () => {
    const { fixture, el } = await setup();
    [...el.querySelectorAll<HTMLButtonElement>('app-kod-olvaso li button')].find((b) => b.textContent!.includes('console/adatok.txt'))!.click();
    fixture.detectChanges();
    expect(el.querySelector('.code-ln--action')).toBeNull();
    click(el, '[data-testid="part-tab-egyeb"]');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="code-view"]')!.textContent).toContain('CREATE TABLE');
    expect(el.querySelector('.code-ln--action')).toBeNull();
    expect(el.querySelector('[data-testid="suggest-part"]')).toBeNull();
  });

  it('grafikus rész: képernyőkép-galéria nagyítással, a zip forrásfájljai megjegyezhetők', async () => {
    const { fixture, el, api } = await setup([]);
    click(el, '[data-testid="part-tab-gui"]');
    fixture.detectChanges();
    expect(api.guiImage).toHaveBeenCalledTimes(2);
    expect(el.querySelectorAll('[data-testid="gui-gallery"] img').length).toBe(2);
    click(el, '[data-testid="gui-thumb-1"]');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="gui-lightbox"]')!.textContent).toContain('2 / 2');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="gui-lightbox"]')).toBeNull();

    expect(el.querySelector('[data-testid="code-view"]')!.textContent).toContain('class Form1');
    lineButton(el, 1).click();
    fixture.detectChanges();
    el.querySelector<HTMLTextAreaElement>('[data-testid="new-comment"] textarea')!.value = 'Nevezd át az űrlapot.';
    el.querySelector<HTMLFormElement>('[data-testid="new-comment"]')!.dispatchEvent(new Event('submit'));
    expect(api.createComment).toHaveBeenCalledWith(31, 'gui', 'Kolcsonzes/Form1.cs', 1, 'Nevezd át az űrlapot.');
  });

  it('MI-javaslat: a rész fájljaira, elfogadva megjegyzés lesz, elvetve eltűnik', async () => {
    const { fixture, el, api } = await setup([]);
    click(el, '[data-testid="suggest-part"]');
    fixture.detectChanges();
    expect(api.commentSuggestions).toHaveBeenCalledWith(31, 'console', null);
    expect(el.textContent).toContain('Havi keret: 1/200');
    const sg = el.querySelector<HTMLFormElement>('[data-testid^="suggestion-"]')!;
    expect(sg.querySelector('textarea')!.value).toBe('Formázd a kimenetet.');
    sg.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.createComment).toHaveBeenCalledWith(31, 'console', 'console/Program.cs', 3, 'Formázd a kimenetet.');
    expect(el.querySelector('[data-testid^="suggestion-"]')).toBeNull();
  });

  const javaSnapshot: ExamSessionSnapshotDto = {
    ...snapshot,
    desktopLanguage: 'java',
    files: {
      'console/Main.java': 'public class Main {\n  public static void main(String[] args) {\n  }\n}',
      'console/Kolcsonzes.java': 'public class Kolcsonzes {\n}',
      'console/adatok.txt': '1;Egri',
      'backend/Program.cs': '// API',
    },
    readOnlyPaths: ['console/adatok.txt'],
    gui: {
      uploadId: 4, uploadedAt: '2026-10-10T11:00:00', imageCount: 0,
      files: {
        'gui/pom.xml': '<project/>',
        'gui/src/main/resources/main.fxml': '<VBox/>',
        'gui/src/main/java/Main.java': 'public class Main {\n}',
        'gui/build.gradle': 'plugins {}',
      },
    },
  };

  const fileList = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('app-kod-olvaso li button')].map((b) => b.textContent!.trim());

  it('Java-dolgozat: nyelv-jelvény az asztali részek fülén, a .java fájlok sorszámozva, megjegyzés a .java sorára', async () => {
    const { fixture, el, api } = await setup([], javaSnapshot);
    expect(el.querySelector('[data-testid="part-lang-console"]')!.textContent!.trim()).toBe('Java');
    expect(el.querySelector('[data-testid="part-lang-gui"]')!.textContent!.trim()).toBe('Java');
    expect(el.querySelector('[data-testid="part-lang-web"]')).toBeNull();
    expect(el.querySelector('[data-testid="part-lang-api"]')).toBeNull();

    expect(fileList(el)).toEqual(['console/Kolcsonzes.java', 'console/Main.java', 'console/adatok.txt (keret)']);
    expect(el.querySelector('[data-testid="code-view"]')!.textContent).toContain('public class Kolcsonzes');
    [...el.querySelectorAll<HTMLButtonElement>('app-kod-olvaso li button')][1].click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.code-line').length).toBe(4);
    lineButton(el, 2).click();
    fixture.detectChanges();
    el.querySelector<HTMLTextAreaElement>('[data-testid="new-comment"] textarea')!.value = 'A main üres.';
    el.querySelector<HTMLFormElement>('[data-testid="new-comment"]')!.dispatchEvent(new Event('submit'));
    expect(api.createComment).toHaveBeenCalledWith(31, 'console', 'console/Main.java', 2, 'A main üres.');
  });

  it('Java GUI-zip: előbb a kézzel írt forrás (.java, .fxml), a projektfájlok (pom.xml, build.gradle) hátul; az fxml megjegyezhető', async () => {
    const { fixture, el, api } = await setup([], javaSnapshot);
    click(el, '[data-testid="part-tab-gui"]');
    fixture.detectChanges();
    expect(fileList(el)).toEqual(['gui/src/main/java/Main.java', 'gui/src/main/resources/main.fxml', 'gui/build.gradle', 'gui/pom.xml']);
    [...el.querySelectorAll<HTMLButtonElement>('app-kod-olvaso li button')][1].click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="code-view"]')!.textContent).toContain('<VBox/>');
    lineButton(el, 1).click();
    fixture.detectChanges();
    el.querySelector<HTMLTextAreaElement>('[data-testid="new-comment"] textarea')!.value = 'Elrendezés?';
    el.querySelector<HTMLFormElement>('[data-testid="new-comment"]')!.dispatchEvent(new Event('submit'));
    expect(api.createComment).toHaveBeenCalledWith(31, 'gui', 'gui/src/main/resources/main.fxml', 1, 'Elrendezés?');
  });

  it('C#-dolgozat (nyelv nélküli régebbi BE is): „C#” jelvény; a GUI-ban a .Designer.cs és a .csproj hátrébb', async () => {
    const { fixture, el } = await setup([], {
      ...snapshot,
      gui: { uploadId: 3, uploadedAt: '2026-10-10T11:00:00', imageCount: 0, files: {
        'App/App.csproj': '<Project/>', 'App/Form1.Designer.cs': 'partial class Form1 {}', 'App/Form1.cs': 'class Form1 {}', 'App/MainWindow.xaml': '<Window/>',
      } },
    });
    expect(el.querySelector('[data-testid="part-lang-console"]')!.textContent!.trim()).toBe('C#');
    click(el, '[data-testid="part-tab-gui"]');
    fixture.detectChanges();
    expect(fileList(el)).toEqual(['App/Form1.cs', 'App/MainWindow.xaml', 'App/Form1.Designer.cs', 'App/App.csproj']);
  });

  it('desktopFileRank: kézzel írt forrás 0, generált 1, minden más 2 (kis-nagybetű független)', () => {
    expect(['Main.JAVA', 'a.fxml', 'Program.cs', 'w.xaml', 'Form1.designer.cs', 'pom.xml', 'build.gradle', 'App.csproj', 'adatok.txt'].map(desktopFileRank))
      .toEqual([0, 0, 0, 0, 1, 2, 2, 2, 2]);
  });
});
