export interface GroupSeatHolderDto {
  userId: number;
  displayName: string;
  claimedAt: string;
  lastActivityAt: string;
  /** A tétlenségi ablakon belül aktív volt-e. */
  isFresh: boolean;
  /** Éppen vizsgát/kvízt ír - ilyenkor a felszabadítás nem hajtódik végre. */
  sessionInProgress: boolean;
  /** Épp vizsgázik/kvízel — tőle a rendszer sem venné el a helyet. */
  hasSessionInProgress: boolean;
  /**
   * Több csoportnak is tagja. Egy diáknak EGY helye van, tehát a felszabadítás
   * a másik órán is látszik — ezt jeleznünk kell a tanárnak.
   */
  inMultipleGroups: boolean;
}

export interface GroupSeatMissingDto {
  userId: number;
  displayName: string;
  /** "free" vagy "standard" — a saját előfizetése. */
  personalTier: string;
}

export interface GroupSeatOverviewDto {
  groupId: number;
  groupName: string;
  /** Null, ha a csoport intézményéhez nem tartozik érvényes licenc. */
  licenseId: number | null;
  tier: string | null;
  capacity: number;
  /** A licenc teljes kihasználtsága, más csoportok diákjaival együtt. */
  usedSeatsOnLicense: number;
  holders: GroupSeatHolderDto[];
  withoutSeat: GroupSeatMissingDto[];
}

export interface ReleaseGroupSeatsResultDto {
  releasedCount: number;
  /** Akiktől nem vettük el, mert épp vizsgáznak. */
  skippedInProgress: string[];
}
