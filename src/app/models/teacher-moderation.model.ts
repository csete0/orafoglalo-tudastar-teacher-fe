export interface TeacherProfileAdminDto {
  id: number;
  userId: number;
  displayName: string;
  email: string;
  institutionName?: string;
  isActive: boolean;
  createdAt: string;
  taskSetCount: number;
  groupCount: number;
  storageUsedBytes: number;
  /** Kvóta: null = korlátlan. Használat alatti érték csak az új létrehozást blokkolja. */
  maxTaskSets: number | null;
  maxStorageBytes: number | null;
}

export interface AdminTaskSetDto {
  id: number;
  title: string;
  slug: string;
  description: string;
  levelId: number;
  subjectCategoryId?: number;
  isPublished: boolean;
  createdAt: string;
  taskCount: number;
}

export interface SchoolAdminDto {
  id: number;
  name: string;
  city?: string;
  createdAt: string;
  teacherCount: number;
  groupCount: number;
  adminDisplayNames: string[];
}

export interface SchoolMergeResultDto {
  movedGroups: number;
  movedMemberships: number;
  mergedDuplicateMemberships: number;
}
