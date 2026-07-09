export interface CreateGroupRequest {
  name: string;
  /** Opcionális — magántanárnál nincs intézmény. */
  schoolId?: number;
}

export interface GroupDto {
  id: number;
  name: string;
  schoolId?: number;
  schoolName?: string;
  inviteCode: string;
  isArchived: boolean;
  createdAt: string;
  memberCount: number;
}

export interface GroupMemberDto {
  userId: number;
  name: string;
  nickname?: string;
  email: string;
  joinedAt: string;
}

export interface JoinGroupRequest {
  code: string;
}

export interface MyGroupDto {
  groupId: number;
  groupName: string;
  teacherDisplayName: string;
  schoolName?: string;
  joinedAt: string;
}

/** A csoportjaim tanárainak (közvetlen + intézményi megosztáson át) publikált feladatsora. */
export interface MyGroupTaskSetDto {
  taskSetId: number;
  title: string;
  slug: string;
  description: string;
  levelId: number;
  teacherDisplayName: string;
  createdAt: string;
}
