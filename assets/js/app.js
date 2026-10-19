"use strict";

const RESULT_LOOKUP = null;

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
const LEADERBOARD_PREVIEW = [
  { name: "MarketMaven", xp: 240 },
  { name: "EconExplorer", xp: 190 },
  { name: "TransitThinker", xp: 150 },
  { name: "DemandDriver", xp: 110 },
];
const MOCK_EXAM_QUESTIONS = [
  { prompt: "Transport demand is called derived when it…", answers: ["Arises from a need to reach another activity", "Exists without any travel purpose", "Is fixed by the number of vehicles"], correctAnswer: 0 },
  { prompt: "Which item is a transport operating cost?", answers: ["Fuel", "A passenger's destination", "A market boundary"], correctAnswer: 0 },
  { prompt: "Congestion delay imposed on other road users is…", answers: ["A negative external cost", "A private fixed cost", "A fare subsidy"], correctAnswer: 0 },
  { prompt: "If more passengers share the same operating cost, average cost per passenger can…", answers: ["Fall", "Become a congestion charge", "No longer be measured"], correctAnswer: 0 },
  { prompt: "A congestion charge can encourage travellers to…", answers: ["Account for some delay costs they impose", "Ignore all travel costs", "Increase peak road demand"], correctAnswer: 0 },
];
const STATISTICS_MOCK_QUESTIONS = [
  { prompt: "A subset selected from a population is called a…", answers: ["Sample", "Census", "Parameter"], correctAnswer: 0 },
  { prompt: "The arithmetic mean is calculated by dividing the sum by the…", answers: ["Number of observations", "Largest value", "Range"], correctAnswer: 0 },
  { prompt: "The middle value in ordered data is the…", answers: ["Median", "Mode", "Variance"], correctAnswer: 0 },
  { prompt: "The maximum minus the minimum is the…", answers: ["Range", "Mean", "Standard error"], correctAnswer: 0 },
  { prompt: "The probability of an impossible event is…", answers: ["0", "0.5", "1"], correctAnswer: 0 },
];
function getMockQuestions() {
  return currentCourse === "ECO 122" ? STATISTICS_MOCK_QUESTIONS : MOCK_EXAM_QUESTIONS;
}
const navButtons = [...document.querySelectorAll("[data-tab]")];
const studyPanels = new Map(["home", "chat", "board", "invite", "results"].map((id) => [id, document.querySelector(`#${id}`)]));
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
  const entries = [...LEADERBOARD_PREVIEW, { name: "You", xp: studyProgress.xp, isCurrentUser: true }]
    .sort((left, right) => right.xp - left.xp);
  leaderboardList.replaceChildren();
  entries.forEach((entry, index) => {
    const row = document.createElement("div");
    const rank = document.createElement("span");
    const name = document.createElement("strong");
    const xp = document.createElement("span");
    row.className = `leaderboard-row${entry.isCurrentUser ? " is-current-user" : ""}`;
    rank.className = "leaderboard-rank mono";
    rank.textContent = String(index + 1).padStart(2, "0");
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
  ];
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
  const currentRank = entries.findIndex((entry) => entry.isCurrentUser) + 1;
  const rankElement = document.querySelector("#yourRank");
  const xpElement = document.querySelector("#yourXp");
  if (rankElement) rankElement.textContent = `#${currentRank}`;
  if (xpElement) xpElement.textContent = `${studyProgress.xp} XP`;
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

function activateTab(tab) {
  const selectedTab = tab.dataset.tab;
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
}

const mockExamState = { questionIndex: 0, score: 0, answered: false };

function renderMockExamQuestion() {
  const questions = getMockQuestions();
  const question = questions[mockExamState.questionIndex];
  mockExamProgress.textContent = `QUESTION ${mockExamState.questionIndex + 1} / ${questions.length}`;
  mockExamQuestion.textContent = question.prompt;
  mockExamFeedback.textContent = "";
  mockExamFeedback.className = "lesson-feedback";
  mockExamOptions.replaceChildren();
  mockExamState.answered = false;
  mockExamNext.disabled = true;
  mockExamNext.textContent = mockExamState.questionIndex === questions.length - 1
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
  const questions = getMockQuestions();
  const score = mockExamState.score;
  const estimate = score >= Math.ceil(questions.length * 0.8) ? "Strong grasp" : score >= Math.ceil(questions.length * 0.6) ? "Developing" : "More practice recommended";
  mockExamProgress.textContent = `PRACTICE SCORE · ${score} / ${questions.length}`;
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
    mockExamFeedback.textContent = "First mock complete! +25 XP · +10 gems.";
    mockExamFeedback.className = "lesson-feedback is-correct";
  }
}

