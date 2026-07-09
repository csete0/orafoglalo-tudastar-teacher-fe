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
