# Fold Book

The **SEV7N FOLD** student hub: a responsive, dark-mode site for Economics 100L at the University of Uyo.

The site includes a searchable Economics 100L results lookup, printable course result cards, weekly timetable, and department announcements. The result search accepts a full registration number or the student's three-digit class number.

**The results lookup is public.** At build time, `data/students.csv` and `data/results.csv` are compiled into the generated `dist/assets/js/app.js`; they aren't copied into `dist/` as raw CSVs. Anyone can download that JavaScript and read the published names, registration numbers, and scores. The registration/name check only filters the on-screen result; it is not authentication and does not make other records private. Do not deploy this client-side build if student results must be confidential; that requires a protected backend.

The app has four views: a public landing/results lookup, a student authentication screen, a student workspace, and a standalone Admin Portal. Open `/#admin` to reach the admin passcode form. Admin access is verified by `/api/admin/session`, which issues an HttpOnly, SameSite session cookie signed by the server. The passcode and signing secret are not included in frontend code or browser storage. The legacy `101010` entry point also requires the server passcode; the number alone does not grant access.

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

The chat formats assistant Markdown bold and line breaks without inserting model text as HTML. Dr. Eco uses a warm, conversational tutoring prompt grounded in retrieved course notes. Voice Call streams microphone PCM to Gemini Live over a WebSocket, plays returned audio chunks, supports microphone mute, speaker mute, and server-reported barge-in, and updates the Dr. Eco Lottie state. Browsers need microphone permission, Web Audio, and WebSocket support. Its single-use, short-lived token is provisioned by `/api/gemini/live-token`; the Gemini API key stays server-side. The default model is `gemini-2.5-flash-native-audio-preview-12-2025`; override it with `GEMINI_LIVE_MODEL` if the model available to your Gemini project changes.

The Admin AI Indexer accepts TXT, selectable-text PDF, DOCX, and PNG/JPG/WEBP image uploads. PDF, DOCX, and image text extraction runs in the browser using parser libraries loaded on demand from pinned public CDNs; image text uses English OCR. Review extracted text before indexing. Scanned PDFs without selectable text are not OCR-processed. Index writes go to `/api/admin/course-materials`, which requires the signed admin session, validates academic level/course/title/content, and uses the server-only Supabase service-role key. Configure `FOLDBOOK_ADMIN_PASSCODE`, `FOLDBOOK_ADMIN_SESSION_SECRET` (at least 32 characters), `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in Vercel. Set the passcode value there; never commit it or expose the service-role key. For local preview, export the same variables before `npm run dev`.

Run `supabase/leaderboard.sql` in the Supabase SQL editor to create the XP leaderboard table. It stores an anonymous alias and browser-local XP under a random browser ID; XP is not verified student-wide progress, and users can modify it because this static browser app has no trusted student identity or server-side write boundary. The SQL grants public read/insert/update access for this demo leaderboard only. Do not use these rankings for rewards or other consequential decisions.

`supabase/admin_dashboard.sql` defines the Admin Portal's `course_catalog` and `student_results` tables with RLS enabled and browser access revoked. The AI material indexer uses the authenticated server endpoint described above. Do not loosen database policies to make browser-only admin UI state authoritative. Broadsheet imports, catalog writes, private result operations, and student-contact reads still have no authenticated server-side endpoints and remain unavailable with the included restrictive policies; student contact reads must remain private. Configure Gemini API quotas and Vercel abuse protection for the public proxy endpoints.

### WhatsApp reminder worker

Run `worker/schema.sql`, `supabase/whatsapp_bot_settings.sql`, and `supabase/whatsapp_bot_test_queue.sql` in Supabase. The worker migration adds reminder, activity, avatar and referral fields, migrates existing consented numbers, enforces one row per phone, and sets the anon upsert policies. The settings migration creates the admin-managed schedule and worker status; the test queue migration allows the authenticated admin API to queue a single test for a number that has opted in. Both scheduled reminders and test sends include a rotating FoldBook illustration (target or trophy) with the personalized message and app link. Profile photos are resized and stored as small base64 data URLs in the opted-in profile row. The referral counter increments on link copy/share actions and is not proof of a referral or sign-up; its fuel and 48-hour pass are client-side demo rewards, not entitlements. If the migration finds duplicate phone numbers, merge those records before rerunning it. Keep RLS enabled and do not grant public SELECT access. The browser policy permits opted-in upserts; because browser requests cannot prove phone ownership, use a verified WhatsApp opt-in/confirmation flow before sending real reminders.

Deploy the repository as a Render Web Service with start command `npm start`; the root entrypoint starts a lightweight HTTP health-check server on Render's `PORT` (default 10000) and the WhatsApp worker. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `FOLDBOOK_URL` in Render's environment; the service-role key must never be used in the site or committed. To authenticate using an 8-digit WhatsApp pairing code, set `BOT_PHONE_NUMBER` to the linked account's number in international digits-only format, for example `2348012345678`. If it is unset, the worker displays a QR code instead. Pairing codes are sensitive: retrieve them only from private worker logs and never publish those logs. Attach a persistent disk and set `WHATSAPP_AUTH_DIRECTORY` to a path on that disk so Baileys login credentials survive restarts. The worker checks the admin-managed morning and evening schedule in Africa/Lagos time, skips recipients nudged within the configured interval, waits between sends, polls the private test queue every 15 seconds, and supports `STOP`/`UNSUBSCRIBE` and `START` replies. In Admin → WhatsApp Bot, Preview reminder only displays a sample. Send test reminder sends one real message to an entered, opted-in Nigerian number.

Baileys is an unofficial WhatsApp Web client and may violate WhatsApp terms or lead to account restrictions; for a production messaging service, prefer the official WhatsApp Business Platform/Cloud API.

## Build and preview a deployment

```sh
npm run build
npm test
npm run preview
```

The build writes a static site to `dist/`. It copies `index.html`, every regular file in `assets/brand/`, `assets/lottie/`, and `assets/sfx/`, the styles and scripts, `data/announcements.csv`, and `data/timetable.csv`. It compiles and validates the student and result records into the generated JavaScript bundle without copying `data/students.csv` or `data/results.csv` into `dist/`. The public landing lookup asks for a registration number and name and renders the matching student's statement. The Launch CTA opens the authentication gateway; authenticated students enter the student workspace, while the Admin demo credentials open the separate Admin Portal. Result cards use the local black poster logo, white navigation and modal logo, and grade-specific trophy or target image; use the browser's print dialog to print or save a card. Tests verify the result output, stage/auth flow, Gemini proxy, timetable, announcements, and absence of raw CSV files from the production preview.

## Deploy to Vercel

Import this repository in Vercel and deploy. Vercel automatically detects Node.js functions under the root `api/` directory; [vercel.json](./vercel.json) keeps that detection enabled while building the static site into `dist/` and adding content-type, referrer, permissions, and content-security-policy headers. The CSP permits the configured Supabase API/realtime host, Gemini Live WebSockets, the required parser CDNs, and local/blob audio and PDF workers. Do not add a catch-all rewrite to `index.html`: it can mask missing API routes and serve HTML in place of static assets. The Live token endpoint accepts a same-origin `POST` with the course and bounded notes context. Configure `GEMINI_API_KEY` for Vercel Production, Preview, and Development as needed, then redeploy; missing credentials return a JSON `503` response.

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