examPredictorButton.addEventListener("click", () => {
  if (studyProgress.completed.length !== activeModules.length) {
    document.querySelector("#fuel").hidden = false;
    return;
  }
  mockExamState.questionIndex = 0;
  mockExamState.score = 0;
  examPredictorPanel.hidden = false;
  mockExamTitle.textContent = "UNIUYO Practice Mock";
  renderMockExamQuestion();
});

mockExamNext.addEventListener("click", () => {
  if (!mockExamState.answered) return;
  if (mockExamState.questionIndex === getMockQuestions().length - 1) {
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
  document.querySelector("#chatCourse").value = course;
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
  document.querySelector("#chatCourse").value = currentCourse;
  for (const button of document.querySelectorAll(".course-choice")) {
    const selected = button.dataset.course === currentCourse;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
}

for (const button of document.querySelectorAll(".course-choice")) {
  button.addEventListener("click", () => setCourse(button.dataset.course));
}
document.querySelector("#chatCourse").addEventListener("change", (event) => setCourse(event.currentTarget.value));

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

const CHAT_ANSWERS = {
  "ECO 128": [
    { match: /peak.?load|congestion|peak pricing/i, answer: "Peak-load pricing charges more during periods when demand strains available capacity. It can spread trips across time and help travellers face some of the congestion cost they impose." },
    { match: /derived demand|transport demand/i, answer: "Transport demand is usually derived: people travel because they want to reach work, school, markets, or another activity. The trip is a means to an end." },
    { match: /externalit|pollution|traffic delay/i, answer: "A negative transport externality is a cost imposed on others, such as congestion delay, noise, or pollution, that is not fully reflected in the traveller's private cost." },
    { match: /cost|scale/i, answer: "Transport costs include vehicles, labour, fuel, infrastructure, and time. When the same operating cost is spread across more passengers, average cost per passenger may fall." },
  ],
  "ECO 122": [
    { match: /mean|average/i, answer: "The arithmetic mean is the sum of all observations divided by the number of observations. Check the units and watch for extreme values." },
    { match: /median|mode/i, answer: "The median is the middle value after ordering the data; the mode is the most frequent value. The median is often less sensitive to outliers." },
    { match: /sample|population/i, answer: "A population is the full group being studied. A sample is the subset observed to draw conclusions about that group." },
    { match: /range|dispersion|variance|standard deviation/i, answer: "Dispersion describes how spread out observations are. The range is maximum minus minimum; variance and standard deviation use deviations around the mean." },
  ],
};

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
}

function answerFromDrEco(question) {
  if (/what.?s on this week|this week/i.test(question)) {
    return `This ${currentCourse} path has ${activeModules.length} short modules. Start with “${activeModules[0].title}” and work through the nodes in order.`;
  }
  if (/generate|quiz|10.?q/i.test(question)) {
    return "Let’s practise with the built-in quiz. Choose 5, 10, or 20 questions and use the feedback to review each answer.";
  }
  const match = (CHAT_ANSWERS[currentCourse] || []).find((item) => item.match.test(question));
  return match
    ? match.answer
    : `For ${currentCourse}, connect the concept to a clear definition, explain the mechanism, and give a relevant example. Try asking about ${currentCourse === "ECO 128" ? "derived demand, peak-load pricing, or external costs" : "the mean, samples, or dispersion"}.`;
}

function submitChatQuestion(question) {
  const cleaned = question.trim();
  if (!cleaned) return;
  const hasDemoPass = studyProgress.demoPassExpiresAt > Date.now();
  if (!hasDemoPass && studyProgress.fuel < 2) {
    document.querySelector("#fuelStatus").textContent = "Your demo fuel is empty. Open the fuel panel to see the pass simulations.";
    document.querySelector("#fuel").hidden = false;
    return;
  }
  appendChatMessage(cleaned, "user");
  if (!hasDemoPass) studyProgress.fuel = Math.max(0, studyProgress.fuel - 2);
  saveStudyProgress();
  updateFuelDisplay();
  const answer = answerFromDrEco(cleaned);
  appendChatMessage(answer, "assistant");
  sfx.msg();
  if (/generate|quiz|10.?q/i.test(cleaned)) {
    testState.index = 0;
    testState.count = 10;
    testState.hearts = 3;
    testDrawer.hidden = false;
    renderTestQuestion();
  }
}

const chatMessages = document.querySelector("#chatMessages");
document.querySelector("#chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
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
  const questions = getMockQuestions();
  const question = questions[testState.index % questions.length];
  document.querySelector("#testProgress").textContent = `${Math.min(testState.index + 1, testState.count)} / ${testState.count}`;
  document.querySelector("#testBar").style.width = `${(testState.index / testState.count) * 100}%`;
  document.querySelector("#testHearts").textContent = "❤️".repeat(testState.hearts) + "🖤".repeat(3 - testState.hearts);
  document.querySelector("#testQuestion").textContent = question.prompt;
  document.querySelector("#testFeedback").textContent = "";
  testFeedbackHeading.textContent = "";
  testAnswerDrawer.classList.toggle("on", false);
  testAnswerDrawer.classList.toggle("is-correct", false);
  testAnswerDrawer.classList.toggle("is-wrong", false);
  document.querySelector("#lecturerTip").textContent = "Read the command word and define the key economic concept before explaining it.";
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
document.querySelector("#openTest").addEventListener("click", () => {
  testState.index = 0;
  testState.count = Number(document.querySelector("#questionCount").value);
  testState.hearts = 3;
  testDrawer.hidden = false;
  renderTestQuestion();
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
    document.querySelector("#testQuestion").textContent = testState.hearts === 0 ? "Out of hearts — review the feedback and try again." : "Practice complete. Keep reviewing the course nodes.";
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
const adminPanel = document.querySelector("#adminPanel");
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
  adminPanel.hidden = false;
  resultsStatus.textContent = `${adminResults.children.length} broadsheet record${adminResults.children.length === 1 ? "" : "s"} available in this static preview.`;
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
  if (event.key !== "Escape") return;
  if (!authModal.hidden) closeVerification();
  else if (!testDrawer.hidden) testDrawer.hidden = true;
  else if (!fuelDialog.hidden) fuelDialog.hidden = true;
});
document.querySelector("#print-card").addEventListener("click", () => window.print());
document.querySelector("#dismiss-card").addEventListener("click", () => {
  posterWrapper.hidden = true;
});
document.querySelector("#adminLogout").addEventListener("click", () => {
  adminPanel.hidden = true;
  adminStudentDetail.hidden = true;
  resultsStatus.textContent = "Admin view closed.";
  registrationInput.focus();
});
adminSearch.addEventListener("input", () => renderAdminDirectory(adminSearch.value));

resultsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  resultsStatus.textContent = "";

  const rawRegistration = registrationInput.value.trim();
  const rawName = fullNameInput.value.trim();
  if (rawRegistration === "101010" && /\b(nssien|daniel)\b/i.test(rawName)) {
    renderAdminDirectory();
    return;
  }
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
  const isNameMatch = inputNameTokens.some((token) => studentNameTokens.includes(token));
  if (!matchedStudent || !isNameMatch) {
    setResultsMessage("Invalid Registration Number or Full Name combination. Please verify your details.");
    registrationInput.focus();
    return;
  }

  renderResults(registration, matchedStudent);
});
