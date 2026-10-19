# Fold Book

The **SEV7N FOLD** student hub: a responsive, dark-mode site for Economics 100L at the University of Uyo.

The site includes a searchable Economics 100L results lookup, printable course result cards, weekly timetable, and department announcements. The result search accepts a full registration number or the student's three-digit class number.

**The results lookup is public.** At build time, `data/students.csv` and `data/results.csv` are compiled into the generated `dist/assets/js/app.js`; they aren't copied into `dist/` as raw CSVs. Anyone can download that JavaScript and read the published names, registration numbers, and scores. The registration/name check only filters the on-screen result; it is not authentication and does not make other records private. Do not deploy this client-side build if student results must be confidential; that requires a protected backend. No hardcoded admin bypass is included because credentials shipped in client code cannot protect access.

The WhatsApp prompt requires explicit consent before saving the normalized Nigerian phone number, registration, name, study streak, and course into Supabase. It saves the result card only after the opt-in succeeds. The browser uses the public Supabase anon key; never expose the service-role key to the site.

## Run locally

Node.js 18 or later is required. The site can be built without credentials. Live Dr. Eco responses require the `GEMINI_API_KEY` server-side environment variable; course-note retrieval and material indexing also require Supabase configuration and database policies.

```sh
npm run dev
```

Open <http://127.0.0.1:4173>. The development script builds the site first, so the results lookup works in the local preview.

Students with an A or B in one or more courses see a celebration card after looking up their results. They can preview each qualifying course and export a 1080 × 1920 PNG for social status or stories; the image is generated in the browser without an additional dependency.

### Configure Dr. Eco

Dr. Eco sends Gemini requests through the same-origin `/api/dr-eco` serverless function. Set `GEMINI_API_KEY` in Vercel Project Settings → Environment Variables for each deployment environment, then redeploy. Never put the Gemini key in frontend files or commit it. The local preview server routes `/api/dr-eco` through the same handler; set `GEMINI_API_KEY` in the environment before running `npm run dev` or `npm run preview`.

The Supabase anon key is a public browser key. Supabase must provide a `course_materials` table with `level`, `course_code`, `title`, and `content` columns, plus a `match_course_materials` RPC accepting `match_course`, `match_level`, and `match_count` and returning material `content`. Configure row-level security to protect reads and inserts; do not use a public insert policy as admin authorization. The static Admin view is only a demo gate, not secure authentication. Configure Gemini API quotas and Vercel abuse protection for the public proxy endpoint.

### WhatsApp reminder worker

Run `worker/schema.sql` in the Supabase SQL editor to add the reminder fields, migrate existing consented numbers, enforce one row per phone, and set the anon upsert policies. If the migration finds duplicate phone numbers, merge those records before rerunning it. Keep RLS enabled and do not grant public SELECT access. The browser policy permits opted-in upserts; because browser requests cannot prove phone ownership, use a verified WhatsApp opt-in/confirmation flow before sending real reminders.

Deploy the repository as a Render Web Service with start command `npm start`; the root entrypoint starts a lightweight HTTP health-check server on Render's `PORT` (default 10000). Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `FOLDBOOK_URL` in Render's environment; the service-role key must never be used in the site or committed. To authenticate using an 8-digit WhatsApp pairing code, set `BOT_PHONE_NUMBER` to the linked account's number in international digits-only format, for example `2348012345678`. If it is unset, the worker displays a QR code instead. Pairing codes are sensitive: retrieve them only from private worker logs and never publish those logs. Attach a persistent disk and set `WHATSAPP_AUTH_DIRECTORY` to a path on that disk so Baileys login credentials survive restarts. The worker sends at 8:00 AM Africa/Lagos time, skips recipients nudged in the last 20 hours, waits between sends, and supports `STOP`/`UNSUBSCRIBE` and `START` replies.

Baileys is an unofficial WhatsApp Web client and may violate WhatsApp terms or lead to account restrictions; for a production messaging service, prefer the official WhatsApp Business Platform/Cloud API.

## Build and preview a deployment

```sh
npm run build
npm test
npm run preview
```

The build writes a static site to `dist/`. It copies `index.html`, every regular file in `assets/brand/`, the styles and scripts, `data/announcements.csv`, and `data/timetable.csv`. It compiles and validates the student and result records into the generated JavaScript bundle without copying `data/students.csv` or `data/results.csv` into `dist/`. The lookup form asks for a registration number and name and renders the matching student's statement. Students who explicitly opt in can save their Nigerian WhatsApp number for study reminders before exporting an A/B-grade result card. Result cards use the local black poster logo, white navigation and modal logo, and grade-specific trophy or target image; use the browser's print dialog to print or save a card. Tests verify the searchable result output, all brand assets, timetable, announcements, and absence of raw CSV files from the production preview.

## Deploy to Vercel

Import this repository in Vercel and deploy. [vercel.json](./vercel.json) configures `npm run build`, publishes `dist/`, and adds content-type, referrer, permissions, and content-security-policy headers. Configure `GEMINI_API_KEY` in the Vercel project settings before relying on live Dr. Eco responses.

You can also deploy from the Vercel CLI:

```sh
npx vercel
```

Check the Vercel build output before sharing your URL. Because results are embedded in downloadable JavaScript, make the Vercel deployment public only if the included student results are authorized for public release. Use a properly authenticated backend instead if results should only be accessible to individual students.

## Optional Glide CSV exports

Generate the existing CSVs for a private Glide or Sheets workflow with:

```sh
node scripts/generate_data.js
```

**These exports contain student names, registration numbers, and results.** Keep them in access-controlled storage unless they are authorized for public release. The Vercel build publishes their lookup data inside its client-side JavaScript bundle. See [GLIDE_SETUP.md](./GLIDE_SETUP.md) for the existing Glide workflow.
