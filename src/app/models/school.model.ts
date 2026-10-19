export type SchoolTeacherRole = 'Admin' | 'Teacher';
/** Az intézmény típusa (a technikumi modul láthatóságához); null = nincs megadva. */
export type SchoolType = 'gimnazium' | 'technikum';

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
  schoolType: SchoolType | null;
  /** A típust a platform-admin rögzítette: a tanár nem módosíthatja. */
  schoolTypeSetByAdmin: boolean;
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
