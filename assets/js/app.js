"use strict";

const RESULT_LOOKUP = null;

const SUPABASE_URL = "https://fdutgltyptcqeyajsnua.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkdXRnbHR5cHRjcWV5YWpzbnVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNTk4NTUsImV4cCI6MjEwNzkzNTg1NX0.wR74d5wS15Ea5O2_3_0BO8RtyZhzV9SuXELDGs-eNCg";
const SUPABASE_ANON_KEY_VALID = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(SUPABASE_ANON_KEY)
  || /^sb_publishable_[A-Za-z0-9_-]+$/.test(SUPABASE_ANON_KEY);
const supabaseClient = SUPABASE_ANON_KEY_VALID && window.supabase && typeof window.supabase.createClient === "function"
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
if (!SUPABASE_ANON_KEY_VALID) {
  console.error("The configured Supabase anon key is malformed; opt-in submissions are disabled.");
}

const resultsForm = document.querySelector("#lookupForm");
const registrationInput = document.querySelector("#searchRegNo");
const fullNameInput = document.querySelector("#searchFullName");
const resultsStatus = document.querySelector("#results-status");
const resultsPanel = document.querySelector("#results-panel");
const resultName = document.querySelector("#result-name");
const resultRegistration = document.querySelector("#result-registration");
const resultSummary = document.querySelector("#result-summary");
const resultsTable = document.querySelector("#results-table");
const resultsEmpty = document.querySelector("#results-empty");
<<<<<<< HEAD
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
=======
const authModal = document.querySelector("#authModal");
const whatsappForm = document.querySelector("#whatsappForm");
const whatsappInput = document.querySelector("#exportWhatsapp");
const whatsappConsent = document.querySelector("#whatsappConsent");
const whatsappStatus = document.querySelector("#whatsapp-status");
const posterWrapper = document.querySelector("#poster-wrapper");
const cardStudentName = document.querySelector("#cardStudentName");
const cardRegistration = document.querySelector("#cardRegNo");
const cardCourse = document.querySelector("#cardCourse");
const cardCourseTitle = document.querySelector("#cardCourseTitle");
const cardGrade = document.querySelector("#cardGrade");
const cardScore = document.querySelector("#cardScore");
const cardRemark = document.querySelector("#cardRemark");
const cardAsset = document.querySelector("#gradeAsset");
let activeCardContext = null;
let verificationTrigger = null;
>>>>>>> 0e87989 (Feat: Add gated full-name auth, master key 101010, deferred WhatsApp opt-in, and Supabase integration)

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

function normalizeNameTokens(value) {
  return value.trim().toLocaleLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
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
  posterWrapper.hidden = true;
  activeCardContext = null;
  resultsStatus.textContent = message;
}

<<<<<<< HEAD
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
=======
function closeVerification() {
  authModal.hidden = true;
  whatsappStatus.textContent = "";
  whatsappInput.value = "";
  whatsappConsent.checked = false;
  activeCardContext = null;
  if (verificationTrigger) verificationTrigger.focus();
  verificationTrigger = null;
}

function generateSevenFoldExportCard(courseData) {
  if (!courseData) return;
  const { registration, student, result } = courseData;
  const grade = gradeForScore(result.score);
  if (grade !== "A" && grade !== "B") return;

  cardStudentName.textContent = student.name;
  cardRegistration.textContent = registration;
  cardCourse.textContent = result.course;
  cardCourseTitle.textContent = result.course_title;
  cardGrade.textContent = grade;
  cardScore.textContent = String(result.score);
  cardRemark.textContent = result.score >= 40 ? "PASS" : "FAIL";
  cardAsset.src = grade === "B" ? "/assets/brand/target.png" : "/assets/brand/trophy.png";
  cardAsset.alt = grade === "A" ? "A grade trophy" : "B grade target";
  cardAsset.hidden = false;

  authModal.hidden = true;
  posterWrapper.hidden = false;
  activeCardContext = null;
  verificationTrigger = null;
  whatsappInput.value = "";
  whatsappConsent.checked = false;
  whatsappStatus.textContent = "";
  document.querySelector("#print-card").focus();
  posterWrapper.scrollIntoView({ behavior: "smooth", block: "start" });
}

function triggerCardExport(courseData, trigger) {
  if (!authModal) {
    generateSevenFoldExportCard(courseData);
    return;
  }
  activeCardContext = courseData;
  verificationTrigger = trigger;
  whatsappInput.value = "";
  whatsappConsent.checked = false;
  whatsappStatus.textContent = "";
  posterWrapper.hidden = true;
  authModal.hidden = false;
  whatsappInput.focus();
>>>>>>> 0e87989 (Feat: Add gated full-name auth, master key 101010, deferred WhatsApp opt-in, and Supabase integration)
}

