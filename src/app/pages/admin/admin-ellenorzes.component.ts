import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminQuestionReportService } from '../../services/admin/admin-question-report.service';
import { AdminInstitutionalInquiryService } from '../../services/admin/admin-institutional-inquiry.service';
import { QuizQuestionReportDto } from '../../models/question-report.model';
import { InstitutionalInquiryDto } from '../../models/institutional-inquiry.model';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { ToastService } from '../../shared/toast/toast.service';

type Tab = 'reports' | 'inquiries';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-ellenorzes',
  standalone: true,
  imports: [DatePipe, FormsModule, LocalSpinnerComponent],
  template: `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <h1 class="page-title">Ellenőrzés</h1>
      <div class="hairline"></div>

      <!-- Tab váltó -->
      <div class="flex gap-1 mb-6 text-sm border-b border-border-default">
        <button (click)="setTab('reports')"
          class="px-4 py-2 font-semibold transition-colors -mb-px border-b-2"
          [class.border-primary]="activeTab() === 'reports'"
          [class.text-primary]="activeTab() === 'reports'"
          [class.border-transparent]="activeTab() !== 'reports'"
          [class.text-text-muted]="activeTab() !== 'reports'">
          Kérdés-jelentések
        </button>
        <button (click)="setTab('inquiries')"
          class="px-4 py-2 font-semibold transition-colors -mb-px border-b-2"
          [class.border-primary]="activeTab() === 'inquiries'"
          [class.text-primary]="activeTab() === 'inquiries'"
          [class.border-transparent]="activeTab() !== 'inquiries'"
          [class.text-text-muted]="activeTab() !== 'inquiries'">
          Érdeklődések
        </button>
      </div>

      <!-- Kérdés-jelentések fül -->
      @if (activeTab() === 'reports') {
        <div class="flex gap-2 mb-6 text-sm flex-wrap">
          @for (option of filterOptions; track option.value) {
            <button (click)="setOnlyOpen(option.value)"
              class="px-3 py-1.5 rounded-lg border font-semibold transition-colors"
              [class.bg-primary]="onlyOpen() === option.value"
              [class.text-white]="onlyOpen() === option.value"
              [class.border-primary]="onlyOpen() === option.value"
              [class.border-border-default]="onlyOpen() !== option.value"
              [class.text-text-muted]="onlyOpen() !== option.value">
              {{ option.label }}
            </button>
          }
        </div>

        @if (reportsError()) {
          <p class="text-danger text-sm mb-4">{{ reportsError() }}</p>
        }
        @if (reportsLoading()) {
          <app-local-spinner />
        }

        @if (!reportsLoading()) {
          <ul class="space-y-3">
            @for (report of reports(); track report.id) {
              <li class="card p-4">
                <div class="flex justify-between items-start gap-3 mb-2">
                  <div class="min-w-0">
                    <p class="font-medium text-sm truncate">{{ report.questionText }}</p>
                    <p class="text-xs text-text-muted mt-0.5">
                      @if (report.quizTitle) {
                        Kvíz: <span class="font-semibold">{{ report.quizTitle }}</span> ·
                      } @else {
                        <span class="italic">Közös bank-kérdés</span> ·
                      }
                      Téma: {{ report.topicName }} · {{ report.questionReportCount }} jelentés
                      @if (!report.questionIsApproved) {
                        · <span class="text-warning font-semibold">deaktivált</span>
                      }
                    </p>
                  </div>
                  <span class="text-xs text-text-muted shrink-0">{{ report.createdAt | date: 'yyyy.MM.dd' }}</span>
                </div>
                @if (report.reason) {
                  <p class="text-sm mb-2 break-words border-l-2 border-border-default pl-2 text-text-muted italic">
                    „{{ report.reason }}"
                  </p>
                }
                @if (report.isReviewed) {
                  <span class="badge badge-success text-xs">Elintézve {{ report.reviewedAt | date: 'yyyy.MM.dd' }}</span>
                } @else {
                  <div class="flex gap-2 mt-2">
                    <button (click)="resolve(report)" [disabled]="pending()"
                      class="btn btn-primary !px-3 !py-1.5 !text-xs">
                      Elintézve
                    </button>
                    @if (!report.questionIsApproved) {
                      <button (click)="approveQuestion(report)" [disabled]="pending()"
                        class="btn !bg-success !text-white !px-3 !py-1.5 !text-xs">
                        Kérdés visszaengedélyezése
                      </button>
                    }
                  </div>
                }
              </li>
            } @empty {
              @if (!reportsLoading()) {
                <li class="text-text-muted text-sm py-6 text-center">
                  {{ onlyOpen() ? 'Nincs elintézetlen jelentés.' : 'Nincs egyetlen jelentés sem.' }}
                </li>
              }
            }
          </ul>

          @if (totalCount() > pageSize) {
            <div class="flex items-center gap-4 mt-6 text-sm">
              <button (click)="prevPage()" [disabled]="page() === 1" class="btn btn-ghost !px-3 !py-1.5">← Előző</button>
              <span class="text-text-muted">{{ page() }} / {{ totalPages() }}</span>
              <button (click)="nextPage()" [disabled]="page() >= totalPages()" class="btn btn-ghost !px-3 !py-1.5">Következő →</button>
            </div>
          }
        }
      }

      <!-- Érdeklődések fül -->
      @if (activeTab() === 'inquiries') {
        <div class="flex gap-2 mb-6 text-sm flex-wrap">
          @for (option of filterOptions; track option.value) {
            <button (click)="setInquiriesOnlyOpen(option.value)"
              class="px-3 py-1.5 rounded-lg border font-semibold transition-colors"
              [class.bg-primary]="inquiriesOnlyOpen() === option.value"
              [class.text-white]="inquiriesOnlyOpen() === option.value"
              [class.border-primary]="inquiriesOnlyOpen() === option.value"
              [class.border-border-default]="inquiriesOnlyOpen() !== option.value"
              [class.text-text-muted]="inquiriesOnlyOpen() !== option.value">
              {{ option.label }}
            </button>
          }
        </div>

        @if (inquiriesError()) {
          <p class="text-danger text-sm mb-4">{{ inquiriesError() }}</p>
        }
        @if (inquiriesLoading()) {
          <app-local-spinner />
        }

        @if (!inquiriesLoading()) {
          <ul class="space-y-3">
            @for (inq of inquiries(); track inq.id) {
              <li class="card p-4">
                <div class="flex justify-between items-start gap-3 mb-1">
                  <div class="min-w-0">
                    <p class="font-semibold text-sm truncate">{{ inq.schoolName }}</p>
                    <p class="text-xs text-text-muted mt-0.5">
                      {{ inq.contactName }} · {{ inq.email }}
                      @if (inq.phone) { · {{ inq.phone }} }
                      @if (inq.estimatedStudents) { · ~{{ inq.estimatedStudents }} fő }
                    </p>
                  </div>
                  <span class="text-xs text-text-muted shrink-0">{{ inq.createdAt | date: 'yyyy.MM.dd' }}</span>
                </div>
                @if (inq.message) {
                  <p class="text-sm my-2 break-words border-l-2 border-border-default pl-2 text-text-muted italic">
                    „{{ inq.message }}"
                  </p>
                }
                @if (inq.isHandled) {
                  <span class="badge badge-success text-xs">Kezelve {{ inq.handledAt | date: 'yyyy.MM.dd' }}</span>
                  @if (inq.note) {
                    <p class="text-xs text-text-muted mt-1 italic">Megjegyzés: {{ inq.note }}</p>
                  }
                } @else {
                  <div class="mt-2 space-y-2">
                    <input [(ngModel)]="handledNotes[inq.id]" placeholder="Megjegyzés (opcionális)"
                      class="input !py-1.5 !text-xs" maxlength="500" />
                    <button (click)="markHandled(inq)" [disabled]="pending()"
                      class="btn btn-primary !px-3 !py-1.5 !text-xs">
                      Kezelve jelölés
                    </button>
                  </div>
                }
              </li>
            } @empty {
              @if (!inquiriesLoading()) {
                <li class="text-text-muted text-sm py-6 text-center">
                  {{ inquiriesOnlyOpen() ? 'Nincs kezeletlen érdeklődés.' : 'Nincs egyetlen érdeklődés sem.' }}
                </li>
              }
            }
          </ul>

          @if (inquiriesTotalCount() > pageSize) {
            <div class="flex items-center gap-4 mt-6 text-sm">
              <button (click)="prevInquiriesPage()" [disabled]="inquiriesPage() === 1" class="btn btn-ghost !px-3 !py-1.5">← Előző</button>
              <span class="text-text-muted">{{ inquiriesPage() }} / {{ inquiriesTotalPages() }}</span>
              <button (click)="nextInquiriesPage()" [disabled]="inquiriesPage() >= inquiriesTotalPages()" class="btn btn-ghost !px-3 !py-1.5">Következő →</button>
            </div>
          }
        }
      }
    </div>
  `,
})
export class AdminEllenorzesComponent implements OnInit {
  private readonly svc = inject(AdminQuestionReportService);
  private readonly inquirySvc = inject(AdminInstitutionalInquiryService);
  private readonly toast = inject(ToastService);

