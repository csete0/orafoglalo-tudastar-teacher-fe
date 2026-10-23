/** Tanári oktatóvideó (BE: GET api/teacher/tutorial-videos - csak Prémium tanárnak). */
export interface TutorialVideo {
  id: string;
  title: string;
  description: string;
  durationSeconds: number;
  /** Aláírt, rövid életű útvonal a backend originjéhez képest; null, ha nincs borítókép. */
  posterUrl: string | null;
}

export interface TutorialVideoCategory {
  name: string;
  videos: TutorialVideo[];
}

export interface TutorialVideoList {
  categories: TutorialVideoCategory[];
}

export interface TutorialVideoStreamUrl {
  /** Aláírt útvonal (`/api/tutorial-videos/{id}/stream?token=…`) - a <video> Bearer nélkül tölti. */
  url: string;
  expiresInSeconds: number;
}

/** „1:35” / „12:05” - a kártya időtartam-jelvénye. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
