// Próbaérettségi (tanár) - lásd DigitalCulture.Domain.Entities.MockExams.MockExamDtos (PATRICKS-PROBAERETTSEGI-TERV.md E).

export type MockExamLevel = 'kozep' | 'emelt';
export type MockExamMemberStatus = 'notRegistered' | 'registered' | 'started' | 'submitted' | 'notStarted';

/** A nyilvános aktuális esemény - a tanári appban csak a menüponthoz és a slughoz kell. */
export interface MockExamCurrent { slug: string; title: string; }

export interface MockExamTeacherGroup {
  groupId: number;
  name: string;
  memberCount: number;
  registered: boolean;
  defaultLevel: MockExamLevel | null;
  registeredMembers: number;
  unconfirmedMembers: number;
}

export interface MockExamTeacherEvent {
  slug: string;
  title: string;
  registrationOpensAt: string;
  opensAt: string;
  startClosesAt: string;
  resultsPlannedAt: string;
  registrationOpen: boolean;
  resultsPublished: boolean;
  groups: MockExamTeacherGroup[];
}

export interface MockExamMemberTask { taskId: number; title: string; points: number; maxPoints: number; }

export interface MockExamMemberResult {
  userId: number;
  name: string;
  emailConfirmed: boolean;
  level: MockExamLevel | null;
  status: MockExamMemberStatus;
  points: number | null;
  maxPoints: number | null;
  percent: number | null;
  grade: number | null;
  rank: number | null;
  percentile: number | null;
  focusLossCount: number | null;
  pasteCount: number | null;
  tasks: MockExamMemberTask[];
}

export interface MockExamGroupResults {
  groupId: number;
  groupName: string;
  resultsPublished: boolean;
  avgPercent: number | null;
  distribution: number[];
  members: MockExamMemberResult[];
}

export const MOCK_EXAM_LEVEL_LABEL: Record<MockExamLevel, string> = { kozep: 'közép', emelt: 'emelt' };
export const MOCK_EXAM_MEMBER_STATUS_LABEL: Record<MockExamMemberStatus, string> = {
  notRegistered: 'nem jelentkezett', registered: 'jelentkezett', started: 'elkezdte', submitted: 'beadta', notStarted: 'nem kezdte el',
};
