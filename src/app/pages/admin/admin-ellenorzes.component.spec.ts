import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AdminEllenorzesComponent } from './admin-ellenorzes.component';
import { AdminQuestionReportService } from '../../services/admin/admin-question-report.service';
import { AdminInstitutionalInquiryService } from '../../services/admin/admin-institutional-inquiry.service';
import { ToastService } from '../../shared/toast/toast.service';
import { QuizQuestionReportDto } from '../../models/question-report.model';
import { InstitutionalInquiryDto } from '../../models/institutional-inquiry.model';

function makeReport(overrides: Partial<QuizQuestionReportDto> = {}): QuizQuestionReportDto {
  return {
    id: 1,
    questionId: 10,
    questionText: 'Mi az A?',
    quizId: null,
    quizTitle: null,
    topicName: 'Téma',
    reason: 'Hibás válasz',
    createdAt: '2026-09-01T10:00:00',
    isReviewed: false,
    reviewedAt: null,
    questionReportCount: 2,
    questionIsApproved: true,
    ...overrides,
  };
}

function makeInquiry(overrides: Partial<InstitutionalInquiryDto> = {}): InstitutionalInquiryDto {
  return {
    id: 1,
    schoolName: 'Teszt Iskola',
    contactName: 'Kiss Péter',
    email: 'kiss@iskola.hu',
    createdAt: '2026-09-01T10:00:00',
    isHandled: false,
    ...overrides,
  };
}

describe('AdminEllenorzesComponent - A5: kérdés-jelentések admin nézet', () => {
  let svcMock: {
    getReports: ReturnType<typeof vi.fn>;
    resolve: ReturnType<typeof vi.fn>;
    approveQuestion: ReturnType<typeof vi.fn>;
  };
  let inquirySvcMock: {
    getInquiries: ReturnType<typeof vi.fn>;
    markHandled: ReturnType<typeof vi.fn>;
  };
  let toastMock: { success: ReturnType<typeof vi.fn>; danger: ReturnType<typeof vi.fn> };

  function configure(reports: QuizQuestionReportDto[] = [], totalCount?: number) {
    svcMock = {
      getReports: vi.fn().mockReturnValue(of({ items: reports, totalCount: totalCount ?? reports.length })),
      resolve: vi.fn().mockReturnValue(of(null)),
      approveQuestion: vi.fn().mockReturnValue(of(null)),
    };
    inquirySvcMock = {
      getInquiries: vi.fn().mockReturnValue(of({ items: [], totalCount: 0 })),
      markHandled: vi.fn().mockReturnValue(of(null)),
    };
    toastMock = { success: vi.fn(), danger: vi.fn() };

    TestBed.configureTestingModule({
      imports: [AdminEllenorzesComponent],
      providers: [
        { provide: AdminQuestionReportService, useValue: svcMock },
        { provide: AdminInstitutionalInquiryService, useValue: inquirySvcMock },
        { provide: ToastService, useValue: toastMock },
      ],
    });
  }

  it('betöltéskor megjeleníti a nyitott jelentéseket', () => {
    configure([makeReport({ id: 1 }), makeReport({ id: 2, questionText: 'Mi a B?' })]);
    const fixture = TestBed.createComponent(AdminEllenorzesComponent);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Mi az A?');
    expect(el.textContent).toContain('Mi a B?');
  });

  it('az "Elintézve" gomb kattintásakor resolve() hívódik és a sor eltűnik', () => {
    configure([makeReport({ id: 5 })]);
    const fixture = TestBed.createComponent(AdminEllenorzesComponent);
    fixture.detectChanges();

    const btn = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.btn-primary');
    btn?.click();
    fixture.detectChanges();

    expect(svcMock.resolve).toHaveBeenCalledWith(5);
    expect(toastMock.success).toHaveBeenCalled();
    // onlyOpen módban a lista üres lesz
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nincs elintézetlen jelentés.');
  });

  it('betöltési hiba esetén hibaüzenet jelenik meg', () => {
    configure();
    svcMock.getReports.mockReturnValue(throwError(() => new Error('net')));
    const fixture = TestBed.createComponent(AdminEllenorzesComponent);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('betöltése sikertelen');
  });

  it('az Érdeklődések fülre kattintva betölti az érdeklődéseket', () => {
    configure();
    inquirySvcMock.getInquiries.mockReturnValue(of({ items: [makeInquiry({ id: 7 })], totalCount: 1 }));
    const fixture = TestBed.createComponent(AdminEllenorzesComponent);
    fixture.detectChanges();

    const tabs = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button');
    const inquiryTab = Array.from(tabs).find(b => b.textContent?.includes('Érdeklődések'));
    inquiryTab?.click();
    fixture.detectChanges();

    expect(inquirySvcMock.getInquiries).toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Teszt Iskola');
  });

  it('a Kezelve jelölés gomb eltünteti az érdeklődést (onlyOpen módban)', () => {
    configure();
    const inq = makeInquiry({ id: 99 });
    inquirySvcMock.getInquiries.mockReturnValue(of({ items: [inq], totalCount: 1 }));
    const fixture = TestBed.createComponent(AdminEllenorzesComponent);
    fixture.detectChanges();

    const tabs = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button');
    const inquiryTab = Array.from(tabs).find(b => b.textContent?.includes('Érdeklődések'));
    inquiryTab?.click();
    fixture.detectChanges();

    const handleBtn = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')
    ).find(b => b.textContent?.includes('Kezelve'));
    handleBtn?.click();
    fixture.detectChanges();

    expect(inquirySvcMock.markHandled).toHaveBeenCalledWith(99, null);
    expect(toastMock.success).toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nincs kezeletlen érdeklődés.');
  });
});
