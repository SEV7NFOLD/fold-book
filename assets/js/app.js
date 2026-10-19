"use strict";

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const RESULT_LOOKUP = null;
let UNIUYO_COURSE_CATALOG = {
  "100L": [
    { code: "ECO 128", title: "Transportation Economics", units: 3 },
    { code: "ECO 122", title: "Introductory Statistics II", units: 3 },
    { code: "ECO 123", title: "Introductory Mathematics II", units: 3 },
  ],
  "200L": [
    { code: "ECO 211", title: "Microeconomic Theory I", units: 3 },
    { code: "ECO 221", title: "Macroeconomic Theory I", units: 3 },
  ],
  "300L": [
    { code: "ECO 311", title: "Advanced Microeconomics", units: 3 },
    { code: "ECO 321", title: "Introductory Econometrics", units: 3 },
  ],
  "400L": [
    { code: "ECO 411", title: "Advanced Econometrics", units: 3 },
    { code: "ECO 421", title: "Applied Economics & Project", units: 6 },
  ],
};

function detectStudentLevel(regNo) {
  const yearMatch = typeof regNo === "string" ? regNo.match(/^(\d{2})\//) : null;
  if (!yearMatch) return "100L";

  const entryYear = Number.parseInt(yearMatch[1], 10);
  const currentAcademicYearShort = 26;
  const yearDiff = currentAcademicYearShort - entryYear;
  if (yearDiff <= 1) return "100L";
  if (yearDiff === 2) return "200L";
  if (yearDiff === 3) return "300L";
  return "400L";
}

function coursesForLevel(level) {
  return UNIUYO_COURSE_CATALOG[level] || UNIUYO_COURSE_CATALOG["100L"];
}

function updateAdminCourseDropdown() {
  const levelSelect = document.querySelector("#adminLevelSelect");
  const courseSelect = document.querySelector("#adminCourseSelect");
  if (!levelSelect || !courseSelect) return;
  courseSelect.replaceChildren(...coursesForLevel(levelSelect.value).map((course) => {
    const option = document.createElement("option");
    option.value = course.code;
    option.textContent = `${course.code} - ${course.title}`;
    return option;
  }));
}

const STUDY_MODULES = [
  {
    id: "transport-role",
    title: "Why transport matters",
    lesson: "Transport moves people and goods between places, helping markets connect and businesses reach customers.",
    question: "What is one important economic role of transport?",
    answers: ["It connects producers with markets", "It removes the need for trade", "It makes distance irrelevant"],
    correctAnswer: 0,
  },
  {
    id: "demand",
    title: "Demand for transport",
    lesson: "Transport demand is often derived demand: people travel because they want to reach work, school, shops, or other activities.",
    question: "A student takes a bus to attend a lecture. The trip is best described as…",
    answers: ["Derived demand", "A fixed supply", "A transport externality"],
    correctAnswer: 0,
  },
  {
    id: "costs",
    title: "Costs and scale",
    lesson: "Transport costs include vehicle, labour, fuel, infrastructure, and time costs. Better utilisation can reduce average cost per trip.",
    question: "When the same operating cost is spread across more passengers, average cost per passenger usually…",
    answers: ["Falls", "Doubles automatically", "Becomes a sunk benefit"],
    correctAnswer: 0,
  },
  {
    id: "externalities",
    title: "Congestion and external costs",
    lesson: "A journey can impose costs on others through congestion, noise, or pollution. These are negative externalities.",
    question: "Traffic delay imposed on other road users is an example of…",
    answers: ["A negative externality", "A private benefit", "Derived supply"],
    correctAnswer: 0,
  },
  {
    id: "policy",
    title: "Pricing and policy",
    lesson: "Transport policy can use fares, road pricing, investment, and regulation to balance access, efficiency, and social costs.",
    question: "A congestion charge is mainly intended to…",
    answers: ["Reflect some congestion costs in travel decisions", "Increase the number of road delays", "Make public transport demand disappear"],
    correctAnswer: 0,
  },
];
const STATISTICS_MODULES = [
  {
    id: "statistics-data",
    title: "Data and variables",
    lesson: "Statistics organises observations into useful information. Variables may be qualitative or quantitative.",
    question: "A student's number of weekly trips is a…",
    answers: ["Quantitative variable", "Qualitative label", "Sampling frame"],
    correctAnswer: 0,
  },
  {
    id: "statistics-sample",
    title: "Population and sample",
    lesson: "A population is the complete group of interest; a sample is a subset selected for study.",
    question: "A subset selected from all Economics students is a…",
    answers: ["Sample", "Census", "Parameter"],
    correctAnswer: 0,
  },
  {
    id: "statistics-mean",
    title: "Measures of central tendency",
    lesson: "The arithmetic mean is the sum of observations divided by the number of observations.",
    question: "To calculate the arithmetic mean, divide the total by the…",
    answers: ["Number of observations", "Largest observation", "Range"],
    correctAnswer: 0,
  },
  {
    id: "statistics-dispersion",
    title: "Spread and dispersion",
    lesson: "Measures of dispersion describe how far observations vary around a central value.",
    question: "Which measure is the difference between the largest and smallest value?",
    answers: ["Range", "Mean", "Median"],
    correctAnswer: 0,
  },
  {
    id: "statistics-probability",
    title: "Probability basics",
    lesson: "Probability measures the likelihood of an event and ranges from zero to one.",
    question: "An impossible event has probability…",
    answers: ["0", "0.5", "1"],
    correctAnswer: 0,
  },
];
const MODULES_BY_COURSE = { "ECO 128": STUDY_MODULES, "ECO 122": STATISTICS_MODULES };
const STUDY_PROGRESS_KEY = "foldBook.studyProgress";
const LEGACY_STUDY_PROGRESS_KEY = "foldBookV2.studyProgress";
const navButtons = [...document.querySelectorAll("[data-tab]")];
const studyPanels = new Map(["home", "chat", "board", "invite"].map((id) => [id, document.querySelector(`#${id}`)]));
const pathTree = document.querySelector("#pathTree");
const lessonPanel = document.querySelector("#lessonPanel");
const lessonStep = document.querySelector("#lessonStep");
const lessonTitle = document.querySelector("#lessonTitle");
const lessonQuestion = document.querySelector("#lessonQuestion");
const answerOptions = document.querySelector("#answerOptions");
const lessonFeedback = document.querySelector("#lessonFeedback");
const courseBar = document.querySelector("#cbar");
const courseProgressBar = document.querySelector(".bar-bg");
const coursePercent = document.querySelector("#cpct");
const streakValue = document.querySelector("#vStreak");
const gemsValue = document.querySelector("#vGems");
const soundToggle = document.querySelector("#sndToggle");
const fuelValue = document.querySelector("#vFuel");
const fuelBar = document.querySelector("#fbar");
const weekTracker = document.querySelector("#weekTracker");
const leaderboardList = document.querySelector("#leaderboardList");
const leaderboardStatus = document.querySelector("#leaderboardStatus");
const closeLessonButton = document.querySelector("#closeLesson");
const examPredictorButton = document.querySelector("#examPredictorButton");
const examPredictorStatus = document.querySelector("#examPredictorStatus");
const examPredictorDescription = document.querySelector("#examPredictorDescription");
const examPredictorPanel = document.querySelector("#examPredictorPanel");
const mockExamProgress = document.querySelector("#mockExamProgress");
const mockExamTitle = document.querySelector("#mockExamTitle");
const mockExamQuestion = document.querySelector("#mockExamQuestion");
const mockExamOptions = document.querySelector("#mockExamOptions");
const mockExamFeedback = document.querySelector("#mockExamFeedback");
const mockExamNext = document.querySelector("#mockExamNext");
const DEFAULT_STUDY_PROGRESS = {
  completed: [],
  courseCompleted: { "ECO 128": [], "ECO 122": [] },
  course: "ECO 128",
  xp: 0,
  gems: 0,
  streak: 6,
  fuel: 85,
  inviteCount: 0,
  demoPassExpiresAt: 0,
  lastStudyDate: "",
  activityDays: [],
  soundEnabled: true,
  examRewardClaimed: false,
};
let currentCourse = "ECO 128";
let activeModules = STUDY_MODULES;
let currentStudentLevel = "100L";
let chatCourseCode = "ECO 128";
let currentStudent = null;
let isMasterAdmin = false;
const AUTH_SESSION_KEY = "foldBook.authSession";
const S = { isAdmin: false, student: null, level: "100L", phoneNumber: "" };
let leaderboardEntries = [];
let practiceQuestions = [];
let mockExamQuestions = [];

function updateChatCourseDropdown(preferredCourse = chatCourseCode) {
  const courseSelect = document.querySelector("#chatCourse");
  if (!courseSelect) return;
  const courses = coursesForLevel(currentStudentLevel);
  courseSelect.replaceChildren(...courses.map((course) => {
    const option = document.createElement("option");
    option.value = course.code;
    option.textContent = course.code;
    return option;
  }));
  chatCourseCode = courses.some((course) => course.code === preferredCourse)
    ? preferredCourse
    : courses[0].code;
  courseSelect.value = chatCourseCode;
}

function setStudentRegistration(registration) {
  currentStudentLevel = detectStudentLevel(registration);
  const levelStatus = document.querySelector("#chatLevel");
  if (levelStatus) levelStatus.textContent = `Detected level: ${currentStudentLevel}`;
  updateChatCourseDropdown(chatCourseCode);
}

function freshStudyProgress() {
  return {
    ...DEFAULT_STUDY_PROGRESS,
    completed: [],
    courseCompleted: { "ECO 128": [], "ECO 122": [] },
    activityDays: [],
  };
}

function loadStudyProgress() {
  try {
    const saved = window.localStorage.getItem(STUDY_PROGRESS_KEY)
      || window.localStorage.getItem(LEGACY_STUDY_PROGRESS_KEY);
    if (!saved) return freshStudyProgress();
    const parsed = JSON.parse(saved);
    const course = parsed.course === "ECO 122" ? "ECO 122" : "ECO 128";
    const validCompleted = (items, targetCourse) => Array.isArray(items)
      ? items.filter((id) => MODULES_BY_COURSE[targetCourse].some((module) => module.id === id))
      : [];
    const courseCompleted = {
      "ECO 128": validCompleted(parsed.courseCompleted?.["ECO 128"] || parsed.completed, "ECO 128"),
      "ECO 122": validCompleted(parsed.courseCompleted?.["ECO 122"], "ECO 122"),
    };
    currentCourse = course;
    activeModules = MODULES_BY_COURSE[currentCourse];
    return {
      ...DEFAULT_STUDY_PROGRESS,
      completed: courseCompleted[course],
      courseCompleted,
      course,
      activityDays: Array.isArray(parsed.activityDays) ? parsed.activityDays.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)) : [],
      xp: Number.isFinite(parsed.xp) && parsed.xp >= 0 ? parsed.xp : 0,
      gems: Number.isFinite(parsed.gems) && parsed.gems >= 0 ? parsed.gems : 0,
      streak: Number.isFinite(parsed.streak) && parsed.streak >= 1 ? parsed.streak : 6,
      fuel: Number.isFinite(parsed.fuel) ? Math.max(0, Math.min(100, parsed.fuel)) : 85,
      inviteCount: Number.isFinite(parsed.inviteCount) ? Math.max(0, Math.min(5, parsed.inviteCount)) : 0,
      demoPassExpiresAt: Number.isFinite(parsed.demoPassExpiresAt) ? parsed.demoPassExpiresAt : 0,
      lastStudyDate: typeof parsed.lastStudyDate === "string" ? parsed.lastStudyDate : "",
      soundEnabled: typeof parsed.soundEnabled === "boolean" ? parsed.soundEnabled : true,
      examRewardClaimed: parsed.examRewardClaimed === true,
    };
  } catch (error) {
    console.error("Could not load saved Study Buddy progress:", error);
    return freshStudyProgress();
  }
}

