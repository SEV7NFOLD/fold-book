"use strict";

const GEMINI_MODEL = "gemini-3.5-flash-lite";
// Official results are fetched on demand from the server; they are never bundled into client code.
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
let activeStudyProgressKey = STUDY_PROGRESS_KEY;
const STUDENT_MATERIAL_OWNER_KEY = "foldBook.studentMaterialOwner";
const navButtons = [...document.querySelectorAll("[data-tab]")];
const studyPanels = new Map(["home", "chat", "board", "invite"].map((id) => [id, document.querySelector(`#${id}`)]));
const pathTree = document.querySelector("#pathTree");
const lessonPanel = document.querySelector("#lessonPanel");
const lessonStep = document.querySelector("#lessonStep");
const lessonTitle = document.querySelector("#lessonTitle");
const lessonQuestion = document.querySelector("#lessonQuestion");
const answerOptions = document.querySelector("#answerOptions");
const lessonFeedback = document.querySelector("#lessonFeedback");
const lessonFeedbackAnimation = document.querySelector("#lessonFeedbackAnimation");
const courseBar = document.querySelector("#cbar");
const courseProgressBar = document.querySelector(".bar-bg");
const coursePercent = document.querySelector("#cpct");
const courseProgressLottie = document.querySelector("#courseProgressLottie");
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
  streak: 0,
  fuel: 100,
  referralCount: 0,
  referralRewardClaimed: false,
  demoPassExpiresAt: 0,
  lastStudyDate: "",
  activityDays: [],
  soundEnabled: true,
  examRewardClaimed: false,
  attempts: {},
  studyTone: "friendly",
  studyPace: "balanced",
  studyVoice: "Kore",
  quizAttempts: [],
};
let currentCourse = "ECO 128";
let activeModules = STUDY_MODULES;
let currentStudentLevel = "100L";
let chatCourseCode = "ECO 128";
let studentCustomCourses = [];
let currentStudent = null;
let isMasterAdmin = false;
const AUTH_SESSION_KEY = "foldBook.authSession";
const S = {
  isAdmin: false,
  student: null,
  user: null,
  level: "100L",
  phoneNumber: "",
  streak: 0,
  fuel: 100,
  referralCount: 0,
};
let leaderboardEntries = [];
let practiceQuestions = [];
let mockExamQuestions = [];

function updateChatCourseDropdown(preferredCourse = chatCourseCode) {
  const courseSelect = document.querySelector("#chatCourse");
  if (!courseSelect) return;
  const courses = [...coursesForLevel(currentStudentLevel)];
  for (const custom of studentCustomCourses) {
    if (!courses.some((course) => course.code === custom.code)) courses.push(custom);
  }
  courseSelect.replaceChildren(...courses.map((course) => {
    const option = document.createElement("option");
    option.value = course.code;
    option.textContent = course.title ? `${course.code} · ${course.title}` : course.code;
    return option;
  }));
  chatCourseCode = courses.some((course) => course.code === preferredCourse)
    ? preferredCourse
    : courses[0]?.code || "";
  courseSelect.value = chatCourseCode;
}

function setStudentRegistration(registration) {
  currentStudentLevel = detectStudentLevel(registration);
  const levelStatus = document.querySelector("#chatLevel");
  if (levelStatus) levelStatus.textContent = `Detected level: ${currentStudentLevel}`;
  updateChatCourseDropdown(chatCourseCode);
}

function applyStudentLevel(level) {
  if (!/^(100L|200L|300L|400L)$/.test(level || "")) return;
  currentStudentLevel = level;
  const levelStatus = document.querySelector("#chatLevel");
  if (levelStatus) levelStatus.textContent = `Selected level: ${currentStudentLevel}`;
  updateChatCourseDropdown(chatCourseCode);
}

async function refreshLiveCourseCatalog(preferredLevel = currentStudentLevel) {
  try {
    const response = await fetch("/api/course-catalog", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok || !Array.isArray(result.courses)) throw new Error(result.error || "Course catalog unavailable.");
    UNIUYO_COURSE_CATALOG = Object.fromEntries(["100L", "200L", "300L", "400L"].map((level) => [
      level,
      result.courses.filter((course) => course.level === level).map((course) => ({
        code: course.course_code,
        title: course.title,
        units: course.credit_units,
      })),
    ]));
    applyStudentLevel(preferredLevel);
    return true;
  } catch (error) {
    console.warn("Live course catalog refresh failed:", error.message);
    return false;
  }
}

function freshStudyProgress() {
  return {
    ...DEFAULT_STUDY_PROGRESS,
    completed: [],
    courseCompleted: { "ECO 128": [], "ECO 122": [] },
    activityDays: [],
  };
}

function loadStudyProgress(storageKey = STUDY_PROGRESS_KEY) {
  try {
    const saved = window.localStorage.getItem(storageKey)
      || (storageKey === STUDY_PROGRESS_KEY ? window.localStorage.getItem(LEGACY_STUDY_PROGRESS_KEY) : null);
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
    const lastStudyDate = typeof parsed.lastStudyDate === "string" ? parsed.lastStudyDate : "";
    const today = localDateKey();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = localDateKey(yesterdayDate);
    const savedStreak = Number.isFinite(parsed.streak) && parsed.streak >= 1 ? Math.floor(parsed.streak) : 0;
    const currentStreak = lastStudyDate === today || lastStudyDate === yesterday ? savedStreak : 0;
    return {
      ...DEFAULT_STUDY_PROGRESS,
      completed: courseCompleted[course],
      courseCompleted,
      course,
      activityDays: Array.isArray(parsed.activityDays) ? parsed.activityDays.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)) : [],
      xp: Number.isFinite(parsed.xp) && parsed.xp >= 0 ? parsed.xp : 0,
      gems: Number.isFinite(parsed.gems) && parsed.gems >= 0 ? parsed.gems : 0,
      streak: currentStreak,
      fuel: Number.isFinite(parsed.fuel) ? Math.max(0, Math.min(100, parsed.fuel)) : 100,
      referralCount: Number.isFinite(parsed.referralCount)
        ? Math.max(0, Math.floor(parsed.referralCount))
        : Number.isFinite(parsed.inviteCount) ? Math.max(0, Math.floor(parsed.inviteCount)) : 0,
      referralRewardClaimed: parsed.referralRewardClaimed === true,
      demoPassExpiresAt: Number.isFinite(parsed.demoPassExpiresAt) ? parsed.demoPassExpiresAt : 0,
      lastStudyDate,
      soundEnabled: typeof parsed.soundEnabled === "boolean" ? parsed.soundEnabled : true,
      examRewardClaimed: parsed.examRewardClaimed === true,
      attempts: parsed.attempts && typeof parsed.attempts === "object" ? parsed.attempts : {},
      studyTone: ["friendly", "calm", "direct"].includes(parsed.studyTone) ? parsed.studyTone : "friendly",
      studyPace: ["gentle", "balanced", "quick"].includes(parsed.studyPace) ? parsed.studyPace : "balanced",
      studyVoice: ["Kore", "Aoede", "Leda", "Puck", "Orus"].includes(parsed.studyVoice) ? parsed.studyVoice : "Kore",
      quizAttempts: Array.isArray(parsed.quizAttempts) ? parsed.quizAttempts.slice(-60).filter((item) => item && typeof item.course === "string" && typeof item.question === "string" && typeof item.correct === "boolean") : [],
    };
  } catch (error) {
    console.error("Could not load saved Study Buddy progress:", error);
    return freshStudyProgress();
  }
}

const studyProgress = loadStudyProgress();
S.streak = studyProgress.streak;
S.fuel = studyProgress.fuel;
S.referralCount = studyProgress.referralCount;

function switchStudyProfile(registration, { fresh = false } = {}) {
  activeStudyProgressKey = `${STUDY_PROGRESS_KEY}.${encodeURIComponent(registration)}`;
  Object.assign(studyProgress, fresh ? freshStudyProgress() : loadStudyProgress(activeStudyProgressKey));
  currentCourse = studyProgress.course;
  activeModules = MODULES_BY_COURSE[currentCourse] || STUDY_MODULES;
  studyProgress.completed = studyProgress.courseCompleted[currentCourse] || [];
  S.streak = studyProgress.streak;
  S.fuel = studyProgress.fuel;
  S.referralCount = studyProgress.referralCount;
  saveStudyProgress();
}

function saveStudyProgress() {
  try {
    studyProgress.courseCompleted[currentCourse] = [...studyProgress.completed];
    studyProgress.course = currentCourse;
    window.localStorage.setItem(activeStudyProgressKey, JSON.stringify(studyProgress));
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
    } else studyProgress.streak = 1;
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
let consecutiveWrongCount = 0;

const sfxEngine = {
  correct: new Audio("assets/sfx/duolingo-correct-answer-10-streak.mp3"),
  wrong: new Audio("assets/sfx/duolingo-wrong.mp3"),
  fah: new Audio("assets/sfx/faaah.mp3"),
  failTest: new Audio("assets/sfx/oh-my-god-bro-oh-hell-nah-man.mp3"),
  deadClick: new Audio("assets/sfx/vine-boom.mp3"),
  loading: new Audio("assets/sfx/a-few-moments-later-sponge-bob-sfx-fun.mp3"),
  complete: new Audio("assets/sfx/Complete%20test.mp3"),
};
Object.values(sfxEngine).forEach((audio) => {
  audio.preload = "auto";
});

function playCustomSfx(key, { loop = false } = {}) {
  if (!soundOn) return;
  const audio = sfxEngine[key];
  if (!audio) return;
  audio.currentTime = 0;
  audio.loop = loop;
  void audio.play().catch((error) => console.warn(`FoldBook sound "${key}" could not be played:`, error));
}

function stopCustomSfx(key) {
  const audio = sfxEngine[key];
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
  audio.loop = false;
}

function playAnswerFeedback(isCorrect) {
  if (isCorrect) {
    consecutiveWrongCount = 0;
    playCustomSfx("correct");
    return;
  }
  consecutiveWrongCount += 1;
  if (consecutiveWrongCount === 3) playCustomSfx("fah");
  else if (consecutiveWrongCount === 5) playCustomSfx("failTest");
  else playCustomSfx("wrong");
}

function startLoadingSfx() {
  playCustomSfx("loading", { loop: true });
}

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
  const deadTarget = event.target.closest?.(
    ".disabled, .dead-link, [disabled], [aria-disabled='true'], [data-dead-click], .empty-course-node, .course-node:empty",
  );
  if (deadTarget) {
    playCustomSfx("deadClick");
    buzz(8);
    return;
  }
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

const PROFILE_AVATAR_LOTTIES = new Set([
  "cat-idle.json",
  "cat-stretch.json",
  "person-02-breathing.json",
  "hello-wave.json",
  "heart-eyes.json",
  "winking-face.json",
]);

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
    if (entry.isCurrentUser && S.user) {
      const userAvatar = document.createElement("span");
      userAvatar.className = "leaderboard-avatar";
      userAvatar.setAttribute("aria-hidden", "true");
      renderUserAvatar(userAvatar, S.user, "leaderboard-avatar");
      name.append(userAvatar);
    }
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
    const award = document.createElement("div");
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
    if (entry.isCurrentUser && S.user) renderUserAvatar(avatar, S.user, "av");
    award.className = "podium-award";
    renderLottieInto(award, "trophy.json", "🏆", `Rank ${rank} award`);
    step.append(award, avatar, name, xp, block);
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
  S.fuel = studyProgress.fuel;
  fuelValue.textContent = `${S.fuel}/100`;
  fuelValue.title = hasDemoPass ? "48-hour all-access pass active" : "Dr. Eco fuel";
  fuelBar.style.width = `${S.fuel}%`;
  chatFuelBar.style.width = `${S.fuel}%`;
  chatFuelValue.textContent = `${S.fuel}/100`;
}

function consumeStudyFuel(amount) {
  if (studyProgress.demoPassExpiresAt > Date.now()) return true;
  if (studyProgress.fuel < amount) {
    document.querySelector("#fuelStatus").textContent = "Your study fuel is empty. Choose a demo refill or earn fuel by sharing FoldBook.";
    fuelDialog.hidden = false;
    return false;
  }
  studyProgress.fuel = Math.max(0, studyProgress.fuel - amount);
  saveStudyProgress();
  updateFuelDisplay();
  return true;
}

