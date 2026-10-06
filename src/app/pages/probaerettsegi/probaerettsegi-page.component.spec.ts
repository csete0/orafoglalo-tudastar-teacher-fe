import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ProbaerettsegiPageComponent } from './probaerettsegi-page.component';
import { MockExamService } from '../../services/mock-exam/mock-exam.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { MockExamGroupResults, MockExamTeacherEvent } from '../../models/mock-exam.model';

const EVENT: MockExamTeacherEvent = {
  slug: 'osz-2026', title: 'Őszi próbaérettségi 2026', registrationOpensAt: '2026-10-26T08:00:00Z', opensAt: '2026-11-23T05:00:00Z',
  startClosesAt: '2026-11-29T17:00:00Z', resultsPlannedAt: '2026-11-30T17:00:00Z', registrationOpen: true, resultsPublished: false,
  groups: [
    { groupId: 1, name: '12.A', memberCount: 25, registered: false, defaultLevel: null, registeredMembers: 2, unconfirmedMembers: 0 },
    { groupId: 2, name: '12.B', memberCount: 20, registered: true, defaultLevel: 'emelt', registeredMembers: 20, unconfirmedMembers: 3 },
  ],
};

const RESULTS = (published: boolean): MockExamGroupResults => ({
  groupId: 2, groupName: '12.B', resultsPublished: published, avgPercent: published ? 64 : null, distribution: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  members: [{ userId: 7, name: 'Kiss Anna', emailConfirmed: false, level: 'emelt', status: published ? 'submitted' : 'started',
    points: published ? 64 : null, maxPoints: published ? 100 : null, percent: published ? 64 : null, grade: published ? 3 : null,
    rank: published ? 12 : null, percentile: published ? 51 : null, focusLossCount: published ? 1 : null, pasteCount: published ? 0 : null, tasks: [] }],
});

describe('ProbaerettsegiPageComponent', () => {
  async function render(event: MockExamTeacherEvent | null, published = false) {
    const api = {
      getCurrent: vi.fn(() => of(event ? { slug: event.slug, title: event.title } : null)),
      get: vi.fn(() => of(event)),
      registerGroup: vi.fn(() => of({ ...EVENT, groups: EVENT.groups.map((g) => ({ ...g, registered: true })) })),
      revokeGroup: vi.fn(() => of(EVENT)),
      getGroupResults: vi.fn(() => of(RESULTS(published))),
    };
    const confirm = { ask: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      imports: [ProbaerettsegiPageComponent],
      providers: [provideRouter([]), { provide: MockExamService, useValue: api }, { provide: ConfirmService, useValue: confirm },
        { provide: ToastService, useValue: { success: vi.fn(), danger: vi.fn() } }],
    });
    const fixture = TestBed.createComponent(ProbaerettsegiPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, api, confirm };
  }

  it('esemény nélkül tájékoztat', async () => {
    const { el } = await render(null);
    expect(el.textContent).toContain('nincs meghirdetett próbaérettségi');
  });

  it('a saját csoportok soronként; a megerősítetlen tagok jelölve; jelentkeztetés a választott szinttel', async () => {
    const { fixture, el, api } = await render(EVENT);
    const rows = el.querySelectorAll('[data-testid="mock-group-row"]');
    expect(rows.length).toBe(2);
    expect(rows[1].textContent).toContain('3 megerősítetlen');

    const select = rows[0].querySelector('select') as HTMLSelectElement;
    select.value = 'emelt';
    select.dispatchEvent(new Event('change'));
    (Array.from(rows[0].querySelectorAll('button')).find((b) => b.textContent?.includes('Jelentkeztetés')) as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(api.registerGroup).toHaveBeenCalledWith('osz-2026', 1, 'emelt');
  });

  it('visszavonás csak megerősítés után', async () => {
    const { fixture, el, api, confirm } = await render(EVENT);
    const row = el.querySelectorAll('[data-testid="mock-group-row"]')[1];
    (Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.includes('Visszavonás')) as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(confirm.ask).toHaveBeenCalled();
    expect(api.revokeGroup).toHaveBeenCalledWith('osz-2026', 2);
  });

  it('a hét alatt csak állapot (pontoszlop nincs), közzététel után a pontok is', async () => {
    for (const published of [false, true]) {
      TestBed.resetTestingModule();
      const { fixture, el } = await render({ ...EVENT, resultsPublished: published }, published);
      const row = el.querySelectorAll('[data-testid="mock-group-row"]')[1];
      (Array.from(row.querySelectorAll('button')).find((b) => /Állapot|Eredmények/.test(b.textContent ?? '')) as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      const panel = el.querySelector('[data-testid="mock-group-results"]')!.textContent!;
      expect(panel).toContain('megerősítetlen e-mail');
      expect(panel.includes('Percentilis')).toBe(published);
      expect(panel).toContain(published ? 'beadta' : 'elkezdte');
    }
  });
});
