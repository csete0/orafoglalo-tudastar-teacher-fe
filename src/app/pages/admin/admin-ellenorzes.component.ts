import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminQuestionReportService } from '../../services/admin/admin-question-report.service';
import { QuizQuestionReportDto } from '../../models/question-report.model';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-ellenorzes',
  standalone: true,
  imports: [DatePipe, FormsModule, LocalSpinnerComponent],
  template: `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <h1 class="page-title">Ellenőrzés</h1>
      <p class="text-sm text-text-muted mt-1">Kérdés-jelentések áttekintése és elintézése</p>
      <div class="hairline"></div>

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

      @if (error()) {
        <p class="text-danger text-sm mb-4">{{ error() }}</p>
      }
      @if (loading()) {
        <app-local-spinner />
      }

      @if (!loading()) {
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
            @if (!loading()) {
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
    </div>
  `,
})
export class AdminEllenorzesComponent implements OnInit {
  private readonly svc = inject(AdminQuestionReportService);
  private readonly toast = inject(ToastService);

  readonly pageSize = 20;
  readonly reports = signal<QuizQuestionReportDto[]>([]);
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly error = signal<string | null>(null);
  readonly onlyOpen = signal(true);
  readonly page = signal(1);
  readonly totalCount = signal(0);
  readonly totalPages = () => Math.max(1, Math.ceil(this.totalCount() / this.pageSize));

  readonly filterOptions = [
    { value: true, label: 'Csak nyitottak' },
    { value: false, label: 'Összes' },
  ];

  ngOnInit(): void {
    this.load();
  }

  setOnlyOpen(value: boolean): void {
    this.onlyOpen.set(value);
    this.page.set(1);
    this.load();
  }

  prevPage(): void {
    if (this.page() > 1) { this.page.update(p => p - 1); this.load(); }
  }

  nextPage(): void {
    if (this.page() < this.totalPages()) { this.page.update(p => p + 1); this.load(); }
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getReports(this.onlyOpen(), this.page(), this.pageSize).subscribe({
      next: (data) => {
        this.reports.set(data.items);
        this.totalCount.set(data.totalCount);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('A jelentések betöltése sikertelen.');
        this.loading.set(false);
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
}