const studyProgress = loadStudyProgress();

function saveStudyProgress() {
  try {
    studyProgress.courseCompleted[currentCourse] = [...studyProgress.completed];
    studyProgress.course = currentCourse;
    window.localStorage.setItem(STUDY_PROGRESS_KEY, JSON.stringify(studyProgress));
  } catch (error) {
    console.error("Could not save Study Buddy progress:", error);
  }
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startStudyActivity() {
  const today = localDateKey();
  if (studyProgress.lastStudyDate !== today) {
    if (studyProgress.lastStudyDate) {
      const previousDay = new Date(`${studyProgress.lastStudyDate}T00:00:00`);
      const daysSinceStudy = Math.round((new Date(`${today}T00:00:00`) - previousDay) / 86400000);
      studyProgress.streak = daysSinceStudy === 1 ? studyProgress.streak + 1 : 1;
    }
    studyProgress.lastStudyDate = today;
  }
  if (!studyProgress.activityDays.includes(today)) studyProgress.activityDays.push(today);
  studyProgress.activityDays = studyProgress.activityDays.slice(-35);
}

function playStudyChime() {
  sfx.ok();
}

let AC = null;
let soundOn = true;

function tone(frequency, start, duration, type = "sine", volume = 0.12) {
  if (!soundOn) return;
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (typeof AudioContextConstructor !== "function") return;
  try {
    AC = AC || new AudioContextConstructor();
    if (AC.state === "suspended") void AC.resume();
    const oscillator = AC.createOscillator();
    const gain = AC.createGain();
    const time = AC.currentTime + start;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain);
    gain.connect(AC.destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  } catch (error) {
    console.error("FoldBook sound could not be played:", error);
  }
}

const sfx = {
  tap() { tone(540, 0, 0.05, "triangle", 0.07); },
  ok() { tone(660, 0, 0.14); tone(990, 0.1, 0.28); },
  no() { tone(190, 0, 0.22, "sawtooth", 0.06); tone(140, 0.12, 0.3, "sawtooth", 0.06); },
  win() { [523, 659, 784, 1047].forEach((frequency, index) => tone(frequency, index * 0.11, 0.3)); },
  gem() { tone(1250, 0, 0.08, "square", 0.035); tone(1700, 0.07, 0.14, "square", 0.035); },
  low() { [392, 330, 262].forEach((frequency, index) => tone(frequency, index * 0.14, 0.25, "triangle", 0.1)); },
  msg() { tone(780, 0, 0.07, "sine", 0.06); tone(1040, 0.06, 0.1, "sine", 0.05); },
  pour() { for (let index = 0; index < 5; index += 1) tone(500 + index * 140, index * 0.06, 0.1, "triangle", 0.06); },
};

function buzz(pattern) {
  if (typeof window.navigator.vibrate !== "function") return;
  try {
    window.navigator.vibrate(pattern);
  } catch (error) {
    console.error("FoldBook haptic feedback could not be triggered:", error);
  }
}

document.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button, [role='option']")) {
    sfx.tap();
    buzz(8);
  }
});

function renderWeekTracker() {
  weekTracker.replaceChildren();
  const today = new Date();
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset);
  const labels = ["M", "T", "W", "T", "F", "S", "S"];

  for (let index = 0; index < 7; index += 1) {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index);
    const day = document.createElement("div");
    const marker = document.createElement("span");
    const label = document.createElement("small");
    const dateKey = localDateKey(date);
    const isActive = studyProgress.activityDays.includes(dateKey);
    day.className = `week-day${isActive ? " is-active" : ""}${dateKey === localDateKey() ? " is-today" : ""}`;
    marker.className = "week-day-marker";
    marker.textContent = isActive ? "✓" : "";
    label.textContent = labels[index];
    day.setAttribute("aria-label", `${date.toLocaleDateString("en", { weekday: "long" })}${isActive ? ", study complete" : ""}`);
    day.append(marker, label);
    weekTracker.append(day);
  }
}

function renderLeaderboard() {
  const entries = [...leaderboardEntries].sort((left, right) => right.xp - left.xp);
  leaderboardList.replaceChildren();
  entries.forEach((entry, index) => {
    const row = document.createElement("div");
    const rank = document.createElement("span");
    const name = document.createElement("strong");
    const xp = document.createElement("span");
    row.className = `leaderboard-row${entry.isCurrentUser ? " is-current-user" : ""}`;
    rank.className = "leaderboard-rank mono";
    rank.textContent = String(entry.rank || index + 1).padStart(2, "0");
    name.textContent = entry.name;
    xp.className = "leaderboard-xp mono";
    xp.textContent = `${entry.xp} XP`;
    row.append(rank, name, xp);
    leaderboardList.append(row);
  });
  const podium = document.querySelector("#leaderboardPodium");
  podium.replaceChildren();
  const podiumEntries = [
    { entry: entries[1], rank: 2 },
    { entry: entries[0], rank: 1 },
    { entry: entries[2], rank: 3 },
  ].filter(({ entry }) => entry);
  podiumEntries.forEach(({ entry, rank }) => {
    const step = document.createElement("div");
    const avatar = document.createElement("div");
    const name = document.createElement("span");
    const xp = document.createElement("small");
    const block = document.createElement("div");
    const initials = entry.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2);
    step.className = `podium-place podium-${rank}`;
    avatar.className = "av";
    avatar.textContent = initials;
    name.textContent = entry.name;
    name.className = "podium-name";
    xp.className = "podium-xp mono";
    xp.textContent = `${entry.xp} XP`;
    block.className = "podium-block";
    block.textContent = String(rank);
    step.append(avatar, name, xp, block);
    podium.append(step);
  });
  const currentEntry = entries.find((entry) => entry.isCurrentUser);
  const currentRank = currentEntry ? currentEntry.rank || entries.indexOf(currentEntry) + 1 : 0;
  const rankElement = document.querySelector("#yourRank");
  const xpElement = document.querySelector("#yourXp");
  if (rankElement) rankElement.textContent = currentRank > 0 ? `#${currentRank}` : "—";
  if (xpElement) xpElement.textContent = `${studyProgress.xp} XP`;
  if (leaderboardStatus && !currentStudent) leaderboardStatus.textContent = "Sign in to load the live XP leaderboard.";
}

function updateFuelDisplay() {
  const hasDemoPass = studyProgress.demoPassExpiresAt > Date.now();
  const chatFuelBar = document.querySelector("#chatFuelBar");
  const chatFuelValue = document.querySelector("#chatFuelValue");
  fuelValue.textContent = hasDemoPass ? "∞ PASS" : `${studyProgress.fuel}/100`;
  fuelBar.style.width = hasDemoPass ? "100%" : `${studyProgress.fuel}%`;
  chatFuelBar.style.width = hasDemoPass ? "100%" : `${studyProgress.fuel}%`;
  chatFuelValue.textContent = hasDemoPass ? "∞ PASS" : `${studyProgress.fuel}/100`;
}

function updateStudySummary() {
  const completedCount = studyProgress.completed.length;
  const percent = Math.round((completedCount / activeModules.length) * 100);
  const mockUnlocked = completedCount === activeModules.length;
  courseBar.style.width = `${percent}%`;
  courseProgressBar.setAttribute("aria-valuenow", String(percent));
  coursePercent.textContent = `${percent}%`;
  streakValue.textContent = String(studyProgress.streak);
  if (gemsValue) gemsValue.textContent = String(studyProgress.gems);
  soundToggle.textContent = studyProgress.soundEnabled ? "🔊" : "🔇";
  soundToggle.setAttribute("aria-pressed", String(studyProgress.soundEnabled));
  soundToggle.setAttribute("aria-label", `Turn sound ${studyProgress.soundEnabled ? "off" : "on"}`);
  examPredictorButton.disabled = false;
  examPredictorButton.textContent = mockUnlocked ? "Start UNIUYO practice mock" : "Complete modules or view pass options";
  examPredictorStatus.textContent = mockUnlocked ? "MOCK EXAM READY" : "LOCKED";
  examPredictorDescription.textContent = mockUnlocked
    ? "All modules complete! Take the practice mock. Pass options are demo-only; no payment is collected."
    : "Complete every module to unlock the practice mock, or view the ₦200 demo pass option. No payment is collected.";
  renderWeekTracker();
  renderLeaderboard();
  updateFuelDisplay();
}

