#!/usr/bin/env node

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { spawnSync } = require('child_process');

// Bundled ffmpeg binary — no global FFmpeg install needed.
// Same pattern as music-downloader: require('ffmpeg-static') returns
// the absolute path to the platform-specific binary inside node_modules.
const FFMPEG_BIN = require('ffmpeg-static');

// Default voice slug used when --voice is not specified.
// The Mistral TTS API requires either voice_id or ref_audio — neither is optional.
const DEFAULT_VOICE = 'en_paul_neutral';

// ─── Config helpers ───────────────────────────────────────────────────────────

/** Returns the path to the per-user config file (~/.voxtral/config.json) */
function getConfigPath() {
  const voxtralDir  = path.join(os.homedir(), '.voxtral');
  const voxtralPath = path.join(voxtralDir, 'config.json');
  const ttsPath     = path.join(os.homedir(), '.tts', 'config.json');

  // Auto-migrate legacy ~/.tts/config.json to ~/.voxtral/config.json if present
  if (!fs.existsSync(voxtralPath) && fs.existsSync(ttsPath)) {
    try {
      fs.mkdirSync(voxtralDir, { recursive: true });
      fs.copyFileSync(ttsPath, voxtralPath);
    } catch {
      // ignore
    }
  }

  return voxtralPath;
}

/** Reads the config file; returns {} if it does not exist yet */
function readConfig() {
  const p = getConfigPath();
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return {}; }
}

/** Writes a config object back to disk, creating the directory if needed */
function writeConfig(obj) {
  const p = getConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

// ─── API key resolution ───────────────────────────────────────────────────────

function getApiKey() {
  // 1) environment variable takes precedence
  if (process.env.MISTRAL_API_KEY) return process.env.MISTRAL_API_KEY;
  // 2) config file
  const cfg = readConfig();
  if (cfg.api_key) return cfg.api_key;
  return null;
}

// ─── Mistral TTS call (with 429 retry) ───────────────────────────────────────

const TTS_ENDPOINT = 'https://api.mistral.ai/v1/audio/speech';
const TTS_MODEL    = 'voxtral-mini-tts-2603';

/**
 * Sends one TTS request.
 * Returns the base64 audio_data string.
 * Retries automatically on 429 rate-limit (up to maxRetries times).
 *
 * The Mistral API requires EITHER voice_id OR ref_audio — never neither.
 * If no voice is specified we fall back to DEFAULT_VOICE slug.
 */
async function ttsRequest({ apiKey, text, voiceId, refAudio, maxRetries = 5 }) {
  const body = {
    model:           TTS_MODEL,
    input:           text,
    response_format: 'mp3',
  };

  if (refAudio) {
    body.ref_audio = refAudio;          // base64-encoded WAV/MP3 for voice cloning
  } else {
    body.voice_id = voiceId || DEFAULT_VOICE;   // preset slug or UUID
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(TTS_ENDPOINT, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '10', 10);
      const wait = (retryAfter || 10) * 1000;
      console.error(`  ↻ Rate-limited (429). Waiting ${retryAfter}s before retry ${attempt + 1}/${maxRetries}…`);
      await sleep(wait);
      continue;
    }

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`TTS API error ${res.status}: ${txt}`);
    }

    const json = await res.json();
    if (!json.audio_data) throw new Error('No audio_data in TTS response');
    return json.audio_data; // base64 MP3
  }
  throw new Error('TTS request failed: too many rate-limit retries');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Converts HH:MM:SS or HH:MM:SS.mmm string to total seconds */
