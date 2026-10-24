// Feedback calls, part 2: post Kelly's call form answers to the customer's AccuLynx job and tag the rep.
//
// Runs every 15 minutes. Reads new submissions of the "FC - Feedback Call Form" in GHL, finds the AccuLynx job
// from the contact's "Feedback AccuLynx Job ID" field (filled by feedback_calls.mjs), and posts the answers as a
// message on that job with an @mention of the rep.
//
// Each submission is posted once. Posted (and skipped) submission ids are kept in state/acculynx_posted.json, which
// the workflow commits back to the repo. A submission with no AccuLynx job is reported once (red X + email) and then
// left alone.
//
// Customer phone numbers and emails are never printed, saved or posted.
// Zero dependencies (Node 18+). Needs env ACCULYNX_API_KEY and GHL_FEEDBACK_TOKEN (GHL Private Integration
// "Feedback Calls", which needs View Forms and View Contacts). DRY_RUN=1 shows what it would post without writing.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const ACX_KEY = process.env.ACCULYNX_API_KEY, GHL_KEY = process.env.GHL_FEEDBACK_TOKEN;
const LOCATION = process.env.GHL_LOCATION_ID || "snK6ntCH0DvCdvjyUt7D";   // Rapid Roofing & Gutters
const FORM_ID = "dyzdc8PS10DBG5s1YE62";                                   // FC - Feedback Call Form
const START = "2026-10-22";                                               // first day of feedback calls
const DRY = /^(1|true|yes)$/i.test(process.env.DRY_RUN || "");
const STATE = "state/acculynx_posted.json";
if (!ACX_KEY || !GHL_KEY) { console.error("Missing ACCULYNX_API_KEY or GHL_FEEDBACK_TOKEN"); process.exit(1); }

// Contact fields filled when the call was loaded
const JOB_ID = "gG5Noz1yy3yoowHvPfBw", REP = "6nsdUvNaBALF6eCnc4tO", APPT = "DubrvXCvwMOvyo28kkMC";
// Form answers, in the order they post
const QUESTIONS = [
  ["0JUYhK2FMYMlUnHTjCNh", "Where they're at"],
  ["d4uP2nFfIMibDb7yKWZB", "Main reason"],
  ["rQdKaIzsQPYWDXTCPMZF", "Price vs what they expected"],
  ["asRnrt2Rk02kRaNkQpN4", "Timeline"],
  ["zNWVwtCCKOQ6Mv2tTO8E", "How the appointment went"],
  ["j0790m84QI9KaYlJuPwk", "Magic wand (what would get them to sign)"],
  ["apW5ZnYtzJr774PzNuLf", "What we could have done better"],
  ["RGuaLO0lnrDFq6UTBJXx", "Signed elsewhere: who and why"],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(url, { method = "GET", headers, body, allow404 = false } = {}) {
  let last;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(url, { method, headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (res.ok) { const t = await res.text(); return t ? JSON.parse(t) : {}; }
    if (res.status === 404 && allow404) return null;
    last = `HTTP ${res.status} on ${method} ${url.split("?")[0]}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
    if (res.status !== 429 && res.status < 500) break;
    await sleep(1500 * 2 ** i);
  }
  throw new Error(last);
}
const acx = (p, o) => call("https://api.acculynx.com/api/v2" + p, { ...o, headers: { Authorization: `Bearer ${ACX_KEY}`, Accept: "application/json" } });
const ghl = (p, o = {}) => call("https://services.leadconnectorhq.com" + p, { ...o, headers: { Authorization: `Bearer ${GHL_KEY}`, Version: "2021-07-28", Accept: "application/json" } });

const clean = (v) => String(Array.isArray(v) ? v.join(", ") : v ?? "").replace(/^\s*"+|"+\s*$/g, "").replace(/\s+/g, " ").trim();
const blank = (v) => !v || /^(n\/?a|none|no)$/i.test(v);
const nyDay = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const apptDay = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : null);

function message(sub, rep, appt) {
  const a = sub.others || {};
  const lines = [`Feedback call from Kelly, ${nyDay(sub.createdAt)}${appt ? ` (appointment ${appt})` : ""}`];
  if (rep) lines.push(`@${rep}`);
  lines.push("");
  for (const [id, label] of QUESTIONS) {
    const v = clean(a[id]);
    if (!blank(v)) lines.push(`${label}: ${v}`);
  }
  return lines.join("\n");
}

// ---------- state ----------
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const save = () => { mkdirSync("state", { recursive: true }); writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n"); };

// ---------- new submissions ----------
const subs = [];
for (let page = 1; page < 50; page++) {
  const r = await ghl(`/forms/submissions?locationId=${LOCATION}&formId=${FORM_ID}&startAt=${START}&limit=100&page=${page}`);
  subs.push(...(r?.submissions || []));
  if (!r?.meta?.nextPage) break;
}
const todo = subs.filter((s) => !state[s.id]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
console.log(`${subs.length} form submissions since ${START}, ${todo.length} new${DRY ? " (DRY RUN, nothing posted)" : ""}`);

const problems = [];
let posted = 0;
for (const s of todo) {
  const who = (s.name || "?").trim();
  try {
    const c = s.contactId ? (await ghl(`/contacts/${s.contactId}`, { allow404: true }))?.contact : null;
    const val = (fid) => (c?.customFields || []).find((x) => x.id === fid)?.value;
    const job = String(val(JOB_ID) || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(job)) {
      problems.push(`${who}: no AccuLynx job on the GHL contact, so the form answers were not posted (submitted ${nyDay(s.createdAt)})`);
      if (!DRY) { state[s.id] = { skipped: "no AccuLynx job id", at: new Date().toISOString() }; save(); }
      continue;
    }
    const text = message(s, clean(val(REP)), apptDay(val(APPT)));
    if (DRY) { console.log(`would post to ${who} (https://my.acculynx.com/jobs/${job}):\n${text}\n`); continue; }
    await acx(`/jobs/${job}/messages`, { method: "POST", body: { message: text } });
    state[s.id] = { job, at: new Date().toISOString() }; save();
    posted++;
    console.log(`posted: ${who} https://my.acculynx.com/jobs/${job}`);
  } catch (e) {
    problems.push(`${who}: ${e.message}`);   // left out of state, so the next run tries again
    if (/HTTP 401|HTTP 403/.test(e.message)) break;   // bad key or missing scope: stop instead of failing every row
  }
}
console.log(`Done: ${posted} posted to AccuLynx, ${problems.length} problems`);
if (problems.length) {
  console.error("Problems:\n" + problems.join("\n"));
  process.exit(1);   // red X in Actions + GitHub emails the repo owner
}