function showStudyLesson(index) {
  const module = activeModules[index];
  lessonStep.textContent = `MODULE ${String(index + 1).padStart(2, "0")} / ${String(activeModules.length).padStart(2, "0")}`;
  lessonTitle.textContent = module.title;
  lessonQuestion.textContent = `${module.lesson} ${module.question}`;
  lessonFeedback.textContent = "";
  answerOptions.replaceChildren();
  module.answers.forEach((answer, answerIndex) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "answer-option";
    option.textContent = answer;
    option.addEventListener("click", () => {
      if (answerIndex !== module.correctAnswer) {
        lessonFeedback.textContent = "Not quite. Re-read the lesson and try another answer.";
        lessonFeedback.className = "lesson-feedback is-retry";
        if (typeof window.navigator.vibrate === "function") window.navigator.vibrate(35);
        return;
      }

      if (!studyProgress.completed.includes(module.id)) {
        studyProgress.completed.push(module.id);
        studyProgress.xp += 20;
        studyProgress.gems += 5;
        startStudyActivity();
        saveStudyProgress();
        updateStudySummary();
        void syncLeaderboardEntry();
        renderStudyPath();
        if (studyProgress.soundEnabled) playStudyChime();
        if (typeof window.navigator.vibrate === "function") window.navigator.vibrate([25, 35, 25]);
        lessonFeedback.textContent = "Correct! +20 XP · +5 gems. The next node is ready.";
      } else {
        lessonFeedback.textContent = "Correct! This module is already complete, so no extra XP was added.";
      }
      lessonFeedback.className = "lesson-feedback is-correct";
      option.classList.add("is-correct");
      for (const answerButton of answerOptions.children) answerButton.disabled = true;
    });
    answerOptions.append(option);
  });
  lessonPanel.hidden = false;
  lessonPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderStudyPath() {
  pathTree.replaceChildren();
  const completedCount = studyProgress.completed.length;
  document.querySelector("#wkd").textContent = `${currentCourse} · STUDY PATH`;
  document.querySelector("#wkdays").textContent = `${completedCount} OF ${activeModules.length} MODULES COMPLETE`;
  document.querySelector("#wkp").textContent = `${completedCount} / ${activeModules.length}`;

  activeModules.forEach((module, index) => {
    const isComplete = studyProgress.completed.includes(module.id);
    const isUnlocked = isComplete || index === studyProgress.completed.length;
    const offset = Math.round(Math.sin(index * 1.1) * 70);
    const row = document.createElement("div");
    const node = document.createElement("button");
    const label = document.createElement("div");
    const title = document.createElement("b");
    const detail = document.createElement("span");
    row.className = `row${offset > 0 ? " flip" : ""}`;
    row.style.transform = `translateX(${offset}px)`;
    node.type = "button";
    node.disabled = false;
    node.className = `node ${isComplete ? "done" : isUnlocked ? "active" : "locked"}`;
    node.setAttribute("aria-label", `${isComplete ? "Review" : isUnlocked ? "Start" : "Locked"} module ${index + 1}: ${module.title}`);
    node.setAttribute("aria-disabled", String(!isUnlocked));
    node.innerHTML = isComplete
      ? '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>'
      : isUnlocked
        ? '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
        : '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>';
    label.className = "lab";
    title.textContent = module.title;
    detail.textContent = isComplete ? "Completed · Review lesson" : `${5} min · +20 XP`;
    label.append(title, detail);
    node.addEventListener("click", () => {
      if (!isUnlocked) {
        node.classList.toggle("shake", false);
        void node.offsetWidth;
        node.classList.add("shake");
        return;
      }
      showStudyLesson(index);
    });
    row.append(node, label);
    pathTree.append(row);
  });
}

function setNavigationAvailable(available) {
  document.querySelector("#studentApp").hidden = !available;
  document.querySelector("#studentMobileNav").hidden = !available;
  document.querySelector("#studentHeaderWidgets").hidden = !available;
}

function showStage(stage) {
  document.querySelector("#landingView").hidden = stage !== "landingView";
  document.querySelector("#authView").hidden = stage !== "authView";
  document.querySelector("#adminDashboard").hidden = stage !== "adminDashboard";
  setNavigationAvailable(stage === "studentApp");
  window.location.hash = `#${stage}`;
  if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
}

function showAccessRestrictedNotice() {
  const notice = "Access Restricted: SevenFold Authorized Personnel Only";
  const authStatus = document.querySelector("#authStatus");
  if (authStatus) authStatus.textContent = notice;
  const toast = document.querySelector("#accessToast");
  toast.textContent = notice;
  toast.hidden = false;
  window.setTimeout(() => { toast.hidden = true; }, 4000);
}

function activateTab(tab) {
  const selectedTab = typeof tab === "string" ? tab : tab.dataset.tab;
  if (!currentStudent || isMasterAdmin || !studyPanels.has(selectedTab)) {
    showAccessRestrictedNotice();
    return false;
  }
  for (const button of navButtons) {
    const isSelected = button.dataset.tab === selectedTab;
    button.classList.toggle("on", isSelected);
    if (isSelected) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  for (const [panelId, panel] of studyPanels) {
    const isHidden = panelId !== selectedTab;
    panel.hidden = isHidden;
    panel.classList.toggle("hide", isHidden);
  }
  if (selectedTab === "chat") document.querySelector("#chatInput").focus();
  return true;
}

const mockExamState = { questionIndex: 0, score: 0, answered: false };

function renderMockExamQuestion() {
  const question = mockExamQuestions[mockExamState.questionIndex];
  if (!question) return;
  mockExamProgress.textContent = `QUESTION ${mockExamState.questionIndex + 1} / ${mockExamQuestions.length}`;
  mockExamQuestion.textContent = question.prompt;
  mockExamFeedback.textContent = "";
  mockExamFeedback.className = "lesson-feedback";
  mockExamOptions.replaceChildren();
  mockExamState.answered = false;
  mockExamNext.disabled = true;
  mockExamNext.textContent = mockExamState.questionIndex === mockExamQuestions.length - 1
    ? "Finish mock exam"
    : "Next question";

  question.answers.forEach((answer, answerIndex) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "answer-option";
    option.textContent = answer;
    option.addEventListener("click", () => {
      if (mockExamState.answered) return;
      mockExamState.answered = true;
      const correct = answerIndex === question.correctAnswer;
      if (correct) {
        mockExamState.score += 1;
        option.classList.add("is-correct");
        mockExamFeedback.textContent = "Correct.";
        mockExamFeedback.className = "lesson-feedback is-correct";
        if (studyProgress.soundEnabled) playStudyChime();
        if (typeof window.navigator.vibrate === "function") window.navigator.vibrate(20);
      } else {
        mockExamFeedback.textContent = `Not quite. The correct answer is: ${question.answers[question.correctAnswer]}.`;
        mockExamFeedback.className = "lesson-feedback is-retry";
        if (typeof window.navigator.vibrate === "function") window.navigator.vibrate(35);
      }
      for (const answerButton of mockExamOptions.children) answerButton.disabled = true;
      mockExamNext.disabled = false;
    });
    mockExamOptions.append(option);
  });
}

function finishMockExam() {
  const score = mockExamState.score;
  const estimate = score >= Math.ceil(mockExamQuestions.length * 0.8) ? "Strong grasp" : score >= Math.ceil(mockExamQuestions.length * 0.6) ? "Developing" : "More practice recommended";
  mockExamProgress.textContent = `PRACTICE SCORE · ${score} / ${mockExamQuestions.length}`;
  mockExamTitle.textContent = estimate;
  mockExamQuestion.textContent = "This practice result is for revision guidance only and does not predict or replace an official exam result.";
  mockExamOptions.replaceChildren();
  mockExamFeedback.textContent = "";
  mockExamNext.disabled = true;
  mockExamNext.textContent = "Mock complete";

  if (!studyProgress.examRewardClaimed) {
    studyProgress.examRewardClaimed = true;
    studyProgress.xp += 25;
    studyProgress.gems += 10;
    startStudyActivity();
    saveStudyProgress();
    updateStudySummary();
    void syncLeaderboardEntry();
    mockExamFeedback.textContent = "First mock complete! +25 XP · +10 gems.";
    mockExamFeedback.className = "lesson-feedback is-correct";
  }
}

examPredictorButton.addEventListener("click", async () => {
  if (studyProgress.completed.length !== activeModules.length) {
    document.querySelector("#fuel").hidden = false;
    return;
  }
  mockExamState.questionIndex = 0;
  mockExamState.score = 0;
  examPredictorPanel.hidden = false;
  mockExamTitle.textContent = "UNIUYO Practice Mock";
  mockExamProgress.textContent = "GENERATING QUESTIONS FROM COURSE MATERIALS…";
  mockExamQuestion.textContent = "Loading indexed notes and preparing a practice set.";
  mockExamOptions.replaceChildren();
  mockExamNext.disabled = true;
  try {
    mockExamQuestions = await generateQuestionsFromMaterials(5, chatCourseCode, currentStudentLevel);
    renderMockExamQuestion();
  } catch (error) {
    console.error("Could not generate the practice mock:", error);
    mockExamProgress.textContent = "PRACTICE MOCK UNAVAILABLE";
    mockExamQuestion.textContent = `Could not generate questions: ${error.message}`;
  }
});

mockExamNext.addEventListener("click", () => {
  if (!mockExamState.answered) return;
  if (mockExamState.questionIndex === mockExamQuestions.length - 1) {
    finishMockExam();
    return;
  }
  mockExamState.questionIndex += 1;
  renderMockExamQuestion();
});

for (const tab of navButtons) {
  tab.addEventListener("click", () => activateTab(tab));
}

soundToggle.addEventListener("click", () => {
  studyProgress.soundEnabled = !studyProgress.soundEnabled;
  soundOn = studyProgress.soundEnabled;
  saveStudyProgress();
  updateStudySummary();
});
closeLessonButton.addEventListener("click", () => {
  lessonPanel.hidden = true;
});

