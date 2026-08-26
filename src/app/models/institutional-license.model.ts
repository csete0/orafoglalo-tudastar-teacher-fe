export interface InstitutionalLicenseDto {
  id: number;
  schoolId: number | null;
  teacherProfileId: number | null;
  /** Az intézmény vagy a magántanár megjelenítendő neve. */
  ownerName: string;
  tier: 'standard' | 'premium';
  capacity: number;
  /**
   * Ténylegesen HASZNÁLT helyek: a tétlenségi ablakon belül aktív tulajdonosok.
   * A `heldSeats` ennél több lehet — egy elhagyott hely addig marad, amíg
   * valakinek nem kell.
   */
  usedSeats: number;
  heldSeats: number;
  validFrom: string;
  validTo: string;
  idleWindowMinutes: number;
  revokedAt: string | null;
  billingNote: string | null;
  createdAt: string;
  isActive: boolean;
  /**
   * BE-ADMINUPDATE-CAPACITYREDUCTION-SILENT-SKIP: az UTOLSÓ update()-hívás kapacitás-
   * csökkentése hány, a tartományon kívülre szorult helyet hagyott bent vizsga/kvíz miatt.
   * 0, ha nem történt kapacitás-csökkentés vagy nem volt kihagyás - a licenc-LISTÁS nézet
   * ezt nem tölti ki, csak az adott update()-hívás válasza hordozza (egyszeri művelet
   * eredménye, nem a licenc tartós állapota).
   */
  skippedDueToActiveSessionCount: number;
}

export interface CreateInstitutionalLicenseRequest {
  schoolId?: number | null;
  teacherProfileId?: number | null;
  tier: string;
  capacity: number;
  validFrom: string;
  validTo: string;
  billingNote?: string | null;
  idleWindowMinutes?: number | null;
}

export interface UpdateInstitutionalLicenseRequest {
  capacity: number;
  validFrom: string;
  validTo: string;
  billingNote?: string | null;
  idleWindowMinutes?: number | null;
}

/**
 * UI-TT-200 / BE-LICENSEREVOKE-BULK-SILENT-FALSE-SUCCESS: a visszavonás SZÁNDÉKOSAN
 * kihagyja a vizsga/kvíz közben lévő diákok helyét - az admin-nak tudnia kell erről,
 * különben a felület sikert mutat, miközben egy hely ténylegesen bent maradt.
 */
export interface InstitutionalLicenseRevokeResultDto {
  releasedCount: number;
  skippedDueToActiveSessionCount: number;
}

export interface InstitutionalSeatHolderDto {
  userId: number;
  displayName: string;
  email: string;
  seatIndex: number;
  claimedAt: string;
  lastActivityAt: string;
  /** A tétlenségi ablakon belül aktív volt-e (különben elvehető-jelölt). */
  isFresh: boolean;
  /** Éppen vizsgát/kvízt ír - ilyenkor a felszabadítás nem hajtódik végre. */
  sessionInProgress: boolean;
}

export interface InstitutionalLicenseUsageDayDto {
  day: string;
  peakSeatsInUse: number;
  denied: number;
  reclaimed: number;
  atCapacity: boolean;
}

export interface InstitutionalLicenseUsageDto {
  licenseId: number;
  capacity: number;
  rangeDays: number;
  /** A bővítési döntés fő száma: hányan nem fértek be, pedig jogosultak lettek volna. */
  totalDenied: number;
  totalReclaimed: number;
  peakSeatsInUse: number;
  daysAtCapacity: number;
  daily: InstitutionalLicenseUsageDayDto[];
}
