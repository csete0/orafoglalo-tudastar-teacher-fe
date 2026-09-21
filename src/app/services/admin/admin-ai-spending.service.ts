import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AiRequestLogFilter,
  AiRequestLogPageDto,
  AiSpendingOverviewDto,
  AiSpendingTopSpenderDto,
  AutomationStatusDto,
  OpenRouterCreditsDto,
  QuizMaintenanceDecisionDto,
  QuizMaintenanceEstimateDto,
  QuizMaintenanceEstimateRequest,
  QuizMaintenanceMergeRequest,
  QuizMaintenanceMergeResultDto,
  QuizMaintenanceRunPageDto,
  QuizMaintenanceRunRequest,
  QuizMaintenanceRunStartedDto,
} from '../../models/ai-spending.model';

/** AI-KOLTES-PULT: admin "AI-költés Pult" - kérésenkénti OpenRouter-költés,
 *  kvíz-karbantartás kézi indítása/eredmény-kezelése, egyéb automatizmusok. */
@Injectable({ providedIn: 'root' })
export class AdminAiSpendingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin`;

  getOverview(days = 30): Observable<AiSpendingOverviewDto> {
    return this.http.get<AiSpendingOverviewDto>(`${this.base}/ai-spending/overview`, {
      params: new HttpParams().set('days', days),
    });
  }

  getCredits(): Observable<OpenRouterCreditsDto> {
    return this.http.get<OpenRouterCreditsDto>(`${this.base}/ai-spending/credits`);
  }

  getTopSpenders(days = 30, limit = 10): Observable<AiSpendingTopSpenderDto[]> {
    return this.http.get<AiSpendingTopSpenderDto[]>(`${this.base}/ai-spending/top-spenders`, {
      params: new HttpParams().set('days', days).set('limit', limit),
    });
  }

  getRequestLog(filter: AiRequestLogFilter, page: number, pageSize: number): Observable<AiRequestLogPageDto> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (filter.source) params = params.set('source', filter.source);
    if (filter.userQuery) params = params.set('userQuery', filter.userQuery);
    if (filter.fromDate) params = params.set('fromDate', filter.fromDate);
    if (filter.toDate) params = params.set('toDate', filter.toDate);
    return this.http.get<AiRequestLogPageDto>(`${this.base}/ai-spending/requests`, { params });
  }

  estimateMaintenanceRun(request: QuizMaintenanceEstimateRequest): Observable<QuizMaintenanceEstimateDto> {
    return this.http.post<QuizMaintenanceEstimateDto>(`${this.base}/quiz-maintenance/estimate`, request);
  }

  runMaintenance(request: QuizMaintenanceRunRequest): Observable<QuizMaintenanceRunStartedDto> {
    return this.http.post<QuizMaintenanceRunStartedDto>(`${this.base}/quiz-maintenance/run`, request);
  }

  getMaintenanceRuns(page: number, pageSize: number): Observable<QuizMaintenanceRunPageDto> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<QuizMaintenanceRunPageDto>(`${this.base}/quiz-maintenance/runs`, { params });
  }

  getRunDecisions(runId: string, actionFilter?: string): Observable<QuizMaintenanceDecisionDto[]> {
    let params = new HttpParams();
    if (actionFilter) params = params.set('actionFilter', actionFilter);
    return this.http.get<QuizMaintenanceDecisionDto[]>(`${this.base}/quiz-maintenance/runs/${runId}/decisions`, { params });
  }

  deactivateQuestion(questionId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/quiz-maintenance/questions/${questionId}`);
  }

  mergeQuestions(request: QuizMaintenanceMergeRequest): Observable<QuizMaintenanceMergeResultDto> {
    return this.http.post<QuizMaintenanceMergeResultDto>(`${this.base}/quiz-maintenance/merge`, request);
  }

  triggerStudyPlan(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/automations/study-plan/trigger`, {});
  }

  triggerDailyChallenge(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/automations/daily-challenge/trigger`, {});
  }

  getAutomationStatus(): Observable<AutomationStatusDto[]> {
    return this.http.get<AutomationStatusDto[]>(`${this.base}/automations/status`);
  }
}
