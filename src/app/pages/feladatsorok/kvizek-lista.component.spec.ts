import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TeacherQuizDto } from '../../models/teacher-quiz.model';
import { TeacherQuizStore } from '../../services/teacher-quiz/teacher-quiz.store';
import { ToastService } from '../../shared/toast/toast.service';
import { KvizekListaComponent } from './kvizek-lista.component';

function makeQuiz(overrides: Partial<TeacherQuizDto> = {}): TeacherQuizDto {
  return {
    id: 1,
    title: 'Teszt kvíz',
    description: null,
    isPublished: false,
    takedownAt: null,
    takedownReason: null,
    questionCount: 6,
    pendingQuestionCount: 0,
    assignedGroupCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('KvizekListaComponent', () => {
  let storeMock: {
    quizzes: ReturnType<typeof signal<TeacherQuizDto[]>>;
    mineLoading: ReturnType<typeof signal<boolean>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    loadMine: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };

  function configure(quizzes: TeacherQuizDto[]) {
    storeMock = {
      quizzes: signal(quizzes),
      mineLoading: signal(false),
      loading: signal(false),
      error: signal(null),
      loadMine: vi.fn(),
      create: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [KvizekListaComponent],
      providers: [
        provideRouter([]),
        { provide: TeacherQuizStore, useValue: storeMock },
        { provide: ToastService, useValue: { success: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(KvizekListaComponent);
    fixture.detectChanges();
    return fixture;
  }

  /**
   * UI-TT-217: a cím-blokk (ikon+cím) és a jelvény-csoport (jóváhagyásra-vár jelvény +
   * státusz-jelvény + nyíl) korábban EGYETLEN `flex items-center gap-3` sorban élt. Ha egy
   * kvíznek EGYIDEJŰLEG volt jóváhagyásra váró AI-kérdése ÉS státusz-jelvénye (2 `shrink-0`
   * jelvény együtt), a két jelvény + ikon + nyíl együttes szélessége 360px-en túllépte a
   * kártya szélességét, a `flex-1 min-w-0 truncate` cím-konténer szélessége nullára
   * szorult, és a cím TELJESEN eltűnt (nem csonkolt "…", hanem semmi). A fix a cím-blokkot
   * és a jelvény-csoportot két KÜLÖN flex-gyerekre bontja, `flex-col`-lal a szülőn `sm:`
   * alatt - a cím-blokk így sosem versenyez a jelvényekért a szélességért.
   */
  it('BUG UI-TT-217 javítva: a cím-blokk és a jelvény-csoport külön flex-gyerek, a szülő flex-col sm: alatt', () => {
    const fixture = configure([
      makeQuiz({ id: 42, title: 'Egyidejűleg 2 jelvényes kvíz', pendingQuestionCount: 1, isPublished: false }),
    ]);

    const row = fixture.nativeElement.querySelector('a.card-link > div.p-4') as HTMLElement;
    expect(row.className).toContain('flex-col');
    expect(row.className).toContain('sm:flex-row');

    const titleBlock = row.children[0] as HTMLElement;
    expect(titleBlock.textContent).toContain('Egyidejűleg 2 jelvényes kvíz');
    // A cím-blokk NEM tartalmazhatja a jelvényeket - azok egy külön flex-gyerekben
    // vannak, hogy 360px-en (flex-col alatt) saját, teljes szélességű sorba kerüljenek.
    expect(titleBlock.textContent).not.toContain('jóváhagyásra vár');
    expect(titleBlock.textContent).not.toContain('Piszkozat');

    const badgeGroup = row.children[1] as HTMLElement;
    expect(badgeGroup.textContent).toContain('jóváhagyásra vár');
    expect(badgeGroup.textContent).toContain('Piszkozat');
  });

  it('a cím span megtartja a truncate + flex-1 + min-w-0 osztályokat (a hosszú cím csonkolása változatlan)', () => {
    const fixture = configure([makeQuiz({ id: 1, title: 'Rövid cím' })]);

    const titleSpan = fixture.nativeElement.querySelector('.font-bold.block.truncate') as HTMLElement;
    const titleContainer = titleSpan.closest('.flex-1.min-w-0') as HTMLElement | null;
    expect(titleContainer).not.toBeNull();
  });
});
