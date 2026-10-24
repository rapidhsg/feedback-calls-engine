# feedback-calls-engine

Loads Rapid Roofing's next-day feedback calls into GoHighLevel.

## What it does

Every morning, 7 days a week, at 8:00 AM Eastern (`.github/workflows/feedback-calls.yml`):

1. Reads the latest AccuLynx job export from `rapidhsg/rr-metrics-data` (data branch).
2. Picks yesterday's appointments that were quoted, are still in Prospect, and were not submitted for approval. No Call Backs, Service, or Upsell / Change Order.
3. Gets each customer's name, phone and email from AccuLynx.
4. Finds them in GHL by phone, then email. If they aren't in GHL, creates them like our prospects: tag `prospect`, lead source, trade type, job category, work type, address.
5. Fills the Feedback fields (appointment date, rep, estimate, AccuLynx job ID and link, rep's appointment notes), clears the last call's answers, and adds the `feedback-call` tag. That tag starts the Feedback Calls workflows in GHL.

Anyone already loaded for that job and day is skipped, so a second run never double-loads. Customer phones and emails are never printed or saved. The morning load never writes to AccuLynx. Posting Kelly's answers is a separate job, below.

If a customer can't be loaded, the run shows a red X and GitHub emails the repo owner with the name and AccuLynx link, so Kelly can still call them.

## Posting Kelly's answers to AccuLynx

Every 15 minutes (`.github/workflows/post-to-acculynx.yml`, `scripts/post_to_acculynx.mjs`):

1. Reads new submissions of the "FC - Feedback Call Form" in GHL.
2. Finds the AccuLynx job from the contact's Feedback AccuLynx Job ID field.
3. Posts the answers as a message on that job and tags the rep with an @mention.

Each form posts once. Posted forms are listed in `state/acculynx_posted.json`, which the workflow commits back. A form for a contact with no AccuLynx job is reported once (red X and an email) and then skipped. Customer phones and emails are never posted. Needs the GHL "Feedback Calls" integration to have View Forms.

To test: Actions > post-to-acculynx > Run workflow. Dry run is on by default (shows what it would post, writes nothing).

## Test or reload a day

Actions > feedback-calls > Run workflow. Dry run is on by default (shows who it would load, writes nothing). Pick a date or leave it blank for yesterday.

## Secrets

- `ACCULYNX_API_KEY`
- `GHL_FEEDBACK_TOKEN`: GHL Private Integration "Feedback Calls" for Rapid Roofing & Gutters (View Contacts, Edit Contacts, View Tags, View Forms)

If `rapidhsg/rr-metrics-data` is ever made private, add a read token for it and pass it to the second checkout step.
