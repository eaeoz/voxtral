# voxtral — Mistral Voxtral Text-to-Speech CLI

Convert timestamped text files to high-quality MP3 audio using Mistral's Voxtral speech model.

---

## Key Features

- **Timestamp Audio Synchronization:** Automatically aligns speech to exact timestamps, inserting silence padding for gaps and trimming overlapping audio.
- **Voice Cloning:** Clone any voice using a short local WAV or MP3 reference sample.
- **Bundled FFmpeg:** Automatic FFmpeg binary management via `ffmpeg-static` with zero external dependencies.
- **Custom Output Naming:** Automatically appends timestamps to output files or accepts custom filenames using `-o` / `--output`.

---

## API Key Setup

Get your Mistral API key from the official console:
https://console.mistral.ai/api-keys

Save your key to your global configuration:
```bash
voxtral api set YOUR_MISTRAL_API_KEY
```

Check your stored API key:
```bash
voxtral api show
```

---

## Installation

Install globally via NPM:

```bash
npm install -g voxtral
```

Install locally from source:

```bash
npm install -g .
```

---

## Quick Start

Save your API key:
```bash
voxtral api set YOUR_MISTRAL_API_KEY
```

Create a timestamped text file `script.txt`:
```text
00:00:00|Hello world, welcome to Voxtral.
00:00:05|This line starts after a 5 second mark.
```

Convert the script to MP3:
```bash
voxtral script.txt
```

---

## Command Reference

- `voxtral <file.txt>`
  Converts a timestamped text file to a merged MP3 audio file.

- `voxtral api set <KEY>`
  Saves your Mistral API key to your user configuration directory.

- `voxtral api show`
  Displays the current config file location and masked API key.

- `voxtral voices`
  Lists all available preset Voxtral voices.

- `voxtral version` (or `--version`, `-V`, `-v`)
  Displays the current version of Voxtral CLI.

- `voxtral help` (or `--help`, `-h`)
  Displays the command-line help menu.

---

## Options & Flags

- `--voice <slug|file>` (or `-v <slug|file>`)
  Specifies a preset voice slug or a path to a local audio file for voice cloning. Default: `en_paul_neutral`.

- `--output <file.mp3>` (or `-o <file.mp3>`)
  Specifies a custom output MP3 filename or path. If omitted, Voxtral automatically generates a timestamped filename like `script_20260920_161514.mp3`.

---

## Input File Format

Each line in your input text file must match the format:

```text
HH:MM:SS|Text to speak
```

- `HH:MM:SS`: Timestamp in hours, minutes, and seconds.
- Pipe symbol separator.
- Text: The phrase or sentence to synthesize into audio.

### Timing & Synchronization Behavior

- **Silence Padding:** If a line finishes before the next timestamp (e.g. line 1 at `00:00:00` and line 2 at `00:00:25`), Voxtral automatically pads silence so line 2 starts at exactly 25 seconds.
- **Overflow Trimming:** If a line takes longer than the gap before the next timestamp (e.g. line 1 takes 10 seconds but line 2 starts at `00:00:04`), line 1 is trimmed to 4 seconds so line 2 starts on time.
- **Initial Delay:** If the first line starts after `00:00:00` (e.g. `00:00:05`), initial silence is inserted at the beginning.

---

## Available Preset Voices

### American English (`en_us`)

- `en_paul_neutral` — Relaxed and balanced (Default voice)
- `en_paul_confident` — Bold and punchy (Intros & announcements)
- `en_paul_cheerful` — Upbeat and breezy (Casual & lifestyle)
- `en_paul_happy` — Sunny and easygoing (Entertainment)
- `en_paul_excited` — Bouncy and spirited (Promos & gaming)
- `en_paul_sad` — Heavy and hushed (Drama & storytelling)
- `en_paul_frustrated` — Edgy and snappy (Character dialogue)
- `en_paul_angry` — Raw and gruff (Action & drama)

### British English (`en_gb`)

- `gb_oliver_neutral` — Oliver (Male, calm and even narration)
- `gb_jane_sarcasm` — Jane (Female, dry and sarcastic tone)

---

## Voice Cloning

To clone a voice from a local reference recording:

- Record 5 to 30 seconds of clear speech in WAV or MP3 format.
- Pass the reference audio file path with `--voice` or `-v`.

Example command:
```bash
voxtral script.txt --voice reference.wav -o cloned_output.mp3
```

---

## Configuration & Storage Locations

Config File Location:
- Windows: `C:\Users\<username>\.voxtral\config.json`
- macOS: `/Users/<username>/.voxtral/config.json`
- Linux: `/home/<username>/.voxtral/config.json`

Environment Variable Override:
- Set `MISTRAL_API_KEY` in your environment to override the config file for a single command run.

PowerShell example:
```powershell
$env:MISTRAL_API_KEY="YOUR_KEY"; voxtral script.txt
```

Linux / macOS example:
```bash
MISTRAL_API_KEY="YOUR_KEY" voxtral script.txt
```

---

## Usage Examples

Set your API key:
```bash
voxtral api set YOUR_MISTRAL_API_KEY
```

List available voices:
```bash
voxtral voices
```

Convert using default voice and auto-timestamped output:
```bash
voxtral script.txt
```

Convert using Jane's voice and custom output filename:
```bash
voxtral script.txt -v gb_jane_sarcasm -o narration.mp3
```

Convert using voice cloning:
```bash
voxtral script.txt -v my_sample.wav -o custom_voice.mp3
```

Check CLI version:
```bash
voxtral version
```

---

Author: Sedat ERGOZ
GitHub: https://github.com/eaeoz/voxtral
NPM: https://www.npmjs.com/package/voxtral
