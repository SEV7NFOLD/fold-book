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
}

function renderResults(registration, student) {
  posterWrapper.hidden = true;
  activeCardContext = null;
  resultName.textContent = student.name;
  resultRegistration.textContent = registration;
  resultsTable.replaceChildren();

  const passedCourses = student.results.filter((result) => result.total >= 40).length;
  resultSummary.textContent = `${student.results.length} course${student.results.length === 1 ? "" : "s"} · ${passedCourses} passed`;

  for (const result of student.results) {
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
    const grade = result.grade || gradeForScore(result.total);
    const courseData = {
      course: result.course,
      course_title: result.course_title,
      score: result.total,
    };

    courseCode.textContent = result.course;
    courseTitle.textContent = result.course_title;
    caScoreCell.textContent = result.ca === null ? "—" : String(result.ca);
    examScoreCell.textContent = result.exam === null ? "—" : String(result.exam);
    scoreCell.textContent = String(result.total);
    gradeCell.textContent = grade;
    gradeCell.className = `grade grade-${grade.toLowerCase()}`;
    remarkCell.textContent = result.remark || (result.total >= 40 ? "PASS" : "FAIL");
    remarkCell.className = remarkCell.textContent === "PASS" ? "grade-pass" : "grade-fail";
    cardButton.type = "button";
    cardButton.className = "result-card-button";
    cardButton.disabled = grade !== "A" && grade !== "B";
    cardButton.textContent = cardButton.disabled ? "Unavailable" : "Create card";
    cardButton.setAttribute("aria-label", cardButton.disabled
      ? `Result card unavailable for ${result.course}; only A and B grades can be exported`
      : `Create result card for ${result.course}`);
    if (!cardButton.disabled) {
      cardButton.addEventListener("click", (event) => {
        triggerCardExport({ registration, student, result: courseData }, event.currentTarget);
      });
    }
    cardCell.append(cardButton);
    courseCell.append(courseCode, courseTitle);
    tableRow.append(courseCell, caScoreCell, examScoreCell, scoreCell, gradeCell, remarkCell, cardCell);
    resultsTable.append(tableRow);
  }

  resultsEmpty.hidden = student.results.length > 0;
  resultsTable.hidden = student.results.length === 0;
  resultsPanel.hidden = false;
  resultsStatus.textContent = student.results.length === 0
    ? "Your registration number was found, but there are no published results yet."
    : "";
}

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

resultsForm.addEventListener("submit", (event) => {
  event.preventDefault();
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
