// Posts each submitted feedback call form to the customer's AccuLynx job as a note.
//
// Runs every 15 minutes (.github/workflows/post-notes.yml). Finds contacts tagged feedback-call whose form answers are
// filled in (Feedback Disposition set) and whose current call hasn't been posted yet, posts the summary to the
// AccuLynx job, then marks the contact "posted" for that job + appointment date so it's never posted twice.
// The morning load clears the answers for a new call, so a later feedback call on the same contact posts again.

const ACX_KEY = process.env.ACCULYNX_API_KEY, GHL_KEY = process.env.GHL_FEEDBACK_TOKEN;
const LOCATION = process.env.GHL_LOCATION_ID || "snK6ntCH0DvCdvjyUt7D";
const DRY = /^(1|true|yes)$/i.test(process.env.DRY_RUN || "");
if (!ACX_KEY || !GHL_KEY) { console.error("Missing ACCULYNX_API_KEY or GHL_FEEDBACK_TOKEN"); process.exit(1); }

const F = {
  rep: "6nsdUvNaBALF6eCnc4tO", apptDate: "DubrvXCvwMOvyo28kkMC", estimate: "4i3u5qdz8CoFEkwxlJCR", jobId: "gG5Noz1yy3yoowHvPfBw",
  howItWent: "zNWVwtCCKOQ6Mv2tTO8E", disposition: "0JUYhK2FMYMlUnHTjCNh", magicWand: "j0790m84QI9KaYlJuPwk",
  price: "rQdKaIzsQPYWDXTCPMZF", timeline: "asRnrt2Rk02kRaNkQpN4", better: "apW5ZnYtzJr774PzNuLf",
  mainReason: "d4uP2nFfIMibDb7yKWZB", signedElsewhere: "RGuaLO0lnrDFq6UTBJXx", posted: "DJWveKeWbWGauuxB8kvP",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(url, { method = "GET", headers, body } = {}) {
  let last;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(url, { method, headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (res.ok) { const t = await res.text(); return t ? JSON.parse(t) : {}; }
    last = `HTTP ${res.status} on ${method} ${url.split("?")[0]}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
    if (res.status !== 429 && res.status < 500) break;
    await sleep(1500 * 2 ** i);
  }
  throw new Error(last);
}
const ghl = (p, o = {}) => call("https://services.leadconnectorhq.com" + p, { ...o, headers: { Authorization: `Bearer ${GHL_KEY}`, Version: "2021-07-28", Accept: "application/json" } });
const acx = (p, o = {}) => call("https://api.acculynx.com/api/v2" + p, { ...o, headers: { Authorization: `Bearer ${ACX_KEY}`, Accept: "application/json" } });

// every contact with the feedback-call tag
const contacts = [];
for (let page = 1; page < 50; page++) {
  const r = await ghl("/contacts/search", { method: "POST", body: { locationId: LOCATION, page, pageLimit: 100,
    filters: [{ field: "tags", operator: "contains", value: "feedback-call" }] } });
  const batch = r?.contacts || [];
  contacts.push(...batch);
  if (batch.length < 100) break;
}

let posted = 0;
const problems = [];
for (const c of contacts) {
  const v = (id) => { const x = (c.customFields || []).find((f) => f.id === id)?.value; return Array.isArray(x) ? x.join(", ") : String(x ?? "").trim(); };
  const job = v(F.jobId), appt = v(F.apptDate).slice(0, 10), disp = v(F.disposition);
  if (!job || !disp) continue;                       // not called yet
  const key = `${job}|${appt}`;
  if (v(F.posted) === key) continue;                 // already posted for this call
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.contactName || "Customer";
  const lines = [
    `FEEDBACK CALL (Kelly): ${name}`,
    `Rep: ${v(F.rep) || "?"} | Appointment: ${appt || "?"}`,
    "",
    `Where they're at: ${disp}`,
    `Main reason: ${v(F.mainReason) || "-"}`,
    `How it went: ${v(F.howItWent) || "-"}`,
    `Magic wand: ${v(F.magicWand) || "-"}`,
    `Price vs expected: ${v(F.price) || "-"}`,
    `Timeline: ${v(F.timeline) || "-"}`,
    `Could have done better: ${v(F.better) || "-"}`,
  ];
  if (v(F.signedElsewhere)) lines.push(`Signed elsewhere (who/why): ${v(F.signedElsewhere)}`);
  const message = lines.join("\n");
  if (DRY) { console.log(`would post: ${name} (job ${job})\n${message}\n`); posted++; continue; }
  try {
    await acx(`/jobs/${job}/messages`, { method: "POST", body: { message } });
    await ghl(`/contacts/${c.id}`, { method: "PUT", body: { customFields: [{ id: F.posted, field_value: key }] } });
    posted++; console.log(`posted: ${name} (job ${job})`);
  } catch (e) {
    problems.push(`${name}: ${e.message} https://my.acculynx.com/jobs/${job}`);
  }
}
console.log(`Done: ${posted} note${posted === 1 ? "" : "s"} posted${DRY ? " (DRY RUN)" : ""}, ${contacts.length} feedback contacts checked`);
if (problems.length) { console.error("Problems:\n" + problems.join("\n")); process.exit(1); }