function updateStudySummary() {
  const completedCount = studyProgress.completed.length;
  const percent = Math.round((completedCount / activeModules.length) * 100);
  const mockUnlocked = completedCount === activeModules.length;
  courseBar.style.width = `${percent}%`;
  courseProgressBar.setAttribute("aria-valuenow", String(percent));
  coursePercent.textContent = `${percent}%`;
  S.streak = studyProgress.streak;
  S.referralCount = studyProgress.referralCount;
  streakValue.textContent = String(S.streak);
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
  lessonFeedback.className = "lesson-feedback";
  lessonFeedbackAnimation.hidden = true;
  lessonFeedbackAnimation.replaceChildren();
  answerOptions.replaceChildren();
  module.answers.forEach((answer, answerIndex) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "answer-option";
    option.textContent = answer;
    option.addEventListener("click", () => {
      const record = studyProgress.attempts[module.id] || { attempts: 0, correct: 0, wrong: 0 };
      record.attempts += 1;
      if (answerIndex !== module.correctAnswer) {
        record.wrong += 1;
        studyProgress.attempts[module.id] = record;
        saveStudyProgress();
        renderStudyPath();
        playAnswerFeedback(false);
        lessonFeedback.textContent = "Not quite. Re-read the lesson and try another answer.";
        lessonFeedback.className = "lesson-feedback is-retry";
        lessonFeedbackAnimation.hidden = false;
        renderLottieInto(lessonFeedbackAnimation, "cat-stretch.json", "↻", "Take a breath and try again", { loop: false });
        if (typeof window.navigator.vibrate === "function") window.navigator.vibrate(35);
        return;
      }

      record.correct += 1;
      studyProgress.attempts[module.id] = record;
      saveStudyProgress();
      renderStudyPath();
      playAnswerFeedback(true);
      if (!studyProgress.completed.includes(module.id)) {
        studyProgress.completed.push(module.id);
        studyProgress.xp += 20;
        studyProgress.gems += 5;
        startStudyActivity();
        saveStudyProgress();
        updateStudySummary();
        void syncLeaderboardEntry();
        renderStudyPath();
        if (typeof window.navigator.vibrate === "function") window.navigator.vibrate([25, 35, 25]);
        lessonFeedback.textContent = "Correct! +20 XP · +5 gems. The next node is ready.";
      } else {
        lessonFeedback.textContent = "Correct! This module is already complete, so no extra XP was added.";
      }
      lessonFeedback.className = "lesson-feedback is-correct";
      lessonFeedbackAnimation.hidden = false;
      renderLottieInto(lessonFeedbackAnimation, "jump-for-joy.json", "✨", "Correct answer", { loop: false });
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
  const progressKey = `${currentCourse}:${completedCount}`;
  if (courseProgressLottie.dataset.progressKey !== progressKey) {
    courseProgressLottie.dataset.progressKey = progressKey;
    courseProgressLottie.hidden = completedCount === 0;
    if (completedCount > 0) {
      const filename = completedCount === activeModules.length ? "watering-the-flower.json" : "growing-plant.json";
      renderLottieInto(courseProgressLottie, filename, "🌱", "Course progress growing", { loop: false });
    } else courseProgressLottie.replaceChildren();
  }

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
    if (isComplete) renderLottieInto(node, "badge-unlocked.json", "✓", `Completed ${module.title}`, { loop: false });
    label.className = "lab";
    title.textContent = module.title;
    const history = studyProgress.attempts[module.id];
    const accuracy = history?.attempts ? Math.round((history.correct / history.attempts) * 100) : null;
    detail.textContent = history?.wrong >= 2 && accuracy < 70
      ? `Needs a little practice · ${accuracy}% so far`
      : isComplete ? `Completed${accuracy !== null ? ` · ${accuracy}%` : ""} · Review lesson` : `${5} min · +20 XP`;
    if (history?.wrong >= 2 && accuracy < 70) node.classList.add("needs-review");
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
  const review = activeModules.map((module) => ({ module, stats: studyProgress.attempts[module.id] }))
    .filter(({ stats }) => stats?.wrong >= 2 && stats.correct / stats.attempts < 0.7)
    .sort((a, b) => (b.stats.wrong - a.stats.wrong));
  const focus = document.querySelector("#learningFocus");
  if (focus) focus.textContent = review.length
    ? `Let’s give ${review[0].module.title} another look (${Math.round(review[0].stats.correct / review[0].stats.attempts * 100)}% so far).`
    : "Your tricky topics will show up here as you practise.";
}

function setNavigationAvailable(available) {
  document.querySelector("#studentApp").hidden = !available;
  document.querySelector("#studentMobileNav").hidden = !available;
  document.querySelector("#studentHeaderWidgets").hidden = !available;
}

function showStage(stage, updateHash = true) {
  for (const stageName of ["landingView", "authView", "studentApp", "adminDashboard"]) {
    const element = document.querySelector(`#${stageName}`);
    const isVisible = stage === stageName;
    element.hidden = !isVisible;
    element.classList.toggle("hide", !isVisible);
  }
  setNavigationAvailable(stage === "studentApp");
  if (updateHash) window.location.hash = `#${stage}`;
  if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
}

function showAccessRestrictedNotice() {
  const notice = "Access Restricted: SevenFold Authorized Personnel Only";
  const authStatus = document.querySelector("#authStatus");
  if (authStatus) authStatus.textContent = notice;
  showNotice(notice);
}

function showNotice(message) {
  const toast = document.querySelector("#accessToast");
  toast.textContent = message;
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

const studentTourSteps = [
  { title: "Welcome to your study space", copy: "I’m Dr. Eco. Let’s take a quick look around so you know where to learn, ask questions and track your progress.", target: "#courseTitle", tab: "home", progress: "WELCOME · 1 OF 5" },
  { title: "Your learning path", copy: "Choose a course, then work through its short modules. Each lesson unlocks the next and adds to your course progress.", target: "#courseSwitcher", tab: "home", progress: "YOUR PATH · 2 OF 5" },
  { title: "Ask Dr. Eco", copy: "Open chat whenever you need an explanation, quiz or help with a course question. You can also talk with Dr. Eco using voice.", target: "#navChat", tab: "chat", progress: "STUDY TOGETHER · 3 OF 5" },
  { title: "Bring your own materials", copy: "Use the camera to photograph a question, or the paperclip to attach a PDF or saved photo. Choose a course and save it for Dr. Eco to use.", target: "#cameraUploadButton", tab: "chat", progress: "YOUR MATERIALS · 4 OF 5" },
  { title: "Make it feel like your tutor", copy: "Set Dr. Eco’s tone and explanation pace in chat settings. Your profile also keeps your study identity and preferences on this device.", target: "#chatSettingsToggle", tab: "chat", progress: "MAKE IT YOURS · 5 OF 5" },
];
let studentTourIndex = 0;
function renderStudentTour() {
  const step = studentTourSteps[studentTourIndex];
  if (!step) return finishStudentTour();
  if (step.tab) activateTab(step.tab);
  document.querySelectorAll(".tour-highlight").forEach((node) => node.classList.remove("tour-highlight"));
  const target = document.querySelector(step.target);
  target?.classList.add("tour-highlight");
  target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  document.querySelector("#studentTourProgress").textContent = step.progress;
  document.querySelector("#studentTourTitle").textContent = step.title;
  document.querySelector("#studentTourCopy").textContent = step.copy;
  document.querySelector("#studentTourBack").hidden = studentTourIndex === 0;
  document.querySelector("#studentTourNext").textContent = studentTourIndex === studentTourSteps.length - 1 ? "Let’s study" : "Next";
}
function startStudentTour() {
  try {
    if (window.localStorage.getItem("foldBook.studentTourComplete") === "true") return;
  } catch {}
  studentTourIndex = 0;
  document.querySelector("#studentTour").hidden = false;
  renderStudentTour();
}
function finishStudentTour() {
  document.querySelector("#studentTour").hidden = true;
  document.querySelectorAll(".tour-highlight").forEach((node) => node.classList.remove("tour-highlight"));
  try { window.localStorage.setItem("foldBook.studentTourComplete", "true"); } catch {}
}
document.querySelector("#studentTourNext")?.addEventListener("click", () => {
  if (studentTourIndex < studentTourSteps.length - 1) { studentTourIndex += 1; renderStudentTour(); }
  else finishStudentTour();
});
document.querySelector("#studentTourBack")?.addEventListener("click", () => {
  if (studentTourIndex > 0) { studentTourIndex -= 1; renderStudentTour(); }
});
document.querySelector("#studentTourSkip")?.addEventListener("click", finishStudentTour);

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
      if (!consumeStudyFuel(1)) return;
      mockExamState.answered = true;
      const correct = answerIndex === question.correctAnswer;
      if (correct) {
        mockExamState.score += 1;
        playAnswerFeedback(true);
        option.classList.add("is-correct");
        mockExamFeedback.textContent = "Correct.";
        mockExamFeedback.className = "lesson-feedback is-correct";
        if (typeof window.navigator.vibrate === "function") window.navigator.vibrate(20);
      } else {
        playAnswerFeedback(false);
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
  playCustomSfx("complete");
  if (score / mockExamQuestions.length < 0.6) playCustomSfx("failTest");
  const estimate = score >= Math.ceil(mockExamQuestions.length * 0.8) ? "Strong grasp" : score >= Math.ceil(mockExamQuestions.length * 0.6) ? "Developing" : "More practice recommended";
  mockExamProgress.textContent = `PRACTICE SCORE · ${score} / ${mockExamQuestions.length}`;
  mockExamTitle.textContent = estimate;
  mockExamQuestion.textContent = "This practice result is for revision guidance only and does not predict or replace an official exam result.";
  mockExamOptions.replaceChildren();
  mockExamFeedback.textContent = "";
  renderLottieInto(document.querySelector("#mockExamAnimation"), "confetti-burst.json", "🎉", "Practice mock complete", { loop: false });
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
  if (studyProgress.completed.length !== activeModules.length && studyProgress.demoPassExpiresAt <= Date.now()) {
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
    startLoadingSfx();
    mockExamQuestions = await generateQuestionsFromMaterials(5, chatCourseCode, currentStudentLevel);
    renderMockExamQuestion();
  } catch (error) {
    console.error("Could not generate the practice mock:", error);
    mockExamProgress.textContent = "PRACTICE MOCK UNAVAILABLE";
    mockExamQuestion.textContent = `Could not generate questions: ${error.message}`;
  } finally {
    stopCustomSfx("loading");
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

function openChatSettingsDrawer() {
  const drawer = document.querySelector("#chatSettingsDrawer");
  if (!drawer) return;
  drawer.hidden = false;
  void refreshStudentMaterials().catch((error) => { studentMaterialStatus.textContent = error.message; });
  document.querySelector("#chatSettingsToggle").setAttribute("aria-expanded", "true");
  document.querySelector("#chatSettingsClose").focus();
}

function closeChatSettingsDrawer() {
  const drawer = document.querySelector("#chatSettingsDrawer");
  if (!drawer || drawer.hidden) return;
  drawer.hidden = true;
  document.querySelector("#chatSettingsToggle").setAttribute("aria-expanded", "false");
  document.querySelector("#chatSettingsToggle").focus();
}

document.querySelector("#chatSettingsToggle").addEventListener("click", () => {
  if (document.querySelector("#chatSettingsDrawer").hidden) openChatSettingsDrawer();
  else closeChatSettingsDrawer();
});
document.querySelector("#chatSettingsClose").addEventListener("click", closeChatSettingsDrawer);

const mascotFiles = {
  person: ["person-02-breathing.json"],
  idle: ["cat-idle.json"],
  happy: ["heart-eyes.json", "confetti-burst.json"],
  success: ["badge-unlocked.json", "confetti-burst.json"],
  sad: ["cat-stretch.json"],
  wrong: ["cat-stretch.json"],
  streak: ["streak-flame.json"],
  fire: ["streak-flame.json"],
  winner: ["trophy.json", "confetti-cannons.json"],
  trophy: ["trophy.json"],
};
let lottieManifestPromise;

function renderLottieInto(container, fileName, fallbackSymbol, label, options = {}) {
  if (!container) return;
  const token = Number(container.dataset.animationToken || 0) + 1;
  container.dataset.animationToken = String(token);
  const fallback = () => {
    if (container.dataset.animationToken !== String(token)) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    svg.setAttribute("viewBox", "0 0 64 64");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
    text.setAttribute("x", "32");
    text.setAttribute("y", "48");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", "44");
    text.textContent = fallbackSymbol;
    svg.append(text);
    container.replaceChildren(svg);
  };
  fallback();
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
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
        console.error("Could not load FoldBook animation manifest:", error);
        return [];
      });
  }
  void lottieManifestPromise.then(async (files) => {
    if (container.dataset.animationToken !== String(token)) return;
    const source = files.find((file) => file.endsWith(`/${fileName}`));
    if (!source) return;
    try {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`Animation request failed (${response.status}).`);
      const animation = await response.json();
      if (!animation || typeof animation !== "object") throw new Error("Animation JSON is invalid.");
      if (container.dataset.animationToken !== String(token)) return;
      const player = document.createElement("dotlottie-player");
      player.setAttribute("src", source);
      player.setAttribute("autoplay", "");
      if (options.loop !== false) player.setAttribute("loop", "");
      player.setAttribute("background", "transparent");
      player.setAttribute("aria-label", label);
      player.addEventListener("error", fallback, { once: true });
      container.replaceChildren(player);
      window.setTimeout(() => {
        if (player.isConnected && player.childElementCount === 0 && !player.shadowRoot) fallback();
      }, 9000);
    } catch (error) {
      console.error(`Could not render ${fileName}:`, error);
      fallback();
    }
  });
}

function renderUserAvatar(container, user, className = "") {
  if (!container) return;
  container.className = [...new Set(`${container.className} ${className}`.trim().split(/\s+/))].join(" ");
  container.replaceChildren();
  const fallback = document.createElement("span");
  fallback.setAttribute("aria-hidden", "true");
  fallback.textContent = typeof user?.name === "string"
    ? user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
    : "S";
  if (user?.avatarUrl && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(user.avatarUrl)
    && user.avatarUrl.length <= 140000) {
    const image = document.createElement("img");
    image.src = user.avatarUrl;
    image.alt = "";
    image.addEventListener("error", () => renderUserAvatar(container, { name: user.name }), { once: true });
    container.append(image);
  } else if (user?.avatarLottie && PROFILE_AVATAR_LOTTIES.has(user.avatarLottie)) {
    container.append(fallback);
    renderLottieInto(container, user.avatarLottie, fallback.textContent || "S", "Profile character");
  } else {
    container.append(fallback);
  }
}

function renderProfile() {
  const user = S.user;
  const name = user?.name || currentStudent?.name || "Student";
  document.querySelector("#headerProfileName").textContent = name.split(/\s+/)[0];
  document.querySelector("#profileDisplayName").textContent = name;
  document.querySelector("#profileDisplayLevel").textContent = user?.level || S.level;
  renderUserAvatar(document.querySelector("#headerProfileAvatar"), user, "profile-avatar");
  renderUserAvatar(document.querySelector("#profilePreviewAvatar"), user, "profile-avatar profile-avatar-large");
  document.querySelectorAll("[data-avatar-lottie]").forEach((button) => {
    const fileName = button.dataset.avatarLottie;
    button.classList.toggle("is-selected", user?.avatarLottie === fileName);
    renderLottieInto(button.querySelector(".profile-avatar-option-preview"), fileName, "✦", "Avatar animation preview", { loop: false });
  });
}

function renderMascot(mood, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const candidates = mascotFiles[String(mood).toLowerCase()] || mascotFiles.idle;
  renderLottieInto(container, candidates[0], mood === "streak" ? "🔥" : "✦", `Dr. Eco ${mood} mascot`);
}

function renderDrEcoFormatting(container, text) {
  container.replaceChildren();
  const lines = String(text).split(/\r?\n/);
  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) container.append(document.createElement("br"));
    const boldParts = line.split(/(\*\*[^*]+?\*\*)/g);
    boldParts.forEach((part) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        const strong = document.createElement("strong");
        strong.textContent = part.slice(2, -2);
        container.append(strong);
      } else {
        const textPart = document.createElement("span");
        textPart.textContent = part;
        container.append(textPart);
      }
    });
  });
}

function appendChatMessage(text, kind) {
  const article = document.createElement("article");
  const paragraph = document.createElement("p");
  article.className = `chat-message ${kind === "assistant" ? "assistant-message" : "user-message"}`;
  if (kind === "assistant") renderDrEcoFormatting(paragraph, text);
  else paragraph.textContent = text;
  article.append(paragraph);
  if (kind === "assistant") {
    const listen = document.createElement("button");
    listen.type = "button";
    listen.className = "listen-button";
    listen.textContent = "🔊 Listen";
    article.append(listen);
  }
  const avatar = document.createElement("span");
  avatar.className = "message-avatar profile-avatar";
  avatar.setAttribute("aria-hidden", "true");
  if (kind === "assistant") {
    article.classList.add("has-avatar");
    renderLottieInto(avatar, "cat-idle.json", "✦", "Dr. Eco");
  } else if (S.user) {
    article.classList.add("has-avatar");
    renderUserAvatar(avatar, S.user, "message-avatar profile-avatar");
  } else {
    avatar.hidden = true;
  }
  article.append(avatar);
  chatMessages.append(article);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return article;
}

