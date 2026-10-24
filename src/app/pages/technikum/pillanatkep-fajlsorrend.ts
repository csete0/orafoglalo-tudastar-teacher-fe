import { CodeFileRank } from '../../shared/kod-olvaso/kod-olvaso.component';
import { ExamPartKey } from '../../models/technikum.model';

/** A pillanatkép fülei: az öt vizsgarész és a részekhez nem tartozó (pl. hivatalos adat-) fájlok. */
export type SnapshotTab = ExamPartKey | 'egyeb';

/** Az asztali részek (konzolos, grafikus): ezek nyelve a munkamenet nyelve (C# / Java). */
export const DESKTOP_PARTS: readonly SnapshotTab[] = ['console', 'gui'];

const HAND_WRITTEN_SOURCES = ['.cs', '.xaml', '.java', '.fxml'];

/**
 * Az asztali részek fájlsorrendje (BE: ExamCodeCommentService.Priority): előbb a kézzel írt forrás (.cs, .xaml, .java, .fxml),
 * aztán a generált (.Designer.cs), végül minden más (projektfájlok: .csproj, pom.xml, build.gradle…, adatfájlok).
 */
export const desktopFileRank: CodeFileRank = (path) => {
  const p = path.toLowerCase();
  if (p.endsWith('.designer.cs')) return 1;
  return HAND_WRITTEN_SOURCES.some((x) => p.endsWith(x)) ? 0 : 2;
};

/** A backend kezdő keret- és projektfájljai (csomag-, build- és beállításfájl, a Laravel alap-osztályai) - a kézzel írt forrás után. */
const BACKEND_PROJECT_FILES = ['package.json', 'pom.xml', 'application.properties', 'controller.php', 'appserviceprovider.php'];

/**
 * A backend-rész fájlsorrendje: elöl az útvonalak (routes/api.php), aztán a kézzel írt forrás (Controllers, Models, src/main/java/**,
 * *.js, *.cs), végül a kezdő keret- és projektfájlok (package.json, pom.xml, application.properties, Controller.php, AppServiceProvider.php).
 */
export const backendFileRank: CodeFileRank = (path) => {
  const p = path.toLowerCase();
  if (p.endsWith('/routes/api.php')) return 0;
  return BACKEND_PROJECT_FILES.includes(p.slice(p.lastIndexOf('/') + 1)) ? 2 : 1;
};

/** A fül fájlsorrendje: asztali részek, backend, egyébként a kódolvasó alapsorrendje. */
export function fileRankOf(tab: SnapshotTab): CodeFileRank {
  return DESKTOP_PARTS.includes(tab) ? desktopFileRank : tab === 'api' ? backendFileRank : () => 0;
}
