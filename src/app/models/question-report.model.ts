/** A5: kérdés-jelentés — tanári és admin nézet. Nincs bejelentő neve. */
export interface QuizQuestionReportDto {
  id: number;
  questionId: number;
  questionText: string;
  quizId?: number | null;
  quizTitle?: string | null;
  topicName: string;
  reason?: string | null;
  createdAt: string;
  isReviewed: boolean;
  reviewedAt?: string | null;
  questionReportCount: number;
  questionIsApproved: boolean;
}

export interface QuizQuestionReportListDto {
  items: QuizQuestionReportDto[];
  totalCount: number;
}