function ensureExternalScript(url, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  const existing = document.querySelector(`script[data-foldbook-parser="${globalName}"]`);
  if (existing?.dataset.loaded === "true") return Promise.resolve(window[globalName]);
  if (existing?.dataset.loading === "true") {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(window[globalName]), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Could not load ${globalName} parser.`)), { once: true });
    });
  }
  const script = document.createElement("script");
  script.src = url;
  script.async = true;
  script.dataset.foldbookParser = globalName;
  script.dataset.loading = "true";
  const loaded = new Promise((resolve, reject) => {
    script.addEventListener("load", () => {
      script.dataset.loading = "false";
      script.dataset.loaded = "true";
      if (!window[globalName]) reject(new Error(`${globalName} parser did not initialize.`));
      else resolve(window[globalName]);
    }, { once: true });
    script.addEventListener("error", () => {
      script.dataset.loading = "false";
      script.remove();
      reject(new Error(`Could not load ${globalName} parser.`));
    }, { once: true });
  });
  document.head.append(script);
  return loaded;
}

const MAX_INDEX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_INDEXED_TEXT_LENGTH = 12000;
const adminFileUploader = document.querySelector("#adminFileUploader");
const adminPdfUploader = document.querySelector("#adminPdfUploader");
const adminFolderUploader = document.querySelector("#adminFolderUploader");
const adminMaterialDropzone = document.querySelector("#adminMaterialDropzone");
const adminMaterialQueue = document.querySelector("#adminMaterialQueue");
const adminMaterialAssignments = document.querySelector("#adminMaterialAssignments");
let queuedMaterialFiles = [];

async function extractAdminUploadText(file) {
  if (file.size > MAX_INDEX_UPLOAD_BYTES) {
    throw new Error("Choose a file smaller than 20 MB.");
  }
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "txt") return file.text();

  if (["csv", "xlsx", "xls"].includes(extension)) {
    if (!window.XLSX) throw new Error("The spreadsheet reader could not be loaded. Refresh the page and try again.");
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    const text = workbook.SheetNames.map((name) => `## ${name}\n${window.XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join("\n\n");
    if (!text.trim()) throw new Error("No readable rows were found in this spreadsheet.");
    return text;
  }

  if (extension === "pdf") {
    const pdfjs = await ensureExternalScript(
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
      "pdfjsLib",
    );
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    if (pdf.numPages > 100) throw new Error("PDFs are limited to 100 pages for browser-side extraction.");
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str).join(" "));
      if (pages.join("\n").length >= MAX_INDEXED_TEXT_LENGTH) break;
    }
    const extracted = pages.join("\n").trim();
    if (!extracted) throw new Error("No selectable text was found in this PDF.");
    return extracted;
  }

  if (extension === "docx") {
    const mammoth = await ensureExternalScript(
      "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js",
      "mammoth",
    );
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    if (!result.value.trim()) throw new Error("No text was found in this Word document.");
    return result.value;
  }

  if (["png", "jpg", "jpeg", "webp"].includes(extension)) {
    const tesseract = await ensureExternalScript(
      "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
      "Tesseract",
    );
    adminMaterialStatus.textContent = "Loading local OCR and extracting image text…";
    const worker = await tesseract.createWorker("eng");
    try {
      const { data } = await worker.recognize(file);
      if (!data.text.trim()) throw new Error("No readable text was found in this image.");
      return data.text;
    } finally {
      await worker.terminate();
    }
  }

  throw new Error("This format cannot be converted to searchable text in the browser. Use PDF, DOCX, TXT, PNG, JPG, WEBP, CSV, XLSX or XLS.");
}

function renderMaterialQueue() {
  adminMaterialQueue.replaceChildren();
  queuedMaterialFiles.forEach((item, index) => {
    const row = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${item.file.webkitRelativePath || item.file.name} · ${item.status}`;
    row.append(label);
    if (item.status === "queued") {
      const inferredCode = item.file.name.match(/\bECO\s*[-_]?\s*(\d{3})\b/i);
      const guessedLevel = inferredCode ? `${inferredCode[1][0]}00L` : adminLevelSelect.value;
      if (!item.level) item.level = ["100L", "200L", "300L", "400L"].includes(guessedLevel) ? guessedLevel : adminLevelSelect.value;
      const level = document.createElement("select");
      level.className = "admin-material-control queue-assignment-select";
      for (const value of ["100L", "200L", "300L", "400L"]) {
        const option = document.createElement("option"); option.value = value; option.textContent = value;
        option.selected = value === item.level; level.append(option);
      }
      const course = document.createElement("select");
      course.className = "admin-material-control queue-assignment-select";
      for (const entry of coursesForLevel(item.level)) {
        const option = document.createElement("option"); option.value = entry.code; option.textContent = entry.code;
        course.append(option);
      }
      if (item.courseCode && Array.from(course.options).some((option) => option.value === item.courseCode)) course.value = item.courseCode;
      else if (inferredCode) {
        const matching = Array.from(course.options).find((option) => option.value.replace(/\s/g, "") === `ECO${inferredCode[1]}`);
        if (matching) course.value = matching.value;
        else {
          const custom = document.createElement("option");
          custom.value = `ECO ${inferredCode[1]}`;
          custom.textContent = `${custom.value} (add to catalogue)`;
          course.append(custom);
          course.value = custom.value;
        }
      }
      else {
        const pending = document.createElement("option"); pending.value = ""; pending.textContent = "Choose course"; pending.selected = true; course.prepend(pending);
      }
      item.courseCode = course.value;
      level.addEventListener("change", () => { item.level = level.value; item.courseCode = coursesForLevel(item.level)[0]?.code || ""; renderMaterialQueue(); });
      course.addEventListener("change", () => { item.courseCode = course.value; });
      row.append(level, course);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "card-secondary-button";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${item.file.name}`);
      remove.addEventListener("click", () => { queuedMaterialFiles.splice(index, 1); renderMaterialQueue(); });
      row.append(remove);
    }
    adminMaterialQueue.append(row);
  });
  adminMaterialAssignments.hidden = queuedMaterialFiles.length === 0;
}

function addMaterialFiles(fileList) {
  const known = new Set(queuedMaterialFiles.map(({ file }) => `${file.name}:${file.size}:${file.lastModified}`));
  for (const file of Array.from(fileList || [])) {
    if (known.has(`${file.name}:${file.size}:${file.lastModified}`)) continue;
    queuedMaterialFiles.push({ file, status: "queued" });
  }
  renderMaterialQueue();
}

async function processMaterialQueue() {
  for (const item of queuedMaterialFiles) {
    if (item.status !== "queued") continue;
    const file = item.file;
    try {
      item.status = "extracting";
      renderMaterialQueue();
      adminMaterialStatus.textContent = `Extracting ${file.name}…`;
      const extracted = (await extractAdminUploadText(file)).trim().slice(0, MAX_INDEXED_TEXT_LENGTH);
      if (!extracted) throw new Error("No searchable text was extracted.");
      const baseTitle = file.name.replace(/\.[^/.]+$/, "");
      const title = queuedMaterialFiles.filter((other) => other !== item && other.file.name.replace(/\.[^/.]+$/, "") === baseTitle).length
        ? `${baseTitle} (${file.webkitRelativePath || file.name})` : baseTitle;
      const level = item.level || adminLevelSelect.value;
      const courseCode = item.courseCode || adminCourseSelect.value;
      if (!courseCode) throw new Error("Choose a course for this file before indexing it.");
      if (/student\s+results|result\s+compilation/i.test(file.name)) {
        throw new Error("This appears to contain student results, so it was skipped. Do not upload student records as course materials.");
      }
      if (!coursesForLevel(level).some((course) => course.code === courseCode)) {
        if (!S.isAdmin) throw new Error(`${courseCode} is not in the course list. Add it in the admin Course Catalogue first.`);
        const titleGuess = file.name.replace(/\.[^/.]+$/, "").replace(/\bECO\s*[-_]?\s*\d{3,4}\b/i, "").replace(/^[\s.;_-]+|[\s.;_-]+$/g, "").trim() || `${courseCode} study materials`;
        await requestAdminApi("/api/admin/course-catalog", {
          action: "upsert", level, courseCode, title: titleGuess, creditUnits: 3,
        });
        UNIUYO_COURSE_CATALOG[level] = [...coursesForLevel(level), { code: courseCode, title: titleGuess, units: 3 }];
        updateAdminCourseDropdown();
      }
      const response = await fetch("/api/admin/course-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, courseCode, title, content: extracted }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Material indexing failed.");
      item.status = `indexed (${result.indexedChunks || 1} sections)`;
    } catch (error) {
      console.error("Admin course file indexing failed:", file.name, error);
      item.status = `failed: ${error.message || "could not index"}`;
    }
    renderMaterialQueue();
  }
  const failed = queuedMaterialFiles.filter((item) => item.status.startsWith("failed:")).length;
  const indexed = queuedMaterialFiles.filter((item) => item.status.startsWith("indexed")).length;
  adminMaterialStatus.textContent = `${indexed} file${indexed === 1 ? "" : "s"} indexed${failed ? `; ${failed} failed. Review their status above and retry after fixing the issue.` : "."}`;
  sfx[failed ? "no" : "win"]();
}

adminFileUploader.addEventListener("change", () => { addMaterialFiles(adminFileUploader.files); adminFileUploader.value = ""; });
adminPdfUploader.addEventListener("change", () => { addMaterialFiles(adminPdfUploader.files); adminPdfUploader.value = ""; });
adminFolderUploader.addEventListener("change", () => { addMaterialFiles(adminFolderUploader.files); adminFolderUploader.value = ""; });
document.querySelector("#adminChoosePdf").addEventListener("click", () => adminPdfUploader.click());
document.querySelector("#adminChooseFiles").addEventListener("click", () => adminFileUploader.click());
document.querySelector("#adminChooseFolder").addEventListener("click", () => adminFolderUploader.click());
adminMaterialDropzone.addEventListener("click", (event) => { if (event.target === adminMaterialDropzone) adminFileUploader.click(); });
adminMaterialDropzone.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); adminFileUploader.click(); } });
for (const eventName of ["dragenter", "dragover"]) adminMaterialDropzone.addEventListener(eventName, (event) => { event.preventDefault(); adminMaterialDropzone.classList.add("is-dragging"); });
for (const eventName of ["dragleave", "drop"]) adminMaterialDropzone.addEventListener(eventName, (event) => { event.preventDefault(); adminMaterialDropzone.classList.remove("is-dragging"); });
adminMaterialDropzone.addEventListener("drop", (event) => addMaterialFiles(event.dataTransfer.files));

async function retrieveCourseMaterialContext(courseCode, level, count = 3, query = `${courseCode} ${level} course notes and concepts`) {
  const response = await fetch("/api/course-materials/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseCode, level, count, query }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Course material search failed.");
  const context = Array.isArray(result.materials)
    ? result.materials
      .filter((segment) => segment && typeof segment.content === "string")
      .map((segment) => `${segment.title}\n${segment.content}`)
      .join("\n\n")
      .slice(0, 12000)
    : "";
  if (!context.trim()) throw new Error(`No indexed materials were found for ${courseCode} (${level}).`);
  return context;
}

async function callGeminiRAG(userMessage, courseCode, level) {
  let contextText = "";
  try {
    contextText = await retrieveCourseMaterialContext(courseCode, level, 3, userMessage);
  } catch (error) {
    console.warn("Course material retrieval failed; continuing without retrieved notes:", error);
  }
  const personalContext = await loadStudentMaterialContext(courseCode);
  const learner = learnerAdaptationSummary();
  const tone = { friendly: "warm and encouraging", calm: "calm, patient, and reassuring", direct: "direct, focused, and concise" }[studyProgress.studyTone] || "warm and encouraging";
  const pace = { gentle: "Explain one small step at a time, check understanding, and avoid jumping ahead.", balanced: "Give a clear explanation with enough detail and one example.", quick: "Use concise revision notes and focus on the key exam idea." }[studyProgress.studyPace] || "Give a clear explanation with enough detail and one example.";
  const systemInstruction = `You are Dr. Eco, a sharp, fun AI Study Companion for Economics students at UNIUYO. You tutor a ${level} student in ${courseCode}. Be ${tone}. ${pace} Adapt explanations to demonstrated learning: revisit weak topics patiently with a different example, and acknowledge progress when accuracy improves. Do not label or shame the student. Keep responses conversational and structured. Ground course-specific claims in supplied notes and student materials; if they do not cover something, say so and label any general guidance.`;
  const prompt = `Level: ${level}\nCourse: ${courseCode}\nLearner progress signals: ${learner}\nOfficial course notes:\n${contextText || "(No matching official course notes were found.)"}\n\nStudent's private materials for this course:\n${personalContext || "(No student materials saved for this course.)"}\n\nQuestion: ${userMessage}`;
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

function learnerAdaptationSummary() {
  const records = activeModules.map((module) => ({ module, stats: studyProgress.attempts[module.id] }))
    .filter(({ stats }) => stats?.attempts);
  const weak = records.filter(({ stats }) => stats.wrong >= 2 && stats.correct / stats.attempts < 0.7)
    .sort((a, b) => (b.stats.wrong - a.stats.wrong) || (a.stats.correct / a.stats.attempts - b.stats.correct / b.stats.attempts));
  const strengths = records.filter(({ stats }) => stats.attempts >= 2 && stats.correct / stats.attempts >= 0.8);
  const recentQuizzes = studyProgress.quizAttempts.filter((item) => item.course === chatCourseCode).slice(-30);
  const weakQuizPrompts = recentQuizzes.filter((item) => !item.correct).slice(-5).map((item) => item.question);
  const quizAccuracy = recentQuizzes.length ? Math.round((recentQuizzes.filter((item) => item.correct).length / recentQuizzes.length) * 100) : null;
  return `Preferred pace: ${studyProgress.studyPace}. Topics needing review: ${weak.map(({ module, stats }) => `${module.title} (${Math.round(stats.correct / stats.attempts * 100)}% accuracy)`).join(", ") || "none identified yet"}. Strong topics: ${strengths.map(({ module }) => module.title).join(", ") || "still learning"}. Recent ${chatCourseCode} quiz accuracy: ${quizAccuracy === null ? "no quiz history yet" : `${quizAccuracy}%`}. Questions recently missed: ${weakQuizPrompts.join(" | ") || "none yet"}. Use these signals to choose examples and next practice questions.`;
}

async function ensureStudentAuth() {
  if (!supabaseClient) throw new Error("Private uploads need a working Supabase connection.");
  const currentUser = await currentStudentMaterialOwner();
  if (currentUser) return currentUser;
  const { data, error } = await supabaseClient.auth.signInAnonymously();
  if (error) throw new Error(/anonymous|disabled/i.test(error.message)
    ? "Private uploads are not enabled yet. The FoldBook admin must enable Anonymous Sign-Ins in Supabase Authentication settings."
    : error.message);
  if (currentStudent?.registration) window.localStorage.setItem(STUDENT_MATERIAL_OWNER_KEY, currentStudent.registration);
  return data.user;
}

async function currentStudentMaterialOwner() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  const user = data.session?.user;
  if (!user?.is_anonymous) return null;
  let ownerRegistration = "";
  try { ownerRegistration = window.localStorage.getItem(STUDENT_MATERIAL_OWNER_KEY) || ""; } catch { /* session remains private to this browser */ }
  if (ownerRegistration && currentStudent?.registration && ownerRegistration !== currentStudent.registration) {
    await supabaseClient.auth.signOut({ scope: "local" });
    try { window.localStorage.removeItem(STUDENT_MATERIAL_OWNER_KEY); } catch { /* local storage may be blocked */ }
    return null;
  }
  if (!ownerRegistration && currentStudent?.registration) {
    await supabaseClient.auth.signOut({ scope: "local" });
    return null;
  }
  return user;
}