function timestampToSeconds(ts) {
  const parts = ts.split(':');
  if (parts.length === 3) {
    const hours   = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  return 0;
}

// ─── Parse timestamped text file ─────────────────────────────────────────────

/**
 * Parses lines of the form:
 *   HH:MM:SS|The text to speak
 * Returns [{ timestamp, timestampSeconds, text }, …]
 */
function parseInputFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const entries = [];
  for (const line of lines) {
    const m = line.match(/^(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\|(.+)$/);
    if (!m) {
      console.error(`  ⚠  Skipping unrecognised line: ${line}`);
      continue;
    }
    const timestamp = m[1];
    const text = m[2].trim();
    const timestampSeconds = timestampToSeconds(timestamp);
    entries.push({ timestamp, timestampSeconds, text });
  }
  return entries;
}

// ─── FFmpeg helpers (bundled via ffmpeg-static) ───────────────────────────────

/**
 * Joins an array of MP3 file paths into one output MP3 using the bundled FFmpeg.
 * Uses concat demuxer for gapless joining.
 */
function joinMp3Files(clips, outputPath, tmpDir) {
  const listFile = path.join(tmpDir, 'concat.txt');
  // Use forward slashes in the file list — works on all platforms
  const lines = clips.map(f => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(listFile, lines, 'utf8');

  const result = spawnSync(FFMPEG_BIN, [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listFile,
    '-c', 'copy',
    outputPath,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  if (result.status !== 0) {
    throw new Error(`ffmpeg failed:\n${result.stderr.toString()}`);
  }
}

// ─── Subcommand: voxtral api set ───────────────────────────────────────────────

function cmdApiSet(args) {
  const key = args[0];
  if (!key) {
    console.error('Usage: voxtral api set <MISTRAL_API_KEY>');
    console.error('Get your API key at: https://console.mistral.ai/api-keys');
    process.exit(1);
  }
  const cfg = readConfig();
  cfg.api_key = key;
  writeConfig(cfg);
  console.log(`✔  API key saved to ${getConfigPath()}`);
}

// ─── Subcommand: voxtral api show ──────────────────────────────────────────────

function cmdApiShow() {
  const cfg = readConfig();
  const p   = getConfigPath();
  if (!cfg.api_key) {
    console.log(`Config file : ${p}`);
    console.log('API key     : (not set)');
    console.log('\nGet your API key at: https://console.mistral.ai/api-keys');
    console.log('To set your key run: voxtral api set <YOUR_KEY>');
  } else {
    // Mask all but the last 4 chars
    const masked = cfg.api_key.replace(/.(?=.{4})/g, '*');
    console.log(`Config file : ${p}`);
    console.log(`API key     : ${masked}`);
    console.log(`Key console : https://console.mistral.ai/api-keys`);
  }
}

// ─── Subcommand: voxtral voices ────────────────────────────────────────────────

async function cmdVoices() {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('Error: No API key configured.');
    console.error('Get your API key at: https://console.mistral.ai/api-keys');
    console.error('Then run: voxtral api set <YOUR_KEY>');
    process.exit(1);
  }

  // Fetch all pages
  let page = 1;
  let allVoices = [];
  while (true) {
    const res = await fetch(`https://api.mistral.ai/v1/audio/voices?page=${page}&page_size=50`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error(`Error fetching voices: ${res.status} ${txt}`);
      process.exit(1);
    }
    const json = await res.json();
    const items = json.items || json.voices || json.data || [];
    allVoices = allVoices.concat(items);
    if (page >= (json.total_pages || 1)) break;
    page++;
  }

  if (!allVoices.length) {
    console.log('No voices found.');
    return;
  }

  console.log(`\nAvailable voices (${allVoices.length} total):\n`);
  console.log(`  ${'SLUG'.padEnd(30)} ${'NAME'.padEnd(25)} GENDER  LANG`);
  console.log(`  ${'─'.repeat(30)} ${'─'.repeat(25)} ──────  ────`);
  for (const v of allVoices) {
    const slug   = (v.slug || v.id || '').padEnd(30);
    const name   = (v.name || '').padEnd(25);
    const gender = (v.gender || '').padEnd(6);
    const lang   = (v.languages || []).join(', ');
    console.log(`  ${slug} ${name} ${gender}  ${lang}`);
  }
  console.log(`\n  Usage:  voxtral test.txt --voice <SLUG>`);
  console.log(`  Default voice: ${DEFAULT_VOICE}\n`);
}

/** Returns a formatted timestamp string (e.g. "20260920_161514") for default output filenames */
function getTimestampString() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const YYYY = d.getFullYear();
  const MM   = pad(d.getMonth() + 1);
  const DD   = pad(d.getDate());
  const hh   = pad(d.getHours());
  const mm   = pad(d.getMinutes());
  const ss   = pad(d.getSeconds());
  return `${YYYY}${MM}${DD}_${hh}${mm}${ss}`;
}

// ─── Subcommand: voxtral <file> [options] ──────────────────────────────────────

async function cmdConvert(inputFile, opts) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('Error: No API key configured.');
    console.error('Get your API key at: https://console.mistral.ai/api-keys');
    console.error('Then run: voxtral api set <YOUR_KEY>');
    process.exit(1);
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  // Derive output path: custom via --output / -o, or default to <basename>_<timestamp>.mp3
  let outputFile;
  if (opts.output) {
    outputFile = path.resolve(opts.output);
    if (!outputFile.toLowerCase().endsWith('.mp3')) {
      outputFile += '.mp3';
    }
  } else {
    const ts = getTimestampString();
    const base = path.basename(inputFile, path.extname(inputFile));
    outputFile = path.join(
      path.dirname(path.resolve(inputFile)),
      `${base}_${ts}.mp3`
    );
  }

  const entries = parseInputFile(inputFile);
  if (entries.length === 0) {
    console.error('Error: No valid timestamped lines found in input file.');
    process.exit(1);
  }

  // ── Resolve voice options ──
  let voiceId  = null;
  let refAudio = null;

  if (opts.voice) {
    const v = opts.voice;
    if (fs.existsSync(v)) {
      // It's a local audio file → base64-encode for ref_audio (voice cloning)
      console.log(`Using reference audio file: ${v}`);
      refAudio = fs.readFileSync(v).toString('base64');
    } else {
      voiceId = v;  // preset slug (e.g. "en_paul_neutral") or UUID
    }
  } else {
    voiceId = DEFAULT_VOICE;
  }

  const effectiveVoice = refAudio ? `[ref_audio: ${opts.voice}]` : voiceId;

  console.log(`\nInput  : ${inputFile}`);
  console.log(`Output : ${outputFile}`);
  console.log(`Lines  : ${entries.length}`);
  console.log(`Voice  : ${effectiveVoice}`);
  console.log(`FFmpeg : ${FFMPEG_BIN}`);
  console.log('');

  // ── Temp directory for individual clips ──
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxtral-'));

  try {
    const rawClips = [];

    for (let i = 0; i < entries.length; i++) {
      const { timestamp, text } = entries[i];
      process.stdout.write(`  [${i + 1}/${entries.length}] ${timestamp}  "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"  →  `);

      const base64 = await ttsRequest({ apiKey, text, voiceId, refAudio });
      const rawClipPath = path.join(tmpDir, `raw_${String(i).padStart(4, '0')}.mp3`);
      fs.writeFileSync(rawClipPath, Buffer.from(base64, 'base64'));
      rawClips.push(rawClipPath);

      console.log('✔');
    }

    console.log('\nAligning clip timings to timestamps with FFmpeg…');
    const finalSegments = [];

    // Initial silence if the first entry starts after 00:00:00
    if (entries[0].timestampSeconds > 0) {
      const initialSilPath = path.join(tmpDir, 'seg_initial.mp3');
      const silDur = entries[0].timestampSeconds;
      const res = spawnSync(FFMPEG_BIN, [
        '-y',
        '-f', 'lavfi',
        '-i', 'anullsrc=r=44100:cl=stereo',
        '-t', String(silDur),
        '-c:a', 'libmp3lame',
        '-b:a', '128k',
        initialSilPath,
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      if (res.status === 0) {
        finalSegments.push(initialSilPath);
      }
    }

    for (let i = 0; i < entries.length; i++) {
      const currentTS = entries[i].timestampSeconds;
      const rawClip   = rawClips[i];
      const segPath   = path.join(tmpDir, `seg_${String(i).padStart(4, '0')}.mp3`);

      let targetDur = null;
      if (i < entries.length - 1) {
        const nextTS = entries[i + 1].timestampSeconds;
        if (nextTS > currentTS) {
          targetDur = nextTS - currentTS;
        }
      }

      if (targetDur !== null && targetDur > 0) {
        // Pad trailing silence if clip is shorter, or trim if clip is longer than targetDur
        const res = spawnSync(FFMPEG_BIN, [
          '-y',
          '-i', rawClip,
          '-af', 'apad',
          '-t', String(targetDur),
          '-c:a', 'libmp3lame',
          '-b:a', '128k',
          segPath,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        if (res.status === 0) {
          finalSegments.push(segPath);
        } else {
          finalSegments.push(rawClip);
        }
      } else {
        // Last clip or no timestamp constraint: use raw clip as is
        finalSegments.push(rawClip);
      }
    }

    console.log('Merging aligned clips into output MP3…');
    joinMp3Files(finalSegments, outputFile, tmpDir);

    const sizeMB = (fs.statSync(outputFile).size / 1024 / 1024).toFixed(2);
    console.log(`\n✔  Done → ${outputFile}  (${sizeMB} MB)\n`);

  } finally {
    // Clean up temp files
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ─── Help text ───────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
voxtral — Mistral Voxtral Text-to-Speech CLI
─────────────────────────────────────────────────

USAGE

  voxtral api set <KEY>          Save your Mistral API key to ~/.voxtral/config.json
  voxtral api show               Display the currently stored API key (masked)
  voxtral voices                 List all available Voxtral preset voices
  voxtral <input.txt>            Convert a timestamped text file → MP3
  voxtral <input.txt> --voice <slug|file> [--output <output.mp3>]
                                 Use a specific voice slug or reference audio file
  voxtral help / --help          Show this help
  voxtral version / --version    Display version number

INPUT FILE FORMAT

  00:00:00|Hello, welcome to my video.
  00:00:04|Today we are going to learn FFmpeg.
  00:00:08|Let's get started.

  Each line:  HH:MM:SS|The text to speak
  Lines are converted sequentially and merged into one MP3.

OUTPUT

  Default: Same folder as input, with timestamp added (e.g. test_20260920_161514.mp3).
  Custom : Pass --output / -o <file.mp3> to specify custom output path.
  Example: test.txt -o test2.mp3 → test2.mp3

CONFIG FILE

  ${getConfigPath()}

API KEY CONSOLE

  https://console.mistral.ai/api-keys

DEFAULT VOICE

  ${DEFAULT_VOICE}  (run "voxtral voices" to see all options)

OPTIONS

  --voice, -v <slug|file>     Preset voice slug or local reference audio file
  --output, -o <file.mp3>     Custom output MP3 filename or path

FFMPEG

  Bundled automatically via ffmpeg-static — no global FFmpeg install needed.
  Binary: ${FFMPEG_BIN}

EXAMPLES

  voxtral api set YOUR_MISTRAL_API_KEY
  voxtral voices
  voxtral test.txt
  voxtral test.txt --voice en_paul_confident
  voxtral test.txt --voice myspeaker.wav
`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
    printHelp();
    process.exit(0);
  }

  // voxtral version / --version / -V / -v (when passed alone)
  if (argv[0] === 'version' || argv[0] === '--version' || argv[0] === '-V' || (argv.length === 1 && argv[0] === '-v')) {
    const pkg = require('./package.json');
    console.log(`voxtral v${pkg.version}`);
    process.exit(0);
  }

  // voxtral api set / voxtral api show
  if (argv[0] === 'api') {
    const sub = argv[1];
    if (sub === 'set')  { cmdApiSet(argv.slice(2)); return; }
    if (sub === 'show') { cmdApiShow(); return; }
    console.error(`Unknown api subcommand: ${sub || '(none)'}`);
    console.error('Usage: voxtral api set <KEY> | voxtral api show');
    process.exit(1);
  }

  // voxtral voices
  if (argv[0] === 'voices') {
    await cmdVoices();
    return;
  }

  // voxtral <file> [--voice <slug>] [--output <file>]
  const inputFile = argv[0];
  const opts = {};
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--voice' || arg === '-v') && argv[i + 1]) {
      opts.voice = argv[++i];
    } else if ((arg === '--output' || arg === '-o') && argv[i + 1]) {
      opts.output = argv[++i];
    }
  }

  await cmdConvert(inputFile, opts);
}

main().catch(err => {
  console.error(`\nFatal error: ${err.message}`);
  process.exit(1);
});
