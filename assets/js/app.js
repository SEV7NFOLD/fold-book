"use strict";

const RESULT_LOOKUP = null;

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

function setResultsMessage(message) {
  resultsPanel.hidden = true;
  resultsStatus.textContent = message;
}

function renderResults(registration, student) {
  resultName.textContent = student.name;
  resultRegistration.textContent = registration;
  resultsTable.replaceChildren();

  const passedCourses = student.results.filter((result) => result.total >= 40).length;
  resultSummary.textContent = `${student.results.length} course${student.results.length === 1 ? "" : "s"} · ${passedCourses} passed`;

  for (const result of student.results) {
    const row = document.createElement("tr");
    const courseCell = document.createElement("td");
    const courseCode = document.createElement("strong");
    const courseTitle = document.createElement("span");
    const caScoreCell = document.createElement("td");
    const examScoreCell = document.createElement("td");
    const scoreCell = document.createElement("td");
    const gradeCell = document.createElement("td");
    const remarkCell = document.createElement("td");

    courseCode.textContent = result.course;
    courseTitle.textContent = result.course_title;
    caScoreCell.textContent = result.ca === null ? "—" : String(result.ca);
    examScoreCell.textContent = result.exam === null ? "—" : String(result.exam);
    scoreCell.textContent = String(result.total);
    gradeCell.textContent = result.grade;
    gradeCell.className = `grade grade-${result.grade.toLowerCase()}`;
    remarkCell.textContent = result.remark;
    remarkCell.className = result.remark === "PASS" ? "grade-pass" : "grade-fail";
    courseCell.append(courseCode, courseTitle);
    row.append(courseCell, caScoreCell, examScoreCell, scoreCell, gradeCell, remarkCell);
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