async function loadStudentMaterialContext(courseCode) {
  if (!supabaseClient?.auth?.getSession || !currentStudent) return "";
  try {
    const owner = await currentStudentMaterialOwner();
    if (!owner) return "";
    const { data, error } = await supabaseClient.from("student_materials")
      .select("title, course_title, extracted_text")
      .eq("owner_id", owner.id).eq("course_code", courseCode)
      .order("created_at", { ascending: false }).limit(5);
    if (error) throw error;
    return (data || []).map((item) => `${item.title}${item.course_title ? ` · ${item.course_title}` : ""}\n${item.extracted_text}`).join("\n\n").slice(0, 18000);
  } catch (error) {
    console.warn("Could not load private study materials:", error);
    return "";
  }
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
  let contextText = "";
  try { contextText = await retrieveCourseMaterialContext(courseCode, level, 5); }
  catch (error) { console.info("No shared course notes for this practice set:", error.message); }
  const studentNotes = await loadStudentMaterialContext(courseCode);
  if (!contextText && !studentNotes) throw new Error(`No course notes or private materials are available for ${courseCode} yet. Upload a PDF or photo in Session settings.`);
  const weakTopics = learnerAdaptationSummary();
  const response = await fetch("/api/dr-eco", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: "Generate accurate course practice questions only from the supplied notes. Return only valid JSON with a top-level questions array. Each item must contain prompt (string), answers (array of 3 or 4 strings), correctAnswer (zero-based integer), and lecturerTip (short string)." }] },
      contents: [{
        role: "user",
        parts: [{ text: `Create ${count} varied multiple-choice questions for ${level} ${courseCode}. Prioritize topics identified as difficult in this learner progress summary, while including a few reinforcement questions on strengths: ${weakTopics}. Do not invent facts beyond these notes.\n\nOfficial indexed course materials:\n${contextText || "(No shared notes for this course.)"}\n\nThe student's private material:\n${studentNotes || "(No private materials.)"}` }],
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
let voiceCallActive = false;
let voiceMuted = false;
let voiceSpeakerOn = true;

class DrEcoVoiceLive {
  constructor(onStatusChange) {
    this.onStatusChange = onStatusChange;
    this.socket = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.processor = null;
    this.sourceNode = null;
    this.silentGain = null;
    this.outputGain = null;
    this.sources = new Set();
    this.playhead = 0;
    this.stopped = true;
    this.config = null;
    this.currentUserTranscript = "";
    this.currentAssistantTranscript = "";
  }

  setStatus(status, detail = "") {
    this.onStatusChange(status, detail);
  }

  async startSession(courseCode, level) {
    try {
      this.stopped = false;
      this.setStatus("CONNECTING", "Getting indexed course notes and a secure call token…");
      if (!navigator.mediaDevices?.getUserMedia || typeof window.WebSocket !== "function") {
        throw new Error("Live audio requires microphone access and WebSocket support in a secure browser.");
      }
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (typeof AudioContextConstructor !== "function") throw new Error("Web Audio is not supported in this browser.");
      this.audioContext = new AudioContextConstructor();
      if (this.audioContext.state === "suspended") await this.audioContext.resume();
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      let courseNotes = "";
      try {
        courseNotes = await retrieveCourseMaterialContext(courseCode, level, 5);
      } catch (error) {
        console.warn("Live voice course-note retrieval failed:", error);
      }
      const studentNotes = await loadStudentMaterialContext(courseCode);
      const tokenResponse = await fetch("/api/gemini/live-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseCode, level, courseNotes, studentNotes, learnerProfile: learnerAdaptationSummary(), studyTone: studyProgress.studyTone, studyPace: studyProgress.studyPace, studyVoice: studyProgress.studyVoice }),
      });
      let tokenData;
      try {
        tokenData = await tokenResponse.json();
      } catch {
        throw new Error(`Live token endpoint returned a non-JSON response (HTTP ${tokenResponse.status}). Check the Vercel API deployment and routing.`);
      }
      if (!tokenResponse.ok) {
        throw new Error(tokenData.error || `Could not obtain a secure Live API token (HTTP ${tokenResponse.status}).`);
      }
      if (!tokenData.token || !tokenData.model || !tokenData.config) {
        throw new Error("Gemini Live returned an incomplete session configuration.");
      }
      this.config = tokenData;
      this.outputGain = this.audioContext.createGain();
    this.outputGain.gain.value = voiceSpeakerOn ? 1 : 0;
      this.outputGain.connect(this.audioContext.destination);
      const endpoint = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
      this.socket = new window.WebSocket(`${endpoint}?access_token=${encodeURIComponent(tokenData.token)}`);
      this.socket.onopen = () => {
        if (this.stopped) return;
        const { model, config } = this.config;
        this.socket.send(JSON.stringify({ setup: { model, ...config } }));
      };
      this.socket.onmessage = (event) => this.handleSocketMessage(event);
      this.socket.onerror = () => {
        if (!this.stopped) this.setStatus("ERROR", "Gemini Live connection failed. Please try again.");
      };
      this.socket.onclose = () => {
        if (!this.stopped) {
          this.setStatus("IDLE", "The live session disconnected.");
          this.stopSession(false);
        }
      };
    } catch (error) {
      console.error("Could not start Dr. Eco Live:", error);
      this.setStatus("ERROR", error.message || "Could not start the live call.");
      this.stopSession();
    }
  }

  async handleSocketMessage(event) {
    try {
      const message = JSON.parse(typeof Blob !== "undefined" && event.data instanceof Blob
        ? await event.data.text()
        : event.data);
      if (message.setupComplete) {
        if (!this.stopped) {
          this.setStatus("LISTENING", "Connected. Speak naturally; you can interrupt Dr. Eco at any time.");
          this.startMicStream();
        }
        return;
      }
      const content = message.serverContent;
      if (!content) return;
      if (content.interrupted) {
        this.stopPlayback();
        this.setStatus("LISTENING", "Dr. Eco paused. Go ahead—I'm listening.");
      }
      if (content.inputTranscription?.text) {
        this.currentUserTranscript = content.inputTranscription.text.trim();
        document.querySelector("#voiceCaption").textContent = `You: ${this.currentUserTranscript}`;
      }
      if (content.outputTranscription?.text) {
        this.currentAssistantTranscript = content.outputTranscription.text.trim();
        document.querySelector("#voiceCaption").textContent = `Dr. Eco: ${this.currentAssistantTranscript}`;
      }
      const parts = content.modelTurn?.parts || [];
      for (const part of parts) {
        const audio = part.inlineData?.data;
        if (audio) {
          this.setStatus("SPEAKING");
          this.playAudioChunk(audio, part.inlineData.mimeType);
        }
        if (part.text) {
          this.currentAssistantTranscript = part.text.trim();
          document.querySelector("#voiceCaption").textContent = `Dr. Eco: ${this.currentAssistantTranscript}`;
        }
      }
      if (content.turnComplete) {
        publishVoiceTranscript(this.currentUserTranscript, this.currentAssistantTranscript);
        this.currentUserTranscript = "";
        this.currentAssistantTranscript = "";
        this.setStatus("LISTENING");
      }
    } catch (error) {
      console.error("Could not process Gemini Live response:", error);
      this.setStatus("ERROR", "Received an unreadable response from Gemini Live.");
    }
  }

  startMicStream() {
    const context = this.audioContext;
    if (!context || !this.mediaStream || !this.socket || this.stopped) return;
    this.sourceNode = context.createMediaStreamSource(this.mediaStream);
    this.processor = context.createScriptProcessor(4096, 1, 1);
    this.silentGain = context.createGain();
    this.silentGain.gain.value = 0;
    this.processor.onaudioprocess = (event) => {
      if (!this.socket || this.socket.readyState !== window.WebSocket.OPEN || voiceMuted) return;
      const samples = this.resample(event.inputBuffer.getChannelData(0), context.sampleRate, 16000);
      if (!samples.length) return;
      const pcm16 = new Int16Array(samples.length);
      for (let index = 0; index < samples.length; index += 1) {
        const sample = Math.max(-1, Math.min(1, samples[index]));
        pcm16[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }
      const bytes = new Uint8Array(pcm16.buffer);
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
      }
      this.socket.send(JSON.stringify({
        realtimeInput: {
          audio: { mimeType: "audio/pcm;rate=16000", data: btoa(binary) },
        },
      }));
    };
    this.sourceNode.connect(this.processor);
    this.processor.connect(this.silentGain);
    this.silentGain.connect(context.destination);
  }

  resample(input, inputRate, outputRate) {
    if (inputRate === outputRate) return input;
    const ratio = inputRate / outputRate;
    const outputLength = Math.floor(input.length / ratio);
    const output = new Float32Array(outputLength);
    for (let index = 0; index < outputLength; index += 1) {
      const start = Math.floor(index * ratio);
      const end = Math.min(Math.floor((index + 1) * ratio), input.length);
      let total = 0;
      for (let sample = start; sample < end; sample += 1) total += input[sample];
      output[index] = total / Math.max(1, end - start);
    }
    return output;
  }

  playAudioChunk(encodedAudio, mimeType = "") {
    const bytes = Uint8Array.from(atob(encodedAudio), (character) => character.charCodeAt(0));
    const sampleCount = Math.floor(bytes.byteLength / 2);
    if (!sampleCount || !this.audioContext || !this.outputGain) return;
    const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
    const sampleRate = Number(mimeType.match(/rate=(\d+)/)?.[1] || 24000);
    const buffer = this.audioContext.createBuffer(1, sampleCount, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < sampleCount; index += 1) channel[index] = view.getInt16(index * 2, true) / 32768;
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputGain);
    const startAt = Math.max(this.audioContext.currentTime, this.playhead);
    source.start(startAt);
    this.playhead = startAt + buffer.duration;
    source.onended = () => this.sources.delete(source);
    this.sources.add(source);
  }

  setMuted(muted) {
    voiceMuted = muted;
    if (this.mediaStream) {
      for (const track of this.mediaStream.getAudioTracks()) track.enabled = !muted;
    }
  }

  setSpeakerEnabled(enabled) {
    voiceSpeakerOn = enabled;
    if (this.outputGain) this.outputGain.gain.value = enabled ? 1 : 0;
  }

  stopPlayback() {
    for (const source of this.sources) {
      try { source.stop(); } catch (error) {
        if (error.name !== "InvalidStateError") console.warn("Could not stop a Live audio chunk:", error);
      }
    }
    this.sources.clear();
    if (this.audioContext) this.playhead = this.audioContext.currentTime;
  }

  stopSession(closeSocket = true) {
    if (this.stopped && !this.audioContext && !this.socket) return;
    this.stopped = true;
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
    }
    if (this.sourceNode) this.sourceNode.disconnect();
    if (this.silentGain) this.silentGain.disconnect();
    if (this.mediaStream) this.mediaStream.getTracks().forEach((track) => track.stop());
    this.stopPlayback();
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      if (closeSocket && this.socket.readyState < window.WebSocket.CLOSING) this.socket.close();
    }
    if (this.audioContext && this.audioContext.state !== "closed") void this.audioContext.close();
    this.processor = null;
    this.sourceNode = null;
    this.silentGain = null;
    this.mediaStream = null;
    this.outputGain = null;
    this.audioContext = null;
    this.socket = null;
    this.playhead = 0;
  }
}

let drEcoVoice = null;
function setVoiceCallStatus(status, detail = "") {
  const statusLabel = document.querySelector("#voiceCallStatus");
  const caption = document.querySelector("#voiceCaption");
  const mascot = document.querySelector("#voiceCallMascot");
  const statusLabels = {
    CONNECTING: "Connecting…",
    LISTENING: "Listening",
    SPEAKING: "Dr. Eco is speaking",
    ERROR: "Call error",
    IDLE: "Disconnected",
  };
  statusLabel.textContent = detail || statusLabels[status] || status;
  if (status === "SPEAKING") renderLottieInto(mascot, "heart-eyes.json", "🔊", "Dr. Eco speaking");
  else if (status === "LISTENING") renderLottieInto(mascot, "person-02-breathing.json", "🎙️", "Dr. Eco listening");
  else if (status === "CONNECTING") renderLottieInto(mascot, "typing-indicator.json", "…", "Connecting to Dr. Eco");
  if (status === "LISTENING" && !caption.textContent) caption.textContent = "Dr. Eco is listening…";
}

