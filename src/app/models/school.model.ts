export type SchoolTeacherRole = 'Admin' | 'Teacher';

export interface CreateSchoolRequest {
  name: string;
  city?: string;
}

export interface SchoolDto {
  id: number;
  name: string;
  slug: string;
  city?: string;
  createdAt: string;
  groupCount: number;
  /** A kérő tanár szerepe ebben az intézményben. */
  myRole: SchoolTeacherRole;
  teacherCount: number;
  /** Csak akkor van kitöltve, ha myRole === 'Admin'. */
  teacherInviteCode?: string;
}

export interface JoinSchoolRequest {
  code: string;
}

export interface SchoolMemberDto {
  teacherProfileId: number;
  displayName: string;
  role: SchoolTeacherRole;
  joinedAt: string;
  groupCount: number;
}

export interface ChangeSchoolMemberRoleRequest {
  role: SchoolTeacherRole;
}

export interface SchoolGroupDto {
  groupId: number;
  name: string;
  teacherDisplayName: string;
  memberCount: number;
  isArchived: boolean;
}
