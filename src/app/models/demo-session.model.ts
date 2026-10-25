/** A bejelentkezett demó-fiók környezete (BE: UserLoginDto.Demo - PATRICKS-DEMO-KORNYEZET-TERV.md F6). */
export interface DemoSession {
  environmentId: number;
  kind: 'owner' | 'school';
  title: string;
  /** UTC ISO (zóna nélkül is UTC); a saját demónál null - az minden éjjel alaphelyzetbe áll. */
  expiresAt: string | null;
  nightlyReset: boolean;
}

/** A demó-fiókban nem elérhető funkciók közös szövege (a BE `DemoRestricted` hibájával azonos). */
export const DEMO_RESTRICTED_MESSAGE = 'Ez a funkció demó-fiókban nem érhető el.';