function toggleVoiceCallRoom(open) {
  const room = document.querySelector("#voiceCallRoom");
  const mini = document.querySelector("#voiceMiniPlayer");
  room.hidden = !open;
  room.classList.toggle("hide", !open);
  room.setAttribute("aria-modal", String(open));
  mini.hidden = true;
  voiceCallActive = open;
  const toggle = document.querySelector("#voiceToggle");
  toggle.setAttribute("aria-pressed", String(open));
  toggle.textContent = open ? "📞 End Dr. Eco call" : "📞 Call Dr. Eco";
  if (open) {
    voiceMuted = false;
    document.querySelector("#voiceMuteButton").setAttribute("aria-pressed", "false");
    document.querySelector("#voiceMuteButton").textContent = "🎙️ Mute mic";
    document.querySelector("#voiceCaption").textContent = "Connecting to Dr. Eco…";
    document.querySelector("#voiceTranscript").replaceChildren();
    drEcoVoice = new DrEcoVoiceLive(setVoiceCallStatus);
    void drEcoVoice.startSession(chatCourseCode, currentStudentLevel);
    document.querySelector("#voiceEndButton").focus();
    return;
  }
  if (drEcoVoice) drEcoVoice.stopSession();
  drEcoVoice = null;
  setVoiceCallStatus("IDLE", "Call ended");
}

function publishVoiceTranscript(userText, assistantText) {
  const transcript = document.querySelector("#voiceTranscript");
  const addLine = (speaker, text) => {
    const clean = String(text || "").trim();
    if (!clean) return;
    const line = document.createElement("p");
    const label = document.createElement("b");
    label.textContent = `${speaker}: `;
    line.append(label, document.createTextNode(clean));
    transcript.append(line);
    while (transcript.children.length > 8) transcript.firstElementChild.remove();
    const miniCaption = document.querySelector("#voiceMiniTranscript");
    miniCaption.textContent = `${speaker}: ${clean}`;
    appendChatMessage(`${speaker}: ${clean}`, speaker === "You" ? "user" : "assistant");
  };
  addLine("You", userText);
  addLine("Dr. Eco", assistantText);
}

document.querySelector("#voiceMinimizeButton").addEventListener("click", () => {
  const room = document.querySelector("#voiceCallRoom");
  room.hidden = true;
  room.classList.add("hide");
  room.setAttribute("aria-modal", "false");
  document.querySelector("#voiceMiniPlayer").hidden = false;
});
document.querySelector("#voiceMiniOpen").addEventListener("click", () => {
  const room = document.querySelector("#voiceCallRoom");
  room.hidden = false;
  room.classList.remove("hide");
  room.setAttribute("aria-modal", "true");
});
document.querySelector("#voiceMiniEnd").addEventListener("click", () => toggleVoiceCallRoom(false));

function speakText(text) {
  if (!voiceSpeakerOn || !("speechSynthesis" in window)
    || typeof window.SpeechSynthesisUtterance !== "function") return;
  window.speechSynthesis.cancel();
  const utterance = new window.SpeechSynthesisUtterance(String(text).replace(/\*\*/g, ""));
  utterance.rate = 1;
  utterance.pitch = 1;
  const voice = window.speechSynthesis.getVoices().find((item) => {
    const name = item.name.toLowerCase();
    return item.lang.toLowerCase().includes("en")
      && (name.includes("google") || name.includes("natural") || name.includes("samantha"));
  });
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

document.querySelector("#voiceMuteButton").addEventListener("click", (event) => {
  voiceMuted = !voiceMuted;
  if (drEcoVoice) drEcoVoice.setMuted(voiceMuted);
  event.currentTarget.setAttribute("aria-pressed", String(voiceMuted));
  event.currentTarget.textContent = voiceMuted ? "🔇 Unmute mic" : "🎙️ Mute mic";
  if (voiceCallActive) setVoiceCallStatus(voiceMuted ? "IDLE" : "LISTENING", voiceMuted ? "Microphone muted" : "Listening");
});
document.querySelector("#voiceSpeakerButton").addEventListener("click", (event) => {
  voiceSpeakerOn = !voiceSpeakerOn;
  if (drEcoVoice) drEcoVoice.setSpeakerEnabled(voiceSpeakerOn);
  event.currentTarget.setAttribute("aria-pressed", String(voiceSpeakerOn));
  event.currentTarget.textContent = voiceSpeakerOn ? "🔊 Speaker on" : "🔇 Speaker off";
});
document.querySelector("#voiceEndButton").addEventListener("click", () => toggleVoiceCallRoom(false));

async function submitChatQuestion(question) {
  const cleaned = question.trim();
  if (!cleaned || chatRequestInProgress) return;
  if (!consumeStudyFuel(2)) return;
  appendChatMessage(cleaned, "user");
  chatRequestInProgress = true;
  startLoadingSfx();
  const responseMessage = appendChatMessage("Checking the course materials…", "assistant");
  renderLottieInto(responseMessage.querySelector(".message-avatar"), "typing-indicator.json", "💭", "Dr. Eco is thinking");
  try {
    const answer = await callGeminiRAG(cleaned, chatCourseCode, currentStudentLevel);
    renderDrEcoFormatting(responseMessage.querySelector("p"), answer);
    renderLottieInto(responseMessage.querySelector(".message-avatar"), "heart-eyes.json", "✨", "Dr. Eco response ready", { loop: false });
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
    renderDrEcoFormatting(responseMessage.querySelector("p"), `Dr. Eco could not respond: ${error.message}`);
    renderLottieInto(responseMessage.querySelector(".message-avatar"), "cat-idle.json", "🐾", "Dr. Eco is resting");
  } finally {
    stopCustomSfx("loading");
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
  speakText(text);
});
document.querySelector("#voiceToggle").addEventListener("click", () => {
  toggleVoiceCallRoom(!voiceCallActive);
});
document.querySelector("#micButton").addEventListener("click", () => document.querySelector("#voiceToggle").click());
document.querySelector("#cameraUploadButton")?.addEventListener("click", () => {
  const picker = document.querySelector("#cameraMaterialPicker");
  if (picker) { picker.value = ""; picker.click(); }
});
document.querySelector("#fileUploadButton")?.addEventListener("click", () => {
  const picker = document.querySelector("#chatMaterialPicker");
  if (picker) { picker.value = ""; picker.click(); }
});

const testDrawer = document.querySelector("#tdr");
const testState = { index: 0, count: 5, hearts: 3, answered: false, correctCount: 0, wrongCount: 0 };
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
      if (!consumeStudyFuel(1)) return;
      testState.answered = true;
      for (const item of document.querySelector("#testOptions").children) item.disabled = true;
      if (index === question.correctAnswer) {
        testState.correctCount += 1;
        studyProgress.quizAttempts.push({ course: chatCourseCode, question: question.prompt.slice(0, 160), correct: true, at: Date.now() });
        playAnswerFeedback(true);
        option.classList.add("is-correct");
        document.querySelector("#testFeedback").textContent = "Correct — state the principle, then show how it applies.";
        testFeedbackHeading.textContent = "Correct!";
        testAnswerDrawer.classList.add("is-correct");
        document.querySelector("#lecturerTip").textContent = "A definition plus a short application usually earns clearer marks than a list of keywords.";
        renderLottieInto(document.querySelector("#testFeedbackAnimation"), "level-up.json", "⬆", "Correct answer", { loop: false });
      } else {
        testState.wrongCount += 1;
        studyProgress.quizAttempts.push({ course: chatCourseCode, question: question.prompt.slice(0, 160), correct: false, at: Date.now() });
        playAnswerFeedback(false);
        testState.hearts -= 1;
        document.querySelector("#testFeedback").textContent = `Not quite. Correct answer: ${question.answers[question.correctAnswer]}.`;
        testFeedbackHeading.textContent = "Not quite";
        testAnswerDrawer.classList.add("is-wrong");
        renderLottieInto(document.querySelector("#testFeedbackAnimation"), "person-02-breathing.json", "↻", "Review this answer", { loop: false });
        document.querySelector("#lecturerTip").textContent = "When correcting an answer, name the concept and explain why the other option does not fit.";
      }
      studyProgress.quizAttempts = studyProgress.quizAttempts.slice(-60);
      saveStudyProgress();
      renderStudyPath();
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
  testState.correctCount = 0;
  testState.wrongCount = 0;
  testDrawer.hidden = false;
  document.querySelector("#testQuestion").textContent = "Loading indexed course materials and generating questions…";
  document.querySelector("#testOptions").replaceChildren();
  try {
    startLoadingSfx();
    practiceQuestions = await generateQuestionsFromMaterials(requestedCount, chatCourseCode, currentStudentLevel);
    testState.count = practiceQuestions.length;
    renderTestQuestion();
  } catch (error) {
    console.error("Could not generate practice questions:", error);
    document.querySelector("#testProgress").textContent = "PRACTICE UNAVAILABLE";
    document.querySelector("#testQuestion").textContent = `Could not generate questions: ${error.message}`;
  } finally {
    stopCustomSfx("loading");
  }
});
document.querySelector("#closeTest").addEventListener("click", () => { testDrawer.hidden = true; });
document.querySelector("#questionCount").addEventListener("change", (event) => {
  testState.count = Number(event.currentTarget.value);
});
document.querySelector("#nextTestQuestion").addEventListener("click", () => {
  if (!testState.answered) return;
  if (testState.hearts === 0 || testState.index + 1 >= testState.count) {
    const attemptedCount = Math.min(testState.index + 1, testState.count);
    const accuracy = attemptedCount ? Math.round((testState.correctCount / attemptedCount) * 100) : 0;
    const passed = accuracy >= 60 && testState.wrongCount < 5;
    playCustomSfx("complete");
    if (!passed) playCustomSfx("failTest");
    document.querySelector("#testProgress").textContent = `PRACTICE COMPLETE · ${testState.index + 1} / ${testState.count}`;
    document.querySelector("#testBar").style.width = "100%";
    document.querySelector("#testQuestion").textContent = `Practice complete · ${testState.correctCount} of ${attemptedCount} correct (${accuracy}%).`;
    document.querySelector("#testOptions").replaceChildren();
    document.querySelector("#testFeedback").textContent = `${testState.wrongCount ? `${testState.wrongCount} question${testState.wrongCount === 1 ? "" : "s"} added to your review focus. ` : "Great run — no missed questions this time. "}Practice only; this is not an official exam score.`;
    document.querySelector("#nextTestQuestion").disabled = true;
    renderLottieInto(document.querySelector("#testFeedbackAnimation"), "finish-line.json", "🏁", "Practice complete", { loop: false });
    return;
  }
  testState.index += 1;
  renderTestQuestion();
});

const fuelDialog = document.querySelector("#fuel");
document.querySelector("#pFuel").addEventListener("click", () => { fuelDialog.hidden = false; });
document.querySelector("#closeFuel").addEventListener("click", () => { fuelDialog.hidden = true; });
function launchPaystack(plan) {
  const durationMs = plan.toLowerCase().includes("semester")
    ? 120 * 24 * 60 * 60 * 1000
    : 48 * 60 * 60 * 1000;
  studyProgress.fuel = 100;
  studyProgress.demoPassExpiresAt = Date.now() + durationMs;
  studyProgress.referralRewardClaimed = true;
  saveStudyProgress();
  updateStudySummary();
  document.querySelector("#fuelStatus").textContent = `${plan} simulated in mock checkout: fuel refilled to 100/100 and demo access is active. No payment was processed.`;
}
for (const button of document.querySelectorAll(".pass-button")) {
  button.addEventListener("click", () => {
    launchPaystack(button.dataset.plan);
  });
}

const inviteBase = `${window.location.origin}${window.location.pathname}`;
const inviteLink = `${inviteBase}?invite=foldbook-demo`;
document.querySelector("#inviteLink").textContent = inviteLink;
document.querySelector("#shareInvite").href = `https://wa.me/?text=${encodeURIComponent(`Study with me on FoldBook: ${inviteLink}`)}`;
function renderInviteProgress() {
  const count = Math.min(5, studyProgress.referralCount);
  document.querySelector("#inviteCount").textContent = `${count} / 5`;
  document.querySelector("#inviteBar").style.width = `${count * 20}%`;
  const friends = document.querySelector("#inviteFriends");
  friends.replaceChildren();
  for (let index = 0; index < 5; index += 1) {
    const badge = document.createElement("span");
    badge.className = `invite-friend${index < count ? " is-joined" : ""}`;
    badge.textContent = index < count ? "✓" : "＋";
    badge.setAttribute("aria-label", index < count ? `Invite action ${index + 1} counted` : `Invite slot ${index + 1}`);
    friends.append(badge);
  }
}
async function persistStudentProfile() {
  if (!currentStudent || !S.user || !S.phoneNumber) return false;
  return syncOptedInWhatsAppProfile(S.phoneNumber, currentStudent.registration, currentStudent.name);
}

async function incrementReferralCount(action) {
  studyProgress.referralCount += 1;
  if (S.user) S.user.referralCount = studyProgress.referralCount;
  let earnedReward = false;
  if (studyProgress.referralCount >= 5 && !studyProgress.referralRewardClaimed) {
    studyProgress.referralRewardClaimed = true;
    studyProgress.fuel = Math.min(100, studyProgress.fuel + 50);
    studyProgress.demoPassExpiresAt = Date.now() + 48 * 60 * 60 * 1000;
    earnedReward = true;
  }
  S.referralCount = studyProgress.referralCount;
  saveStudyProgress();
  persistAuthSession();
  renderInviteProgress();
  if (earnedReward) {
    const rewardAnimation = document.querySelector("#inviteRewardAnimation");
    rewardAnimation.hidden = false;
    renderLottieInto(rewardAnimation, "delivery-arrival.json", "🎁", "Study reward unlocked", { loop: false });
  }
  updateFuelDisplay();
  updateStudySummary();
  const status = document.querySelector("#inviteStatus");
  status.textContent = earnedReward
    ? `5 ${action} actions reached! +50 fuel credits and a 48-hour all-access demo pass unlocked. Referrals are not verified sign-ups.`
    : `${action} recorded (${studyProgress.referralCount} total). This action count does not verify a sign-up.`;
  const saved = await persistStudentProfile();
  if (!saved) {
    console.warn("Referral count could not be synced to Supabase.");
    document.querySelector("#inviteRewardStatus").textContent = "Saved on this device; referral sync to Supabase failed.";
  } else {
    document.querySelector("#inviteRewardStatus").textContent = earnedReward
      ? "Reward active for 48 hours. +50 fuel credits were added (up to 100/100)."
      : "Referral action synced to your opted-in profile.";
  }
  return earnedReward;
}
document.querySelector("#copyInvite").addEventListener("click", async () => {
  try {
    await window.navigator.clipboard.writeText(inviteLink);
    await incrementReferralCount("copy");
  } catch (error) {
    console.error("Could not copy invite link:", error);
    document.querySelector("#inviteStatus").textContent = "Copy is unavailable. Select and copy the link above.";
  }
});
document.querySelector("#shareInvite").addEventListener("click", () => {
  void incrementReferralCount("share");
});

