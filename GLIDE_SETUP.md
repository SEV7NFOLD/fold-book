# Glide setup — Fold Book

This document explains how to create a Glide app for Fold Book using the CSV data included in this repository (data/*.csv).

Overview
- The repo includes a Node script (scripts/generate_data.js) that will produce CSV files in the data/ folder. You can run this locally and then upload the CSVs to Google Sheets or directly import them into Glide.

Steps
1. Generate the CSV files locally (optional)
   - Clone the repository locally and run:
     ```bash
     npm install
     node scripts/generate_data.js
     ```
   - This writes data/students.csv, data/results.csv, data/announcements.csv and data/timetable.csv.

2. Create a Google Sheet (recommended) or import CSVs directly into Glide
   - Open Google Sheets and create a new spreadsheet named "Fold Book Data".
   - Use File → Import → Upload and import each CSV as a new sheet/tab (students, results, announcements, timetable).

3. Create a new Glide app
   - Visit https://www.glideapps.com and sign in.
   - Click "New App" → "From Google Sheets" and choose the spreadsheet you created.

4. Data relationships in Glide
   - Students sheet: has columns `reg` and `name`.
   - Results sheet: has `reg`, `course`, `course_title`, `score`.
   - In Glide Data editor, add a Relation column on Students named `results` that links Students.reg → Results.reg and returns multiple rows. This lets you show a student's results on their detail screen.

5. App UI (suggested)
   - Home screen: add a Search component (search by `reg`) and a list of students.
   - Student detail screen: show name & reg, and add an Inline List using the `results` relation to display course, score and grade (you can compute grade using a Math column or show letter grades using an If/Then column).
   - Announcements: create a Tab that shows the Announcements sheet as a list.
   - Timetable: create a Tab that shows the Timetable sheet as a calendar/list.

6. Privacy & sign-in
   - If this app will contain sensitive/student data, set Privacy to "Sign in (Email)" and require sign-in. Configure allowed domains if you want to limit access to your university domain.
   - Glide supports user profiles; you can map signed-in users to student reg numbers for personalized views.

7. Sharing
   - Publish the app and use the Share → Link to copy a short URL. Share the URL via WhatsApp/Telegram.
   - You may also publish as a Progressive Web App — Glide provides an install prompt for mobile users.

Security note
- The repository contains example data only. For a production deployment with real student results, DO NOT keep raw student data in a public GitHub repository — move data to a protected Google Sheet (with restricted sharing) or a secure backend and enforce authentication.

Need help?
- I can prepare a Google Sheet for you and (optionally) import the CSVs if you provide a Google account email that can be used for an editor (I cannot access your Google account directly). Alternatively, I can export the CSVs here for you to upload to Google Sheets.