function renderResults(registration, student) {
  posterWrapper.hidden = true;
  activeCardContext = null;
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
    const cardCell = document.createElement("td");
    const cardButton = document.createElement("button");

<<<<<<< HEAD
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
=======
    courseCode.textContent = result.course;
    courseTitle.textContent = result.course_title;
    caScoreCell.textContent = "—";
    examScoreCell.textContent = "—";
    scoreCell.textContent = String(result.score);
    gradeCell.textContent = grade;
    gradeCell.className = `grade grade-${grade.toLowerCase()}`;
    remarkCell.textContent = result.score >= 40 ? "PASS" : "FAIL";
    remarkCell.className = result.score >= 40 ? "grade-pass" : "grade-fail";
    cardButton.type = "button";
    cardButton.className = "result-card-button";
    cardButton.disabled = grade !== "A" && grade !== "B";
    cardButton.textContent = cardButton.disabled ? "Unavailable" : "Create card";
    cardButton.setAttribute("aria-label", cardButton.disabled
      ? `Result card unavailable for ${result.course}; only A and B grades can be exported`
      : `Create result card for ${result.course}`);
    if (!cardButton.disabled) {
      cardButton.addEventListener("click", (event) => {
        triggerCardExport({ registration, student, result }, event.currentTarget);
      });
    }
    cardCell.append(cardButton);
    courseCell.append(courseCode, courseTitle);
    row.append(courseCell, caScoreCell, examScoreCell, scoreCell, gradeCell, remarkCell, cardCell);
    resultsTable.append(row);
>>>>>>> 0e87989 (Feat: Add gated full-name auth, master key 101010, deferred WhatsApp opt-in, and Supabase integration)
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

<<<<<<< HEAD
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
=======
whatsappForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeCardContext) return;

  const whatsappNumber = whatsappInput.value.trim();
  const normalizedNumber = whatsappNumber.replace(/[\s()+.-]/g, "");
  if (!/^\d{10,15}$/.test(normalizedNumber)) {
    whatsappStatus.textContent = "Enter a valid WhatsApp number.";
    whatsappInput.focus();
    return;
  }
  if (!whatsappConsent.checked) {
    whatsappStatus.textContent = "Please agree to the WhatsApp reminder opt-in before continuing.";
    whatsappConsent.focus();
    return;
  }

  if (!supabaseClient) {
    whatsappStatus.textContent = SUPABASE_ANON_KEY_VALID
      ? "The opt-in service is unavailable. Your result card has not been created; please try again later."
      : "The opt-in service is misconfigured. Your number was not submitted; please contact support.";
    console.error("Supabase client is unavailable; WhatsApp opt-in was not submitted.");
    return;
  }

  const { registration, student, result } = activeCardContext;
  const courseData = {
    registration,
    student,
    result,
  };
  const optInRecord = {
    reg_number: registration,
    full_name: student.name,
    whatsapp_number: whatsappNumber,
    course_code: result.course,
    grade: gradeForScore(result.score),
  };
  const submitButton = whatsappForm.querySelector('button[type="submit"]');
  const cancelButton = document.querySelector("#cancel-whatsapp");
  const closeButton = document.querySelector("#close-verification");
  submitButton.disabled = true;
  cancelButton.disabled = true;
  closeButton.disabled = true;
  whatsappStatus.textContent = "Saving your opt-in…";

  try {
    const { error } = await supabaseClient
      .from("whatsapp_optins")
      .insert([optInRecord]);

    if (error) {
      console.error("Supabase WhatsApp opt-in insert failed:", error.message);
      whatsappStatus.textContent = "We couldn't save your opt-in, so the card has not been created. Please try again.";
      return;
    }
  } catch (error) {
    console.error("WhatsApp opt-in request failed:", error);
    whatsappStatus.textContent = "We couldn't reach the opt-in service, so the card has not been created. Please try again.";
    return;
  } finally {
    submitButton.disabled = false;
    cancelButton.disabled = false;
    closeButton.disabled = false;
  }

  generateSevenFoldExportCard(courseData);
});

document.querySelector("#cancel-whatsapp").addEventListener("click", closeVerification);
document.querySelector("#close-verification").addEventListener("click", closeVerification);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !authModal.hidden) closeVerification();
});
document.querySelector("#print-card").addEventListener("click", () => window.print());
document.querySelector("#dismiss-card").addEventListener("click", () => {
  posterWrapper.hidden = true;
});
>>>>>>> 0e87989 (Feat: Add gated full-name auth, master key 101010, deferred WhatsApp opt-in, and Supabase integration)

resultsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  closeCelebration();
  resultsStatus.textContent = "";

  const registration = normalizeRegistration(registrationInput.value);
  const inputNameTokens = normalizeNameTokens(fullNameInput.value);
  if (!registration || inputNameTokens.length < 2) {
    setResultsMessage("Invalid Registration Number or Full Name combination. Please verify your details.");
    registrationInput.focus();
    return;
  }

  const matchedStudent = RESULT_LOOKUP && Object.hasOwn(RESULT_LOOKUP, registration)
    ? RESULT_LOOKUP[registration]
    : null;
  const studentNameTokens = matchedStudent ? normalizeNameTokens(matchedStudent.name) : [];
  const isNameMatch = inputNameTokens.every((token) => studentNameTokens.includes(token));
  if (!matchedStudent || !isNameMatch) {
    setResultsMessage("Invalid Registration Number or Full Name combination. Please verify your details.");
    registrationInput.focus();
    return;
  }

  renderResults(registration, matchedStudent);
});