const soundEnabled = studyProgress.soundEnabled;
soundOn = soundEnabled;
syncCourseControls();
renderStudyPath();
updateStudySummary();
renderMascot("person", "chatMascot");
renderLottieInto(document.querySelector("#streakAnimation"), "streak-flame.json", "🔥", "Daily streak");
renderInviteProgress();
chatMessages.replaceChildren();
appendChatMessage("Hey! I’m Dr. Eco 👋 What are we tackling today? Ask me about your Economics course, or say “quiz me” and I’ll make practice questions from your indexed notes. We’ve got this!", "assistant");
setNavigationAvailable(false);

const SUPABASE_URL = "https://fdutgltyptcqeyajsnua.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkdXRnbHR5cHRjcWV5YWpzbnVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNTk4NTUsImV4cCI6MjEwNzkzNTg1NX0.wR74d5wS15Ea5O2_3_0BO8RtyZhzV9SuXELDGs-eNCg";
const SUPABASE_ANON_KEY_VALID = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(SUPABASE_ANON_KEY)
  || /^sb_publishable_[A-Za-z0-9_-]+$/.test(SUPABASE_ANON_KEY);
const supabaseClient = SUPABASE_ANON_KEY_VALID && window.supabase && typeof window.supabase.createClient === "function"
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
const studentMaterialForm = document.querySelector("#studentMaterialForm");
const studentMaterialStatus = document.querySelector("#studentMaterialStatus");
const studentMaterialList = document.querySelector("#studentMaterialList");
const studentMaterialFile = document.querySelector("#studentMaterialFile");
const chatMaterialPicker = document.querySelector("#chatMaterialPicker");
const cameraMaterialPicker = document.querySelector("#cameraMaterialPicker");
const studentUploadDialog = document.querySelector("#studentUploadDialog");
let pendingStudentMaterialFile = null;
let pendingStudentMaterialText = "";
let studentMaterialProcessingToken = 0;
let studentMaterialSaving = false;
function showStudentUploadProgress(progress, message) {
  const wrap = document.querySelector("#studentUploadProgressWrap");
  wrap.hidden = false;
  document.querySelector("#studentUploadProgress").value = progress;
  document.querySelector("#studentUploadProgressValue").textContent = `${progress}%`;
  document.querySelector("#studentUploadProgressTitle").textContent = message;
  studentMaterialStatus.textContent = message;
}
async function prepareStudentMaterial(file) {
  if (!file) return;
  pendingStudentMaterialFile = file;
  pendingStudentMaterialText = "";
  const token = ++studentMaterialProcessingToken;
  document.querySelector("#studentMaterialTitle").value = file.name.replace(/\.[^/.]+$/, "");
  document.querySelector("#studentUploadFileName").textContent = file.name;
  document.querySelector("#studentCustomCourseCode").value = chatCourseCode || "";
  document.querySelector("#studentCustomCourseTitle").value = studentCustomCourses.find((course) => course.code === chatCourseCode)?.title
    || coursesForLevel(currentStudentLevel).find((course) => course.code === chatCourseCode)?.title || "";
  document.querySelector("#studentMaterialFile").value = "";
  document.querySelector("#studentUploadDetails").hidden = true;
  const submit = document.querySelector("#studentUploadSubmit");
  submit.disabled = true;
  document.querySelector("#studentUploadProgressWrap").hidden = false;
  studentUploadDialog.hidden = false;
  showStudentUploadProgress(15, "Processing your document on this device…");
  try {
    const extracted = await extractStudentMaterialText(file);
    if (token !== studentMaterialProcessingToken || pendingStudentMaterialFile !== file) return;
    pendingStudentMaterialText = extracted;
    document.querySelector("#studentUploadDetails").hidden = false;
    showStudentUploadProgress(100, "Document ready. Add the course details and a short description, then save.");
    submit.disabled = false;
    document.querySelector("#studentMaterialTitle").focus({ preventScroll: true });
  } catch (error) {
    if (token !== studentMaterialProcessingToken || pendingStudentMaterialFile !== file) return;
    showStudentUploadProgress(100, `Could not process this document: ${error.message || "Try another PDF or photo."}`);
  }
}
chatMaterialPicker?.addEventListener("change", () => prepareStudentMaterial(chatMaterialPicker.files?.[0]));
cameraMaterialPicker?.addEventListener("change", () => prepareStudentMaterial(cameraMaterialPicker.files?.[0]));
studentMaterialFile?.addEventListener("change", () => {
  const file = studentMaterialFile.files?.[0];
  if (!file) return;
  void prepareStudentMaterial(file);
});
function closeStudentUpload() {
  if (studentMaterialSaving) return;
  studentUploadDialog.hidden = true;
  studentMaterialProcessingToken += 1;
  pendingStudentMaterialFile = null;
  pendingStudentMaterialText = "";
  document.querySelector("#studentUploadSubmit").disabled = true;
  studentMaterialForm.reset();
}
document.querySelector("#studentUploadClose")?.addEventListener("click", closeStudentUpload);
document.querySelector("#studentUploadCancel")?.addEventListener("click", closeStudentUpload);
document.querySelector("#studentUploadReplace")?.addEventListener("click", () => {
  if (chatMaterialPicker) { chatMaterialPicker.value = ""; chatMaterialPicker.click(); }
});
document.querySelector("#studyTone").value = studyProgress.studyTone;
document.querySelector("#studyPace").value = studyProgress.studyPace;
document.querySelector("#studyVoice").value = studyProgress.studyVoice;
document.querySelector("#studyTone").addEventListener("change", (event) => {
  studyProgress.studyTone = event.currentTarget.value;
  saveStudyProgress();
});
document.querySelector("#studyPace").addEventListener("change", (event) => {
  studyProgress.studyPace = event.currentTarget.value;
  saveStudyProgress();
});
document.querySelector("#studyVoice").addEventListener("change", (event) => {
  studyProgress.studyVoice = event.currentTarget.value;
  saveStudyProgress();
});