function setCourse(course) {
  if (!MODULES_BY_COURSE[course] || course === currentCourse) return;
  studyProgress.courseCompleted[currentCourse] = [...studyProgress.completed];
  currentCourse = course;
  activeModules = MODULES_BY_COURSE[course];
  studyProgress.completed = [...studyProgress.courseCompleted[course]];
  document.querySelector("#courseCodeLabel").textContent = `${course} · STUDY PATH`;
  document.querySelector("#courseTitle").textContent = course === "ECO 128" ? "Transportation Economics" : "Statistics";
  for (const button of document.querySelectorAll(".course-choice")) {
    const selected = button.dataset.course === course;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  lessonPanel.hidden = true;
  examPredictorPanel.hidden = true;
  saveStudyProgress();
  renderStudyPath();
  updateStudySummary();
}

function syncCourseControls() {
  document.querySelector("#courseCodeLabel").textContent = `${currentCourse} · STUDY PATH`;
  document.querySelector("#courseTitle").textContent = currentCourse === "ECO 128" ? "Transportation Economics" : "Statistics";
  chatCourseCode = currentCourse;
  updateChatCourseDropdown(currentCourse);
  for (const button of document.querySelectorAll(".course-choice")) {
    const selected = button.dataset.course === currentCourse;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
}

for (const button of document.querySelectorAll(".course-choice")) {
  button.addEventListener("click", () => setCourse(button.dataset.course));
}
document.querySelector("#chatCourse").addEventListener("change", (event) => {
  chatCourseCode = event.currentTarget.value;
  if (MODULES_BY_COURSE[chatCourseCode] && chatCourseCode !== currentCourse) setCourse(chatCourseCode);
});

const mascotFiles = {
  person: ["person-02-breathing.json"],
  idle: ["cat-idle.json", "idle.json"],
  happy: ["confetti-burst.json", "success.json", "happy.json"],
  success: ["confetti-burst.json", "success.json", "happy.json"],
  sad: ["wrong.json", "sad.json"],
  wrong: ["wrong.json", "sad.json"],
  streak: ["streak-flame.json", "fire.json"],
  fire: ["streak-flame.json", "fire.json"],
  winner: ["trophy.json", "winner.json"],
  trophy: ["trophy.json", "winner.json"],
};
let lottieManifestPromise;

function renderMascot(mood, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const fallback = () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 120 120");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Dr. Eco portrait");
    svg.classList.add("mascot-fallback");
    svg.innerHTML = '<circle cx="60" cy="60" r="58" fill="#20231b"/><path d="M21 110c4-20 18-30 39-30s35 10 39 30" fill="#f2efe8"/><path d="M48 77h24v19H48z" fill="#b9754e"/><ellipse cx="60" cy="54" rx="25" ry="30" fill="#c98a62"/><path d="M35 52c-4-20 7-37 25-37 21 0 31 16 25 38l-5-12-9-8-15 8-13-4z" fill="#27231f"/><path d="M39 52h17m9 0h17" fill="none" stroke="#f2efe8" stroke-width="3"/><circle cx="48" cy="53" r="8" fill="none" stroke="#252525" stroke-width="2.5"/><circle cx="72" cy="53" r="8" fill="none" stroke="#252525" stroke-width="2.5"/><path d="M56 53h8m-15 15q11 9 22 0" fill="none" stroke="#252525" stroke-linecap="round" stroke-width="2.5"/><path d="m48 82 12 12 12-12 12 28H36z" fill="#fff"/><path d="m56 95 4 5 4-5-4-7z" fill="#9db843"/>';
    container.replaceChildren(svg);
  };
  const candidates = mascotFiles[String(mood).toLowerCase()] || mascotFiles.idle;
  if (!lottieManifestPromise) {
    lottieManifestPromise = fetch("/assets/lottie/manifest.json")
      .then((response) => {
        if (!response.ok) throw new Error(`Lottie manifest request failed (${response.status}).`);
        return response.json();
      })
      .then((files) => {
        if (!Array.isArray(files) || !files.every((file) => typeof file === "string")) {
          throw new Error("Lottie manifest has an invalid format.");
        }
        return files;
      })
      .catch((error) => {
        lottieManifestPromise = null;
        console.error("Could not load FoldBook mascot manifest:", error);
        return [];
      });
  }
  void lottieManifestPromise.then(async (files) => {
    const available = candidates.map((name) => files.find((file) => file.endsWith(`/${name}`))).find(Boolean);
    if (!available) {
      fallback();
      return;
    }
    try {
      const response = await fetch(available);
      if (!response.ok) throw new Error(`Mascot animation request failed (${response.status}).`);
      const animation = await response.json();
      if (!animation || typeof animation !== "object") throw new Error("Mascot animation JSON is invalid.");
      const player = document.createElement("dotlottie-player");
      player.setAttribute("src", available);
      player.setAttribute("autoplay", "");
      player.setAttribute("loop", "");
      player.setAttribute("background", "transparent");
      player.setAttribute("aria-label", `Dr. Eco ${mood} mascot`);
      player.addEventListener("error", fallback, { once: true });
      container.replaceChildren(player);
      window.setTimeout(() => {
        if (player.isConnected && player.childElementCount === 0 && !player.shadowRoot) fallback();
      }, 9000);
    } catch (error) {
      console.error("Could not render FoldBook mascot:", error);
      fallback();
    }
  });
}

function appendChatMessage(text, kind) {
  const article = document.createElement("article");
  const paragraph = document.createElement("p");
  article.className = `chat-message ${kind === "assistant" ? "assistant-message" : "user-message"}`;
  paragraph.textContent = text;
  article.append(paragraph);
  if (kind === "assistant") {
    const listen = document.createElement("button");
    listen.type = "button";
    listen.className = "listen-button";
    listen.textContent = "🔊 Listen";
    article.append(listen);
  }
  chatMessages.append(article);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return article;
}

async function retrieveCourseMaterialContext(courseCode, level, count = 3) {
  if (!supabaseClient) throw new Error("Supabase is unavailable; indexed course materials cannot be loaded.");
  const { data: matchedSegments, error } = await supabaseClient.rpc("match_course_materials", {
    match_course: courseCode,
    match_level: level,
    match_count: count,
  });
  if (error) throw error;
  const context = Array.isArray(matchedSegments)
    ? matchedSegments
      .filter((segment) => segment && typeof segment.content === "string")
      .map((segment) => segment.content)
      .join("\n\n")
      .slice(0, 12000)
    : "";
  if (!context.trim()) throw new Error(`No indexed materials were found for ${courseCode} (${level}).`);
  return context;
}

async function callGeminiRAG(userMessage, courseCode, level) {
  let contextText = "";
  try {
    contextText = await retrieveCourseMaterialContext(courseCode, level);
  } catch (error) {
    console.warn("Course material retrieval failed; continuing without retrieved notes:", error);
  }
  const systemInstruction = `You are Dr. Eco, the official AI Study Buddy for the UNIUYO Department of Economics. Tutor a ${level} student in ${courseCode}. Use the supplied course notes where relevant. If the notes do not cover a point, say so and provide clearly identified general guidance rather than inventing course-specific facts. Include a concise UNIUYO exam or continuous-assessment marking tip when appropriate.`;
  const prompt = `Level: ${level}\nCourse: ${courseCode}\nUNIUYO course notes:\n${contextText || "(No matching course notes were found.)"}\n\nQuestion: ${userMessage}`;
  const response = await fetch("/api/dr-eco", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}): ${data.error?.message || response.statusText}`);
  }
  const answer = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((text) => typeof text === "string")
    .join("\n")
    .trim();
  if (!answer) throw new Error("Gemini returned no text for this response.");
  return answer;
}

function parseGeneratedQuestions(text, count) {
  const jsonText = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(jsonText);
  if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length < count) {
    throw new Error(`The AI response did not include all ${count} requested questions.`);
  }
  const questions = parsed.questions.slice(0, count);
  for (const question of questions) {
    if (typeof question.prompt !== "string" || !question.prompt.trim()
      || !Array.isArray(question.answers) || question.answers.length < 2
      || question.answers.some((answer) => typeof answer !== "string" || !answer.trim())
      || !Number.isInteger(question.correctAnswer)
      || question.correctAnswer < 0 || question.correctAnswer >= question.answers.length) {
      throw new Error("The AI returned an invalid question format.");
    }
  }
  return questions;
}

async function generateQuestionsFromMaterials(count, courseCode, level) {
  const contextText = await retrieveCourseMaterialContext(courseCode, level, 5);
  const response = await fetch("/api/dr-eco", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: "Generate accurate course practice questions only from the supplied notes. Return only valid JSON with a top-level questions array. Each item must contain prompt (string), answers (array of 3 or 4 strings), correctAnswer (zero-based integer), and lecturerTip (short string)." }] },
      contents: [{
        role: "user",
        parts: [{ text: `Create ${count} varied multiple-choice questions for ${level} ${courseCode}. Do not invent facts beyond these notes.\n\nIndexed course materials:\n${contextText}` }],
      }],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Quiz generation failed (${response.status}): ${data.error?.message || response.statusText}`);
  }
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((part) => typeof part === "string")
    .join("\n");
  if (!text) throw new Error("The AI returned no practice questions.");
  return parseGeneratedQuestions(text, count);
}

