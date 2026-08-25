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

export interface InstitutionalSeatHolderDto {
  userId: number;
  displayName: string;
  email: string;
  seatIndex: number;
  claimedAt: string;
  lastActivityAt: string;
  /** A tétlenségi ablakon belül aktív volt-e (különben elvehető-jelölt). */
  isFresh: boolean;
}
