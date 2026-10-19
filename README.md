# Fold Book

The **SEV7N FOLD** student hub: a responsive, dark-mode site for Economics 100L at the University of Uyo.

The site includes a searchable Economics 100L results lookup, printable course result cards, weekly timetable, and department announcements. The result search accepts a full registration number or the student's three-digit class number.

**The results lookup is public.** At build time, `data/students.csv` and `data/results.csv` are compiled into the generated `dist/assets/js/app.js`; they aren't copied into `dist/` as raw CSVs. Anyone can download that JavaScript and read the published names, registration numbers, and scores. The registration/name check only filters the on-screen result; it is not authentication and does not make other records private. Do not deploy this client-side build if student results must be confidential; that requires a protected backend.

The app has four views: a public landing/results lookup, a mandatory student/Admin authentication screen, a student workspace, and a standalone Admin Portal. The `101010` plus `Nssien` or `Daniel` Admin entry is a **UI-only demo gate**; the credentials and browser session can be bypassed. It is not authorization. Admin uploads, catalog changes, student contact reads, and private results require authenticated server-side operations and restrictive database policies; the included browser UI must not be granted broad access to these tables.

Student authentication verifies the name and registration against the published result index, requires explicit marketing consent and a valid Nigerian WhatsApp number, and saves the opt-in before opening the student workspace. The academic level is inferred from the registration year. The browser uses the public Supabase anon key; never expose the service-role key to the site. Client-side sessions and compiled result records are not private authentication or data protection.

## Run locally

Node.js 18 or later is required. The site can be built without credentials. Live Dr. Eco responses require the `GEMINI_API_KEY` server-side environment variable; course-note retrieval and material indexing also require Supabase configuration and database policies.

```sh
npm run dev
```

Open <http://127.0.0.1:4173>. The development script builds the site first, so the results lookup works in the local preview.

Students with an A or B in one or more courses see a celebration card after looking up their results. They can preview each qualifying course and export a 1080 × 1920 PNG for social status or stories; the image is generated in the browser without an additional dependency.

### Configure Dr. Eco

Dr. Eco sends Gemini 3.5 Flash Lite requests through the same-origin `/api/dr-eco` serverless function, which applies a 30-second upstream timeout. Set `GEMINI_API_KEY` in Vercel Project Settings → Environment Variables for each deployment environment, then redeploy. Never put the Gemini key in frontend files or commit it. The local preview server routes `/api/dr-eco` through the same handler; set `GEMINI_API_KEY` in the environment before running `npm run dev` or `npm run preview`.

The Supabase anon key is a public browser key. Supabase must provide a `course_materials` table with `level`, `course_code`, `title`, and `content` columns, plus a `match_course_materials` RPC accepting `match_course`, `match_level`, and `match_count` and returning material `content`. Practice quizzes and mock exams require matching indexed materials; they fail with a visible error if none are available.

The chat formats assistant Markdown bold and line breaks without inserting model text as HTML. Dr. Eco uses a warm, conversational tutoring prompt grounded in retrieved course notes. Voice Call uses the browser's Web Speech APIs for microphone transcription and speech synthesis; interim speech recognition can interrupt spoken replies, but browser support, microphone permission, audio echo cancellation, and available voices vary. The Admin AI Indexer accepts TXT, selectable-text PDF, DOCX, and image uploads. PDF, DOCX, and image text extraction runs in the browser using parser libraries loaded on demand from pinned public CDNs; image text uses English OCR. Review extracted text before indexing. Scanned PDFs without selectable text are not OCR-processed.

Run `supabase/leaderboard.sql` in the Supabase SQL editor to create the XP leaderboard table. It stores an anonymous alias and browser-local XP under a random browser ID; XP is not verified student-wide progress, and users can modify it because this static browser app has no trusted student identity or server-side write boundary. The SQL grants public read/insert/update access for this demo leaderboard only. Do not use these rankings for rewards or other consequential decisions.

`supabase/admin_dashboard.sql` defines the Admin Portal's `course_catalog` and `student_results` tables with RLS enabled and browser access revoked. This is intentionally not a working authorization setup: do not loosen those policies to make the UI-only demo credentials work. Implement authenticated server-side Admin endpoints (or Supabase Auth with verified Admin roles and narrow policies) before enabling uploads, catalog writes, private result lookup, or student-contact reads. Student contact reads must remain private. The material indexer extracts text from TXT, selectable-text PDF, DOCX, and images in the browser before sending reviewed text to Supabase. The broadsheet uploader accepts CSV/XLSX files with registration number, full name, course code/title, CA, exam, total, grade, remark, and level columns; score fields are checked against the schema limits before submission. Catalog entries use levels 100L–400L, a course code/title, and 1–12 credit units. Configure Gemini API quotas and Vercel abuse protection for the public proxy endpoint.

### WhatsApp reminder worker

Run `worker/schema.sql` in the Supabase SQL editor to add reminder, activity, avatar and referral fields, migrate existing consented numbers, enforce one row per phone, and set the anon upsert policies. Profile photos are resized and stored as small base64 data URLs in the opted-in profile row. The referral counter increments on link copy/share actions and is not proof of a referral or sign-up; its fuel and 48-hour pass are client-side demo rewards, not entitlements. If the migration finds duplicate phone numbers, merge those records before rerunning it. Keep RLS enabled and do not grant public SELECT access. The browser policy permits opted-in upserts; because browser requests cannot prove phone ownership, use a verified WhatsApp opt-in/confirmation flow before sending real reminders.

Deploy the repository as a Render Web Service with start command `npm start`; the root entrypoint starts a lightweight HTTP health-check server on Render's `PORT` (default 10000). Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `FOLDBOOK_URL` in Render's environment; the service-role key must never be used in the site or committed. To authenticate using an 8-digit WhatsApp pairing code, set `BOT_PHONE_NUMBER` to the linked account's number in international digits-only format, for example `2348012345678`. If it is unset, the worker displays a QR code instead. Pairing codes are sensitive: retrieve them only from private worker logs and never publish those logs. Attach a persistent disk and set `WHATSAPP_AUTH_DIRECTORY` to a path on that disk so Baileys login credentials survive restarts. The worker sends at 8:00 AM Africa/Lagos time, skips recipients nudged in the last 20 hours, waits between sends, and supports `STOP`/`UNSUBSCRIBE` and `START` replies.

Baileys is an unofficial WhatsApp Web client and may violate WhatsApp terms or lead to account restrictions; for a production messaging service, prefer the official WhatsApp Business Platform/Cloud API.

## Build and preview a deployment

```sh
npm run build
npm test
npm run preview
```

The build writes a static site to `dist/`. It copies `index.html`, every regular file in `assets/brand/`, `assets/lottie/`, and `assets/sfx/`, the styles and scripts, `data/announcements.csv`, and `data/timetable.csv`. It compiles and validates the student and result records into the generated JavaScript bundle without copying `data/students.csv` or `data/results.csv` into `dist/`. The public landing lookup asks for a registration number and name and renders the matching student's statement. The Launch CTA opens the authentication gateway; authenticated students enter the student workspace, while the Admin demo credentials open the separate Admin Portal. Result cards use the local black poster logo, white navigation and modal logo, and grade-specific trophy or target image; use the browser's print dialog to print or save a card. Tests verify the result output, stage/auth flow, Gemini proxy, timetable, announcements, and absence of raw CSV files from the production preview.

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