let chatRequestInProgress = false;
async function submitChatQuestion(question) {
  const cleaned = question.trim();
  if (!cleaned || chatRequestInProgress) return;
  const hasDemoPass = studyProgress.demoPassExpiresAt > Date.now();
  if (!hasDemoPass && studyProgress.fuel < 2) {
    document.querySelector("#fuelStatus").textContent = "Your demo fuel is empty. Open the fuel panel to see the pass simulations.";
    document.querySelector("#fuel").hidden = false;
    return;
  }
  appendChatMessage(cleaned, "user");
  chatRequestInProgress = true;
  if (!hasDemoPass) studyProgress.fuel = Math.max(0, studyProgress.fuel - 2);
  saveStudyProgress();
  updateFuelDisplay();
  const responseMessage = appendChatMessage("Checking the course materials…", "assistant");
  try {
    const answer = await callGeminiRAG(cleaned, chatCourseCode, currentStudentLevel);
    responseMessage.querySelector("p").textContent = answer;
    sfx.msg();
    if (/generate|quiz|10.?q/i.test(cleaned)) {
      try {
        practiceQuestions = await generateQuestionsFromMaterials(10, chatCourseCode, currentStudentLevel);
        testState.index = 0;
        testState.count = practiceQuestions.length;
        testState.hearts = 3;
        testDrawer.hidden = false;
        renderTestQuestion();
      } catch (quizError) {
        console.error("Could not generate a course quiz:", quizError);
        appendChatMessage(`Quiz unavailable: ${quizError.message}`, "assistant");
      }
    }
  } catch (error) {
    console.error("Dr. Eco could not answer the question:", error);
    responseMessage.querySelector("p").textContent = `Dr. Eco could not respond: ${error.message}`;
  } finally {
    chatRequestInProgress = false;
  }
}

const chatMessages = document.querySelector("#chatMessages");
document.querySelector("#chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (chatRequestInProgress) return;
  const input = document.querySelector("#chatInput");
  submitChatQuestion(input.value);
  input.value = "";
});
document.querySelector("#chatPrompts").addEventListener("click", (event) => {
  const prompt = event.target.closest("[data-prompt]");
  if (prompt) submitChatQuestion(prompt.dataset.prompt);
});
chatMessages.addEventListener("click", (event) => {
  if (!event.target.closest(".listen-button")) return;
  const text = event.target.closest(".chat-message").querySelector("p").textContent;
  if (!("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") {
    appendChatMessage("Text-to-speech is not supported by this browser.", "assistant");
    return;
  }
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new window.SpeechSynthesisUtterance(text));
});
let voiceRecognition = null;
document.querySelector("#voiceToggle").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (button.getAttribute("aria-pressed") === "true") {
    if (voiceRecognition) voiceRecognition.stop();
    button.setAttribute("aria-pressed", "false");
    button.textContent = "🎙️ Voice mode: off";
    return;
  }
  if (!Recognition) {
    document.querySelector("#chatInput").placeholder = "Voice recognition is unavailable; type your question";
    return;
  }
  voiceRecognition = new Recognition();
  voiceRecognition.lang = "en";
  voiceRecognition.onresult = (resultEvent) => {
    const transcript = resultEvent.results[0][0].transcript;
    document.querySelector("#chatInput").value = transcript;
    submitChatQuestion(transcript);
  };
  voiceRecognition.onerror = (errorEvent) => {
    console.error("Voice recognition failed:", errorEvent.error);
    button.textContent = "🎙️ Voice mode: unavailable";
    button.setAttribute("aria-pressed", "false");
  };
  voiceRecognition.onend = () => {
    button.setAttribute("aria-pressed", "false");
    button.textContent = "🎙️ Voice mode: off";
  };
  try {
    voiceRecognition.start();
    button.setAttribute("aria-pressed", "true");
    button.textContent = "🎙️ Listening…";
  } catch (error) {
    console.error("Voice recognition could not start:", error);
    button.setAttribute("aria-pressed", "false");
    button.textContent = "🎙️ Voice mode: unavailable";
    document.querySelector("#chatInput").placeholder = "Microphone unavailable; type your question";
  }
});
document.querySelector("#micButton").addEventListener("click", () => document.querySelector("#voiceToggle").click());

const testDrawer = document.querySelector("#tdr");
const testState = { index: 0, count: 5, hearts: 3, answered: false };
const testAnswerDrawer = document.querySelector("#testAnswerDrawer");
const testFeedbackHeading = document.querySelector("#testFeedbackHeading");
function renderTestQuestion() {
  const question = practiceQuestions[testState.index];
  if (!question) return;
  document.querySelector("#testProgress").textContent = `${Math.min(testState.index + 1, testState.count)} / ${testState.count}`;
  document.querySelector("#testBar").style.width = `${(testState.index / testState.count) * 100}%`;
  document.querySelector("#testHearts").textContent = "❤️".repeat(testState.hearts) + "🖤".repeat(3 - testState.hearts);
  document.querySelector("#testQuestion").textContent = question.prompt;
  document.querySelector("#testFeedback").textContent = "";
  testFeedbackHeading.textContent = "";
  testAnswerDrawer.classList.toggle("on", false);
  testAnswerDrawer.classList.toggle("is-correct", false);
  testAnswerDrawer.classList.toggle("is-wrong", false);
  document.querySelector("#lecturerTip").textContent = question.lecturerTip || "Define the key economic concept, then apply it to the question.";
  document.querySelector("#testOptions").replaceChildren();
  testState.answered = false;
  const next = document.querySelector("#nextTestQuestion");
  next.disabled = true;
  next.textContent = "Continue";
  question.answers.forEach((answer, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "answer-option";
    option.textContent = answer;
    option.addEventListener("click", () => {
      if (testState.answered) return;
      testState.answered = true;
      for (const item of document.querySelector("#testOptions").children) item.disabled = true;
      if (index === question.correctAnswer) {
        option.classList.add("is-correct");
        document.querySelector("#testFeedback").textContent = "Correct — state the principle, then show how it applies.";
        testFeedbackHeading.textContent = "Correct!";
        testAnswerDrawer.classList.add("is-correct");
        document.querySelector("#lecturerTip").textContent = "A definition plus a short application usually earns clearer marks than a list of keywords.";
        sfx.ok();
      } else {
        testState.hearts -= 1;
        document.querySelector("#testFeedback").textContent = `Not quite. Correct answer: ${question.answers[question.correctAnswer]}.`;
        testFeedbackHeading.textContent = "Not quite";
        testAnswerDrawer.classList.add("is-wrong");
        document.querySelector("#lecturerTip").textContent = "When correcting an answer, name the concept and explain why the other option does not fit.";
        sfx.no();
      }
      testAnswerDrawer.classList.add("on");
      document.querySelector("#testHearts").textContent = "❤️".repeat(testState.hearts) + "🖤".repeat(3 - testState.hearts);
      next.disabled = false;
    });
    document.querySelector("#testOptions").append(option);
  });
}
document.querySelector("#openTest").addEventListener("click", async () => {
  testState.index = 0;
  const requestedCount = Number(document.querySelector("#questionCount").value);
  testState.count = requestedCount;
  testState.hearts = 3;
  testDrawer.hidden = false;
  document.querySelector("#testQuestion").textContent = "Loading indexed course materials and generating questions…";
  document.querySelector("#testOptions").replaceChildren();
  try {
    practiceQuestions = await generateQuestionsFromMaterials(requestedCount, chatCourseCode, currentStudentLevel);
    testState.count = practiceQuestions.length;
    renderTestQuestion();
  } catch (error) {
    console.error("Could not generate practice questions:", error);
    document.querySelector("#testProgress").textContent = "PRACTICE UNAVAILABLE";
    document.querySelector("#testQuestion").textContent = `Could not generate questions: ${error.message}`;
  }
});
document.querySelector("#closeTest").addEventListener("click", () => { testDrawer.hidden = true; });
document.querySelector("#questionCount").addEventListener("change", (event) => {
  testState.count = Number(event.currentTarget.value);
});
document.querySelector("#nextTestQuestion").addEventListener("click", () => {
  if (!testState.answered) return;
  if (testState.hearts === 0 || testState.index + 1 >= testState.count) {
    document.querySelector("#testProgress").textContent = `PRACTICE COMPLETE · ${testState.index + 1} / ${testState.count}`;
    document.querySelector("#testBar").style.width = "100%";
    document.querySelector("#testQuestion").textContent = testState.hearts === 0 ? "Out of hearts — review the feedback and try again." : "Practice complete. Keep reviewing indexed course materials.";
    document.querySelector("#testOptions").replaceChildren();
    document.querySelector("#testFeedback").textContent = "Practice only; this is not an official exam score.";
    document.querySelector("#nextTestQuestion").disabled = true;
    return;
  }
  testState.index += 1;
  renderTestQuestion();
});

const fuelDialog = document.querySelector("#fuel");
document.querySelector("#pFuel").addEventListener("click", () => { fuelDialog.hidden = false; });
document.querySelector("#closeFuel").addEventListener("click", () => { fuelDialog.hidden = true; });
for (const button of document.querySelectorAll(".pass-button")) {
  button.addEventListener("click", () => {
    document.querySelector("#fuelStatus").textContent = `${button.dataset.plan} selected in demo mode. No payment was processed and no pass activated.`;
  });
}

const inviteBase = `${window.location.origin}${window.location.pathname}`;
const inviteLink = `${inviteBase}?invite=foldbook-demo`;
document.querySelector("#inviteLink").textContent = inviteLink;
document.querySelector("#shareInvite").href = `https://wa.me/?text=${encodeURIComponent(`Study with me on FoldBook: ${inviteLink}`)}`;
function renderInviteProgress() {
  const count = Math.min(5, studyProgress.inviteCount);
  document.querySelector("#inviteCount").textContent = `${count} / 5`;
  document.querySelector("#inviteBar").style.width = `${count * 20}%`;
  const friends = document.querySelector("#inviteFriends");
  friends.replaceChildren();
  for (let index = 0; index < 5; index += 1) {
    const badge = document.createElement("span");
    badge.className = `invite-friend${index < count ? " is-joined" : ""}`;
    badge.textContent = index < count ? "✓" : "＋";
    badge.setAttribute("aria-label", index < count ? `Demo friend ${index + 1} counted` : `Invite slot ${index + 1}`);
    friends.append(badge);
  }
}
document.querySelector("#copyInvite").addEventListener("click", async () => {
  try {
    await window.navigator.clipboard.writeText(inviteLink);
    document.querySelector("#inviteStatus").textContent = "Sample invite link copied.";
  } catch (error) {
    console.error("Could not copy invite link:", error);
    document.querySelector("#inviteStatus").textContent = "Copy is unavailable. Select and copy the link above.";
  }
});
document.querySelector("#simulateInvite").addEventListener("click", () => {
  studyProgress.inviteCount = Math.min(5, studyProgress.inviteCount + 1);
  if (studyProgress.inviteCount === 5 && studyProgress.demoPassExpiresAt <= Date.now()) {
    studyProgress.demoPassExpiresAt = Date.now() + 48 * 60 * 60 * 1000;
    studyProgress.fuel = 100;
  }
  saveStudyProgress();
  renderInviteProgress();
  updateFuelDisplay();
  document.querySelector("#inviteStatus").textContent = studyProgress.inviteCount === 5
    ? "Demo reward unlocked: 48-hour unlimited study fuel. This is a local simulation, not a real pass."
    : "Demo friend counted locally; real sign-ups are not verified.";
});

