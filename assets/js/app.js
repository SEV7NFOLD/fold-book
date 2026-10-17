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
const cardStudentName = document.querySelector("#cardStudentName");
const cardRegistration = document.querySelector("#cardRegNo");
const cardGrade = document.querySelector("#cardGrade");
const cardCourse = document.querySelector("#cardCourse");
const cardCourseTitle = document.querySelector("#cardCourseTitle");
const cardScore = document.querySelector("#cardScore");
const cardRemark = document.querySelector("#cardRemark");
let celebrationRegistration = "";
let celebrationStudent = null;
let celebrationResults = [];
let celebrationIndex = 0;
let celebrationAudioContext = null;

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

function playCelebrationFanfare() {
  const AudioContextConstructor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextConstructor) return;

  try {
    celebrationAudioContext ??= new AudioContextConstructor();
    const audioContext = celebrationAudioContext;
    const startTime = audioContext.currentTime;
    const resume = audioContext.resume();
    if (resume && typeof resume.catch === "function") resume.catch(() => {});

    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      const start = startTime + index * 0.11;
      const oscillator = audioContext.createOscillator();
      const filter = audioContext.createBiquadFilter();
      const volume = audioContext.createGain();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1800, start);
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(frequency, start);
      volume.gain.setValueAtTime(0, start);
      volume.gain.linearRampToValueAtTime(0.065, start + 0.025);
      volume.gain.exponentialRampToValueAtTime(0.001, start + 0.29);
      oscillator.connect(filter);
      filter.connect(volume);
      volume.connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.3);
    });
  } catch {}
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
  if (!celebrationModal.open) {
    celebrationModal.showModal();
    playCelebrationFanfare();
  }
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
  context.fillStyle = "#F7F5F0";
  context.fillRect(0, 0, 360, 640);
  context.fillStyle = "rgba(122, 40, 255, 0.045)";
  context.beginPath();
  context.moveTo(278, 45);
  context.lineTo(380, 174);
  context.lineTo(291, 289);
  context.lineTo(208, 172);
  context.closePath();
  context.fill();
  context.fillStyle = "rgba(255, 255, 255, 0.68)";
  context.beginPath();
  context.moveTo(300, 108);
  context.lineTo(374, 200);
  context.lineTo(309, 282);
  context.lineTo(246, 197);
  context.closePath();
  context.fill();
  context.strokeStyle = "rgba(45, 45, 45, 0.1)";
  context.lineWidth = 1;
  context.stroke();

  context.strokeStyle = "#111111";
  context.lineWidth = 2.24;
  context.lineCap = "square";
  context.lineJoin = "miter";
  context.beginPath();
  context.moveTo(28.8, 42);
  context.lineTo(51.2, 42);
  context.lineTo(40, 64.4);
  context.closePath();
  context.stroke();
  context.beginPath();
  context.moveTo(34.24, 45.84);
  context.lineTo(45.76, 45.84);
  context.lineTo(40, 57.04);
  context.lineTo(36.16, 50);
  context.lineTo(43.84, 50);
  context.lineWidth = 1.92;
  context.stroke();
  context.beginPath();
  context.arc(40, 37.84, 1.44, 0, Math.PI * 2);
  context.fillStyle = "#111111";
  context.fill();
  context.beginPath();
  context.arc(40, 68.56, 1.44, 0, Math.PI * 2);
  context.fill();
  context.font = "900 12px Arial, sans-serif";
  context.fillText("SEVENFOLD", 64, 43);
  context.font = "500 9px Arial, sans-serif";
  context.fillStyle = "#555555";
  context.fillText("Make More", 64, 58);

  context.fillStyle = "#6A0DAD";
  roundedRect(context, 24, 166, 129, 20, 10);
  context.fill();
  context.font = "800 8px Arial, sans-serif";
  context.fillStyle = "#FFFFFF";
  context.fillText("ACADEMIC EXCELLENCE", 33, 179);
  context.font = "800 10px Arial, sans-serif";
  context.fillStyle = "#6A0DAD";
  context.fillText("CONGRATULATIONS!", 24, 209);
  context.font = "900 22px Arial, sans-serif";
  context.fillStyle = "#111111";
  drawWrappedText(context, celebrationStudent.name.toLocaleUpperCase(), 24, 238, 232, 25, 3);
  context.font = "600 10px Arial, sans-serif";
  context.fillStyle = "#666666";
  context.fillText(celebrationRegistration, 24, 317);

  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.06)";
  context.shadowBlur = 15;
  context.fillStyle = "rgba(255, 255, 255, 0.94)";
  roundedRect(context, 24, 340, 241, 100, 10);
  context.fill();
  context.restore();
  context.fillStyle = "#6A0DAD";
  roundedRect(context, 24, 340, 4, 100, 2);
  context.fill();
  context.font = "900 48px Arial, sans-serif";
  context.fillStyle = "#6A0DAD";
  context.fillText(result.grade, 39, 405);
  context.font = "800 13px Arial, sans-serif";
  context.fillStyle = "#111111";
  context.fillText(result.course, 94, 367);
  context.font = "500 9px Arial, sans-serif";
  context.fillStyle = "#444444";
  drawWrappedText(context, result.course_title, 94, 385, 158, 12, 2);
  context.font = "8px Arial, sans-serif";
  context.fillStyle = "#666666";
  context.fillText(`Score: ${result.total} / 100`, 94, 416);
  context.fillStyle = "#2D2D2D";
  context.fillText(`Remark: ${result.remark}`, 94, 429);

  context.fillStyle = "#6A0DAD";
  roundedRect(context, 24, 467, 36, 3, 1);
  context.fill();
  context.font = "800 10px Arial, sans-serif";
  context.fillStyle = "#111111";
  context.fillText("Strategy. Design. Technology.", 24, 489);
  context.font = "10px Arial, sans-serif";
  context.fillStyle = "#555555";
  drawWrappedText(context, "Built to move student careers & brands forward.", 24, 506, 238, 13, 2);

  context.strokeStyle = "rgba(0, 0, 0, 0.08)";
  context.beginPath();
  context.moveTo(24, 565);
  context.lineTo(336, 565);
  context.stroke();
  context.font = "700 7px Arial, sans-serif";
  context.fillStyle = "#888888";
  context.fillText("POWERED BY SEVENFOLD CREATIVE TECH AGENCY", 24, 586);
  context.font = "800 11px Arial, sans-serif";
  context.fillStyle = "#6A0DAD";
  context.fillText("bignssien.wixstudio.com/sev7nfold", 24, 605);
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
