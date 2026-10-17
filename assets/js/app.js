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
const celebrationModal = document.querySelector("#celebration-modal");
const celebrationClose = document.querySelector("#celebration-close");
const celebrationTitle = document.querySelector("#celebration-title");
const celebrationCourseCount = document.querySelector("#celebration-course-count");
const celebrationCourseNav = document.querySelector("#celebration-course-nav");
const celebrationCoursePosition = document.querySelector("#celebration-course-position");
const celebrationPrevious = document.querySelector("#celebration-previous");
const celebrationNext = document.querySelector("#celebration-next");
const celebrationExport = document.querySelector("#celebration-export");
const celebrationExportStatus = document.querySelector("#celebration-export-status");
const cardStudentName = document.querySelector("#card-student-name");
const cardRegistration = document.querySelector("#card-registration");
const cardGrade = document.querySelector("#card-grade");
const cardCourse = document.querySelector("#card-course");
const cardCourseTitle = document.querySelector("#card-course-title");
const cardScore = document.querySelector("#card-score");
const cardRemark = document.querySelector("#card-remark");
let celebrationRegistration = "";
let celebrationStudent = null;
let celebrationResults = [];
let celebrationIndex = 0;

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

function renderCelebrationCard() {
  const result = celebrationResults[celebrationIndex];
  cardStudentName.textContent = celebrationStudent.name;
  cardRegistration.textContent = celebrationRegistration;
  cardGrade.textContent = result.grade;
  cardCourse.textContent = result.course;
  cardCourseTitle.textContent = result.course_title;
  cardScore.textContent = String(result.total);
  cardRemark.textContent = result.remark;
  celebrationCoursePosition.textContent = `${celebrationIndex + 1} OF ${celebrationResults.length} COURSES`;
  celebrationExportStatus.textContent = "";
}

function showCelebration(registration, student) {
  celebrationRegistration = registration;
  celebrationStudent = student;
  celebrationResults = student.results.filter((result) => result.grade === "A" || result.grade === "B");
  celebrationIndex = 0;
  celebrationTitle.textContent = "Your hard work deserves a moment.";
  celebrationCourseCount.textContent = celebrationResults.length > 1
    ? `${celebrationResults.length} courses earned an A or B. Celebrate each one.`
    : "";
  celebrationCourseNav.hidden = celebrationResults.length < 2;
  renderCelebrationCard();
  if (!celebrationModal.open) celebrationModal.showModal();
}

function closeCelebration() {
  if (celebrationModal.open) celebrationModal.close();
  celebrationStudent = null;
  celebrationResults = [];
  celebrationRegistration = "";
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  const visibleLines = lines.slice(0, maxLines);
  if (lines.length > maxLines && visibleLines.length > 0) {
    let lastLine = `${visibleLines[maxLines - 1]}…`;
    while (context.measureText(lastLine).width > maxWidth && lastLine.length > 1) {
      lastLine = `${lastLine.slice(0, -2)}…`;
    }
    visibleLines[maxLines - 1] = lastLine;
  }
  visibleLines.forEach((textLine, index) => context.fillText(textLine, x, y + index * lineHeight));
  return visibleLines.length;
}

function drawCelebrationCanvas(context, result) {
  context.fillStyle = "#F9F9FB";
  context.fillRect(0, 0, 360, 640);
  context.fillStyle = "#FFFFFF";
  roundedRect(context, 13, 13, 334, 614, 14);
  context.fill();

  context.save();
  roundedRect(context, 13, 13, 334, 614, 14);
  context.clip();
  context.strokeStyle = "rgba(122, 40, 255, 0.035)";
  context.lineWidth = 1;
  for (let position = -640; position < 720; position += 78) {
    context.beginPath();
    context.moveTo(position, 13);
    context.lineTo(position + 614, 627);
    context.stroke();
  }
  context.restore();

  context.strokeStyle = "#7A28FF";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(30, 35);
  context.lineTo(58, 35);
  context.lineTo(43, 62);
  context.lineTo(38, 53);
  context.lineTo(44, 53);
  context.lineTo(49, 42);
  context.lineTo(35, 42);
  context.closePath();
  context.stroke();
  context.font = "800 11px Arial, sans-serif";
  context.fillStyle = "#111111";
  context.fillText("SEV7NFOLD", 66, 43);
  context.font = "8px Arial, sans-serif";
  context.fillStyle = "#6B7280";
  context.fillText("Make More", 66, 57);

  context.textAlign = "right";
  context.font = "700 5.5px Arial, sans-serif";
  context.fillStyle = "#2D2D2D";
  context.fillText("IDEAS / BRANDS / DIGITAL SOLUTIONS", 330, 37);
  context.fillStyle = "#6B7280";
  context.fillText("DEPARTMENT OF ECONOMICS | UNIUYO", 330, 49);
  context.textAlign = "left";

  context.fillStyle = "#7A28FF";
  roundedRect(context, 30, 157, 127, 20, 10);
  context.fill();
  context.font = "700 8px Arial, sans-serif";
  context.fillStyle = "#FFFFFF";
  context.fillText("ACADEMIC EXCELLENCE", 39, 170);
  context.font = "800 10px Arial, sans-serif";
  context.fillStyle = "#7A28FF";
  context.fillText("CONGRATULATIONS!", 30, 202);
  context.font = "800 22px Arial, sans-serif";
  context.fillStyle = "#111111";
  drawWrappedText(context, celebrationStudent.name.toLocaleUpperCase(), 30, 233, 300, 25, 2);
  context.font = "9px Arial, sans-serif";
  context.fillStyle = "#6B7280";
  context.fillText(celebrationRegistration, 30, 291);

  context.save();
  context.shadowColor = "rgba(122, 40, 255, 0.14)";
  context.shadowBlur = 17;
  context.fillStyle = "#FFFFFF";
  roundedRect(context, 30, 325, 300, 133, 8);
  context.fill();
  context.restore();
  context.fillStyle = "#7A28FF";
  context.fillRect(30, 325, 4, 133);
  context.font = "700 7px Arial, sans-serif";
  context.fillStyle = "#6B7280";
  context.fillText("GRADE", 55, 367);
  context.font = "900 57px Arial, sans-serif";
  context.fillStyle = "#7A28FF";
  context.fillText(result.grade, 50, 422);

  context.font = "800 11px Arial, sans-serif";
  context.fillStyle = "#111111";
  context.fillText(result.course, 112, 354);
  context.font = "9px Arial, sans-serif";
  context.fillStyle = "#2D2D2D";
  drawWrappedText(context, result.course_title, 112, 373, 199, 12, 2);
  context.font = "8px Arial, sans-serif";
  context.fillStyle = "#6B7280";
  context.fillText(`Score: ${result.total} / 100`, 112, 408);
  context.fillStyle = "#2D2D2D";
  context.fillText(`Remark: ${result.remark}`, 112, 425);

  context.fillStyle = "#7A28FF";
  context.fillRect(30, 508, 40, 3);
  context.font = "800 9px Arial, sans-serif";
  context.fillStyle = "#111111";
  context.fillText("BUILD STRONGER BRANDS. CREATE REAL VALUE.", 30, 531);
  context.font = "700 8px Arial, sans-serif";
  context.fillStyle = "#2D2D2D";
  context.fillText("STRATEGY  •  DESIGN  •  TECHNOLOGY", 30, 553);
  context.font = "700 6px Arial, sans-serif";
  context.fillStyle = "#6B7280";
  context.fillText("POWERED BY SEVENFOLD CREATIVE TECH AGENCY", 30, 584);
  context.font = "600 8px Arial, sans-serif";
  context.fillStyle = "#7A28FF";
  context.fillText("www.sevenfold.agency", 30, 603);
}

