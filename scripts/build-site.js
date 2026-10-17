"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const output = path.join(root, "dist");
const allowedFiles = [
  "index.html",
  "assets/brand/mark.svg",
  "assets/css/styles.css",
  "assets/js/app.js",
];

function parseCsv(text, fileName) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === '"') {
      throw new Error(`${fileName} contains a misplaced quote.`);
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      record.push(field);
      field = "";
      if (record.some((value) => value.length > 0)) records.push(record);
      record = [];
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error(`${fileName} contains an unfinished quoted field.`);
  record.push(field);
  if (record.some((value) => value.length > 0)) records.push(record);
  if (records.length === 0) throw new Error(`${fileName} contains no data.`);

  const headers = records[0].map((header, index) => index === 0 ? header.replace(/^\uFEFF/, "") : header);
  if (headers.some((header) => header.length === 0)) throw new Error(`${fileName} contains an empty column name.`);
  if (new Set(headers).size !== headers.length) throw new Error(`${fileName} contains duplicate columns.`);

  return records.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(`${fileName} row ${index + 2} has the wrong number of columns.`);
    }
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });
}

function normalizeRegistration(registration) {
  const normalized = registration.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^\d{2}\/SS\/EC\/\d{1,4}$/.test(normalized)) {
    throw new Error(`Invalid registration number in student results: ${registration}`);
  }
  return normalized;
}

function gradeForScore(score) {
  if (score >= 70) return "A";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  if (score >= 45) return "D";
  if (score >= 40) return "E";
  return "F";
}

function parseAssessmentScore(value, registration, course, assessment) {
  if (value.trim() === "") return null;
  const score = Number(value);
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error(`A result has an invalid ${assessment} score for ${registration} (${course}).`);
  }
  return score;
}

function createResultsLookup() {
  const studentsPath = path.join(root, "data", "students.csv");
  const resultsPath = path.join(root, "data", "results.csv");
  for (const file of [studentsPath, resultsPath]) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw new Error(`Required results source is missing: ${path.relative(root, file)}`);
    }
  }

  const students = parseCsv(fs.readFileSync(studentsPath, "utf8"), "data/students.csv");
  const results = parseCsv(fs.readFileSync(resultsPath, "utf8"), "data/results.csv");
  const requiredStudentColumns = ["reg", "name"];
  const requiredResultColumns = ["reg", "name", "course", "course_title", "ca", "exam", "total"];
  if (students.length === 0 || requiredStudentColumns.some((column) => !(column in students[0]))) {
    throw new Error("data/students.csv is missing required columns or student records.");
  }
  if (results.length === 0 || requiredResultColumns.some((column) => !(column in results[0]))) {
    throw new Error("data/results.csv is missing required columns or result records.");
  }

  const lookup = Object.create(null);
  for (const student of students) {
    const registration = normalizeRegistration(student.reg);
    if (!student.name.trim()) throw new Error(`Student ${registration} has no name.`);
    if (Object.hasOwn(lookup, registration)) {
      throw new Error(`Student registration number is duplicated: ${registration}`);
    }
    lookup[registration] = { name: student.name, results: [] };
  }

  const seenResults = new Set();
  for (const result of results) {
    const registration = normalizeRegistration(result.reg);
    const student = lookup[registration];
    if (!student) throw new Error(`A result references an unknown student: ${registration}`);
    if (student.name !== result.name) {
      throw new Error(`Student name does not match for registration number ${registration}.`);
    }
    if (!result.course.trim() || !result.course_title.trim()) {
      throw new Error(`A result is missing its course details for ${registration}.`);
    }
    const ca = parseAssessmentScore(result.ca, registration, result.course, "CA");
    const exam = parseAssessmentScore(result.exam, registration, result.course, "Exam");
    const total = Number(result.total);
    if (!Number.isInteger(total) || total < 0 || total > 100) {
      throw new Error(`A result has an invalid total score for ${registration} (${result.course}).`);
    }

    const resultKey = `${registration}\u0000${result.course}`;
    if (seenResults.has(resultKey)) {
      throw new Error(`A duplicate course result was found for ${registration} (${result.course}).`);
    }
    seenResults.add(resultKey);
    student.results.push({
      course: result.course,
      course_title: result.course_title,
      ca,
      exam,
      total,
      grade: gradeForScore(total),
      remark: total >= 40 ? "PASS" : "FAIL",
    });
  }

  for (const student of Object.values(lookup)) {
    student.results.sort((first, second) => first.course.localeCompare(second.course));
  }

  return lookup;
}

function serializeForJavaScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function writePublicSite() {
  for (const relativePath of allowedFiles) {
    const source = path.join(root, relativePath);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
      throw new Error(`Required public site file is missing: ${relativePath}`);
    }
  }

  const sourceApp = fs.readFileSync(path.join(root, "assets/js/app.js"), "utf8");
  const lookupMarker = "const RESULT_LOOKUP = null;";
  if (sourceApp.split(lookupMarker).length !== 2) {
    throw new Error("assets/js/app.js must contain exactly one results lookup build marker.");
  }
  const resultLookup = createResultsLookup();

  if (fs.existsSync(output)) fs.rmSync(output, { recursive: true, force: true });

  for (const relativePath of allowedFiles) {
    const destination = path.join(output, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const content = relativePath === "assets/js/app.js"
      ? sourceApp.replace(lookupMarker, `const RESULT_LOOKUP = ${serializeForJavaScript(resultLookup)};`)
      : fs.readFileSync(path.join(root, relativePath));
    fs.writeFileSync(destination, content);
  }

  const builtFiles = [];
  function listFiles(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        listFiles(absolutePath);
      } else if (entry.isFile()) {
        builtFiles.push(path.relative(output, absolutePath).split(path.sep).join("/"));
      } else {
        throw new Error("The deployment output contains an unsupported file type.");
      }
    }
  }

  listFiles(output);
  const unexpectedFiles = builtFiles.filter((file) => !allowedFiles.includes(file));
  if (unexpectedFiles.length > 0) {
    throw new Error(`The deployment output contains files outside its public allowlist: ${unexpectedFiles.join(", ")}`);
  }

  for (const privateFile of ["data/students.csv", "data/results.csv"]) {
    if (fs.existsSync(path.join(output, privateFile))) {
      throw new Error(`Private student records must not be included in the deployment: ${privateFile}`);
    }
  }

  console.log(`Built ${builtFiles.length} allowlisted public files in dist/.`);
  console.log(`Compiled ${Object.keys(resultLookup).length} student records into assets/js/app.js.`);
  console.log("Raw student and results CSVs are excluded from the deployment.");
}

try {
  writePublicSite();
} catch (error) {
  console.error(`Production build failed: ${error.message}`);
  process.exitCode = 1;
}