const soundEnabled = studyProgress.soundEnabled;
soundOn = soundEnabled;
syncCourseControls();
renderStudyPath();
updateStudySummary();
renderMascot("person", "chatMascot");
renderInviteProgress();
chatMessages.replaceChildren();
appendChatMessage("Hello! I’m Dr. Eco. Ask me about your course, or request practice questions generated from indexed notes.", "assistant");
setNavigationAvailable(false);

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

const LEADERBOARD_CLIENT_ID_KEY = "foldBook.leaderboardClientId";
function getLeaderboardClientId() {
  try {
    const savedId = window.localStorage.getItem(LEADERBOARD_CLIENT_ID_KEY);
    if (savedId && /^[0-9a-f-]{36}$/i.test(savedId)) return savedId;
    const clientId = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
        const random = Math.floor(Math.random() * 16);
        return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
      });
    window.localStorage.setItem(LEADERBOARD_CLIENT_ID_KEY, clientId);
    return clientId;
  } catch (error) {
    console.error("Could not initialize this browser's leaderboard identity:", error);
    throw new Error("Leaderboard storage is unavailable in this browser.");
  }
}

async function syncLeaderboardEntry() {
  if (!currentStudent || !supabaseClient) {
    leaderboardStatus.textContent = "Leaderboard unavailable until Supabase is configured and you sign in.";
    return;
  }
  try {
    const id = getLeaderboardClientId();
    const { error: upsertError } = await supabaseClient.from("student_xp").upsert({
      id,
      display_name: `Learner-${id.slice(-4).toUpperCase()}`,
      xp: studyProgress.xp,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (upsertError) throw upsertError;

    const { data, error } = await supabaseClient
      .from("student_xp")
      .select("id, display_name, xp")
      .order("xp", { ascending: false });
    if (error) throw error;
    const sorted = (Array.isArray(data) ? data : [])
      .filter((entry) => typeof entry.display_name === "string" && Number.isFinite(entry.xp))
      .sort((left, right) => right.xp - left.xp);
    const ownRank = sorted.findIndex((entry) => entry.id === id) + 1;
    leaderboardEntries = sorted.slice(0, 10).map((entry, index) => ({
      name: entry.display_name,
      xp: entry.xp,
      rank: index + 1,
      isCurrentUser: entry.id === id,
    }));
    if (ownRank > 10) {
      const ownEntry = sorted[ownRank - 1];
      leaderboardEntries.push({
        name: ownEntry.display_name,
        xp: ownEntry.xp,
        rank: ownRank,
        isCurrentUser: true,
      });
    }
    leaderboardStatus.textContent = "Live browser-submitted XP rankings. Names are shown as anonymous aliases.";
    renderLeaderboard();
  } catch (error) {
    console.error("Leaderboard sync failed:", error);
    leaderboardStatus.textContent = `Leaderboard could not be loaded: ${error.message || "Supabase request failed."}`;
  }
}

const resultsForm = document.querySelector("#lookupForm");
const registrationInput = document.querySelector("#searchRegNo");
const chatRegistrationInput = document.querySelector("#chatRegistration");
const fullNameInput = document.querySelector("#searchFullName");
const resultsStatus = document.querySelector("#results-status");
const resultsPanel = document.querySelector("#results-panel");
const adminPanel = document.querySelector("#adminDashboard");
const adminStatus = document.querySelector("#adminStatus");
const adminSearch = document.querySelector("#adminSearch");
const adminResults = document.querySelector("#adminResults");
const adminStudentDetail = document.querySelector("#adminStudentDetail");
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
const adminLevelSelect = document.querySelector("#adminLevelSelect");
const adminCourseSelect = document.querySelector("#adminCourseSelect");
const adminMaterialTitle = document.querySelector("#adminMaterialTitle");
const adminMaterialText = document.querySelector("#adminMaterialText");
const adminMaterialStatus = document.querySelector("#adminMaterialStatus");
const adminMaterialSubmit = document.querySelector("#adminMaterialSubmit");
let activeCardContext = null;
let verificationTrigger = null;

async function handleIndexMaterialSubmit() {
  const level = adminLevelSelect.value;
  const courseCode = adminCourseSelect.value;
  const title = adminMaterialTitle.value.trim();
  const text = adminMaterialText.value.trim();

  if (!title || !text || !coursesForLevel(level).some((course) => course.code === courseCode)) {
    sfx.no();
    adminMaterialStatus.textContent = "Choose a valid level and course, and fill in both the title and course content.";
    return;
  }
  if (!supabaseClient) {
    sfx.no();
    adminMaterialStatus.textContent = "Supabase is unavailable or misconfigured. Material was not saved.";
    console.error("Supabase client is unavailable; course material was not indexed.");
    return;
  }

  adminMaterialSubmit.disabled = true;
  adminMaterialStatus.textContent = "Indexing content into the course materials table...";
  try {
    const { error } = await supabaseClient.from("course_materials").insert([{
      level,
      course_code: courseCode,
      title,
      content: text,
    }]);
    if (error) throw error;

    sfx.win();
    adminMaterialStatus.textContent = `Successfully indexed "${title}" under ${level} (${courseCode}).`;
    adminMaterialTitle.value = "";
    adminMaterialText.value = "";
  } catch (error) {
    sfx.no();
    console.error("Course material insert failed:", error);
    adminMaterialStatus.textContent = `Error saving material: ${error.message || "Supabase request failed."}`;
  } finally {
    adminMaterialSubmit.disabled = false;
  }
}

adminLevelSelect.addEventListener("change", updateAdminCourseDropdown);
adminMaterialSubmit.addEventListener("click", handleIndexMaterialSubmit);
updateAdminCourseDropdown();
chatRegistrationInput.addEventListener("input", () => {
  registrationInput.value = chatRegistrationInput.value;
  setStudentRegistration(chatRegistrationInput.value.trim().toUpperCase());
});
registrationInput.addEventListener("input", () => {
  chatRegistrationInput.value = registrationInput.value;
  setStudentRegistration(registrationInput.value.trim().toUpperCase());
});
setStudentRegistration(chatRegistrationInput.value);

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
  adminPanel.hidden = true;
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
  adminPanel.hidden = true;
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

async function lookupImportedStudentResults(registration) {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient.from("student_results")
    .select("reg_number, full_name, course_code, course_title, ca, exam, total, grade, remark")
    .eq("reg_number", registration);
  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) return null;
  const name = data[0].full_name;
  if (data.some((row) => row.full_name !== name)) {
    throw new Error("Imported results have inconsistent student names for this registration.");
  }
  return {
    name,
    results: data.map((row) => ({
      course: row.course_code,
      course_title: row.course_title,
      ca: row.ca,
      exam: row.exam,
      total: row.total,
      grade: row.grade || gradeForScore(row.total),
      remark: row.remark || (row.total >= 40 ? "PASS" : "FAIL"),
    })),
  };
}

function showAdminStudent(registration, student) {
  const detailName = document.querySelector("#adminStudentName");
  const detailRegistration = document.querySelector("#adminStudentRegistration");
  const detailCourses = document.querySelector("#adminStudentCourses");
  detailName.textContent = student.name;
  detailRegistration.textContent = registration;
  detailCourses.replaceChildren();
  for (const result of student.results) {
    const row = document.createElement("tr");
    const course = document.createElement("td");
    const score = document.createElement("td");
    const grade = document.createElement("td");
    const remark = document.createElement("td");
    course.textContent = `${result.course} · ${result.course_title}`;
    score.textContent = String(result.total);
    grade.textContent = result.grade || gradeForScore(result.total);
    remark.textContent = result.remark || (result.total >= 40 ? "PASS" : "FAIL");
    row.append(course, score, grade, remark);
    detailCourses.append(row);
  }
  adminStudentDetail.hidden = false;
}

function renderAdminDirectory(filter = "") {
  const normalizedFilter = filter.trim().toLocaleLowerCase();
  adminResults.replaceChildren();
  for (const [registration, student] of Object.entries(RESULT_LOOKUP || {})) {
    if (normalizedFilter && !`${registration} ${student.name}`.toLocaleLowerCase().includes(normalizedFilter)) continue;
    const row = document.createElement("tr");
    const name = document.createElement("td");
    const reg = document.createElement("td");
    const courses = document.createElement("td");
    const action = document.createElement("td");
    const viewButton = document.createElement("button");
    name.textContent = student.name;
    reg.textContent = registration;
    courses.textContent = String(student.results.length);
    viewButton.type = "button";
    viewButton.className = "result-card-button";
    viewButton.textContent = "View broadsheet";
    viewButton.addEventListener("click", () => showAdminStudent(registration, student));
    action.append(viewButton);
    row.append(name, reg, courses, action);
    adminResults.append(row);
  }
  adminStudentDetail.hidden = true;
  resultsPanel.hidden = true;
  posterWrapper.hidden = true;
  adminStatus.textContent = `${adminResults.children.length} broadsheet record${adminResults.children.length === 1 ? "" : "s"} available in this static preview.`;
}

let selectedBroadsheetFile = null;
const broadsheetInput = document.querySelector("#broadsheetFile");
const broadsheetDropzone = document.querySelector("#broadsheetDropzone");
const broadsheetStatus = document.querySelector("#broadsheetStatus");
const broadsheetImportButton = document.querySelector("#importBroadsheet");

function setSelectedBroadsheet(file) {
  if (!file) return;
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
    selectedBroadsheetFile = null;
    broadsheetStatus.textContent = "Choose a CSV, XLSX or XLS broadsheet.";
    return;
  }
  selectedBroadsheetFile = file;
  broadsheetStatus.textContent = `Selected: ${file.name}`;
}

