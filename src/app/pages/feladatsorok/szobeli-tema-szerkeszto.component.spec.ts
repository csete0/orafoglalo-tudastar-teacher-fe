import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SzobeliTemaSzerkesztoComponent } from './szobeli-tema-szerkeszto.component';
import { TeacherOralExamService } from '../../services/teacher-oral-exam/teacher-oral-exam.service';
import { GroupStore } from '../../services/group/group.store';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { TeacherOralTopicDto, TeacherOralTopicUpdateRequest } from '../../models/teacher-oral-exam.model';

function topic(overrides: Partial<TeacherOralTopicDto> = {}): TeacherOralTopicDto {
  return {
    id: 3,
    title: 'A fotoszintézis',
    status: 'draft',
    voiceMinuteOptions: [5, 10],
    defaultVoiceMinutes: 10,
    items: [
      {
        slug: 't-1',
        title: 'A fényszakasz',
        keywords: ['klorofill', 'ATP'],
        questions: [
          { text: 'Mi történik a fényszakaszban?', expected: ['vízbontás', 'ATP keletkezik'] },
          { text: 'Hol zajlik?', expected: ['tilakoid', 'kloroplasztisz'] },
          { text: 'Mi a klorofill szerepe?', expected: ['fényelnyelés', 'gerjesztés'] },
        ],
      },
    ],
    rubric: [
      { key: 'tartalom', title: 'Tartalom', points: 18, description: 'Szakmai tartalom' },
      { key: 'kommunikacio', title: 'Kommunikatív készség', points: 4, description: 'Érthetőség' },
    ],
    hasSessions: false,
    ...overrides,
  };
}

