import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { ADMIN_API_PID_FILE, BACKEND_PID_FILE, DB_CONTAINER_NAME } from './constants';

export default async function globalTeardown(): Promise<void> {
  console.log('[global-teardown] Backend + Admin API leállítása (global-setup.ts manuálisan indította)...');
  stopProcessTree(BACKEND_PID_FILE);
  stopProcessTree(ADMIN_API_PID_FILE);

  console.log('[global-teardown] E2E DB-konténer eltávolítása...');
  try {
    if (process.env.E2E_KEEP_DB === '1') {
      console.log('[global-teardown] E2E_KEEP_DB=1 -> a DB-kontener megmarad (diagnosztika).');
    } else {
      execFileSync('docker', ['rm', '-f', DB_CONTAINER_NAME], { stdio: 'inherit' });
    }
  } catch {
    // A konténer esetleg már nem létezik — nem hiba.
  }
}

function stopProcessTree(pidFile: string): void {
  if (!fs.existsSync(pidFile)) return;

  const pid = fs.readFileSync(pidFile, 'utf-8').trim();
  fs.rmSync(pidFile, { force: true });
  if (!pid) return;

  // A `dotnet run` egy KÜLÖN gyerekfolyamatként indítja a tényleges API-t. Csak a wrappert megölve a gyerek
  // elárvul (PPID=1) és tovább figyel a porton - a KÖVETKEZŐ futás pedig csendben ehhez a régi binárishoz
  // beszélne. Ezért előbb a gyerekeket, aztán magát a wrappert állítjuk le.
  try {
    execFileSync('pkill', ['-TERM', '-P', pid], { stdio: 'ignore' });
  } catch {
    // Nincs gyerek - nem hiba.
  }
  try {
    process.kill(Number(pid), 'SIGTERM');
  } catch {
    // A folyamat esetleg már nem fut — nem hiba.
  }
}