  readonly activeTab = signal<Tab>('reports');
  readonly pageSize = 20;

  // ── Kérdés-jelentések ─────────────────────────
  readonly reports = signal<QuizQuestionReportDto[]>([]);
  readonly reportsLoading = signal(false);
  readonly pending = signal(false);
  readonly reportsError = signal<string | null>(null);
  readonly onlyOpen = signal(true);
  readonly page = signal(1);
  readonly totalCount = signal(0);
  readonly totalPages = () => Math.max(1, Math.ceil(this.totalCount() / this.pageSize));

  // ── Érdeklődések ──────────────────────────────
  readonly inquiries = signal<InstitutionalInquiryDto[]>([]);
  readonly inquiriesLoading = signal(false);
  readonly inquiriesError = signal<string | null>(null);
  readonly inquiriesOnlyOpen = signal(true);
  readonly inquiriesPage = signal(1);
  readonly inquiriesTotalCount = signal(0);
  readonly inquiriesTotalPages = () => Math.max(1, Math.ceil(this.inquiriesTotalCount() / this.pageSize));
  readonly handledNotes: Record<number, string> = {};

  readonly filterOptions = [
    { value: true, label: 'Csak nyitottak' },
    { value: false, label: 'Összes' },
  ];

  ngOnInit(): void {
    this.loadReports();
  }