broadsheetInput.addEventListener("change", () => setSelectedBroadsheet(broadsheetInput.files?.[0]));
broadsheetDropzone.addEventListener("dragover", (event) => event.preventDefault());
broadsheetDropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  setSelectedBroadsheet(event.dataTransfer?.files?.[0]);
});

function normalizeBroadsheetRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("The broadsheet contains no score rows.");
  const aliases = {
    reg_number: ["reg_number", "registration", "registration_number", "matric", "matric_number", "reg"],
    full_name: ["full_name", "name", "student_name"],
    course_code: ["course_code", "course", "code"],
    course_title: ["course_title", "title"],
    ca: ["ca", "continuous_assessment"],
    exam: ["exam", "examination"],
    total: ["total", "score"],
    level: ["level", "academic_level"],
  };
  return rows.map((rawRow, index) => {
    const normalized = Object.fromEntries(Object.entries(rawRow).map(([key, value]) => [
      key.trim().toLowerCase().replace(/[\s-]+/g, "_"),
      value,
    ]));
    const get = (key) => {
      const match = aliases[key].find((alias) => Object.hasOwn(normalized, alias));
      return match ? String(normalized[match]).trim() : "";
    };
    const regNumber = normalizeRegistration(get("reg_number"));
    const fullName = get("full_name");
    const courseCode = get("course_code").toUpperCase();
    const courseTitle = get("course_title");
    const rawCa = get("ca");
    const rawExam = get("exam");
    const rawTotal = get("total");
    const ca = Number(rawCa);
    const exam = Number(rawExam);
    const total = Number(rawTotal);
    const level = get("level") || detectStudentLevel(regNumber);
    if (!regNumber || !fullName || !courseCode || !courseTitle
      || !rawCa || !rawExam || !rawTotal
      || !Number.isInteger(ca) || ca < 0 || ca > 30
      || !Number.isInteger(exam) || exam < 0 || exam > 70
      || !Number.isInteger(total) || total < 0 || total > 100
      || !UNIUYO_COURSE_CATALOG[level]) {
      throw new Error(`Broadsheet row ${index + 2} has missing or invalid student, course or score data.`);
    }
    return {
      reg_number: regNumber,
      full_name: fullName,
      course_code: courseCode,
      course_title: courseTitle,
      ca,
      exam,
      total,
      grade: gradeForScore(total),
      remark: total >= 40 ? "PASS" : "FAIL",
      level,
    };
  });
}

broadsheetImportButton.addEventListener("click", async () => {
  if (!S.isAdmin) {
    showAccessRestrictedNotice();
    return;
  }
  if (!selectedBroadsheetFile) {
    broadsheetStatus.textContent = "Choose a broadsheet file before importing.";
    return;
  }
  if (!window.XLSX) {
    broadsheetStatus.textContent = "The spreadsheet parser did not load. Refresh the page and try again.";
    return;
  }
  broadsheetImportButton.disabled = true;
  try {
    const bytes = await selectedBroadsheetFile.arrayBuffer();
    const workbook = window.XLSX.read(bytes, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("The selected file has no worksheet.");
    const records = normalizeBroadsheetRows(window.XLSX.utils.sheet_to_json(sheet, { defval: "" }));
    if (!supabaseClient) throw new Error("Supabase is not configured.");
    const { error } = await supabaseClient.from("student_results")
      .upsert(records, { onConflict: "reg_number,course_code" });
    if (error) throw error;
    broadsheetStatus.textContent = `Imported ${records.length} score records successfully.`;
    selectedBroadsheetFile = null;
    broadsheetInput.value = "";
  } catch (error) {
    console.error("Broadsheet import failed:", error);
    broadsheetStatus.textContent = `Import failed: ${error.message || "Supabase request failed."}`;
  } finally {
    broadsheetImportButton.disabled = false;
  }
});

async function loadCourseCatalog() {
  const status = document.querySelector("#catalogStatus");
  const table = document.querySelector("#catalogCourses");
  if (!supabaseClient) {
    status.textContent = "Supabase is unavailable; course catalog could not be loaded.";
    return;
  }
  try {
    const { data, error } = await supabaseClient.from("course_catalog")
      .select("level, course_code, title, credit_units")
      .order("level");
    if (error) throw error;
    if (Array.isArray(data) && data.length > 0) {
      UNIUYO_COURSE_CATALOG = Object.fromEntries(["100L", "200L", "300L", "400L"].map((level) => [
        level,
        data.filter((course) => course.level === level).map((course) => ({
          code: course.course_code,
          title: course.title,
          units: course.credit_units,
        })),
      ]));
    }
    table.replaceChildren();
    for (const level of ["100L", "200L", "300L", "400L"]) {
      for (const course of coursesForLevel(level)) {
        const row = document.createElement("tr");
        [level, course.code, course.title, String(course.units)].forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.append(cell);
        });
        const actionCell = document.createElement("td");
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "result-card-button";
        deleteButton.textContent = "Remove";
        deleteButton.addEventListener("click", async () => {
          if (!S.isAdmin) {
            showAccessRestrictedNotice();
            return;
          }
          try {
            const { error: deleteError } = await supabaseClient.from("course_catalog")
              .delete()
              .eq("level", level)
              .eq("course_code", course.code);
            if (deleteError) throw deleteError;
            UNIUYO_COURSE_CATALOG[level] = UNIUYO_COURSE_CATALOG[level]
              .filter((item) => item.code !== course.code);
            await loadCourseCatalog();
          } catch (deleteError) {
            console.error("Course catalog delete failed:", deleteError);
            status.textContent = `Could not remove course: ${deleteError.message || "Supabase request failed."}`;
          }
        });
        actionCell.append(deleteButton);
        row.append(actionCell);
        table.append(row);
      }
    }
    updateAdminCourseDropdown();
    status.textContent = `Loaded ${table.children.length} courses.`;
  } catch (error) {
    console.error("Course catalog fetch failed:", error);
    status.textContent = `Could not load the course catalog: ${error.message || "Supabase request failed."}`;
  }
}

document.querySelector("#saveCatalogCourse").addEventListener("click", async () => {
  const level = document.querySelector("#catalogLevel").value;
  const code = document.querySelector("#catalogCode").value.trim().toUpperCase();
  const title = document.querySelector("#catalogTitle").value.trim();
  const units = Number(document.querySelector("#catalogUnits").value);
  const status = document.querySelector("#catalogStatus");
  if (!S.isAdmin) {
    showAccessRestrictedNotice();
    return;
  }
  if (!UNIUYO_COURSE_CATALOG[level] || !/^[A-Z]{2,5}\s?\d{3,4}$/i.test(code)
    || !title || !Number.isInteger(units) || units < 1 || units > 12) {
    status.textContent = "Enter a valid level, course code, title and credit unit count.";
    return;
  }
  if (!supabaseClient) {
    status.textContent = "Supabase is unavailable; this course was not saved.";
    return;
  }
  try {
    const { error } = await supabaseClient.from("course_catalog").upsert({
      level,
      course_code: code,
      title,
      credit_units: units,
    }, { onConflict: "level,course_code" });
    if (error) throw error;
    const courses = UNIUYO_COURSE_CATALOG[level].filter((course) => course.code !== code);
    courses.push({ code, title, units });
    UNIUYO_COURSE_CATALOG[level] = courses;
    document.querySelector("#catalogCode").value = "";
    document.querySelector("#catalogTitle").value = "";
    status.textContent = `Saved ${code} under ${level}.`;
    await loadCourseCatalog();
  } catch (error) {
    console.error("Course catalog save failed:", error);
    status.textContent = `Could not save course: ${error.message || "Supabase request failed."}`;
  }
});

async function loadStudentRecords() {
  const status = document.querySelector("#studentRecordsStatus");
  const tableBody = document.querySelector("#studentRecords");
  if (!S.isAdmin) {
    showAccessRestrictedNotice();
    return;
  }
  if (!supabaseClient) {
    status.textContent = "Supabase is unavailable; student records could not be loaded.";
    return;
  }
  status.textContent = "Loading consented WhatsApp records…";
  try {
    const { data, error } = await supabaseClient.from("whatsapp_optins")
      .select("full_name, reg_number, phone_number, streak_count, last_nudged_at")
      .eq("opted_in", true)
      .order("full_name");
    if (error) throw error;
    tableBody.replaceChildren();
    for (const student of data || []) {
      const row = document.createElement("tr");
      [
        student.full_name,
        student.reg_number,
        student.phone_number,
        String(student.streak_count || 1),
        student.last_nudged_at ? new Date(student.last_nudged_at).toLocaleString() : "Not yet",
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value || "—";
        row.append(cell);
      });
      tableBody.append(row);
    }
    status.textContent = `Loaded ${tableBody.children.length} consented contacts.`;
  } catch (error) {
    console.error("Student contact fetch failed:", error);
    status.textContent = `Could not load student records: ${error.message || "Supabase access denied."}`;
  }
}
document.querySelector("#loadStudentRecords").addEventListener("click", loadStudentRecords);

function normalizeWhatsAppPhone(phoneNumber) {
  const digits = phoneNumber.replace(/\D/g, "");
  const formattedPhone = digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
  return /^234[789]\d{9}$/.test(formattedPhone) ? formattedPhone : "";
}