async function refreshStudentMaterials() {
  if (!studentMaterialList || !supabaseClient) return;
  const owner = await currentStudentMaterialOwner();
  if (!owner) return;
  const { data, error } = await supabaseClient.from("student_materials")
    .select("id,title,course_code,course_title,file_name,created_at")
    .eq("owner_id", owner.id).order("created_at", { ascending: false }).limit(25);
  if (error) throw error;
  studentCustomCourses = [...new Map((data || []).map((item) => [item.course_code, { code: item.course_code, title: item.course_title || "My course" }])).values()]
    .filter((item) => !coursesForLevel(currentStudentLevel).some((course) => course.code === item.code));
  const priorCourse = chatCourseCode;
  updateChatCourseDropdown(priorCourse);
  studentMaterialList.replaceChildren();
  for (const material of data || []) {
    const row = document.createElement("li");
    const label = document.createElement("span");
    const remove = document.createElement("button");
    label.textContent = `${material.title} · ${material.course_code}${material.course_title ? ` ${material.course_title}` : ""}`;
    remove.type = "button";
    remove.className = "card-secondary-button";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete ${material.title}`);
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      const { data: owned } = await supabaseClient.from("student_materials").select("storage_path").eq("id", material.id).maybeSingle();
      const { error: deleteError } = await supabaseClient.from("student_materials").delete().eq("id", material.id);
      if (!deleteError && owned?.storage_path) await supabaseClient.storage.from("student-materials").remove([owned.storage_path]);
      if (deleteError) studentMaterialStatus.textContent = deleteError.message;
      else { studentMaterialStatus.textContent = "Material deleted."; await refreshStudentMaterials(); }
    });
    row.append(label, remove);
    studentMaterialList.append(row);
  }
}

async function extractStudentMaterialText(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error("Choose a file smaller than 10 MB.");
  const extension = file.name.toLowerCase().split(".").pop();
  if (file.type === "application/pdf" || extension === "pdf") {
    const pdfjs = await ensureExternalScript("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js", "pdfjsLib");
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    if (pdf.numPages > 100) throw new Error("PDFs are limited to 100 pages.");
    const pages = [];
    for (let n = 1; n <= pdf.numPages && pages.join("\n").length < 12000; n += 1) {
      const page = await pdf.getPage(n);
      pages.push((await page.getTextContent()).items.map((item) => item.str).join(" "));
    }
    let text = pages.join("\n").trim();
    if (text.length < 80) {
      const tesseract = await ensureExternalScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js", "Tesseract");
      const worker = await tesseract.createWorker("eng");
      try {
        const scannedPages = [];
        for (let n = 1; n <= Math.min(pdf.numPages, 10) && scannedPages.join("\n").length < 12000; n += 1) {
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(1.5, 1600 / base.width) });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
          scannedPages.push((await worker.recognize(canvas)).data.text);
        }
        if (scannedPages.join("\n").trim().length > text.length) text = scannedPages.join("\n").trim();
      } finally { await worker.terminate(); }
    }
    if (!text) throw new Error("No readable text was found. Try clear photos of the pages.");
    return text.slice(0, 12000);
  }
  if (["image/jpeg", "image/png", "image/webp"].includes(file.type) || ["jpg", "jpeg", "png", "webp"].includes(extension)) {
    const tesseract = await ensureExternalScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js", "Tesseract");
    const worker = await tesseract.createWorker("eng");
    try {
      const { data } = await worker.recognize(file);
      if (!data.text.trim()) throw new Error("No readable text was found. Try a clearer, well-lit photo.");
      return data.text.trim().slice(0, 12000);
    } finally { await worker.terminate(); }
  }
  throw new Error("Upload a PDF, JPG, PNG, or WebP photo.");
}

studentMaterialForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = pendingStudentMaterialFile || studentMaterialFile.files?.[0];
  const title = document.querySelector("#studentMaterialTitle").value.trim();
  const courseCode = document.querySelector("#studentCustomCourseCode").value.trim().toUpperCase().replace(/\s+/g, " ");
  const courseTitle = document.querySelector("#studentCustomCourseTitle").value.trim();
  const description = document.querySelector("#studentMaterialDescription").value.trim();
  if (!file || !title || !courseCode || !courseTitle || !description) return;
  if (!/^[A-Z]{2,6}\s?-?\s?\d{3,4}[A-Z]?$/.test(courseCode)) {
    studentMaterialStatus.textContent = "Enter a valid course code, for example ECO 214 or GST121.";
    return;
  }
  const submit = studentMaterialForm.querySelector("button[type=submit]");
  submit.disabled = true;
  studentMaterialSaving = true;
  try {
    if (!pendingStudentMaterialText) throw new Error("The document has not finished processing yet. Please choose it again.");
    showStudentUploadProgress(5, "Step 1 of 3 · Securing your private study space…");
    const user = await ensureStudentAuth();
    const extracted = pendingStudentMaterialText;
    showStudentUploadProgress(55, "Step 2 of 3 · Document processed. Saving your material and course details…");
    const id = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
    const inferredMime = ({ pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" })[file.name.toLowerCase().split(".").pop()];
    const mimeType = ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type) ? file.type : inferredMime;
    if (!mimeType) throw new Error("Upload a PDF, JPG, PNG, or WebP photo.");
    const storagePath = `${user.id}/${id}/${safeName}`;
    const { error: uploadError } = await supabaseClient.storage.from("student-materials")
      .upload(storagePath, file, { contentType: mimeType, upsert: false });
    if (uploadError) throw uploadError;
    const { error: rowError } = await supabaseClient.from("student_materials").insert({
      id, owner_id: user.id, title, course_code: courseCode, course_title: courseTitle,
      description, level: currentStudentLevel,
      file_name: safeName, storage_path: storagePath, mime_type: mimeType, extracted_text: extracted,
    });
    if (rowError) {
      await supabaseClient.storage.from("student-materials").remove([storagePath]);
      throw rowError;
    }
    showStudentUploadProgress(100, "Step 3 of 3 · Saved! Dr. Eco can use it, and the course details are ready for admin review.");
    pendingStudentMaterialText = "";
    pendingStudentMaterialFile = null;
    await refreshStudentMaterials().catch((refreshError) => console.warn("Material saved, but the list could not refresh:", refreshError));
    window.setTimeout(() => {
      studentUploadDialog.hidden = true;
      studentMaterialForm.reset();
      document.querySelector("#studentUploadProgressWrap").hidden = true;
      showNotice("Material saved and sent to the admin review queue.");
    }, 500);
  } catch (error) {
    studentMaterialStatus.textContent = error.message || "Could not save this material. Please try again.";
  } finally {
    studentMaterialSaving = false;
    submit.disabled = !pendingStudentMaterialText;
  }
});

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
const adminPasscodeGroup = document.querySelector("#adminPasscodeGroup");
const adminPasscodeInput = document.querySelector("#adminPasscode");
let activeCardContext = null;
let verificationTrigger = null;

async function handleIndexMaterialSubmit() {
  if (queuedMaterialFiles.some((item) => item.status === "queued")) {
    adminMaterialSubmit.disabled = true;
    await processMaterialQueue();
    adminMaterialSubmit.disabled = false;
    return;
  }
  const level = adminLevelSelect.value;
  const courseCode = adminCourseSelect.value;
  const title = adminMaterialTitle.value.trim();
  const text = adminMaterialText.value.trim();

  if (!title || !text || !coursesForLevel(level).some((course) => course.code === courseCode)) {
    sfx.no();
    adminMaterialStatus.textContent = "Choose a valid level and course, and fill in both the title and course content.";
    return;
  }
  adminMaterialSubmit.disabled = true;
  adminMaterialStatus.textContent = "Indexing content into the course materials table…";
  startLoadingSfx();
  try {
    const response = await fetch("/api/admin/course-materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, courseCode, title, content: text }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Material indexing failed.");

    sfx.win();
    adminMaterialStatus.textContent = `Successfully indexed "${title}" under ${level} (${courseCode}) in ${result.indexedChunks || 1} searchable section${result.indexedChunks === 1 ? "" : "s"}.`;
    adminMaterialTitle.value = "";
    adminMaterialText.value = "";
  } catch (error) {
    sfx.no();
    console.error("Course material insert failed:", error);
    adminMaterialStatus.textContent = `Error saving material: ${error.message || "Supabase request failed."}`;
  } finally {
    stopCustomSfx("loading");
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

async function lookupImportedStudentResults(registration, fullName) {
  const response = await fetch("/api/results/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registration, fullName }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Results could not be loaded.");
  if (!payload.student) throw new Error("No matching result was found. Check the name and registration number.");
  return payload.student;
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

let adminDirectoryCache = null;
async function renderAdminDirectory(filter = "") {
  if (!S.isAdmin) return;
  if (!adminDirectoryCache) {
    adminStatus.textContent = "Loading private broadsheets…";
    try {
      const response = await requestAdminApi("/api/admin/broadsheets", { action: "list" });
      adminDirectoryCache = response.students || {};
    } catch (error) {
      adminStatus.textContent = error.message || "Broadsheets could not be loaded.";
      return;
    }
  }
  const normalizedFilter = filter.trim().toLocaleLowerCase();
  adminResults.replaceChildren();
  for (const [registration, student] of Object.entries(adminDirectoryCache)) {
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
  if (adminStatus) {
    adminStatus.textContent = `${adminResults.children.length} private broadsheet record${adminResults.children.length === 1 ? "" : "s"} available.`;
  }
}

async function requestAdminApi(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The admin request failed.");
  return result;
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
  startLoadingSfx();
  try {
    const bytes = await selectedBroadsheetFile.arrayBuffer();
    const workbook = window.XLSX.read(bytes, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("The selected file has no worksheet.");
    const records = normalizeBroadsheetRows(window.XLSX.utils.sheet_to_json(sheet, { defval: "" }));
    const result = await requestAdminApi("/api/admin/broadsheets", { records });
    broadsheetStatus.textContent = `Imported ${result.imported} score records successfully.`;
    adminDirectoryCache = null;
    await renderAdminDirectory(adminSearch.value);
    selectedBroadsheetFile = null;
    broadsheetInput.value = "";
  } catch (error) {
    console.error("Broadsheet import failed:", error);
    broadsheetStatus.textContent = `Import failed: ${error.message || "Supabase request failed."}`;
  } finally {
    stopCustomSfx("loading");
    broadsheetImportButton.disabled = false;
  }
});

async function loadCourseCatalog({ updateStatus = true } = {}) {
  const status = document.querySelector("#catalogStatus");
  const table = document.querySelector("#catalogCourses");
  if (!supabaseClient) {
    status.textContent = "Supabase is unavailable; course catalog could not be loaded.";
    return;
  }
  try {
    const { courses } = await requestAdminApi("/api/admin/course-catalog", { action: "list" });
    if (Array.isArray(courses)) {
      UNIUYO_COURSE_CATALOG = Object.fromEntries(["100L", "200L", "300L", "400L"].map((level) => [
        level,
        courses.filter((course) => course.level === level).map((course) => ({
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
            await requestAdminApi("/api/admin/course-catalog", {
              action: "delete", level, courseCode: course.code,
            });
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
    if (updateStatus) status.textContent = `Loaded ${table.children.length} courses.`;
    return true;
  } catch (error) {
    console.error("Course catalog fetch failed:", error);
    if (updateStatus) status.textContent = `Could not load the course catalog: ${error.message || "Supabase request failed."}`;
    return false;
  }
}

const saveCatalogCourseButton = document.querySelector("#saveCatalogCourse");
saveCatalogCourseButton.addEventListener("click", async () => {
  const level = document.querySelector("#catalogLevel").value;
  const code = document.querySelector("#catalogCode").value.trim().toUpperCase().replace(/\s+/g, " ");
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
  saveCatalogCourseButton.disabled = true;
  status.textContent = `Saving ${code} to the course catalog…`;
  try {
    await requestAdminApi("/api/admin/course-catalog", {
      action: "upsert", level, courseCode: code, title, creditUnits: units,
    });
    const courses = UNIUYO_COURSE_CATALOG[level].filter((course) => course.code !== code);
    courses.push({ code, title, units });
    UNIUYO_COURSE_CATALOG[level] = courses;
    updateAdminCourseDropdown();
    document.querySelector("#catalogCode").value = "";
    document.querySelector("#catalogTitle").value = "";
    status.textContent = `Saved ${code} under ${level}. It is ready to select in the AI Indexer.`;
    await loadCourseCatalog({ updateStatus: false });
  } catch (error) {
    console.error("Course catalog save failed:", error);
    status.textContent = `Could not save course: ${error.message || "Supabase request failed."}`;
  } finally {
    saveCatalogCourseButton.disabled = false;
  }
});

async function loadStudentRecords() {
  const status = document.querySelector("#studentRecordsStatus");
  const tableBody = document.querySelector("#studentRecords");
  if (!S.isAdmin) {
    showAccessRestrictedNotice();
    return;
  }
  status.textContent = "Loading consented WhatsApp records…";
  try {
    const { students } = await requestAdminApi("/api/admin/student-records");
    tableBody.replaceChildren();
    for (const student of students || []) {
      const row = document.createElement("tr");
      [
        student.full_name,
        student.reg_number,
        student.phone_number,
        String(Number.isFinite(student.streak_count) ? student.streak_count : 0),
        String(Number.isFinite(student.activity_count) ? student.activity_count : 0),
        student.last_activity_at ? new Date(student.last_activity_at).toLocaleString() : "Not yet",
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

async function loadAdminCourseMaterials() {
  const status = document.querySelector("#adminMaterialsStatus");
  const list = document.querySelector("#adminMaterialsList");
  if (!S.isAdmin) return showAccessRestrictedNotice();
  status.textContent = "Loading shared course materials…";
  try {
    const { materials } = await requestAdminApi("/api/admin/materials", { action: "list" });
    list.replaceChildren();
    for (const material of materials || []) {
      const card = document.createElement("article");
      card.className = "student-material-admin-card";
      const title = document.createElement("h3");
      title.textContent = `${material.title} · ${material.course_code}`;
      const details = document.createElement("p");
      details.textContent = `${material.level} · ${material.chunk_count} indexed section${material.chunk_count === 1 ? "" : "s"}`;
      const date = document.createElement("small");
      date.textContent = material.created_at ? new Date(material.created_at).toLocaleString() : "Date unavailable";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "card-secondary-button";
      remove.textContent = "Remove material";
      remove.addEventListener("click", async () => {
        if (!window.confirm(`Remove “${material.title}” from ${material.course_code}?`)) return;
        remove.disabled = true;
        try {
          await requestAdminApi("/api/admin/materials", {
            action: "delete",
            level: material.level,
            courseCode: material.course_code,
            title: material.title,
            createdAt: material.created_at,
          });
          await loadAdminCourseMaterials();
        } catch (error) {
          remove.disabled = false;
          status.textContent = error.message || "Material could not be removed.";
        }
      });
      card.append(title, details, date, remove);
      list.append(card);
    }
    status.textContent = `Loaded ${list.children.length} shared course material${list.children.length === 1 ? "" : "s"}.`;
  } catch (error) {
    status.textContent = error.message || "Shared materials could not be loaded.";
  }
}
document.querySelector("#loadAdminMaterials")?.addEventListener("click", loadAdminCourseMaterials);

async function loadStudentMaterialSubmissions() {
  const status = document.querySelector("#studentMaterialsAdminStatus");
  const list = document.querySelector("#studentMaterialsAdminList");
  if (!S.isAdmin) return showAccessRestrictedNotice();
  status.textContent = "Loading private student submissions for admin review…";
  try {
    const response = await fetch("/api/admin/student-materials", { credentials: "same-origin", headers: { Accept: "application/json" } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    list.replaceChildren();
    for (const material of result.materials || []) {
      const card = document.createElement("article");
      card.className = "student-material-admin-card";
      const heading = document.createElement("h3");
      heading.textContent = `${material.title} · ${material.course_code}`;
      const course = document.createElement("p");
      course.textContent = `${material.course_title || "Course title not provided"} · ${material.level || "Level not provided"}`;
      const description = document.createElement("p");
      description.textContent = material.description || "No document description provided.";
      const meta = document.createElement("small");
      meta.textContent = `${material.file_name || "Uploaded material"} · ${material.created_at ? new Date(material.created_at).toLocaleString() : "Date unavailable"}`;
      const textDetails = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Preview extracted text";
      const excerpt = document.createElement("pre");
      excerpt.textContent = material.extracted_text || "No text was extracted.";
      textDetails.append(summary, excerpt);
      const actions = document.createElement("div");
      actions.className = "student-material-admin-actions";
      const indexButton = document.createElement("button");
      indexButton.type = "button";
      indexButton.className = "results-submit";
      indexButton.textContent = "Review in AI Indexer";
      indexButton.addEventListener("click", async () => {
        const level = ["100L", "200L", "300L", "400L"].includes(material.level) ? material.level : "100L";
        const normalizedCode = String(material.course_code || "").trim().toUpperCase().replace(/\s+/g, " ");
        const catalogHasCourse = coursesForLevel(level).some((item) => item.code === normalizedCode);
        if (!catalogHasCourse) {
          document.querySelector("#catalogLevel").value = level;
          document.querySelector("#catalogCode").value = normalizedCode;
          document.querySelector("#catalogTitle").value = material.course_title || "";
          document.querySelector("#catalogUnits").value = "3";
          document.querySelector('[data-admin-view="catalog"]').click();
          document.querySelector("#catalogStatus").textContent = "Review this student-submitted course and save it to the catalog before indexing its material.";
          return;
        }
        await loadCourseCatalog({ updateStatus: false });
        document.querySelector("#adminLevelSelect").value = level;
        updateAdminCourseDropdown();
        document.querySelector("#adminCourseSelect").value = normalizedCode;
        document.querySelector("#adminMaterialTitle").value = material.title || "";
        document.querySelector("#adminMaterialText").value = material.extracted_text || "";
        document.querySelector('[data-admin-view="indexer"]').click();
        document.querySelector("#adminMaterialStatus").textContent = "Student material loaded for review. Confirm the content before adding it to the shared course library.";
      });
      const catalogButton = document.createElement("button");
      catalogButton.type = "button";
      catalogButton.className = "card-secondary-button";
      catalogButton.textContent = "Review course details";
      catalogButton.addEventListener("click", () => {
        document.querySelector("#catalogLevel").value = material.level || "100L";
        document.querySelector("#catalogCode").value = material.course_code || "";
        document.querySelector("#catalogTitle").value = material.course_title || "";
        document.querySelector("#catalogUnits").value = "3";
        document.querySelector('[data-admin-view="catalog"]').click();
      });
      actions.append(indexButton, catalogButton);
      card.append(heading, course, description, meta, textDetails, actions);
      list.append(card);
    }
    status.textContent = `Loaded ${list.children.length} student submission${list.children.length === 1 ? "" : "s"}.`;
  } catch (error) {
    status.textContent = `Could not load submissions: ${error.message || "Request failed."}`;
  }
}
document.querySelector("#loadStudentMaterials")?.addEventListener("click", loadStudentMaterialSubmissions);

function normalizeWhatsAppPhone(phoneNumber) {
  const digits = phoneNumber.replace(/\D/g, "");
  const formattedPhone = digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
  return /^234[789]\d{9}$/.test(formattedPhone) ? formattedPhone : "";
}

let lastWhatsAppOptInError = "";
async function saveWhatsAppOptIn(phoneNumber, regNumber, fullName, { silent = false } = {}) {
  if (!phoneNumber) return false;

  try {
    lastWhatsAppOptInError = "";
    const formattedPhone = normalizeWhatsAppPhone(phoneNumber);
    if (!formattedPhone) throw new Error("Enter a valid Nigerian mobile number.");
    if (!supabaseClient) throw new Error("The opt-in service is unavailable.");
    const { data: authData } = await supabaseClient.auth.getSession();
    const anonymousUser = authData.session?.user?.is_anonymous ? authData.session.user : null;

    const { error } = await supabaseClient
      .from("whatsapp_optins")
      .upsert({
        ...(anonymousUser ? { owner_id: anonymousUser.id } : {}),
        phone_number: formattedPhone,
        whatsapp_number: formattedPhone,
        reg_number: regNumber,
        full_name: fullName,
        streak_count: studyProgress.streak,
        activity_count: studyProgress.activityDays.length,
        referral_count: studyProgress.referralCount,
        avatar_url: S.user?.avatarUrl || null,
        avatar_lottie: S.user?.avatarLottie || null,
        last_activity_at: studyProgress.lastStudyDate ? new Date(`${studyProgress.lastStudyDate}T00:00:00`).toISOString() : null,
        opted_in: true,
      }, { onConflict: "phone_number" });
    if (error) throw error;
    console.info("WhatsApp number saved for up to two daily study reminders.");
    return true;
  } catch (error) {
    lastWhatsAppOptInError = error.message || "Supabase could not save the contact.";
    if (!silent) console.warn("WhatsApp opt-in error:", lastWhatsAppOptInError);
    else console.error("WhatsApp opt-in was not saved:", lastWhatsAppOptInError);
    return false;
  }
}

async function syncOptedInWhatsAppProfile(phoneNumber, regNumber, fullName) {
  try {
    const formattedPhone = normalizeWhatsAppPhone(phoneNumber);
    if (!formattedPhone || !supabaseClient) return false;
    const { error } = await supabaseClient
      .from("whatsapp_optins")
      .update({
        whatsapp_number: formattedPhone,
        reg_number: regNumber,
        full_name: fullName,
        streak_count: studyProgress.streak,
        activity_count: studyProgress.activityDays.length,
        referral_count: studyProgress.referralCount,
        avatar_url: S.user?.avatarUrl || null,
        avatar_lottie: S.user?.avatarLottie || null,
        last_activity_at: studyProgress.lastStudyDate ? new Date(`${studyProgress.lastStudyDate}T00:00:00`).toISOString() : null,
      })
      .eq("phone_number", formattedPhone)
      .eq("opted_in", true);
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn("Could not sync the opted-in WhatsApp profile:", error.message);
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
  if (!document.querySelector("#chatSettingsDrawer").hidden) closeChatSettingsDrawer();
  else if (!document.querySelector("#profileModal").hidden) document.querySelector("#profileModal").hidden = true;
  else if (!document.querySelector("#voiceCallRoom").hidden) toggleVoiceCallRoom(false);
  else if (!authModal.hidden) closeVerification();
  else if (!testDrawer.hidden) testDrawer.hidden = true;
  else if (!fuelDialog.hidden) fuelDialog.hidden = true;
});
document.querySelector("#print-card").addEventListener("click", () => window.print());
document.querySelector("#dismiss-card").addEventListener("click", () => {
  posterWrapper.hidden = true;
});
async function signOut() {
  if (voiceCallActive) toggleVoiceCallRoom(false);
  try {
    await supabaseClient?.auth?.signOut({ scope: "local" });
    window.localStorage.removeItem(STUDENT_MATERIAL_OWNER_KEY);
  } catch (error) {
    console.warn("Could not clear this browser's private upload identity:", error);
  }
  currentStudent = null;
  isMasterAdmin = false;
  S.isAdmin = false;
  S.student = null;
  S.user = null;
  S.phoneNumber = "";
  window.localStorage.removeItem(AUTH_SESSION_KEY);
  adminPasscodeInput.value = "";
  void fetch("/api/admin/session", { method: "DELETE" }).catch((error) => {
    console.warn("Could not end the admin session on the server:", error);
  });
  void fetch("/api/student/auth", { method: "DELETE", credentials: "same-origin" }).catch((error) => {
    console.warn("Could not end the student session on the server:", error);
  });
  document.querySelector("#profileModal").hidden = true;
  document.querySelector("#authStatus").textContent = "";
  showStage("authView");
}

document.querySelector("#adminLogout").addEventListener("click", signOut);
document.querySelector("#studentSignOut").addEventListener("click", signOut);
document.querySelector("#profileSignOut").addEventListener("click", signOut);
adminSearch.addEventListener("input", () => renderAdminDirectory(adminSearch.value));

function studentProfileStorageKey(registration) {
  return `foldBook.profile.${encodeURIComponent(registration)}`;
}

function loadSavedStudentProfile(registration) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(studentProfileStorageKey(registration)) || "{}");
    return {
      avatarUrl: typeof saved.avatarUrl === "string"
        && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(saved.avatarUrl)
        && saved.avatarUrl.length <= 140000 ? saved.avatarUrl : "",
      avatarLottie: typeof saved.avatarLottie === "string"
        && PROFILE_AVATAR_LOTTIES.has(saved.avatarLottie) ? saved.avatarLottie : "",
    };
  } catch (error) {
    console.warn("Could not load this browser's saved profile:", error);
    return { avatarUrl: "", avatarLottie: "" };
  }
}

function persistAuthSession() {
  if (!currentStudent || !S.user) return;
  try {
    window.localStorage.setItem(studentProfileStorageKey(currentStudent.registration), JSON.stringify({
      avatarUrl: S.user.avatarUrl || "",
      avatarLottie: S.user.avatarLottie || "",
    }));
    window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
      role: "student",
      name: currentStudent.name,
      registration: currentStudent.registration,
      phoneNumber: S.phoneNumber,
      level: S.level,
      avatarUrl: S.user.avatarUrl || "",
      avatarLottie: S.user.avatarLottie || "",
      referralCount: studyProgress.referralCount,
    }));
  } catch (error) {
    console.error("Could not save your profile to this browser:", error);
    document.querySelector("#profileStatus").textContent = "Profile changes could not be saved on this device.";
  }
}

document.querySelector("#profileButton").addEventListener("click", () => {
  renderProfile();
  document.querySelector("#profileStatus").textContent = "";
  document.querySelector("#profileModal").hidden = false;
  document.querySelector("#closeProfile").focus();
});
document.querySelector("#closeProfile").addEventListener("click", () => {
  document.querySelector("#profileModal").hidden = true;
});
document.querySelector("#profileModal").addEventListener("click", (event) => {
  if (event.target === document.querySelector("#profileModal")) {
    document.querySelector("#profileModal").hidden = true;
  }
});
document.querySelectorAll("[data-avatar-lottie]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (!S.user || !PROFILE_AVATAR_LOTTIES.has(button.dataset.avatarLottie)) return;
    S.user.avatarUrl = "";
    S.user.avatarLottie = button.dataset.avatarLottie;
    renderProfile();
    persistAuthSession();
    const saved = await persistStudentProfile();
    document.querySelector("#profileStatus").textContent = saved
      ? "Character avatar saved to your profile."
      : "Character avatar saved on this device; Supabase sync failed.";
  });
});

async function compressProfilePhoto(file) {
  if (!file || !/^image\/(?:jpeg|png|webp)$/.test(file.type)) {
    throw new Error("Choose a JPG, PNG or WebP image.");
  }
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
  if (typeof window.createImageBitmap !== "function") {
    throw new Error("This browser cannot resize profile photos. Choose a character avatar instead.");
  }
  const bitmap = await window.createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("This browser could not process the selected photo.");
  }
  let scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  let dataUrl = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    dataUrl = canvas.toDataURL("image/jpeg", Math.max(0.45, 0.82 - attempt * 0.08));
    if (dataUrl.length <= 140000) break;
    scale *= 0.8;
  }
  bitmap.close();
  if (dataUrl.length > 140000) throw new Error("That image could not be compressed small enough. Try a smaller photo.");
  return dataUrl;
}

document.querySelector("#profilePhotoInput").addEventListener("change", async (event) => {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file || !S.user) return;
  const status = document.querySelector("#profileStatus");
  status.textContent = "Preparing profile photo…";
  try {
    S.user.avatarUrl = await compressProfilePhoto(file);
    S.user.avatarLottie = "";
    renderProfile();
    persistAuthSession();
    const saved = await persistStudentProfile();
    status.textContent = saved
      ? "Photo saved to your profile."
      : "Photo saved on this device; Supabase sync failed.";
  } catch (error) {
    console.error("Profile photo upload failed:", error);
    status.textContent = error.message;
  } finally {
    input.value = "";
  }
});

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

  try {
    const student = await lookupImportedStudentResults(registration, fullNameInput.value);
    chatRegistrationInput.value = registration;
    renderResults(registration, student);
  } catch (error) {
    setResultsMessage(error.message || "Results could not be loaded right now. Please try again.");
  }
});

document.querySelector("#launchApp").addEventListener("click", () => {
  document.querySelector("#authStatus").textContent = "";
  setAuthMode("signup");
  adminPasscodeGroup.hidden = true;
  adminPasscodeInput.value = "";
  showStage("authView");
  document.querySelector("#authFullName").focus();
});
document.querySelector("#backToLanding").addEventListener("click", () => showStage("landingView"));

const appAuthForm = document.querySelector("#appAuthForm");
let authMode = "signup";
function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  for (const id of ["authNameGroup", "authPhoneGroup", "authLevelGroup", "authConsentGroup"]) {
    document.querySelector(`#${id}`).hidden = !signup;
  }
  document.querySelector("#authFullName").required = signup;
  document.querySelector("#authWhatsapp").required = signup;
  document.querySelector("#authLevel").required = signup;
  document.querySelector("#authMarketingConsent").required = signup;
  document.querySelector("#authMarketingConsent").checked = false;
  document.querySelector("#authPassword").autocomplete = signup ? "new-password" : "current-password";
  document.querySelector("#authSubmit").textContent = signup ? "Create account" : "Log in";
  document.querySelector("#authSignupMode").classList.toggle("is-active", signup);
  document.querySelector("#authSignupMode").setAttribute("aria-pressed", String(signup));
  document.querySelector("#authLoginMode").classList.toggle("is-active", !signup);
  document.querySelector("#authLoginMode").setAttribute("aria-pressed", String(!signup));
  document.querySelector("#authStatus").textContent = "";
}
document.querySelector("#authSignupMode").addEventListener("click", () => setAuthMode("signup"));
document.querySelector("#authLoginMode").addEventListener("click", () => setAuthMode("login"));
function isMasterAdminRegistration(registration) {
  return registration === "101010";
}

