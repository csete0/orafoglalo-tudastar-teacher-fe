/** B3: kuponok - admin nézet (api/admin/coupons). A `CouponAdminDto` tükre. */
export interface CouponAdminDto {
  id: number;
  code: string;
  /** Pontosan az egyik van kitöltve: százalék VAGY fix Ft. */
  percentOff: number | null;
  amountOffHuf: number | null;
  validFrom: string;
  validTo: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  /** null = bármelyik fizetős csomagra érvényes. */
  subscriptionTypeId: number | null;
  subscriptionTypeName: string | null;
  isActive: boolean;
  createdAt: string;
  note: string | null;
}

/** A `CouponCreateRequest` tükre - a validáció a szerveren fut (OrafoglaloException → errorMessage). */
export interface CouponCreateRequest {
  code: string;
  percentOff?: number | null;
  amountOffHuf?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  maxRedemptions?: number | null;
  subscriptionTypeId?: number | null;
  note?: string | null;
}

/** A diák-app nyilvános `api/Payment/sub-types` listájának a kuponhoz szükséges része. */
export interface SubscriptionTypeOption {
  id: number;
  name: string;
  price: number;
  billingCycle: string;
}
