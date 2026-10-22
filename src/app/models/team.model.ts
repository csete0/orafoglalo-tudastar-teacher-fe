// Vizsgaremek-csapat a tanári felületen - mezőnévre egyezően a diák FE `team.models.ts`-ével (BE: TeamDtos.cs és társai).

/** BE: GitRepoDto (a tanári nézet által használt mezők). */
export interface TeamRepo { id: number; name: string; cloneUrl: string; sizeKb: number; quotaKb: number; locked: boolean; }

/** BE: TeamDtos.cs (TeamDto). */
export interface TeamMember { userId: number; name: string; role: string | null; joinedAt: string; isFounder: boolean; }
export interface Team {
  id: number; name: string; kind: 'school' | 'individual'; status: 'proposed' | 'active' | 'rejected' | 'archived'; groupId: number | null; groupName: string | null;
  projectTitle: string | null; examDate: string | null; members: TeamMember[]; repo: TeamRepo | null; viewer: 'member' | 'teacher'; canManage: boolean;
  rejectReason: string | null; createdAt: string;
}

/** BE: TeamGithubService.cs. */
export interface TeamGithubBranch { name: string; action: string; ours: string | null; theirs: string | null; detail: string | null; }
export interface TeamGithubStatus {
  enabled: boolean; linked: boolean; repoFullName: string | null; repoUrl: string | null; status: 'active' | 'broken' | 'unlinked' | null; lastSyncStatus: string | null;
  lastSyncAt: string | null; lastError: string | null; branches: TeamGithubBranch[]; canImport: boolean; importedAt: string | null;
}

/** BE: TeamActivityService.cs, TeamRepoFilesService.cs. A `weeks[].commits` kulcsa a userId, „deleted” (Törölt felhasználó) vagy „import”. */
export interface TeamMemberActivity { userId: number | null; name: string; active: boolean; commits: number; additions: number; deletions: number; merges: number; lastPushAt: string | null; }
export interface TeamWeek { weekStart: string; commits: Record<string, number>; }
export interface TeamActivity { members: TeamMemberActivity[]; branches: { name: string; sha: string }[]; weeks: TeamWeek[]; pendingPushes: number; hasRepo: boolean; }
export interface TeamTree { ref: string; entries: { path: string; type: string; size: number }[]; truncated: boolean; }
export interface TeamFile { path: string; content: string | null; binary: boolean; tooLarge: boolean; }

/** BE: TeamMilestoneService.cs. */
export interface TeamMilestoneTest { passed: boolean; output: string; at: string; preset: string; }
/** BE: TeamDocsCheck.cs – a vizsgaremek-dokumentáció egy kötelező eleme: fejezetcím/bizonyíték (`found`), csak említés (`mentioned`), hiányzik. */
export interface TeamDocsCheckItem { key: string; label: string; status: 'found' | 'mentioned' | 'missing'; where: string | null; hint: string; }
export interface TeamDocsCheck { at: string; items: TeamDocsCheckItem[]; sources: string[]; warnings: string[]; }
/** `docs`: csak a „docs” mérföldkőnél (a régi ellenőrzésekben nincs). */
export interface TeamMilestoneCheck {
  at: string; branch: string; truncated: boolean; items: { pattern: string; matched: boolean; example: string | null }[]; allMatched: boolean; test: TeamMilestoneTest | null;
  docs?: TeamDocsCheck | null;
}
export interface TeamMilestone {
  id: number; kind: 'db' | 'rest' | 'desktop' | 'mobile' | 'tests' | 'docs' | 'submit' | 'custom'; title: string; sortOrder: number; dueDate: string | null;
  effectiveDueDate: string | null; overdue: boolean; requiredPaths: string[]; testPreset: string | null; testDir: string | null;
  lastCheck: TeamMilestoneCheck | null; tickedAt: string | null; tickedByName: string | null; teacherNote: string | null; canEdit: boolean; canTick: boolean;
}
/** A tesztfuttató-legördülő sora (BE: GET api/teams/test-runners); a nem elérhető (`available: false`) a szerveren még nem fut, nem választható. */
export interface TestRunnerOption { key: string; label: string; language: string; available: boolean; }
export interface TeamMilestoneEdit {
  title?: string | null; dueDate?: string | null; clearDueDate?: boolean; requiredPaths?: string[] | null; testPreset?: string | null; testDir?: string | null; clearTest?: boolean;
}

/** BE: TeamRepoReviewService.cs, RepoReviewPrompt.cs. */
export interface CodeSuggestion { path: string; line: number; lineText: string; severity: 'hiba' | 'javaslat' | 'dicséret'; text: string; }
export interface RepoReviewCriterion { key: 'quality' | 'clean' | 'docs' | 'tests'; label: string; score: number; text: string; }
export interface RepoReviewResult { summary: string | null; criteria: RepoReviewCriterion[]; suggestions: CodeSuggestion[]; reviewedPaths: string[]; truncatedPaths: string[]; skippedFiles: number; }
export interface TeamRepoReview {
  id: number; status: 'queued' | 'running' | 'done' | 'failed' | 'truncated'; branch: string; commitSha: string | null; requestedByName: string | null;
  payerKind: 'teacher' | 'system'; createdAt: string; finishedAt: string | null; error: string | null; counted: boolean; result: RepoReviewResult | null;
}
export interface TeamReviews { used: number; limit: number; month: string; items: TeamRepoReview[]; }

export const MILESTONE_KIND_LABEL: Record<TeamMilestone['kind'], string> = {
  db: 'Adatbázis', rest: 'REST-szerver', desktop: 'Asztali kliens', mobile: 'Mobilkliens', tests: 'Tesztek', docs: 'Dokumentáció', submit: 'Beadás', custom: 'Saját',
};
export const SYNC_LABEL: Record<string, string> = {
  ok: 'Szinkronban', diverged: 'Eltért a GitHubon', error: 'Hiba', workflow_blocked: 'Workflow-fájl miatt tiltva', importing: 'Import folyamatban', import_failed: 'Import sikertelen',
};
