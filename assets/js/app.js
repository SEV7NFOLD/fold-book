"use strict";

const RESULT_LOOKUP = null;

function parseCsv(text) {
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

  if (quoted) throw new Error("CSV contains an unfinished quoted field.");
  record.push(field);
  if (record.some((value) => value.length > 0)) records.push(record);
  if (records.length === 0) throw new Error("CSV contains no data.");

  const headers = records[0];
  if (new Set(headers).size !== headers.length) throw new Error("CSV contains duplicate columns.");

  return records.slice(1).map((values) => {
    if (values.length !== headers.length) throw new Error("CSV contains a row with the wrong number of columns.");
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

async function loadCsv(url, requiredHeaders) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load data (${response.status}).`);

  const rows = parseCsv(await response.text());
  if (rows.length === 0 || requiredHeaders.some((header) => !(header in rows[0]))) {
    throw new Error("The published data is missing a required column.");
  }

  return rows;
}

const scheduleList = document.querySelector("#timetable-list");
const scheduleStatus = document.querySelector("#timetable-status");
const announcementList = document.querySelector("#announcements-list");
const announcementStatus = document.querySelector("#announcements-status");
const resultsForm = document.querySelector("#results-form");
const registrationInput = document.querySelector("#registration-number");
const resultsStatus = document.querySelector("#results-status");
const resultsPanel = document.querySelector("#results-panel");
const resultName = document.querySelector("#result-name");
const resultRegistration = document.querySelector("#result-registration");
const resultSummary = document.querySelector("#result-summary");
const resultsTable = document.querySelector("#results-table");
const resultsEmpty = document.querySelector("#results-empty");

function normalizeRegistration(value) {
  const registration = value.trim().toUpperCase().replace(/\s+/g, "");
  if (/^\d{1,3}$/.test(registration)) {
    return `25/SS/EC/${registration.padStart(3, "0")}`;
  }

  const currentRegistration = registration.match(/^25\/SS\/EC\/(\d{1,3})$/);
  if (currentRegistration) {
    return `25/SS/EC/${currentRegistration[1].padStart(3, "0")}`;
  }

  return /^\d{2}\/SS\/EC\/\d{1,4}$/.test(registration) ? registration : "";
}

function gradeForScore(score) {
  if (score >= 70) return "A";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  if (score >= 45) return "D";
  if (score >= 40) return "E";
  return "F";
}

function setResultsMessage(message) {
  resultsPanel.hidden = true;
  resultsStatus.textContent = message;
}

function renderResults(registration, student) {
  resultName.textContent = student.name;
  resultRegistration.textContent = registration;
  resultsTable.replaceChildren();

  const passedCourses = student.results.filter((result) => result.score >= 40).length;
  resultSummary.textContent = `${student.results.length} course${student.results.length === 1 ? "" : "s"} · ${passedCourses} passed`;

  for (const result of student.results) {
    const grade = gradeForScore(result.score);
    const row = document.createElement("tr");
    const courseCell = document.createElement("td");
    const courseCode = document.createElement("strong");
    const courseTitle = document.createElement("span");
    const scoreCell = document.createElement("td");
    const gradeCell = document.createElement("td");
    const remarkCell = document.createElement("td");

    courseCode.textContent = result.course;
    courseTitle.textContent = result.course_title;
    scoreCell.textContent = String(result.score);
    gradeCell.textContent = grade;
    gradeCell.className = `grade grade-${grade.toLowerCase()}`;
    remarkCell.textContent = result.score >= 40 ? "PASS" : "FAIL";
    remarkCell.className = result.score >= 40 ? "grade-pass" : "grade-fail";
    courseCell.append(courseCode, courseTitle);
    row.append(courseCell, scoreCell, gradeCell, remarkCell);
    resultsTable.append(row);
  }

  resultsEmpty.hidden = student.results.length > 0;
  resultsTable.hidden = student.results.length === 0;
  resultsPanel.hidden = false;
  resultsStatus.textContent = student.results.length === 0
    ? "Your registration number was found, but there are no published results yet."
    : "";
}

resultsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  resultsStatus.textContent = "";

  const registration = normalizeRegistration(registrationInput.value);
  if (!registration) {
    setResultsMessage("Enter a valid registration number, such as 25/SS/EC/001.");
    registrationInput.focus();
    return;
  }

  if (!RESULT_LOOKUP || !Object.hasOwn(RESULT_LOOKUP, registration)) {
    setResultsMessage("No student or results found for that registration number. Check it and try again.");
    registrationInput.focus();
    return;
  }

  renderResults(registration, RESULT_LOOKUP[registration]);
});

let timetable = [];
let selectedDay = "all";

function renderTimetable() {
  const visibleRows = timetable
    .filter((entry) => selectedDay === "all" || entry.day === selectedDay)
    .sort((first, second) => {
      const weekdayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri"];
      const dayDifference = weekdayOrder.indexOf(first.day) - weekdayOrder.indexOf(second.day);
      return dayDifference || first.time.localeCompare(second.time);
    });

  scheduleList.replaceChildren();
  scheduleStatus.textContent = "";

  if (visibleRows.length === 0) {
    scheduleStatus.textContent = "There are no timetable entries for this day.";
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const entry of visibleRows) {
    const row = document.createElement("article");
    row.className = "class-row";

    const day = document.createElement("span");
    day.className = "class-day";
    day.textContent = entry.day;

    const time = document.createElement("time");
    time.className = "class-time";
    time.textContent = entry.time;

    const course = document.createElement("span");
    course.className = "class-course";
    course.textContent = entry.course;

    const room = document.createElement("span");
    room.className = "class-room";
    room.textContent = entry.room;

    row.append(day, time, course, room);
    fragment.append(row);
  }
  scheduleList.append(fragment);
}

async function initializeTimetable() {
  try {
    timetable = await loadCsv("/data/timetable.csv", ["day", "time", "course", "room"]);
    renderTimetable();
  } catch (error) {
    scheduleStatus.textContent = `The timetable could not be loaded. ${error.message} Refresh the page or check back later.`;
  }
}

document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    selectedDay = button.dataset.day;
    document.querySelectorAll(".filter-button").forEach((filter) => {
      const isSelected = filter === button;
      filter.classList.toggle("is-selected", isSelected);
      filter.setAttribute("aria-pressed", String(isSelected));
    });

    if (timetable.length > 0) renderTimetable();
  });
});

function formatNoticeDate(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) throw new Error("An announcement has an invalid date.");
  const date = new Date(`${dateText}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateText) {
    throw new Error("An announcement has an invalid date.");
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

async function initializeAnnouncements() {
  try {
    const announcements = await loadCsv("/data/announcements.csv", ["when", "text"]);
    const fragment = document.createDocumentFragment();

    for (const announcement of announcements) {
      const row = document.createElement("article");
      row.className = "announcement-row";

      const date = document.createElement("time");
      date.className = "announcement-date";
      date.dateTime = announcement.when;
      date.textContent = formatNoticeDate(announcement.when);

      const text = document.createElement("p");
      text.className = "announcement-text";
      text.textContent = announcement.text;

      row.append(date, text);
      fragment.append(row);
    }

    if (announcements.length === 0) {
      announcementStatus.textContent = "There are no department updates to show right now.";
      return;
    }

    announcementList.replaceChildren(fragment);
    announcementStatus.textContent = "";
  } catch (error) {
    announcementStatus.textContent = `Department updates could not be loaded. ${error.message} Refresh the page or check back later.`;
  }
}

initializeTimetable();
initializeAnnouncements();