async function handleAuthSubmit(fullName, regNumber, phone, passcode, password) {
  const name = typeof fullName === "string" ? fullName.trim() : "";
  const rawRegistration = typeof regNumber === "string" ? regNumber.trim() : "";
  const rawPhone = typeof phone === "string" ? phone.trim() : "";
  const status = document.querySelector("#authStatus");
  status.textContent = "";

  if (isMasterAdminRegistration(rawRegistration)
    || window.location.hash === "#admin" || window.location.hash === "#adminDashboard") {
    const passcodeValue = typeof passcode === "string" ? passcode : "";
    if (!passcodeValue) {
      adminPasscodeGroup.hidden = false;
      status.textContent = "Enter the admin passcode to continue.";
      adminPasscodeInput.focus();
      return;
    }
    status.textContent = "Verifying admin access…";
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcodeValue }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Admin access could not be verified.");
    } catch (error) {
      status.textContent = error.message || "Admin access could not be verified.";
      return;
    }
    const adminName = name || "SevenFold Admin";
    currentStudent = null;
    isMasterAdmin = true;
    S.isAdmin = true;
    S.level = "400L";
    S.phoneNumber = "";
    S.student = { name: "SevenFold Admin", registration: "101010" };
    S.user = { name: adminName, regNo: "101010", level: "400L" };
    window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
      role: "admin",
      name: adminName,
      registration: "101010",
    }));
    renderAdminDirectory();
    showStage("adminDashboard");
    sfx.win();
    showNotice("Welcome to SevenFold Admin Portal ⚡");
    return;
  }

  const registration = normalizeRegistration(rawRegistration);
  const level = document.querySelector("#authLevel").value;
  if (!registration) {
    status.textContent = "Enter a valid matric number, for example 25/SS/EC/001.";
    return;
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    status.textContent = "Use a password between 8 and 128 characters.";
    return;
  }
  if (authMode === "signup" && (!name || !normalizeWhatsAppPhone(rawPhone) || !document.querySelector("#authMarketingConsent").checked)) {
    status.textContent = "Enter your full name and a valid WhatsApp number, then agree to reminders.";
    document.querySelector("#authMarketingConsent").focus();
    return;
  }

  const submitButton = document.querySelector("#authSubmit");
  submitButton.disabled = true;
  status.textContent = authMode === "signup" ? "Creating your student account…" : "Logging you in…";
  try {
    const response = await fetch("/api/student/auth", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: authMode,
        fullName: name,
        registration,
        phone: rawPhone,
        level,
        password,
        consent: document.querySelector("#authMarketingConsent").checked,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Student sign-in failed.");
    const student = result.student;
    if (!student || student.registration !== registration || !student.name) throw new Error("Student account details could not be loaded.");
    const studentLevel = student.level || level || detectStudentLevel(registration);
    switchStudyProfile(registration, { fresh: authMode === "signup" });
    currentStudent = { name: student.name, registration };
    isMasterAdmin = false;
    S.isAdmin = false;
    S.student = currentStudent;
    const savedProfile = loadSavedStudentProfile(registration);
    S.user = {
      name: student.name,
      regNo: registration,
      phone: student.phoneNumber || "",
      level: studentLevel,
      ...savedProfile,
      referralCount: studyProgress.referralCount,
    };
    S.level = studentLevel;
    S.phoneNumber = student.phoneNumber || "";
    currentStudentLevel = S.level;
    chatRegistrationInput.value = registration;
    setStudentRegistration(registration);
    await refreshLiveCourseCatalog(studentLevel);
    applyStudentLevel(studentLevel);
    await currentStudentMaterialOwner();
    window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
      role: "student",
      name: student.name,
      registration,
      phoneNumber: S.phoneNumber,
      level: S.level,
      avatarUrl: S.user.avatarUrl,
      avatarLottie: S.user.avatarLottie,
      referralCount: studyProgress.referralCount,
    }));
    showStage("studentApp");
    renderProfile();
    activateTab("home");
    startStudentTour();
    void refreshStudentMaterials().catch(() => {});
    void syncLeaderboardEntry();
    sfx.ok();
    showNotice(authMode === "signup" && !result.contactSaved
      ? "Account created, but your WhatsApp reminder contact did not save. Please ask your class rep for help."
      : `${authMode === "signup" ? "Welcome" : "Welcome back"} ${student.name.split(" ")[0]}! (${S.level})`);
  } catch (error) {
    console.error("Student onboarding failed:", error);
    status.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

appAuthForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await handleAuthSubmit(
    document.querySelector("#authFullName").value,
    document.querySelector("#authRegNo").value,
    document.querySelector("#authWhatsapp").value,
    adminPasscodeInput.value,
    document.querySelector("#authPassword").value,
  );
});

async function restoreAuthSession() {
  let savedSession;
  try {
    savedSession = window.localStorage.getItem(AUTH_SESSION_KEY);
    if (!savedSession) return false;
    const localSession = JSON.parse(savedSession);
    if (localSession.role === "admin") {
      window.localStorage.removeItem(AUTH_SESSION_KEY);
      return false;
    }
    const response = await fetch("/api/student/auth", { credentials: "same-origin" });
    if (!response.ok) { window.localStorage.removeItem(AUTH_SESSION_KEY); return false; }
    const session = { ...localSession, ...(await response.json()).student };
    const registration = normalizeRegistration(session.registration || "");
    if (session.role !== "student" || !registration || typeof session.name !== "string"
      || normalizeNameTokens(session.name).length < 2) {
      window.localStorage.removeItem(AUTH_SESSION_KEY);
      return false;
    }
    currentStudent = { name: session.name, registration };
    S.student = currentStudent;
    switchStudyProfile(registration);
    S.level = session.level || detectStudentLevel(registration);
    S.phoneNumber = typeof session.phoneNumber === "string" ? session.phoneNumber : "";
    S.user = {
      name: session.name,
      regNo: registration,
      phone: S.phoneNumber,
      level: S.level,
      avatarUrl: typeof session.avatarUrl === "string"
        && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(session.avatarUrl)
        && session.avatarUrl.length <= 140000 ? session.avatarUrl : "",
      avatarLottie: typeof session.avatarLottie === "string"
        && PROFILE_AVATAR_LOTTIES.has(session.avatarLottie) ? session.avatarLottie : "",
      referralCount: studyProgress.referralCount,
    };
    if (Number.isFinite(session.referralCount)) {
      studyProgress.referralCount = Math.max(studyProgress.referralCount, Math.floor(session.referralCount));
      S.referralCount = studyProgress.referralCount;
      saveStudyProgress();
    }
    S.user.referralCount = studyProgress.referralCount;
    currentStudentLevel = S.level;
    chatRegistrationInput.value = registration;
    setStudentRegistration(registration);
    await refreshLiveCourseCatalog(S.level);
    applyStudentLevel(S.level);
    showStage("studentApp");
    renderProfile();
    activateTab("home");
    startStudentTour();
    void refreshStudentMaterials().catch(() => {});
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
    if (button.dataset.adminView === "indexer") void loadCourseCatalog({ updateStatus: false });
    if (button.dataset.adminView === "materials") {
      void loadAdminCourseMaterials();
      void loadStudentMaterialSubmissions();
    }
    if (button.dataset.adminView === "students") loadStudentRecords();
  });
});

const initialHash = window.location.hash.slice(1);
(async () => {
  if (!await restoreAuthSession()) {
    if (initialHash === "admin" || initialHash === "adminDashboard") {
      adminPasscodeGroup.hidden = false;
      showStage("authView", false);
    } else showStage("landingView");
  }
})();
if (typeof window.addEventListener === "function") {
  window.addEventListener("hashchange", () => {
    const stage = window.location.hash.slice(1);
    if (stage === "admin" || stage === "adminDashboard") {
      if (!S.isAdmin) {
        showAccessRestrictedNotice();
        adminPasscodeGroup.hidden = stage !== "admin";
        showStage("authView", stage !== "admin");
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
