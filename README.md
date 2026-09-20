# voxtral — Mistral Voxtral Text-to-Speech CLI

> Convert timestamped text files to MP3 using Mistral's Voxtral speech model.

---

## Table of Contents

- [Installation](#installation)
- [Publishing to NPM](#publishing-to-npm)
- [Quick Start](#quick-start)
- [Command Reference](#command-reference)
  - [voxtral api set](#voxtral-api-set)
  - [voxtral api show](#voxtral-api-show)
  - [voxtral voices](#voxtral-voices)
  - [voxtral \<file\>](#voxtral-file)
- [Input File Format](#input-file-format)
- [Voice Reference](#voice-reference)
  - [Paul — American English (en_us)](#paul--american-english-en_us)
  - [Oliver — British English (en_gb)](#oliver--british-english-en_gb)
  - [Jane — British English (en_gb)](#jane--british-english-en_gb)
- [Voice Cloning](#voice-cloning)
- [Config File](#config-file)
- [Environment Variables](#environment-variables)
- [How FFmpeg is Bundled](#how-ffmpeg-is-bundled)
- [Rate Limiting](#rate-limiting)
- [Troubleshooting](#troubleshooting)

---

## Installation

### From NPM (Global CLI)
```bash
npm install -g voxtral
```

After installation, the `voxtral` command is available globally in your terminal.

### From Source (Local Link)
```bash
# Clone and install globally from folder
npm install -g .
```

---

## Publishing to NPM

To publish this package under your NPM account:

```bash
# 1. Login to your NPM account (if not already logged in)
npm login

# 2. Publish as a public global package
npm publish --access public
```

---

## Quick Start

```bash
# 1. Get your Mistral API key from: https://console.mistral.ai/api-keys
# 2. Save your key to config
voxtral api set YOUR_MISTRAL_API_KEY

# 3. Create a timestamped text file
echo "00:00:00|Hello world." > test.txt

# 4. Convert to MP3 (uses default voice: en_paul_neutral)
voxtral test.txt
# → produces test_<timestamp>.mp3 in the same folder
```

---

## Command Reference

---

### `voxtral api set`

Saves your Mistral API key to the user config file. You can obtain an API key at [https://console.mistral.ai/api-keys](https://console.mistral.ai/api-keys).

```
voxtral api set <KEY>
```

| Argument | Required | Description |
|----------|----------|-------------|
| `<KEY>`  | ✔ Yes   | Your Mistral API key from [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys) |

**Examples:**
```bash
voxtral api set abc123xyz
```

**Config file location by OS:**

| OS      | Path |
|---------|------|
| Windows | `C:\Users\<you>\.voxtral\config.json` |
| macOS   | `~/.voxtral/config.json` |
| Linux   | `~/.voxtral/config.json` |

> [!NOTE]
> The `MISTRAL_API_KEY` environment variable always takes precedence over the config file if both are set.

---

### `voxtral api show`

Displays the currently stored API key (masked) and the config file path.

```
voxtral api show
```

**Example output:**
```
Config file : C:\Users\sedat\.voxtral\config.json
API key     : ****************************FKZU
```

---

### `voxtral voices`

Lists all available Voxtral preset voices with their slug, name, gender, language and style tags.

```
voxtral voices
```

**Example output:**
```
Available voices (10 unique total):

  SLUG                           NAME                      GENDER  LANG
  ------------------------------ ------------------------- ------  ----
  en_paul_sad                    Paul - Sad                male    en_us
  en_paul_neutral                Paul - Neutral            male    en_us
  en_paul_happy                  Paul - Happy              male    en_us
  en_paul_frustrated             Paul - Frustrated         male    en_us
  en_paul_excited                Paul - Excited            male    en_us
  en_paul_confident              Paul - Confident          male    en_us
  en_paul_cheerful               Paul - Cheerful           male    en_us
  en_paul_angry                  Paul - Angry              male    en_us
  gb_oliver_neutral              Oliver - Neutral          male    en_gb
  gb_jane_sarcasm                Jane - Sarcasm            female  en_gb

  Usage: voxtral test.txt --voice <SLUG>
  Default voice: en_paul_neutral
```

Use the **SLUG** value with `--voice`.

---

### `voxtral <file>`

Converts a timestamped text file to a single merged MP3.

```
voxtral <input.txt> [--voice <slug|file>] [--output <out.mp3>]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `<input.txt>` | ✔ Yes | Path to the timestamped text file |
| `--voice <slug>` / `-v` | ✗ No | Preset voice slug (default: `en_paul_neutral`) or audio file for cloning |
| `--output <out.mp3>` / `-o` | ✗ No | Custom output MP3 filename or path |

**Output:** By default, the MP3 is saved in the **same folder** as the input with a timestamp appended (e.g. `test_20260920_161514.mp3`). You can override the output filename using `--output` or `-o`.

```
voxtral test.txt                                        →  test_20260920_161514.mp3
voxtral test.txt --voice gb_jane_sarcasm -o test2.mp3  →  test2.mp3
```

**Progress display:**
```
Input  : test.txt
Output : E:\Gemini\voxtral\test.mp3
Lines  : 3
Voice  : en_paul_neutral
FFmpeg : E:\Gemini\voxtral\node_modules\ffmpeg-static\ffmpeg.exe

  [1/3] 00:00:00  "Hello, welcome to my video."         →  ✔
  [2/3] 00:00:04  "Today we are going to learn FFmpeg." →  ✔
  [3/3] 00:00:08  "Let's get started."                  →  ✔

Merging clips with bundled FFmpeg…

✔  Done → E:\Gemini\voxtral\test.mp3  (0.04 MB)
```

---

## Input File Format

Each line follows the pattern:

```
HH:MM:SS|Text to speak
```

- **HH:MM:SS** — timestamp in hours:minutes:seconds (used for audio synchronization and timeline alignment)
- **|** — literal pipe character separator
- **Text** — the sentence or phrase to synthesise

**Timestamp Audio Alignment Behavior:**
- **Silence Padding:** If a line finishes before the next line's timestamp (e.g. line 1 is at `00:00:00` and line 2 is at `00:00:25`), silence is automatically padded so line 2 starts at exactly 25 seconds.
- **Overflow Trimming:** If a line takes longer than the gap before the next timestamp (e.g. line 1 takes 10s but line 2 starts at `00:00:04`), line 1 is trimmed to 4 seconds so line 2 starts precisely on schedule.
- **Initial Delay:** If the first timestamp is greater than `00:00:00` (e.g. `00:00:05`), initial silence is inserted at the beginning.

**Rules:**
- Empty lines are skipped automatically
- Lines that don't match the `HH:MM:SS|text` pattern are skipped with a warning
- Lines are processed **sequentially** (one API call per line)
- All clips are aligned to their timestamps and merged into one continuous MP3 via FFmpeg

---

## Voice Reference

The Mistral Voxtral API provides **10 preset voices** as of the time of writing. Use the **Slug** column with `--voice`.

### Paul — American English (`en_us`)

> Male voice, age 30. Multiple emotional styles available.

| Slug | Name | Style Tags | Best For |
|------|------|-----------|---------|
| `en_paul_neutral` ⭐ | Paul - Neutral | relaxed, balanced, neutral | General narration, tutorials, default |
| `en_paul_confident` | Paul - Confident | bold, punchy, confident | Intros, announcements, marketing |
| `en_paul_cheerful` | Paul - Cheerful | upbeat, breezy, cheerful | Lifestyle content, casual narration |
| `en_paul_happy` | Paul - Happy | sunny, easygoing, happy | Entertainment, positive content |
| `en_paul_excited` | Paul - Excited | bouncy, spirited, excited | Promotions, game content, energy |
| `en_paul_sad` | Paul - Sad | heavy, hushed, sad | Dramatic content, storytelling |
| `en_paul_frustrated` | Paul - Frustrated | edgy, snappy, frustrated | Character voices, drama |
| `en_paul_angry` | Paul - Angry | raw, gruff, angry | Character voices, drama, action |

⭐ = default voice when `--voice` is not specified

**Usage examples:**
```bash
tts narration.txt --voice en_paul_confident
tts narration.txt --voice en_paul_cheerful
tts narration.txt --voice en_paul_excited
tts narration.txt -v en_paul_happy
```

---

### Oliver — British English (`en_gb`)

> Male British voice, age 30.

| Slug | Name | Style Tags | Best For |
|------|------|-----------|---------|
| `gb_oliver_neutral` | Oliver - Neutral | calm, even, neutral | British accent narration, documentaries |

**Usage example:**
```bash
tts narration.txt --voice gb_oliver_neutral
```

---

### Jane — British English (`en_gb`)

> Female British voice, age 30.

| Slug | Name | Style Tags | Best For |
|------|------|-----------|---------|
| `gb_jane_sarcasm` | Jane - Sarcasm | dry, wry, sarcastic | Comedy, character dialogue, satire |

**Usage example:**
```bash
tts narration.txt --voice gb_jane_sarcasm
```

---

## Voice Cloning

Pass a local WAV or MP3 audio file as the `--voice` argument to clone that voice.

```bash
tts narration.txt --voice my_recording.wav
tts narration.txt --voice reference_speaker.mp3
```

**How it works:**
1. The file is detected by checking if the path exists on disk
2. The file is base64-encoded and sent to the API as `ref_audio`
3. Voxtral transfers the speaking style, rhythm and intonation from the reference

**Tips for best cloning quality:**
- Use a clear recording with minimal background noise
- 5–30 seconds of speech is ideal
- WAV (PCM) or MP3 format both work
- The reference speaker's language should match the text you're synthesising

---

## Config File

The config is stored as plain JSON at `~/.voxtral/config.json`.

**Location by OS:**
| OS | Full path |
|----|-----------|
| Windows | `C:\Users\<username>\.voxtral\config.json` |
| macOS | `/Users/<username>/.voxtral/config.json` |
| Linux | `/home/<username>/.voxtral/config.json` |

**Current config keys:**

| Key | Set by | Description |
|-----|--------|-------------|
| `api_key` | `voxtral api set` | Your Mistral API key |

**Example `~/.voxtral/config.json`:**
```json
{
  "api_key": "your-mistral-api-key-here"
}
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MISTRAL_API_KEY` | Mistral API key — takes precedence over config file |

**Example:**
```bash
# Linux / macOS
MISTRAL_API_KEY=abc123 voxtral test.txt

# Windows PowerShell
$env:MISTRAL_API_KEY="abc123"; voxtral test.txt

# Windows CMD
set MISTRAL_API_KEY=abc123 && voxtral test.txt
```

---

## How FFmpeg is Bundled

`voxtral` uses the [`ffmpeg-static`](https://www.npmjs.com/package/ffmpeg-static) npm package.

- On `npm install -g .`, npm automatically downloads a **pre-compiled FFmpeg binary** for your platform
- `require('ffmpeg-static')` returns the **absolute path** to that binary
- **No global FFmpeg installation required** — the binary lives inside `node_modules`

| Platform | Binary location |
|----------|----------------|
| Windows | `node_modules\ffmpeg-static\ffmpeg.exe` |
| macOS | `node_modules/ffmpeg-static/ffmpeg` |
| Linux | `node_modules/ffmpeg-static/ffmpeg` |

FFmpeg is used only for the **concat/merge step** — joining multiple per-line MP3 clips into one final MP3. If the input file has only 1 line, the clip is copied directly without invoking FFmpeg.

---

## Rate Limiting

The Mistral Free tier has API rate limits. The app handles this automatically:

- Lines are processed **sequentially** — never in parallel
- If a `429 Too Many Requests` response is received, the app:
  1. Reads the `Retry-After` header (falls back to 10 seconds if absent)
  2. Waits the specified time
  3. Retries up to **5 times** per line before giving up

**Example rate-limit output:**
```
  [2/5] 00:00:04  "Second sentence."  →
  ↻ Rate-limited (429). Waiting 10s before retry 1/5…
  ✔
```

---

## Troubleshooting

### `TTS API error 400: Either ref_audio or voice must be provided`
The API requires a voice every time. Make sure you are on version `1.0.1` or later — older versions did not send a default voice.

### `TTS API error 400: Invalid model`
The model name in the code doesn't match your account's available models. Run:
```bash
node -e "fetch('https://api.mistral.ai/v1/models',{headers:{Authorization:'Bearer YOUR_KEY'}}).then(r=>r.json()).then(d=>d.data.filter(m=>m.id.includes('tts')).forEach(m=>console.log(m.id)))"
```
Then update `TTS_MODEL` in `index.js` to match.

### `Error: File not found`
Pass the full or relative path to the input file:
```bash
voxtral C:\Users\sedat\Desktop\script.txt
voxtral .\script.txt
```

### Lines are skipped with `⚠ Skipping unrecognised line`
Each line must match exactly `HH:MM:SS|text`. Common mistakes:
- Using a comma instead of `|` as separator
- Missing leading zeros: `0:00:00` instead of `00:00:00`
- BOM characters at the start of the file (save as UTF-8 without BOM)

### Output MP3 is silent or corrupted
- Check that the base64 audio data from the API is non-empty
- Try a different voice slug
- Run with a single-line file first to isolate the issue

---

## Model Information

| Property | Value |
|----------|-------|
| Model | `voxtral-mini-tts-2603` |
| Alias | `voxtral-mini-tts-latest` |
| Endpoint | `POST https://api.mistral.ai/v1/audio/speech` |
| Output format | MP3 (base64-encoded in JSON response) |
| Free tier | ✔ Available (rate limited) |

---

## Full Command Examples

Every possible way to use the `voxtral` CLI — copy, paste, run.

---

### 🔑 API Key Management

Get your Mistral API key from: [https://console.mistral.ai/api-keys](https://console.mistral.ai/api-keys)

```bash
# Save your key (stored in ~/.voxtral/config.json)
voxtral api set YOUR_MISTRAL_API_KEY

# Display current key (masked) and config file location
voxtral api show

# Override key for a single run via environment variable (not saved)
# Windows PowerShell:
$env:MISTRAL_API_KEY="2dfN8bc0XS31SKheOczCCw00lJPWFKZU"; voxtral test.txt
# Linux / macOS:
MISTRAL_API_KEY="2dfN8bc0XS31SKheOczCCw00lJPWFKZU" voxtral test.txt
```

---

### 🎙️ List Voices

```bash
# Show all available preset voices (slug, name, gender, language)
voxtral voices
```

---

### 📄 Basic Conversion

```bash
# Convert test.txt → test.mp3 using the default voice (en_paul_neutral)
voxtral test.txt

# Convert with a relative path
voxtral .\narration.txt

# Convert with an absolute path (Windows)
voxtral C:\Users\sedat\Desktop\script.txt

# Convert with an absolute path (Linux / macOS)
voxtral /home/sedat/projects/script.txt
```

---

### 🎭 Preset Voice — Paul (American English, Male)

```bash
# Neutral — relaxed, balanced  ⭐ DEFAULT
voxtral test.txt --voice en_paul_neutral
voxtral test.txt -v en_paul_neutral

# Confident — bold, punchy  (great for intros, announcements)
voxtral test.txt --voice en_paul_confident
voxtral test.txt -v en_paul_confident

# Cheerful — upbeat, breezy  (lifestyle, casual content)
voxtral test.txt --voice en_paul_cheerful
voxtral test.txt -v en_paul_cheerful

# Happy — sunny, easygoing  (entertainment, positive content)
voxtral test.txt --voice en_paul_happy
voxtral test.txt -v en_paul_happy

# Excited — bouncy, spirited  (promos, gaming, energy)
voxtral test.txt --voice en_paul_excited
voxtral test.txt -v en_paul_excited

# Sad — heavy, hushed  (drama, storytelling)
voxtral test.txt --voice en_paul_sad
voxtral test.txt -v en_paul_sad

# Frustrated — edgy, snappy  (character voices, drama)
voxtral test.txt --voice en_paul_frustrated
voxtral test.txt -v en_paul_frustrated

# Angry — raw, gruff  (action, drama, character voices)
voxtral test.txt --voice en_paul_angry
voxtral test.txt -v en_paul_angry
```

---

### 🇬🇧 Preset Voice — Oliver (British English, Male)

```bash
# Neutral — calm, even  (documentaries, British accent narration)
voxtral test.txt --voice gb_oliver_neutral
voxtral test.txt -v gb_oliver_neutral
```

---

### 🇬🇧 Preset Voice — Jane (British English, Female)

```bash
# Sarcasm — dry, wry  (comedy, satire, character dialogue)
voxtral test.txt --voice gb_jane_sarcasm
voxtral test.txt -v gb_jane_sarcasm
```

---

### 🔊 Voice Cloning (Reference Audio)

```bash
# Clone from a WAV file in the current folder
voxtral test.txt --voice my_voice.wav

# Clone from an MP3 reference file
voxtral test.txt --voice speaker_sample.mp3

# Clone from an absolute path
voxtral test.txt --voice C:\recordings\reference.wav

# Short alias
voxtral test.txt -v my_voice.wav
```

> When `--voice` points to a file that exists on disk, it is used for voice cloning.
> When it is a text slug (e.g. `en_paul_confident`), it selects a preset voice.

---

### 📁 Different Input / Output Locations

```bash
# File in another folder — output lands in the same folder as the input
voxtral C:\projects\video\script.txt --voice en_paul_confident
# → C:\projects\video\script.mp3

voxtral C:\projects\video\intro.txt --voice en_paul_excited
# → C:\projects\video\intro.mp3
```

---

### 🚀 One-Liner Cheatsheet

```bash
# Setup (run once)
voxtral api set YOUR_MISTRAL_API_KEY

# See what voices are available
voxtral voices

# Convert with every voice style — quick reference
voxtral test.txt -v en_paul_neutral      # Default — general narration
voxtral test.txt -v en_paul_confident    # Bold, punchy — intros & announcements
voxtral test.txt -v en_paul_cheerful     # Upbeat, breezy — casual & lifestyle
voxtral test.txt -v en_paul_happy        # Sunny, easygoing — entertainment
voxtral test.txt -v en_paul_excited      # Bouncy, spirited — promos & gaming
voxtral test.txt -v en_paul_sad          # Heavy, hushed — drama & storytelling
voxtral test.txt -v en_paul_frustrated   # Edgy, snappy — character voices
voxtral test.txt -v en_paul_angry        # Raw, gruff — action & drama
voxtral test.txt -v gb_oliver_neutral    # British male — calm & even
voxtral test.txt -v gb_jane_sarcasm      # British female — dry & sarcastic
voxtral test.txt -v my_voice.wav         # Voice cloning from local audio file
```

---

### 📋 Full Syntax Summary

```
voxtral help
voxtral version
voxtral api set <MISTRAL_API_KEY>
voxtral api show
voxtral voices
voxtral <input.txt>
voxtral <input.txt> --voice <slug>
voxtral <input.txt> --voice <reference_audio.wav|mp3>
voxtral <input.txt> -v <slug|file>
```

| Token | Type | Required | Description |
|-------|------|----------|-------------|
| `<input.txt>` | positional | ✔ Yes | Path to timestamped text file |
| `--voice` / `-v` | flag | ✗ No | Voice slug or path to reference audio file |
| `api set <KEY>` | subcommand | — | Save Mistral API key to config |
| `api show` | subcommand | — | Show saved key (masked) |
| `voices` | subcommand | — | List all preset voices |
| `version` / `--version` / `-v` | subcommand / flag | — | Display version number |
| `help` / `--help` / `-h` | subcommand / flag | — | Show help text |

---

*Author: Sedat ERGOZ · [github.com/eaeoz/voxtral](https://github.com/eaeoz/voxtral)*