async function saveWhatsAppOptIn(phoneNumber, regNumber, fullName) {
  if (!phoneNumber) return false;

  try {
    const formattedPhone = normalizeWhatsAppPhone(phoneNumber);
    if (!formattedPhone) throw new Error("Enter a valid Nigerian mobile number.");
    if (!supabaseClient) throw new Error("The opt-in service is unavailable.");

    const { error } = await supabaseClient
      .from("whatsapp_optins")
      .upsert({
        phone_number: formattedPhone,
        whatsapp_number: formattedPhone,
        reg_number: regNumber,
        full_name: fullName,
        streak_count: studyProgress.streak || 1,
        activity_count: studyProgress.activityDays.length,
        last_activity_at: studyProgress.lastStudyDate ? new Date(`${studyProgress.lastStudyDate}T00:00:00`).toISOString() : null,
        opted_in: true,
      }, { onConflict: "phone_number" });
    if (error) throw error;
    console.info("WhatsApp number saved for daily study reminders.");
    return true;
  } catch (error) {
    console.warn("WhatsApp opt-in error:", error.message);
    return false;
  }
}

whatsappForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeCardContext) return;

  const whatsappNumber = whatsappInput.value.trim();
  if (!normalizeWhatsAppPhone(whatsappNumber)) {
    whatsappStatus.textContent = "Enter a valid Nigerian mobile number, for example 08012345678.";
    whatsappInput.focus();
    return;
  }
  if (!whatsappConsent.checked) {
    whatsappStatus.textContent = "Please agree to the WhatsApp reminder opt-in before continuing.";
    whatsappConsent.focus();
    return;
  }

  const { registration, student, result } = activeCardContext;
  const courseData = { registration, student, result };
  const submitButton = whatsappForm.querySelector('button[type="submit"]');
  const cancelButton = document.querySelector("#cancel-whatsapp");
  const closeButton = document.querySelector("#close-verification");
  submitButton.disabled = true;
  cancelButton.disabled = true;
  closeButton.disabled = true;
  whatsappStatus.textContent = "Saving your reminder opt-in…";

  let optInSaved = false;
  try {
    optInSaved = await saveWhatsAppOptIn(whatsappNumber, registration, student.name);
  } finally {
    submitButton.disabled = false;
    cancelButton.disabled = false;
    closeButton.disabled = false;
  }

  generateSevenFoldExportCard(courseData);
  if (!optInSaved) {
    resultsStatus.textContent = "Your result card was created, but the WhatsApp reminder opt-in could not be saved.";
  }
});

document.querySelector("#cancel-whatsapp").addEventListener("click", closeVerification);
document.querySelector("#close-verification").addEventListener("click", closeVerification);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!authModal.hidden) closeVerification();
  else if (!testDrawer.hidden) testDrawer.hidden = true;
  else if (!fuelDialog.hidden) fuelDialog.hidden = true;
});
document.querySelector("#print-card").addEventListener("click", () => window.print());
document.querySelector("#dismiss-card").addEventListener("click", () => {
  posterWrapper.hidden = true;
});
function signOut() {
  currentStudent = null;
  isMasterAdmin = false;
  S.isAdmin = false;
  S.student = null;
  S.phoneNumber = "";
  window.localStorage.removeItem(AUTH_SESSION_KEY);
  showStage("landingView");
}

document.querySelector("#adminLogout").addEventListener("click", signOut);
adminSearch.addEventListener("input", () => renderAdminDirectory(adminSearch.value));

resultsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  resultsStatus.textContent = "";

  const registration = normalizeRegistration(registrationInput.value);
  const inputNameTokens = normalizeNameTokens(fullNameInput.value);
  if (!registration || inputNameTokens.length < 2) {
    setResultsMessage("Invalid Registration Number or Full Name combination. Please verify your details.");
    registrationInput.focus();
    return;
  }

  let matchedStudent = RESULT_LOOKUP && Object.hasOwn(RESULT_LOOKUP, registration)
    ? RESULT_LOOKUP[registration]
    : null;
  if (!matchedStudent) {
    try {
      matchedStudent = await lookupImportedStudentResults(registration);
    } catch (error) {
      console.error("Imported results lookup failed:", error);
      setResultsMessage(`Could not load imported results: ${error.message || "Supabase request failed."}`);
      return;
    }
  }
  const studentNameTokens = matchedStudent ? normalizeNameTokens(matchedStudent.name) : [];
  const isNameMatch = inputNameTokens.every((token) => studentNameTokens.includes(token));
  if (!matchedStudent || !isNameMatch) {
    setResultsMessage("Invalid Registration Number or Full Name combination. Please verify your details.");
    registrationInput.focus();
    return;
  }

  chatRegistrationInput.value = registration;
  renderResults(registration, matchedStudent);
});

document.querySelector("#launchApp").addEventListener("click", () => {
  document.querySelector("#authStatus").textContent = "";
  showStage("authView");
  document.querySelector("#authFullName").focus();
});
document.querySelector("#backToLanding").addEventListener("click", () => showStage("landingView"));

const appAuthForm = document.querySelector("#appAuthForm");
appAuthForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.querySelector("#authFullName").value.trim();
  const rawRegistration = document.querySelector("#authRegNo").value.trim();
  const phone = document.querySelector("#authWhatsapp").value.trim();
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  const consent = document.querySelector("#authMarketingConsent").checked;
  const status = document.querySelector("#authStatus");
  status.textContent = "";

  if (!name || !rawRegistration || !phone) {
    status.textContent = "Enter your full name, registration number and WhatsApp phone number.";
    return;
  }
  if (!normalizedPhone) {
    status.textContent = "Enter a valid Nigerian WhatsApp number, for example 08012345678.";
    return;
  }

  const normalizedName = normalizeNameTokens(name);
  if (rawRegistration === "101010" && normalizedName.length === 1
    && ["nssien", "daniel"].includes(normalizedName[0])) {
    currentStudent = null;
    isMasterAdmin = true;
    S.isAdmin = true;
    S.student = { name, registration: "101010" };
    S.phoneNumber = normalizedPhone;
    window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
      role: "admin",
      name,
      registration: "101010",
    }));
    renderAdminDirectory();
    showStage("adminDashboard");
    return;
  }
  if (!consent) {
    status.textContent = "Consent is required to save this number and send study reminders.";
    document.querySelector("#authMarketingConsent").focus();
    return;
  }

  const registration = normalizeRegistration(rawRegistration);
  const student = registration && RESULT_LOOKUP && Object.hasOwn(RESULT_LOOKUP, registration)
    ? RESULT_LOOKUP[registration]
    : null;
  const nameMatches = student && normalizedName.length > 0
    && normalizedName.every((token) => normalizeNameTokens(student.name).includes(token));
  if (!student || !nameMatches) {
    status.textContent = "Registration number and full name do not match a published student record.";
    return;
  }

  const submitButton = document.querySelector("#authSubmit");
  submitButton.disabled = true;
  status.textContent = "Saving your WhatsApp opt-in…";
  try {
    const saved = await saveWhatsAppOptIn(phone, registration, student.name);
    if (!saved) throw new Error("The WhatsApp opt-in could not be saved. Check the connection and try again.");
    currentStudent = { name: student.name, registration };
    isMasterAdmin = false;
    S.isAdmin = false;
    S.student = currentStudent;
    S.level = detectStudentLevel(registration);
    S.phoneNumber = normalizedPhone;
    currentStudentLevel = S.level;
    chatRegistrationInput.value = registration;
    setStudentRegistration(registration);
    window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
      role: "student",
      name: student.name,
      registration,
      phoneNumber: normalizedPhone,
      level: S.level,
    }));
    showStage("studentApp");
    activateTab("home");
    void syncLeaderboardEntry();
  } catch (error) {
    console.error("Student onboarding failed:", error);
    status.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

function restoreAuthSession() {
  let savedSession;
  try {
    savedSession = window.localStorage.getItem(AUTH_SESSION_KEY);
    if (!savedSession) return false;
    const session = JSON.parse(savedSession);
    if (session.role === "admin" && session.registration === "101010"
      && ["nssien", "daniel"].includes(normalizeNameTokens(session.name)[0])) {
      isMasterAdmin = true;
      S.isAdmin = true;
      S.student = { name: session.name, registration: session.registration };
      renderAdminDirectory();
      showStage("adminDashboard");
      return true;
    }
    const registration = normalizeRegistration(session.registration || "");
    const student = registration && RESULT_LOOKUP && Object.hasOwn(RESULT_LOOKUP, registration)
      ? RESULT_LOOKUP[registration]
      : null;
    if (session.role !== "student" || !student
      || !normalizeNameTokens(student.name).every((token) => normalizeNameTokens(session.name).includes(token))) {
      window.localStorage.removeItem(AUTH_SESSION_KEY);
      return false;
    }
    currentStudent = { name: student.name, registration };
    S.student = currentStudent;
    S.level = detectStudentLevel(registration);
    S.phoneNumber = typeof session.phoneNumber === "string" ? session.phoneNumber : "";
    currentStudentLevel = S.level;
    chatRegistrationInput.value = registration;
    setStudentRegistration(registration);
    showStage("studentApp");
    activateTab("home");
    void syncLeaderboardEntry();
    return true;
  } catch (error) {
    console.error("Could not restore the FoldBook session:", error);
    window.localStorage.removeItem(AUTH_SESSION_KEY);
    return false;
  }
}

document.querySelectorAll("[data-admin-view]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!S.isAdmin) {
      showAccessRestrictedNotice();
      return;
    }
    document.querySelectorAll(".admin-view-panel").forEach((panel) => {
      panel.hidden = panel.id !== `adminView-${button.dataset.adminView}`;
    });
    document.querySelectorAll("[data-admin-view]").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    if (button.dataset.adminView === "catalog") void loadCourseCatalog();
    if (button.dataset.adminView === "students") loadStudentRecords();
  });
});

if (!restoreAuthSession()) showStage("landingView");
if (typeof window.addEventListener === "function") {
  window.addEventListener("hashchange", () => {
    const stage = window.location.hash.slice(1);
    if (stage === "adminDashboard") {
      if (!S.isAdmin) {
        showAccessRestrictedNotice();
        showStage("landingView");
      } else showStage("adminDashboard");
    } else if (stage === "studentApp") {
      if (!currentStudent || S.isAdmin) {
        showAccessRestrictedNotice();
        showStage(currentStudent ? "adminDashboard" : "authView");
      } else showStage("studentApp");
    } else if (["landingView", "authView"].includes(stage)) {
      showStage(stage);
    }
  });
}
