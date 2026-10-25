import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ElmeletiDolgozatKiadasComponent } from './elmeleti-dolgozat-kiadas.component';
import { TeacherQuizTestService } from '../../services/teacher-quiz/teacher-quiz-test.service';
import { ToastService } from '../../shared/toast/toast.service';

describe('ElmeletiDolgozatKiadasComponent', () => {
  it('a választott teszt alapidejével és a megadott ablakkal adja ki a csoportnak, utána az áttekintőre linkel', () => {
    const api = {
      getTheoryTestOptions: vi.fn().mockReturnValue(of([
        { kind: 'szakmai', topicKey: null, name: 'Technikum elméleti próbateszt', questionCount: 20, defaultMinutes: 45 },
        { kind: 'topic', topicKey: 'alap-git', name: 'Alapvizsga: Git és csoportmunka', questionCount: 10, defaultMinutes: 15 },
      ])),
      createTheoryTest: vi.fn().mockReturnValue(of({ id: 31, groupId: 4, groupName: '11.c', assignedAt: '2026-10-25T08:00:00Z', isTest: true })),
    };
    TestBed.configureTestingModule({
      imports: [ElmeletiDolgozatKiadasComponent],
      providers: [
        provideRouter([]),
        { provide: TeacherQuizTestService, useValue: api },
        { provide: ToastService, useValue: { success: vi.fn(), danger: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(ElmeletiDolgozatKiadasComponent);
    fixture.componentRef.setInput('groupId', 4);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.form.controls.timeLimitMinutes.value).toBe(45);

    component.form.controls.option.setValue(1);
    component.applyDefaultMinutes();
    const opens = new Date(Date.now() + 3600_000);
    const due = new Date(Date.now() + 2 * 3600_000);
    const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    component.form.patchValue({ opensAt: local(opens), dueAt: local(due) });
    expect(component.form.valid).toBe(true);
    component.assign();
    fixture.detectChanges();

    expect(api.createTheoryTest).toHaveBeenCalledWith(expect.objectContaining({
      groupId: 4, kind: 'topic', topicKey: 'alap-git', timeLimitMinutes: 15,
    }));
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="theory-test-created"]')!.getAttribute('href')).toBe('/dolgozatok/kviz/31');
    TestBed.resetTestingModule();
  });
});
