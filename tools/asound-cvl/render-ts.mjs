#!/usr/bin/env node

// Renders a sound ID to a WAV file through the renderer's own OPL2 synth
// (src/js/Audio/opl/), as render.py does through pyopl, so the two can be
// compared (#126). The TypeScript is bundled with esbuild first, as
// tools/lib/suite.js bundles the test suites.
//
//   node tools/asound-cvl/render-ts.mjs ASOUND.CVL id out.wav [seconds] [level] [rate]
//
// ASOUND.CVL is the player's own copyrighted data, and so is anything rendered
// from it: keep the WAVs out of the repository.

import { build } from 'esbuild';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

const [cvl, id, out, seconds = '30', level = '3', rate = '44100'] =
  process.argv.slice(2);

if (!cvl || id === undefined || !out) {
  console.error(
    'usage: node tools/asound-cvl/render-ts.mjs ASOUND.CVL id out.wav [seconds] [level] [rate]'
  );
  process.exit(1);
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'render-ts-')),
  outfile = path.join(directory, 'render.js');

try {
  await build({
    entryPoints: [path.join(root, 'src', 'js', 'Audio', 'opl', 'render.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile,
    logLevel: 'error',
  });

  const { Image, render } = createRequire(import.meta.url)(outfile),
    sampleRate = Number(rate),
    samples = render(
      new Image(fs.readFileSync(cvl)),
      Number(id),
      Number(seconds),
      {
        level: Number(level),
        sampleRate,
      }
    );

  fs.writeFileSync(out, wav(samples, sampleRate));
  console.log(`${out}: ${(samples.length / sampleRate).toFixed(1)} s`);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

// 16-bit mono PCM.
function wav(samples, sampleRate) {
  const buffer = Buffer.alloc(44 + samples.length * 2);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, i) =>
    buffer.writeInt16LE(
      Math.max(-32768, Math.min(32767, Math.round(sample * 32768))),
      44 + i * 2
    )
  );

  return buffer;
}
