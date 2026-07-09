export interface StudentActivitySummaryDto {
  userId: number;
  name: string;
  nickname?: string;
  completedExamsCount: number;
  averageExamScorePercent?: number;
  totalExamTimeSpentSeconds: number;
  completedQuizSessionsCount: number;
  quizAccuracyPercent?: number;
  currentStreak: number;
  longestStreak: number;
  badgeCount: number;
}

export interface StudentExamSessionDto {
  sessionId: number;
  taskSetId: number;
  taskSetTitle: string;
  startedAt: string;
  isCompleted: boolean;
  scorePercent?: number;
  timeSpentSeconds: number;
}

export interface StudentActivityDetailDto extends StudentActivitySummaryDto {
  recentExams: StudentExamSessionDto[];
}

export interface TeacherTaskColumnDto {
  taskId: number;
  title: string;
  maxPoints: number;
  taskOrder: number;
}

export interface TaskResultCellDto {
  taskId: number;
  isCompleted: boolean;
  earnedPoints?: number;
  maxPoints?: number;
}

export interface StudentTaskSetResultRowDto {
  userId: number;
  name: string;
  hasSession: boolean;
  isCompleted: boolean;
  totalEarnedPoints?: number;
  totalMaxPoints?: number;
  taskResults: TaskResultCellDto[];
}

export interface TeacherTaskSetResultsDto {
  taskSetId: number;
  title: string;
  tasks: TeacherTaskColumnDto[];
  students: StudentTaskSetResultRowDto[];
}