describe('SzobeliTemaSzerkesztoComponent', () => {
  function setup(loaded: unknown = of(topic()), confirm = true) {
    const api = {
      topic: vi.fn(() => loaded),
      updateTopic: vi.fn((_id: number, body: TeacherOralTopicUpdateRequest) => of(topic({ ...body }))),
      approveTopic: vi.fn(() => of(topic({ status: 'approved' }))),
      deleteTopic: vi.fn(() => of(undefined)),
      quota: vi.fn(() => of({})),
      assign: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [SzobeliTemaSzerkesztoComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '3' }) } } },
        { provide: TeacherOralExamService, useValue: api },
        { provide: GroupStore, useValue: { loadMine: vi.fn(), activeGroups: signal([]) } },
        { provide: ConfirmService, useValue: { ask: vi.fn(() => Promise.resolve(confirm)) } },
        { provide: ToastService, useValue: { success: vi.fn(), warning: vi.fn() } },
      ],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(SzobeliTemaSzerkesztoComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    return { fixture, c: fixture.componentInstance, el, q, api, navigate };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('betölti a tételeket, a kérdéseket az elvárt elemekkel és a szempontlista összegét', async () => {
    const { fixture, el, q, api } = setup();
    // Az ngModel a mező értékét aszinkron írja.
    await fixture.whenStable();
    expect(api.topic).toHaveBeenCalledWith(3);
    expect(q('oral-topic-status')!.textContent).toContain('Vázlat');
    const question = q('oral-question-0-0')!;
    expect((question.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Mi történik a fényszakaszban?');
    expect((question.querySelectorAll('textarea')[1] as HTMLTextAreaElement).value).toBe('vízbontás\nATP keletkezik');
    expect(q('oral-rubric-sum')!.textContent).toContain('összesen 22 pont');
    expect((q('oral-topic-minutes-5') as HTMLInputElement).checked).toBe(true);
    expect((q('oral-topic-minutes-15') as HTMLInputElement).checked).toBe(false);
    expect(el.textContent).toContain('Jóváhagyás');
    expect(q('oral-topic-assign')).toBeNull();
  });

  it('szerkesztés után a mentés a teljes cserét küldi (kulcsszavak vesszővel, elvárt elemek soronként, rendezett hosszak)', () => {
    const { fixture, c, q, api } = setup();
    c.patch({ title: ' Fotoszintézis – javított ' });
    c.patchItem(0, { keywords: 'klorofill, , ATP ,NADPH' });
    c.patchQuestion(0, 1, { expected: 'tilakoid\n\n kloroplasztisz ' });
    c.toggleMinutes(15);
    c.toggleMinutes(5);
    c.addRubric();
    c.patchRubric(2, { title: 'Felépítés', points: 4 });
    fixture.detectChanges();
    expect(q('oral-rubric-sum')!.textContent).toContain('összesen 26 pont');
    expect((q('oral-topic-approve') as HTMLButtonElement).disabled).toBe(true);

    q('oral-topic-save')!.click();
    const body = api.updateTopic.mock.calls[0][1];
    expect(api.updateTopic.mock.calls[0][0]).toBe(3);
    expect(body.title).toBe('Fotoszintézis – javított');
    expect(body.voiceMinuteOptions).toEqual([10, 15]);
    expect(body.defaultVoiceMinutes).toBe(10);
    expect(body.items[0].keywords).toEqual(['klorofill', 'ATP', 'NADPH']);
    expect(body.items[0].questions[1].expected).toEqual(['tilakoid', 'kloroplasztisz']);
    expect(body.items[0].slug).toBe('t-1');
    expect(body.rubric[2]).toEqual({ key: 'szempont-1', title: 'Felépítés', points: 4, description: '' });
    expect(c.dirty()).toBe(false);
  });

  it('a mezők szerkesztése új modellt ad (a betöltöttet nem mutálja), mentetlennek jelöl, és frissíti az összeget', async () => {
    const { fixture, c, q } = setup();
    await fixture.whenStable();
    const before = c.model()!;
    const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      el.value = value;
      el.dispatchEvent(new Event('input'));
    };
    type(q('oral-item-0')!.querySelector('input') as HTMLInputElement, 'Fényszakasz (javított)');
    type(q('oral-question-0-1')!.querySelectorAll('textarea')[1] as HTMLTextAreaElement, 'tilakoid');
    type(q('oral-rubric-1')!.querySelector('input[type=number]') as HTMLInputElement, '7');
    type(q('oral-topic-title') as HTMLInputElement, 'Új cím');
    fixture.detectChanges();

    const after = c.model()!;
    expect(after).not.toBe(before);
    expect(before.title).toBe('A fotoszintézis');
    expect(before.items[0].title).toBe('A fényszakasz');
    expect(before.items[0].questions[1].expected).toBe('tilakoid\nkloroplasztisz');
    expect(before.rubric[1].points).toBe(4);
    expect(after.title).toBe('Új cím');
    expect(after.items[0].title).toBe('Fényszakasz (javított)');
    expect(after.items[0].questions[1].expected).toBe('tilakoid');
    expect(after.items[0].questions[0]).toBe(before.items[0].questions[0]);
    expect(after.rubric[1].points).toBe(7);
    expect(c.dirty()).toBe(true);
    expect(q('oral-rubric-sum')!.textContent).toContain('összesen 25 pont');
    expect((q('oral-topic-save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('tétel és kérdés felvétele, törlése; az alapértelmezett hossz a kiválasztottak közül', () => {
    const { c } = setup();
    c.addItem();
    expect(c.model()!.items).toHaveLength(2);
    c.addQuestion(1);
    expect(c.model()!.items[1].questions).toHaveLength(2);
    c.removeQuestion(0, 2);
    expect(c.model()!.items[0].questions).toHaveLength(2);
    c.removeItem(1);
    expect(c.model()!.items).toHaveLength(1);
    c.toggleMinutes(10);
    expect(c.model()!.defaultVoiceMinutes).toBe(5);
    expect(c.dirty()).toBe(true);
  });

  it('a 400-as hibalista a mezők mellett; az útvonal nélküli hibák a hibasávban', () => {
    const err = new HttpErrorResponse({
      status: 400,
      error: {
        errorType: 'OralTopicInvalid',
        errorMessage: 'A téma nem menthető - javítsd a jelzett hibákat.',
        details: {
          errors: [
            'items[0].questions[1].expected: legalább 2 elvárt elem kell',
            'items[0].title: kötelező',
            'rubric[1].points: 1–100',
            'phases[1].durationMinutes: legalább egy hossz kell',
          ],
        },
      },
    });
    const { fixture, c, q } = setup();
    TestBed.inject(TeacherOralExamService).updateTopic = vi.fn(() => throwError(() => err));
    c.patch({ title: 'A fotoszintézis 2' });
    c.save();
    fixture.detectChanges();
    expect(q('oral-question-0-1')!.textContent).toContain('legalább 2 elvárt elem kell');
    expect(q('oral-question-0-0')!.textContent).not.toContain('legalább 2 elvárt elem kell');
    expect(q('oral-item-0')!.textContent).toContain('kötelező');
    expect(q('oral-rubric-1')!.textContent).toContain('1–100');
    const banner = q('oral-topic-error')!;
    expect(banner.textContent).toContain('A téma nem menthető');
    expect(banner.textContent).toContain('phases[1].durationMinutes: legalább egy hossz kell');
    expect(banner.textContent).not.toContain('1–100');
  });

  it('jóváhagyás után a „Kiadás csoportnak” megnyitja a párbeszédablakot a téma hosszaival', () => {
    const { fixture, c, q, api } = setup();
    q('oral-topic-approve')!.click();
    fixture.detectChanges();
    expect(api.approveTopic).toHaveBeenCalledWith(3);
    expect(q('oral-topic-status')!.textContent).toContain('Jóváhagyva');
    q('oral-topic-assign')!.click();
    fixture.detectChanges();
    expect(c.assignTarget()).toEqual({ topicId: 3, profileSlug: null, title: 'A fotoszintézis', voiceMinuteOptions: [5, 10], defaultVoiceMinutes: 10 });
    expect(q('oral-assign-dialog')).not.toBeNull();
  });

  it('munkamenet után csak olvasható: nincs mentés, törlés; a mezők tiltva', () => {
    const { el, q } = setup(of(topic({ status: 'approved', hasSessions: true })));
    expect(q('oral-topic-readonly')).not.toBeNull();
    expect(q('oral-topic-save')).toBeNull();
    expect(q('oral-topic-delete')).toBeNull();
    expect((el.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    expect(q('oral-topic-assign')).not.toBeNull();
  });

  it('elhagyás: tiszta állapotban szabad; mentetlen módosításnál megerősítést kér', async () => {
    expect(setup().c.canLeave()).toBe(true);

    TestBed.resetTestingModule();
    const staying = setup(of(topic()), false);
    staying.c.patch({ title: 'Új cím' });
    expect(await staying.c.canLeave()).toBe(false);
    expect(TestBed.inject(ConfirmService).ask).toHaveBeenCalled();
  });

  it('törlés megerősítés után a listára visz; a 409 üzenete megjelenik; betöltési hiba', async () => {
    const { c, api, navigate } = setup();
    await c.remove();
    expect(api.deleteTopic).toHaveBeenCalledWith(3);
    expect(navigate).toHaveBeenCalledWith(['/feladatsorok/szobeli']);

    TestBed.resetTestingModule();
    const conflict = setup();
    TestBed.inject(TeacherOralExamService).deleteTopic = vi.fn(() =>
      throwError(() => new HttpErrorResponse({ status: 409, error: { errorMessage: 'A kiadott téma nem törölhető.' } })));
    await conflict.c.remove();
    expect(conflict.c.error()).toBe('A kiadott téma nem törölhető.');

    TestBed.resetTestingModule();
    const missing = setup(throwError(() => new HttpErrorResponse({ status: 404, error: { errorMessage: 'A szóbeli téma nem található.' } })));
    expect(missing.q('oral-topic-load-error')!.textContent).toContain('nem található');
  });
});
