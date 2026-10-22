// Makes the ElevenLabs voiceover for the Feedback Call Playbook.
// Reads training/lines.json (every caption in the playbook), writes one mp3 per line to training/audio/,
// and training/audio/manifest.json mapping each line to its file. Lines that already have audio are skipped,
// unless the voice changed (then everything is redone).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = (process.env.VOICE_ID || "").trim() || "EXAVITQu4vr4xnoEQFDL";   // default: "Sarah"
const MODEL = "eleven_multilingual_v2";
if (!KEY) { console.error("Missing ELEVENLABS_API_KEY secret (repo Settings > Secrets and variables > Actions)"); process.exit(1); }

const dir = "training/audio"; mkdirSync(dir, { recursive: true });
const lines = JSON.parse(readFileSync("training/lines.json", "utf8"));
const mfPath = `${dir}/manifest.json`;
const old = existsSync(mfPath) ? JSON.parse(readFileSync(mfPath, "utf8")) : { voice: null, files: {} };
const sameVoice = old.voice === VOICE;
const out = { voice: VOICE, model: MODEL, files: {} };

let made = 0;
for (const text of lines) {
  const file = createHash("sha1").update(VOICE + "|" + text).digest("hex").slice(0, 12) + ".mp3";
  out.files[text] = file;
  if (sameVoice && old.files[text] === file && existsSync(`${dir}/${file}`)) continue;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true } }),
  });
  if (!res.ok) { console.error(`ElevenLabs HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
  writeFileSync(`${dir}/${file}`, Buffer.from(await res.arrayBuffer()));
  made++; console.log(`made ${file}: ${text}`);
}
writeFileSync(mfPath, JSON.stringify(out, null, 1) + "\n");
console.log(`Done: ${made} new clips, ${lines.length} lines total, voice ${VOICE}`);