  setTab(tab: Tab): void {
    this.activeTab.set(tab);
    if (tab === 'inquiries' && this.inquiries().length === 0 && !this.inquiriesLoading()) {
      this.loadInquiries();
    }
  }

  // ── Kérdés-jelentések ─────────────────────────

  setOnlyOpen(value: boolean): void {
    this.onlyOpen.set(value);
    this.page.set(1);
    this.loadReports();
  }

  prevPage(): void {
    if (this.page() > 1) { this.page.update(p => p - 1); this.loadReports(); }
  }

  nextPage(): void {
    if (this.page() < this.totalPages()) { this.page.update(p => p + 1); this.loadReports(); }
  }

  private loadReports(): void {
    this.reportsLoading.set(true);
    this.reportsError.set(null);
    this.svc.getReports(this.onlyOpen(), this.page(), this.pageSize).subscribe({
      next: (data) => {
        this.reports.set(data.items);
        this.totalCount.set(data.totalCount);
        this.reportsLoading.set(false);
      },
      error: () => {
        this.reportsError.set('A jelentések betöltése sikertelen.');
        this.reportsLoading.set(false);
      },
    });
  }

  resolve(report: QuizQuestionReportDto): void {
    this.pending.set(true);
    this.svc.resolve(report.id).subscribe({
      next: () => {
        this.pending.set(false);
        if (this.onlyOpen()) {
          this.reports.update(list => list.filter(r => r.id !== report.id));
          this.totalCount.update(n => n - 1);
        } else {
          this.reports.update(list => list.map(r => r.id === report.id ? { ...r, isReviewed: true } : r));
        }
        this.toast.success('Elintézve jelölve.');
      },
      error: () => { this.pending.set(false); this.toast.danger('Hiba történt.'); },
    });
  }

  approveQuestion(report: QuizQuestionReportDto): void {
    this.pending.set(true);
    this.svc.approveQuestion(report.questionId).subscribe({
      next: () => {
        this.pending.set(false);
        this.reports.update(list =>
          list.map(r => r.questionId === report.questionId ? { ...r, questionIsApproved: true } : r));
        this.toast.success('Kérdés visszaengedélyezve.');
      },
      error: () => { this.pending.set(false); this.toast.danger('Hiba történt.'); },
    });
  }

  // ── Érdeklődések ──────────────────────────────

  setInquiriesOnlyOpen(value: boolean): void {
    this.inquiriesOnlyOpen.set(value);
    this.inquiriesPage.set(1);
    this.loadInquiries();
  }

  prevInquiriesPage(): void {
    if (this.inquiriesPage() > 1) { this.inquiriesPage.update(p => p - 1); this.loadInquiries(); }
  }

  nextInquiriesPage(): void {
    if (this.inquiriesPage() < this.inquiriesTotalPages()) { this.inquiriesPage.update(p => p + 1); this.loadInquiries(); }
  }

  private loadInquiries(): void {
    this.inquiriesLoading.set(true);
    this.inquiriesError.set(null);
    this.inquirySvc.getInquiries(this.inquiriesOnlyOpen(), this.inquiriesPage(), this.pageSize).subscribe({
      next: (data) => {
        this.inquiries.set(data.items);
        this.inquiriesTotalCount.set(data.totalCount);
        this.inquiriesLoading.set(false);
      },
      error: () => {
        this.inquiriesError.set('Az érdeklődések betöltése sikertelen.');
        this.inquiriesLoading.set(false);
      },
    });
  }

  markHandled(inq: InstitutionalInquiryDto): void {
    this.pending.set(true);
    const note = this.handledNotes[inq.id] || null;
    this.inquirySvc.markHandled(inq.id, note).subscribe({
      next: () => {
        this.pending.set(false);
        if (this.inquiriesOnlyOpen()) {
          this.inquiries.update(list => list.filter(i => i.id !== inq.id));
          this.inquiriesTotalCount.update(n => n - 1);
        } else {
          this.inquiries.update(list => list.map(i =>
            i.id === inq.id
              ? { ...i, isHandled: true, handledAt: new Date().toISOString(), note: note ?? undefined }
              : i
          ));
        }
        this.toast.success('Érdeklődés kezelve jelölve.');
      },
      error: () => { this.pending.set(false); this.toast.danger('Hiba történt.'); },
    });
  }
}
