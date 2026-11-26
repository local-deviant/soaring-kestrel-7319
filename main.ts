// Kestrel Run — the hand-in program (Node 22, standard library only).
//
// It hands the flight game in: it copies this repository's game/ and
// screenshots/ into the grader's output directory and writes
// /output/dossier.json with the kit's vendored make.fun library, so the
// judge reads exactly the files that were built. The program does no
// network, keeps no clock and seeds nothing: the same repository always
// hands in the same bytes, so the grader's two runs agree.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the directory this file lives in.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
// The grader writes to /output; outside its container MAKEFUN_OUTPUT_DIR
// stands in for it.
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');

// The caps the gate enforces on what the program hands in. They mirror
// the scorer's own limits, so a repository that passes here passes there:
// at most 4 screenshots of 256 KiB each, at most 993 files and 48 MiB in
// game/, no path under game/ longer than 1000 bytes, and the dossier's
// text capped at 160 KiB.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function handIn() {
  mkdirSync(outputDir, { recursive: true });
  cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
  if (existsSync(shotsDir)) {
    cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
  }
  const dossier = buildDossier(outputDir, DOSSIER_CAPS);
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
}

handIn();
