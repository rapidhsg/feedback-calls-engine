# feedback-calls-engine

Loads Rapid Roofing's next-day feedback calls into GoHighLevel.

## What it does

Every morning, 7 days a week, at 8:00 AM Eastern (`.github/workflows/feedback-calls.yml`):

1. Reads the latest AccuLynx job export from `rapidhsg/rr-metrics-data` (data branch).
2. Picks yesterday's appointments that were quoted, are still in Prospect, and were not submitted for approval. No Call Backs, Service, or Upsell / Change Order.
3. Gets each customer's name, phone and email from AccuLynx.
4. Finds them in GHL by phone, then email. If they aren't in GHL, creates them like our prospects: tag `prospect`, lead source, trade type, job category, work type, address.
5. Fills the Feedback fields (appointment date, rep, estimate, AccuLynx job ID and link, rep's appointment notes), clears the last call's answers, and adds the `feedback-call` tag. That tag starts the Feedback Calls workflows in GHL.

Anyone already loaded for that job and day is skipped, so a second run never double-loads. Customer phones and emails are never printed or saved. It never writes to AccuLynx.

If a customer can't be loaded, the run shows a red X and GitHub emails the repo owner with the name and AccuLynx link, so Kelly can still call them.

## Test or reload a day

Actions > feedback-calls > Run workflow. Dry run is on by default (shows who it would load, writes nothing). Pick a date or leave it blank for yesterday.

## Secrets

- `ACCULYNX_API_KEY`
- `GHL_FEEDBACK_TOKEN`: GHL Private Integration "Feedback Calls" for Rapid Roofing & Gutters (View Contacts, Edit Contacts, View Tags)

If `rapidhsg/rr-metrics-data` is ever made private, add a read token for it and pass it to the second checkout step.
