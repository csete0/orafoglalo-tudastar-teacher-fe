import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { draftErrorMessage, SzobeliTemaVazlatComponent } from './szobeli-tema-vazlat.component';
import { TeacherOralExamService } from '../../services/teacher-oral-exam/teacher-oral-exam.service';
import { ToastService } from '../../shared/toast/toast.service';
import { TeacherOralDraftRequest, TeacherOralDraftResultDto } from '../../models/teacher-oral-exam.model';

const LONG_TEXT = 'A fotoszintézis során a növények fényenergiát kémiai energiává alakítanak. '.repeat(4);
const QUOTA = { month: '2026-10', premium: true, oralDraft: { used: 1, limit: 5 } };

describe('SzobeliTemaVazlatComponent', () => {
  function setup(draft: unknown = of({ topic: { id: 12 }, quota: { used: 2, limit: 5 }, warnings: [] }), quota: unknown = of(QUOTA)) {
    const api = { quota: vi.fn(() => quota), draft: vi.fn((_request: TeacherOralDraftRequest) => draft) };
    const toast = { success: vi.fn(), warning: vi.fn() };
    TestBed.configureTestingModule({
      imports: [SzobeliTemaVazlatComponent],
      providers: [provideRouter([]), { provide: TeacherOralExamService, useValue: api }, { provide: ToastService, useValue: toast }],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(SzobeliTemaVazlatComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    return { fixture, c: fixture.componentInstance, el, q, api, toast, navigate };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('a keretet „1 egység a havi N-ből” formában írja ki', () => {
    const { q } = setup();
    expect(q('oral-draft-quota')!.textContent).toContain('1 egység a havi 5-ből');
    expect(q('oral-draft-quota')!.textContent).toContain('még 4 vázlat');
  });

  it('cím, elég hosszú anyag és tartományon belüli számok nélkül nem indítható', () => {
    const { c } = setup();
    c.text.set(LONG_TEXT);
    expect(c.canGenerate()).toBe(false);
    c.title.set('Fotoszintézis');
    expect(c.canGenerate()).toBe(true);
    c.itemCount.set(11);
    expect(c.canGenerate()).toBe(false);
    c.itemCount.set(10);
    c.questionsPerItem.set(2);
    expect(c.canGenerate()).toBe(false);
    c.questionsPerItem.set(5);
    c.text.set('rövid');
    expect(c.canGenerate()).toBe(false);
  });

  it('a kérés a helyes törzzsel; közben folyamatjelző és nincs második kérés; siker után a szerkesztőbe visz, a figyelmeztetés látszik', () => {
    const pending = new Subject<TeacherOralDraftResultDto>();
    const { fixture, c, q, api, toast, navigate } = setup(pending);
    c.title.set('  Fotoszintézis ');
    c.text.set(LONG_TEXT);
    c.itemCount.set(3);
    c.audience.set('emelt');
    fixture.detectChanges();
    q('oral-draft-submit')!.click();
    fixture.detectChanges();
    expect(api.draft).toHaveBeenCalledWith({
      text: LONG_TEXT.trim(), file: null, title: 'Fotoszintézis', itemCount: 3, questionsPerItem: 4, audience: 'emelt',
    });
    expect(q('oral-draft-progress')).not.toBeNull();
    expect(q('oral-draft-form')).toBeNull();
    c.generate();
    expect(api.draft).toHaveBeenCalledTimes(1);

    pending.next({ topic: { id: 12 } as TeacherOralDraftResultDto['topic'], quota: { used: 2, limit: 5 }, warnings: ['A PDF-ből csak az első 20 oldal.'] });
    expect(navigate).toHaveBeenCalledWith(['/feladatsorok/szobeli', 12]);
    expect(toast.warning).toHaveBeenCalledWith('A PDF-ből csak az első 20 oldal.', 8000);
  });

  it('fájl: kiterjesztés-ellenőrzés, majd a fájllal hív', () => {
    const { c, api } = setup();
    c.title.set('T');
    c.mode.set('file');
    c.onFile({ target: { files: [new File(['x'], 'kep.png')] } } as unknown as Event);
    expect(c.fileError()).toContain('.txt, .docx vagy .pdf');
    const ok = new File(['anyag'], 'jegyzet.docx');
    c.onFile({ target: { files: [ok] } } as unknown as Event);
    c.generate();
    expect(api.draft.mock.calls[0][0]).toMatchObject({ text: null, file: ok });
  });

  it('a validátor hibalistája a hibasávban; elfogyott keret / prémium hiánya tiltó magyarázat', () => {
    const invalid = new HttpErrorResponse({
      status: 400,
      error: { errorType: 'OralTopicInvalid', errorMessage: 'Az MI most nem adott használható tételvázlatot.', details: { errors: ['rubric[0].points: 1–100'] } },
    });
    const { fixture, c, q } = setup(throwError(() => invalid));
    c.title.set('T');
    c.text.set(LONG_TEXT);
    c.generate();
    fixture.detectChanges();
    expect(q('oral-draft-error')!.textContent).toContain('használható tételvázlatot');
    expect(q('oral-draft-error')!.textContent).toContain('rubric[0].points: 1–100');

    TestBed.resetTestingModule();
    const quotaErr = new HttpErrorResponse({ status: 400, error: { errorType: 'AiHelperQuotaExceeded', errorMessage: 'Elfogyott' } });
    const second = setup(throwError(() => quotaErr));
    second.c.title.set('T');
    second.c.text.set(LONG_TEXT);
    second.c.generate();
    second.fixture.detectChanges();
    expect(second.q('oral-draft-blocked')!.textContent).toContain('Elfogyott a havi kereted (5 szóbeli-tételvázlat / hó)');
    expect(second.c.canGenerate()).toBe(false);

    TestBed.resetTestingModule();
    const noPremium = setup(undefined, of({ ...QUOTA, premium: false }));
    expect(noPremium.q('oral-draft-blocked')!.textContent).toContain('Prémium');
    expect(draftErrorMessage({ status: 524 })).toContain('100 mp');
  });
});
