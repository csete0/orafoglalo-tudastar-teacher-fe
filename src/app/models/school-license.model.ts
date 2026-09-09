export interface SchoolLicenseSeatDto {
  userId: number;
  studentName: string;
  groupNames: string[];
  claimedAt: string;
  lastActivityAt: string;
}

export interface SchoolLicenseGroupUsageDto {
  groupId: number;
  groupName: string;
  teacherName: string;
  activeSeatCount: number;
}

export interface SchoolLicenseOverviewDto {
  licenseId: number;
  tier: string;
  capacity: number;
  usedSeats: number;
  validFrom: string;
  validTo: string;
  idleWindowMinutes: number;
  groups: SchoolLicenseGroupUsageDto[];
  seats: SchoolLicenseSeatDto[];
}
