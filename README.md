# Fold Book

The **SEV7N FOLD** student hub: a responsive, dark-mode site for Economics 100L at the University of Uyo.

The site includes a searchable Economics 100L results lookup, weekly timetable, and department announcements. The result search accepts a full registration number or the student's three-digit class number.

**The results lookup is public.** At build time, `data/students.csv` and `data/results.csv` are compiled into the generated `dist/assets/js/app.js`; they aren't copied into `dist/` as raw CSVs. Anyone can download that JavaScript and read the published names, registration numbers, and scores. Deploy this build only for an authorized public release of the results. Client-side lookup does not authenticate a student or make individual results confidential.

## Run locally

Node.js 18 or later is required. No third-party application dependencies or account credentials are needed.

```sh
npm run dev
```

Open <http://127.0.0.1:4173>. The development script builds the site first, so the results lookup works in the local preview.

## Build and preview a deployment

```sh
npm run build
npm test
npm run preview
```

The build writes a static site to `dist/`. It copies only `index.html`, the branded logo and styles and scripts, `data/announcements.csv`, and `data/timetable.csv`. It compiles and validates the student and result records into the generated JavaScript bundle without copying `data/students.csv` or `data/results.csv` into `dist/`. Tests verify the searchable result output, timetable, announcements, and absence of raw CSV files from the production preview.

## Deploy to Vercel

Import this repository in Vercel and deploy. [vercel.json](./vercel.json) configures `npm run build`, publishes `dist/`, and adds content-type, referrer, permissions, and content-security-policy headers. Vercel will use the `build` script in `package.json`; no Vercel secrets, environment variables, database, or application framework are required.

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