function safeFilenamePart(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

function downloadCelebrationCard() {
  const student = celebrationStudent;
  const result = celebrationResults[celebrationIndex];
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) {
    celebrationExportStatus.textContent = "Your browser could not prepare the image. Please try another browser.";
    return;
  }
  context.scale(3, 3);
  drawCelebrationCanvas(context, result);

  canvas.toBlob((blob) => {
    if (!blob) {
      celebrationExportStatus.textContent = "The PNG could not be generated. Please try again.";
      return;
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${safeFilenamePart(student.name)}_${safeFilenamePart(result.course)}_SevenFold_Grade.png`;
    link.click();
    const imageUrl = link.href;
    setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
    celebrationExportStatus.textContent = "Your 1080 × 1920 PNG is ready to share.";
  }, "image/png");
}

function renderResults(registration, student) {
  resultName.textContent = student.name;
  resultRegistration.textContent = registration;
  resultsTable.replaceChildren();

  const passedCourses = student.results.filter((result) => result.total >= 40).length;
  resultSummary.textContent = `${student.results.length} course${student.results.length === 1 ? "" : "s"} · ${passedCourses} passed`;

  for (const row of student.results) {
    const tableRow = document.createElement("tr");
    const courseCell = document.createElement("td");
    const courseCode = document.createElement("strong");
    const courseTitle = document.createElement("span");
    const caScoreCell = document.createElement("td");
    const examScoreCell = document.createElement("td");
    const scoreCell = document.createElement("td");
    const gradeCell = document.createElement("td");
    const remarkCell = document.createElement("td");

    courseCode.textContent = row.course;
    courseTitle.textContent = row.course_title;
    caScoreCell.textContent = row.ca === null ? "—" : String(row.ca);
    examScoreCell.textContent = row.exam === null ? "—" : String(row.exam);
    scoreCell.textContent = String(row.total);
    gradeCell.textContent = row.grade;
    gradeCell.className = `grade grade-${row.grade.toLowerCase()}`;
    remarkCell.textContent = row.remark;
    remarkCell.className = row.remark === "PASS" ? "grade-pass" : "grade-fail";
    courseCell.append(courseCode, courseTitle);
    tableRow.append(courseCell, caScoreCell, examScoreCell, scoreCell, gradeCell, remarkCell);
    resultsTable.append(tableRow);
  }

  resultsEmpty.hidden = student.results.length > 0;
  resultsTable.hidden = student.results.length === 0;
  resultsPanel.hidden = false;
  resultsStatus.textContent = student.results.length === 0
    ? "Your registration number was found, but there are no published results yet."
    : "";
  if (student.results.some((result) => result.grade === "A" || result.grade === "B")) {
    showCelebration(registration, student);
  } else {
    closeCelebration();
  }
}

celebrationClose.addEventListener("click", closeCelebration);
celebrationPrevious.addEventListener("click", () => {
  celebrationIndex = (celebrationIndex - 1 + celebrationResults.length) % celebrationResults.length;
  renderCelebrationCard();
});
celebrationNext.addEventListener("click", () => {
  celebrationIndex = (celebrationIndex + 1) % celebrationResults.length;
  renderCelebrationCard();
});
celebrationExport.addEventListener("click", downloadCelebrationCard);

resultsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  closeCelebration();
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
