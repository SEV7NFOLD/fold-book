"use strict";

const assert = require("node:assert/strict");
const vm = require("node:vm");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const drEcoHandler = require("../api/dr-eco.js");
const geminiLiveTokenHandler = require("../api/gemini/live-token.js");
const adminSessionHandler = require("../api/admin/session.js");
const adminCourseMaterialsHandler = require("../api/admin/course-materials.js");
const { createAdminSession } = require("../lib/admin-auth.js");

const root = path.join(__dirname, "..");
const output = path.join(root, "dist");
const brandDirectory = path.join(root, "assets", "brand");
const lottieDirectory = path.join(root, "assets", "lottie");
const sfxDirectory = path.join(root, "assets", "sfx");
const host = "127.0.0.1";
const port = 18371;
const origin = `http://${host}:${port}`;
const publicFiles = [
  "index.html",
  ...fs.readdirSync(brandDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `assets/brand/${entry.name}`),
  ...fs.readdirSync(lottieDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => `assets/lottie/${entry.name}`),
  ...fs.readdirSync(sfxDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp3"))
    .map((entry) => `assets/sfx/${entry.name}`),
  "assets/lottie/manifest.json",
  "assets/css/design-tokens.css",
  "assets/css/styles.css",
  "assets/js/app.js",
  "data/announcements.csv",
  "data/timetable.csv",
];
const privateFiles = ["data/students.csv", "data/results.csv"];
let server;

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await fetch(origin);
    } catch (error) {
      if (error.cause?.code !== "ECONNREFUSED" && error.cause?.code !== "ECONNRESET") throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Production preview did not start within five seconds.");
}

before(() => {
  const { execFileSync } = require("node:child_process");
  execFileSync(process.execPath, [path.join(__dirname, "build-site.js")], {
    cwd: root,
    stdio: "pipe",
  });

  server = spawn(process.execPath, [path.join(__dirname, "serve-site.js"), "--built"], {
    cwd: root,
    env: { ...process.env, GEMINI_API_KEY: "", PORT: String(port) },
    stdio: "ignore",
  });
  return waitForServer().then(async (response) => {
    if (response.status !== 200) throw new Error("Production preview returned an unsuccessful response.");
  });
});

after(() => {
  if (server && server.exitCode === null) server.kill();
});

test("production build contains only its explicit public-site allowlist", () => {
  function listFiles(directory, prefix = "") {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return listFiles(path.join(directory, entry.name), relativePath);
      assert.ok(entry.isFile(), `Unexpected deployment entry: ${relativePath}`);
      return [relativePath];
    });
  }

  assert.deepEqual(listFiles(output).sort(), [...publicFiles].sort());
});

test("production output keeps the dark branding and compiles student results into the app", () => {
  const html = fs.readFileSync(path.join(output, "index.html"), "utf8");
  const styles = fs.readFileSync(path.join(output, "assets/css/styles.css"), "utf8");
  const app = fs.readFileSync(path.join(output, "assets/js/app.js"), "utf8");
  const leaderboardSchema = fs.readFileSync(path.join(root, "supabase/leaderboard.sql"), "utf8");
  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const lookupMatch = app.match(/^const RESULT_LOOKUP = (\{.*\});$/m);

  assert.equal(vercel.buildCommand, "npm run build");
  assert.equal(vercel.outputDirectory, "dist");
  assert.equal(Object.hasOwn(vercel, "builds"), false);
  assert.equal(Object.hasOwn(vercel, "rewrites"), false);
  const liveTokenHandler = fs.readFileSync(path.join(root, "api/gemini/live-token.js"), "utf8");
  assert.match(liveTokenHandler, /module\.exports\s*=\s*async function/);
  assert.match(liveTokenHandler, /request\.method !== "POST"/);
  assert.match(styles, /color-scheme:\s*dark\b/);
  assert.match(html, /id="searchRegNo"/);
  assert.match(html, /id="searchFullName"/);
  assert.match(html, /id="results-table"/);
  assert.match(html, /id="navLearn"[^>]+data-tab="home"/);
  assert.match(html, /id="navBoard"[^>]+data-tab="board"/);
  assert.match(html, /id="navChat"[^>]+data-tab="chat"/);
  assert.match(html, /id="navInvite"[^>]+data-tab="invite"/);
  assert.match(html, /id="profileButton"/);
  assert.match(html, /id="profileModal"/);
  assert.match(html, /id="profilePhotoInput"/);
  assert.match(html, /data-avatar-lottie="cat-idle\.json"/);
  assert.match(html, /id="studentSignOut"/);
  assert.match(html, /id="profileSignOut"/);
  assert.match(html, /id="mobileLearn"[^>]+data-tab="home"/);
  assert.doesNotMatch(html, /data-tab="results"|data-tab="admin"/);
  assert.match(html, /<section id="landingView" class="landing-view">/);
  assert.match(html, /Verify your results instantly, then master your courses with Dr\. Eco\./);
  assert.match(html, /id="launchApp"[^>]*>Launch FoldBook App →/);
  assert.match(html, /<section id="authView" class="auth-view" hidden>/);
  assert.match(html, /id="authFullName"[^>]+required/);
  assert.match(html, /id="authRegNo"[^>]+required/);
  assert.match(html, /id="authWhatsapp"[^>]+required/);
  assert.match(html, /xlsx@0\.18\.5/);
  assert.match(html, /<div class="shell" id="studentApp" hidden>/);
  assert.match(html, /<section id="adminDashboard" class="admin-portal hide sec" hidden>/);
  assert.match(html, /SevenFold Admin Portal/);
  assert.match(html, /data-admin-view="broadsheets"/);
  assert.match(html, /data-admin-view="catalog"/);
  assert.match(html, /data-admin-view="indexer"/);
  assert.match(html, /data-admin-view="students"/);
  assert.doesNotMatch(html, /id="adminPanel"/);
  assert.match(html, /id="home" class="learn-section hide" hidden/);
  assert.match(html, /id="results"[^>]*>/);
  assert.match(html, /id="accessToast" role="alert" hidden/);
  assert.doesNotMatch(html, /Sample rankings for preview only/);
  assert.match(html, /FoldBook/);
  assert.doesNotMatch(html, /Fold Book V2|FOLD BOOK V2/);
  assert.match(html, /@dotlottie\/player-component/);
  assert.match(html, /id="tdr"/);
  assert.match(html, /id="fuel"/);
  assert.match(html, /id="pathTree"/);
  assert.match(html, /id="weekTracker"/);
  assert.match(html, /id="leaderboardList"/);
  assert.match(html, /id="sndToggle"/);
  assert.match(html, /id="voiceCallRoom"/);
  assert.match(html, /id="voiceToggle"[^>]*>📞 Call</);
  assert.match(html, /id="chatSettingsToggle"[^>]*aria-controls="chatSettingsDrawer"/);
  assert.match(html, /id="chatSettingsDrawer" hidden/);
  assert.match(html, /id="chatSettingsClose"/);
  assert.match(html, /id="voiceCaption"/);
  assert.match(html, /id="voiceMuteButton"/);
  assert.match(html, /id="voiceSpeakerButton"/);
  assert.match(html, /id="voiceEndButton"/);
  assert.match(html, /id="adminFileUploader"/);
  assert.match(html, /id="examPredictorButton"/);
  assert.match(html, /id="examPredictorPanel"/);
  assert.match(app, /const STUDY_MODULES = \[/);
  assert.match(app, /function saveStudyProgress/);
  assert.match(app, /function renderMascot/);
  assert.match(app, /function tone/);
  assert.match(app, /function playCustomSfx/);
  assert.match(app, /consecutiveWrongCount === 3/);
  assert.match(app, /consecutiveWrongCount === 5/);
  assert.match(app, /playCustomSfx\("complete"\)/);
  assert.match(app, /playCustomSfx\("deadClick"\)/);
  assert.match(app, /startLoadingSfx\(\)/);
  for (const soundFile of fs.readdirSync(sfxDirectory).filter((file) => file.toLowerCase().endsWith(".mp3"))) {
    assert.ok(fs.existsSync(path.join(output, "assets", "sfx", soundFile)), `${soundFile} is copied into dist/.`);
  }
  assert.match(app, /101010/);
  assert.match(app, /function isMasterAdminRegistration/);
  assert.match(app, /function setCourse/);
  assert.match(app, /function detectStudentLevel/);
  assert.match(app, /function updateAdminCourseDropdown/);
  assert.match(app, /function callGeminiRAG/);
  assert.match(app, /sharp, fun, and warm AI Study Companion/);
  assert.match(app, /We’ve got this!/);
  assert.match(app, /saveWhatsAppOptIn\(normalizedPhone, registration, student\.name, \{ silent: true \}\)/);
  assert.match(app, /function generateQuestionsFromMaterials/);
  assert.match(app, /const GEMINI_MODEL = "gemini-3\.5-flash-lite"/);
  assert.doesNotMatch(app, /MOCK_EXAM_QUESTIONS|STATISTICS_MOCK_QUESTIONS|LEADERBOARD_PREVIEW/);
  assert.match(app, /match_level:\s*level/);
  assert.match(app, /fetch\("\/api\/dr-eco"/);
  assert.doesNotMatch(app, /generativelanguage\.googleapis\.com\/v1beta\/models\/.*:generateContent/);
  assert.match(app, /from\("student_xp"\)\.upsert/);
  assert.match(leaderboardSchema, /enable row level security/);
  assert.match(leaderboardSchema, /create table if not exists public\.student_xp/);
  assert.match(leaderboardSchema, /to anon, authenticated/);
  assert.match(fs.readFileSync(path.join(root, "supabase/admin_dashboard.sql"), "utf8"), /create table if not exists public\.student_results/);
  assert.match(fs.readFileSync(path.join(root, "supabase/admin_dashboard.sql"), "utf8"), /revoke all on public\.student_results from anon, authenticated/);
  assert.match(app, /fetch\("\/api\/admin\/course-materials"/);
  assert.match(app, /class DrEcoVoiceLive/);
  assert.match(app, /realtimeInput:\s*\{/);
  const lottieManifest = JSON.parse(fs.readFileSync(path.join(output, "assets/lottie/manifest.json"), "utf8"));
  assert.ok(lottieManifest.length > 0);
  assert.ok(lottieManifest.every((file) => fs.existsSync(path.join(output, file.slice(1)))));
  assert.match(styles, /\.learn-section\s*\{[^}]*display:\s*grid/);
  assert.match(styles, /\.leaderboard-row\.is-current-user/);
  assert.match(html, /src="\/assets\/brand\/Seven%20fold%20logo%20svg%20WHITE\.svg" alt="SEV7NFOLD" class="brand-logo-img"/);
  assert.match(html, /src="\/assets\/brand\/SEV7N%20FOLD%20LOGO%20BLACK\.svg"/);
  assert.match(html, /src="\/assets\/brand\/SEV7N%20FOLD%20white%20with%20word%20mark\.png"/);
  assert.match(html, /id="authModal"/);
  assert.match(html, /id="exportCard"/);
  assert.doesNotMatch(html, /gemini-api-key/);
  assert.match(html, /id="chatRegistration"/);
  assert.match(html, /id="chatLevel"/);
  assert.match(html, /id="adminMaterialsTab"/);
  assert.match(html, /id="adminLevelSelect"/);
  assert.match(html, /id="adminCourseSelect"/);
  assert.match(html, /id="adminMaterialText"/);
  assert.match(html, /CONGRATULATIONS!/);
  assert.match(html, /BUILD STRONGER BRANDS\. CREATE REAL VALUE\./);
  assert.match(html, /STRATEGY <span>•<\/span> DESIGN <span>•<\/span> TECHNOLOGY/);
  assert.match(html, /POWERED BY SEV7NFOLD CREATIVE TECH AGENCY/);
  assert.match(html, /bignssien\.wixstudio\.com\/sev7nfold/);
  assert.match(html, /id="exportWhatsapp"/);
  assert.match(html, /id="whatsappConsent"/);
  assert.match(html, /save it for daily study streak reminders/i);
  assert.match(html, /@supabase\/supabase-js@2/);
  assert.match(html, /id="gradeAsset"[^>]+src="\/assets\/brand\/trophy\.png"/);
  assert.match(styles, /--poster-purple:\s*#7a28ff/i);
  assert.match(styles, /border-left:\s*4px solid var\(--poster-purple\)/);
  const contentSecurityPolicy = vercel.headers[0].headers.find((header) => header.key === "Content-Security-Policy").value;
  assert.match(contentSecurityPolicy, /script-src 'self' https:\/\/cdn\.jsdelivr\.net https:\/\/unpkg\.com/);
  assert.match(contentSecurityPolicy, /connect-src 'self' https:\/\/fdutgltyptcqeyajsnua\.supabase\.co/);
  assert.match(contentSecurityPolicy, /wss:\/\/generativelanguage\.googleapis\.com/);
  assert.match(app, /function normalizeRegistration/);
  assert.match(fs.readFileSync(path.join(root, "api/dr-eco.js"), "utf8"), /gemini-3\.5-flash-lite/);
  assert.match(fs.readFileSync(path.join(root, "api/dr-eco.js"), "utf8"), /REQUEST_TIMEOUT_MS = 30000/);
  assert.match(app, /fetch\("\/api\/gemini\/live-token"/);
  assert.match(fs.readFileSync(path.join(root, "api/gemini/live-token.js"), "utf8"), /liveConnectConstraints/);
  assert.match(app, /function gradeForScore/);
  assert.ok(lookupMatch, "The production app contains its compiled results lookup.");

  const lookup = JSON.parse(lookupMatch[1]);
  assert.equal(Object.keys(lookup).length, 114);
  assert.equal(lookup["25/SS/EC/001"].name, "Godspower Esther Gift");
  assert.ok(lookup["25/SS/EC/001"].results.some((result) => result.course === "ECO 121"
    && result.ca === 11 && result.exam === 25 && result.total === 36 && result.grade === "F" && result.remark === "FAIL"));
  assert.ok(lookup["19/SS/EC/1592"].results.some((result) => result.course === "ECO 122"
    && result.ca === 6 && result.exam === 14 && result.total === 20 && result.grade === "F" && result.remark === "FAIL"));
  for (const student of Object.values(lookup)) {
    for (const result of student.results) {
      assert.ok(result.ca >= 0 && result.ca <= 30);
      assert.ok(result.exam >= 0 && result.exam <= 70);
      assert.equal(result.ca + result.exam, result.total);
    }
  }
  assert.match(html, /<th scope="col">Course<\/th>\s*<th scope="col">CA<\/th>\s*<th scope="col">Exam<\/th>\s*<th scope="col">Total<\/th>\s*<th scope="col">Grade<\/th>\s*<th scope="col">Remark<\/th>/);
  assert.doesNotMatch(app, /const RESULT_LOOKUP = null;/);
  assert.doesNotMatch(app, /data\/(?:students|results)\.csv/i);
  for (const privateFile of privateFiles) {
    assert.ok(!fs.existsSync(path.join(output, privateFile)), `${privateFile} is not copied into dist/.`);
  }
});

test("public timetable and announcement exports are valid and contain usable entries", () => {
  const timetable = fs.readFileSync(path.join(output, "data/timetable.csv"), "utf8").trim().split(/\r?\n/);
  const announcements = fs.readFileSync(path.join(output, "data/announcements.csv"), "utf8").trim().split(/\r?\n/);

  assert.equal(timetable[0], "day,time,course,room");
  assert.ok(timetable.length > 1, "The weekly timetable contains entries.");
  assert.equal(announcements[0], "when,text");
  assert.ok(announcements.length > 1, "There are department announcements.");
});

test("students can look up and view their compiled results in the production app", async () => {
  class Element {
    constructor() {
      this.children = [];
      this.listeners = Object.create(null);
      this.attributes = Object.create(null);
      this.dataset = Object.create(null);
      this.className = "";
      this.style = {};
      this.classList = {
        toggle: (name, enabled = true) => {
          const current = this.className.split(/\s+/).filter(Boolean);
          this.className = enabled
            ? [...new Set([...current, name])].join(" ")
            : current.filter((entry) => entry !== name).join(" ");
        },
        add: (name) => this.classList.toggle(name, true),
      };
      this.hidden = false;
      this.textContent = "";
      this.value = "";
      this.checked = false;
      this.isConnected = true;
      this.scrollHeight = 0;
    }

    addEventListener(name, listener) {
      this.listeners[name] = listener;
    }

    append(...children) {
      this.children.push(...children);
    }

    querySelector(selector) {
      if (selector === "p") return this.children.find((child) => child.tagName === "P");
      return undefined;
    }

    replaceChildren(...children) {
      this.children = [...children];
    }

    setAttribute(name, value) {
      this.attributes[name] = value;
    }

    getAttribute(name) {
      return this.attributes[name] ?? null;
    }

    removeAttribute(name) {
      delete this.attributes[name];
    }

    showModal() {
      this.open = true;
    }

    close() {
      this.open = false;
    }

    click() {
      downloads.push({ download: this.download, href: this.href });
    }

    focus() {}

    scrollIntoView() {}
  }

  const elements = new Map([
    "#lookupForm",
    "#studentApp",
    "#studentMobileNav",
    "#studentHeaderWidgets",
    "#landingView",
    "#authView",
    "#launchApp",
    "#backToLanding",
    "#appAuthForm",
    "#authFullName",
    "#authRegNo",
    "#authWhatsapp",
    "#authMarketingConsent",
    "#adminPasscodeGroup",
    "#adminPasscode",
    "#authStatus",
    "#authSubmit",
    "#adminDashboard",
    "#home",
    "#chat",
    "#board",
    "#invite",
    "#results",
    "#navChat",
    "#navLearn",
    "#navBoard",
    "#navInvite",
    "#mobileLearn",
    "#mobileBoard",
    "#mobileChat",
    "#mobileInvite",
    "#learn",
    "#leaderboard",
    "#chatInput",
    "#chatCourse",
    "#courseCodeLabel",
    "#courseTitle",
    "#chatFuelBar",
    "#chatFuelValue",
    "#chatMessages",
    "#chatPrompts",
    "#chatForm",
    "#voiceToggle",
    "#chatSettingsToggle",
    "#chatSettingsClose",
    "#chatSettingsDrawer",
    "#voiceCallRoom",
    "#voiceCallMascot",
    "#voiceCallStatus",
    "#voiceCaption",
    "#voiceMuteButton",
    "#voiceSpeakerButton",
    "#voiceEndButton",
    "#adminFileUploader",
    "#adminMaterialTitle",
    "#adminMaterialText",
    "#micButton",
    "#openTest",
    "#tdr",
    "#closeTest",
    "#questionCount",
    "#testHearts",
    "#testBar",
    "#testProgress",
    "#testQuestion",
    "#testOptions",
    "#testFeedback",
    "#lecturerTip",
    "#nextTestQuestion",
    "#pFuel",
    "#fuel",
    "#closeFuel",
    "#fuelStatus",
    "#inviteLink",
    "#shareInvite",
    "#copyInvite",
    "#inviteStatus",
    "#inviteCount",
    "#inviteBar",
    "#inviteFriends",
    "#leaderboardPodium",
    "#yourRank",
    "#yourXp",
    "#leaderboardStatus",
    "#adminView-broadsheets",
    "#adminView-catalog",
    "#adminView-indexer",
    "#adminView-students",
    "#adminStatus",
    "#broadsheetDropzone",
    "#broadsheetFile",
    "#broadsheetStatus",
    "#importBroadsheet",
    "#catalogLevel",
    "#catalogCode",
    "#catalogTitle",
    "#catalogUnits",
    "#saveCatalogCourse",
    "#catalogStatus",
    "#catalogCourses",
    "#loadStudentRecords",
    "#studentRecordsStatus",
    "#studentRecords",
    "#adminSearch",
    "#adminResults",
    "#adminStudentDetail",
    "#adminStudentName",
    "#adminStudentRegistration",
    "#adminStudentCourses",
    "#adminLogout",
    "#vFuel",
    "#fbar",
    "#courseSwitcher",
    "#pathTree",
    "#lessonPanel",
    "#lessonStep",
    "#lessonTitle",
    "#lessonQuestion",
    "#answerOptions",
    "#lessonFeedback",
    "#cbar",
    ".bar-bg",
    "#cpct",
    "#vStreak",
    "#vGems",
    "#sndToggle",
    "#weekTracker",
    "#leaderboardList",
    "#closeLesson",
    "#examPredictorButton",
    "#examPredictorStatus",
    "#examPredictorDescription",
    "#examPredictorPanel",
    "#mockExamProgress",
    "#mockExamTitle",
    "#mockExamQuestion",
    "#mockExamOptions",
    "#mockExamFeedback",
    "#mockExamNext",
    "#searchRegNo",
    "#searchFullName",
    "#results-status",
    "#accessToast",
    "#results-panel",
    "#result-name",
    "#result-registration",
    "#result-summary",
    "#results-table",
    "#results-empty",
    "#authModal",
    "#whatsappForm",
    "#exportWhatsapp",
    "#whatsappConsent",
    "#whatsapp-status",
    "#whatsapp-submit",
    "#poster-wrapper",
    "#cardStudentName",
    "#cardRegNo",
    "#cardCourse",
    "#cardCourseTitle",
    "#cardGrade",
    "#cardScore",
    "#cardRemark",
    "#gradeAsset",
    "#cancel-whatsapp",
    "#close-verification",
    "#print-card",
    "#dismiss-card",
  ].map((selector) => [selector, new Element()]));
  const navTabs = [
    ["#navChat", "chat"],
    ["#navLearn", "home"],
    ["#navBoard", "board"],
    ["#navInvite", "invite"],
    ["#mobileLearn", "home"],
    ["#mobileBoard", "board"],
    ["#mobileChat", "chat"],
    ["#mobileInvite", "invite"],
  ].map(([selector, tab]) => {
    const element = elements.get(selector);
    element.dataset.tab = tab;
    return element;
  });
  const courseChoices = ["ECO 128", "ECO 122"].map((course) => {
    const choice = new Element();
    choice.dataset.course = course;
    return choice;
  });
  const adminTabs = ["broadsheets", "catalog", "indexer", "students"].map((view) => {
    const button = new Element();
    button.dataset.adminView = view;
    return button;
  });
  const adminPanels = ["broadsheets", "catalog", "indexer", "students"].map((view) => {
    const panel = elements.get(`#adminView-${view}`);
    panel.id = `adminView-${view}`;
    return panel;
  });
  const avatarOptions = ["cat-idle.json"].map((fileName) => {
    const button = new Element();
    const preview = new Element();
    button.dataset.avatarLottie = fileName;
    button.querySelector = (selector) => selector === ".profile-avatar-option-preview" ? preview : undefined;
    return button;
  });
  elements.get("#home").hidden = true;
  elements.get("#chat").hidden = true;
  elements.get("#board").hidden = true;
  elements.get("#invite").hidden = true;
  elements.get("#results").hidden = false;
  elements.get("#studentApp").hidden = true;
  elements.get("#studentMobileNav").hidden = true;
  elements.get("#studentHeaderWidgets").hidden = true;
  elements.get("#landingView").hidden = false;
  elements.get("#authView").hidden = true;
  elements.get("#adminDashboard").hidden = true;
  elements.get("#accessToast").hidden = true;
  elements.get("#authModal").hidden = true;
  elements.get("#voiceCallRoom").hidden = true;
  elements.get("#chatSettingsDrawer").hidden = true;
  elements.get("#poster-wrapper").hidden = true;
  elements.get("#poster-wrapper").scrollIntoView = () => {};
  elements.get("#whatsappForm").querySelector = (selector) => {
    assert.equal(selector, 'button[type="submit"]');
    return elements.get("#whatsapp-submit");
  };
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    },
    querySelectorAll(selector) {
      if (selector === "[data-tab]") return navTabs;
      if (selector === ".course-choice") return courseChoices;
      if (selector === "[data-admin-view]") return adminTabs;
      if (selector === ".admin-view-panel") return adminPanels;
      if (selector === "[data-avatar-lottie]") return avatarOptions;
      return [];
    },
    addEventListener() {},
    getElementById(id) {
      return this.querySelector(`#${id}`);
    },
    createElement(tagName) {
      const element = new Element();
      element.tagName = tagName.toUpperCase();
      return element;
    },
    createElementNS() {
      return new Element();
    },
    createDocumentFragment() {
      return new Element();
    },
  };

  const app = fs.readFileSync(path.join(output, "assets/js/app.js"), "utf8")
    .replace(/const SUPABASE_ANON_KEY = .*;/, 'const SUPABASE_ANON_KEY = "header.payload.signature";');
  let insertResponse = { error: null };
  const savedOptIns = [];
  const ragCalls = [];
  const geminiRequests = [];
  const leaderboardRows = [];
  const studyStorage = new Map();
  const audioPlays = [];
  const windowListeners = Object.create(null);
  const spokenUtterances = [];
  let speechCancelCount = 0;
  const speechSynthesis = {
    speaking: false,
    getVoices: () => [{ lang: "en-US", name: "Google English" }],
    cancel() {
      speechCancelCount += 1;
      this.speaking = false;
    },
    speak(utterance) {
      this.speaking = true;
      spokenUtterances.push(utterance);
    },
  };
  class MockSpeechSynthesisUtterance {
    constructor(text) { this.text = text; }
  }
  class MockAudio {
    constructor(src) {
      this.src = src;
      this.currentTime = 0;
      this.preload = "";
      this.loop = false;
    }

    play() {
      audioPlays.push(this.src);
      return Promise.resolve();
    }

    pause() {}
  }
  let liveSocket;
  let liveAudioContext;
  const liveMediaTracks = [];
  const liveAudioSources = [];
  const liveTokenRequests = [];
  class MockWebSocket {
    static OPEN = 1;
    static CLOSING = 2;
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      liveSocket = this;
    }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() {
      this.readyState = 3;
      if (this.onclose) this.onclose();
    }
  }
  class MockAudioContext {
    constructor() {
      this.state = "running";
      this.sampleRate = 48000;
      this.currentTime = 0;
      this.destination = {};
      this.closed = false;
      this.processors = [];
      this.gains = [];
      liveAudioContext = this;
    }
    async resume() {}
    createGain() {
      const gain = { gain: { value: 1 }, connect() {}, disconnect() {} };
      this.gains.push(gain);
      return gain;
    }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() {
      const processor = { onaudioprocess: null, connect() {}, disconnect() {} };
      this.processors.push(processor);
      return processor;
    }
    createBuffer(_channels, length, sampleRate) {
      const samples = new Float32Array(length);
      return {
        duration: length / sampleRate,
        getChannelData() { return samples; },
      };
    }
    createBufferSource() {
      const source = {
        buffer: null,
        connect() {},
        start() {},
        stop() { this.stopped = true; },
      };
      liveAudioSources.push(source);
      return source;
    }
    async close() { this.state = "closed"; this.closed = true; }
  }
  const mediaDevices = {
    async getUserMedia() {
      const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
      liveMediaTracks.push(track);
      return { getTracks: () => [track], getAudioTracks: () => [track] };
    },
  };
  const runtime = {
    document,
    Audio: MockAudio,
    navigator: { mediaDevices },
    atob,
    btoa,
    console: { error() {}, info() {}, warn() {} },
    window: {
      print() {},
      location: { origin, pathname: "/", hash: "#admin" },
      crypto: { randomUUID: () => "12345678-1234-4234-8234-123456789abc" },
      setTimeout() { return 1; },
      scrollTo() {},
      navigator: {
        vibrate() { return true; },
        clipboard: { async writeText() {} },
        mediaDevices,
      },
      WebSocket: MockWebSocket,
      AudioContext: MockAudioContext,
      speechSynthesis,
      SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
      addEventListener(name, listener) {
        windowListeners[name] = listener;
      },
      localStorage: {
        getItem(key) {
          return studyStorage.get(key) || null;
        },
        setItem(key, value) {
          studyStorage.set(key, value);
        },
        removeItem(key) {
          studyStorage.delete(key);
        },
      },
      supabase: {
        createClient(url, key) {
          assert.equal(url, "https://fdutgltyptcqeyajsnua.supabase.co");
          assert.equal(key, "header.payload.signature");
          return {
            from(table) {
              return {
                async upsert(row, options) {
                  if (table === "whatsapp_optins") {
                    savedOptIns.push({ row, options });
                    return insertResponse;
                  }
                  if (table === "course_catalog" || table === "student_results") return { error: null };
                  assert.equal(table, "student_xp");
                  const index = leaderboardRows.findIndex((entry) => entry.id === row.id);
                  if (index === -1) leaderboardRows.push(row);
                  else leaderboardRows[index] = row;
                  return { error: null };
                },
                select() {
                  const query = {
                    eq() { return this; },
                    async order() {
                      return {
                        data: table === "student_xp"
                          ? [...leaderboardRows].sort((left, right) => right.xp - left.xp)
                          : [],
                        error: null,
                      };
                    },
                    then(resolve) {
                      resolve({ data: [], error: null });
                    },
                  };
                  return query;
                },
              };
            },
            async rpc(name, args) {
              ragCalls.push({ name, args });
              return { data: [{ content: "Retrieved notes for this course." }], error: null };
            },
          };
        },
      },
    },
    fetch: async (url, options) => {
      if (String(url) === "/api/gemini/live-token") {
        const body = JSON.parse(options.body);
        liveTokenRequests.push(body);
        return {
          ok: true,
          json: async () => ({
            token: "short-lived-constrained-token",
            model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
            config: {
              responseModalities: ["AUDIO"],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: { parts: [{ text: "Dr. Eco persona and course notes." }] },
            },
          }),
        };
      }
      if (String(url) === "/api/dr-eco") {
        geminiRequests.push({ url, body: JSON.parse(options.body) });
        if (geminiRequests.at(-1).body.system_instruction.parts[0].text.includes("Generate accurate course practice questions")) {
          const prompt = geminiRequests.at(-1).body.contents[0].parts[0].text;
          const count = Number(prompt.match(/Create (\d+) varied/)?.[1] || 5);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [{
                content: {
                  parts: [{
                    text: JSON.stringify({
                      questions: Array.from({ length: count }, (_, index) => ({
                        prompt: `Generated question ${index + 1}`,
                        answers: ["Correct answer", "Distractor one", "Distractor two"],
                        correctAnswer: 0,
                        lecturerTip: "Use the indexed notes.",
                      })),
                    }),
                  }],
                },
              }],
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ candidates: [{ content: { parts: [{ text: "Gemini **RAG** response.\nSecond line." }] } }] }),
        };
      }
      return { ok: true, json: async () => [] };
    },
  };
  vm.runInNewContext(app, runtime);

  elements.get("#chatSettingsToggle").listeners.click();
  assert.equal(elements.get("#chatSettingsDrawer").hidden, false);
  assert.equal(elements.get("#chatSettingsToggle").getAttribute("aria-expanded"), "true");
  elements.get("#chatSettingsClose").listeners.click();
  assert.equal(elements.get("#chatSettingsDrawer").hidden, true);
  assert.equal(elements.get("#chatSettingsToggle").getAttribute("aria-expanded"), "false");

  const tree = elements.get("#pathTree");
  assert.equal(tree.children.length, 5);
  assert.equal(tree.children[0].children[0].disabled, false);
  assert.equal(tree.children[1].children[0].disabled, false);
  assert.equal(tree.children[1].children[0].getAttribute("aria-disabled"), "true");
  tree.children[1].children[0].listeners.click();
  assert.equal(tree.children[1].children[0].className.includes("shake"), true);
  assert.equal(tree.children[1].children[0].getAttribute("aria-disabled"), "true");
  assert.equal(elements.get("#vStreak").textContent, "6");
  assert.equal(elements.get("#vGems").textContent, "0");
  assert.equal(elements.get("#examPredictorButton").disabled, false);
  assert.equal(elements.get("#examPredictorStatus").textContent, "LOCKED");
  assert.equal(elements.get("#results").hidden, false);
  assert.equal(elements.get("#home").hidden, true);
  assert.equal(elements.get("#studentApp").hidden, true);
  assert.equal(elements.get("#landingView").hidden, true);
  assert.equal(elements.get("#authView").hidden, false);
  assert.equal(elements.get("#adminDashboard").hidden, true);
  assert.equal(elements.get("#accessToast").hidden, true);
  assert.equal(elements.get("#chatMessages").children.length, 1);
  assert.match(elements.get("#chatMessages").children[0].children[0].children.map((part) => part.textContent).join(""), /Hey! I’m Dr\. Eco/);
  runtime.window.location.hash = "#admin";
  windowListeners.hashchange();
  assert.equal(elements.get("#adminDashboard").hidden, true);
  assert.equal(elements.get("#authView").hidden, false);
  assert.equal(elements.get("#adminPasscodeGroup").hidden, false);
  assert.equal(elements.get("#accessToast").hidden, false);
  elements.get("#navBoard").listeners.click();
  assert.equal(elements.get("#authStatus").textContent, "Access Restricted: SevenFold Authorized Personnel Only");
  assert.equal(elements.get("#accessToast").hidden, false);
  elements.get("#launchApp").listeners.click();
  assert.equal(elements.get("#landingView").hidden, true);
  assert.equal(elements.get("#authView").hidden, false);
  elements.get("#authFullName").value = "Godspower Esther Gift";
  elements.get("#authRegNo").value = "001";
  elements.get("#authWhatsapp").value = "08012345678";
  elements.get("#authMarketingConsent").checked = true;
  await elements.get("#appAuthForm").listeners.submit({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements.get("#adminDashboard").hidden, true);
  assert.equal(elements.get("#studentApp").hidden, false);
  assert.equal(elements.get("#home").hidden, false);
  assert.equal(elements.get("#studentMobileNav").hidden, false);
  assert.equal(elements.get("#studentHeaderWidgets").hidden, false);
  elements.get("#profileButton").listeners.click();
  assert.equal(elements.get("#profileModal").hidden, false);
  assert.equal(elements.get("#profileDisplayName").textContent, "Godspower Esther Gift");
  avatarOptions[0].listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(JSON.parse(studyStorage.get("foldBook.authSession")).avatarLottie, "cat-idle.json");
  assert.equal(savedOptIns.at(-1).row.avatar_lottie, "cat-idle.json");
  elements.get("#closeProfile").listeners.click();
  assert.equal(elements.get("#profileModal").hidden, true);
  elements.get("#profileButton").listeners.click();
  assert.equal(elements.get("#profileModal").hidden, false);
  assert.equal(elements.get("#profileDisplayName").textContent, "Godspower Esther Gift");
  elements.get("#closeProfile").listeners.click();
  assert.equal(elements.get("#profileModal").hidden, true);
  assert.equal(elements.get("#leaderboardList").children.length, 1);
  assert.match(elements.get("#leaderboardList").children[0].children[1].textContent, /^Learner-/);
  assert.equal(savedOptIns.length, 2);
  assert.equal(savedOptIns[0].row.phone_number, "2348012345678");
  assert.equal(savedOptIns[0].row.reg_number, "25/SS/EC/001");
  assert.equal(savedOptIns[1].row.avatar_lottie, "cat-idle.json");
  savedOptIns.length = 0;
  await elements.get("#examPredictorButton").listeners.click();
  assert.equal(elements.get("#fuel").hidden, false);
  elements.get("#closeFuel").listeners.click();
  courseChoices[1].listeners.click();
  assert.equal(elements.get("#courseTitle").textContent, "Statistics");
  assert.match(tree.children[0].children[1].children[0].textContent, /Data and variables/);
  courseChoices[0].listeners.click();
  assert.equal(elements.get("#courseTitle").textContent, "Transportation Economics");
  elements.get("#navBoard").listeners.click();
  assert.equal(elements.get("#home").hidden, true);
  assert.equal(elements.get("#board").hidden, false);
  assert.ok(elements.get("#leaderboardList").children.length > 0);
  elements.get("#navLearn").listeners.click();
  elements.get("#navChat").listeners.click();
  elements.get("#voiceToggle").listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements.get("#voiceCallRoom").hidden, false);
  assert.equal(liveTokenRequests.length, 1);
  assert.equal(liveTokenRequests[0].courseCode, "ECO 128");
  assert.match(liveTokenRequests[0].courseNotes, /Retrieved notes for this course/);
  assert.match(liveSocket.url, /access_token=short-lived-constrained-token/);
  liveSocket.readyState = MockWebSocket.OPEN;
  liveSocket.onopen();
  assert.equal(liveSocket.sent[0].setup.model, "models/gemini-2.5-flash-native-audio-preview-12-2025");
  assert.equal(liveSocket.sent[0].setup.responseModalities[0], "AUDIO");
  await liveSocket.onmessage({ data: JSON.stringify({ setupComplete: {} }) });
  const micProcessor = liveAudioContext.processors[0];
  micProcessor.onaudioprocess({
    inputBuffer: { getChannelData: () => new Float32Array(4800).fill(0.25) },
  });
  assert.equal(liveSocket.sent[1].realtimeInput.audio.mimeType, "audio/pcm;rate=16000");
  const encodedAudio = btoa(String.fromCharCode(0, 0, 0, 0));
  liveSocket.onmessage({ data: JSON.stringify({
    serverContent: {
      inputTranscription: { text: "What is demand?" },
      outputTranscription: { text: "Demand is willingness and ability." },
      modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: encodedAudio } }] },
    },
  }) });
  assert.equal(elements.get("#voiceCaption").textContent, "Dr. Eco: Demand is willingness and ability.");
  assert.match(elements.get("#voiceCallStatus").textContent, /speaking/i);
  const liveSourceCount = liveAudioSources.length;
  liveSocket.onmessage({ data: JSON.stringify({ serverContent: { interrupted: true } }) });
  assert.ok(liveAudioSources.slice(0, liveSourceCount).every((source) => source.stopped));
  assert.match(elements.get("#voiceCallStatus").textContent, /paused/i);
  elements.get("#voiceMuteButton").listeners.click({ currentTarget: elements.get("#voiceMuteButton") });
  assert.equal(liveMediaTracks[0].enabled, false);
  elements.get("#voiceMuteButton").listeners.click({ currentTarget: elements.get("#voiceMuteButton") });
  assert.equal(liveMediaTracks[0].enabled, true);
  elements.get("#voiceSpeakerButton").listeners.click({ currentTarget: elements.get("#voiceSpeakerButton") });
  assert.equal(liveAudioContext.gains[0].gain.value, 0);
  elements.get("#voiceEndButton").listeners.click();
  assert.equal(elements.get("#voiceCallRoom").hidden, true);
  assert.equal(liveMediaTracks[0].stopped, true);
  assert.equal(liveSocket.readyState, 3);
  assert.equal(liveAudioContext.closed, true);
  elements.get("#chatInput").value = "Explain peak-load pricing";
  elements.get("#chatForm").listeners.submit({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));
  const formattedReply = elements.get("#chatMessages").children.at(-1).children[0];
  assert.deepEqual(formattedReply.children.map((part) => [part.tagName, part.textContent]), [
    ["SPAN", "Gemini "],
    ["STRONG", "RAG"],
    ["SPAN", " response."],
    ["BR", ""],
    ["SPAN", "Second line."],
  ]);
  assert.equal(ragCalls.length, 2);
  assert.equal(ragCalls[0].name, "match_course_materials");
  assert.equal(ragCalls[0].args.match_course, "ECO 128");
  assert.equal(ragCalls[0].args.match_level, "100L");
  assert.equal(ragCalls[0].args.match_count, 5);
  assert.equal(ragCalls[1].args.match_count, 3);
  assert.equal(geminiRequests[0].url, "/api/dr-eco");
  assert.match(geminiRequests[0].body.system_instruction.parts[0].text, /energetic, witty, and deeply encouraging/);
  assert.match(geminiRequests[0].body.contents[0].parts[0].text, /Retrieved notes for this course/);
  assert.equal(elements.get("#vFuel").textContent, "83/100");
  elements.get("#chatRegistration").value = "24/SS/EC/071";
  elements.get("#chatRegistration").listeners.input();
  assert.equal(elements.get("#chatLevel").textContent, "Detected level: 200L");
  assert.equal(elements.get("#chatCourse").value, "ECO 211");
  elements.get("#adminLevelSelect").value = "300L";
  elements.get("#adminLevelSelect").listeners.change();
  assert.equal(elements.get("#adminCourseSelect").children[0].value, "ECO 311");
  elements.get("#questionCount").value = "10";
  await elements.get("#openTest").listeners.click();
  assert.equal(elements.get("#tdr").hidden, false);
  assert.equal(elements.get("#testProgress").textContent, "1 / 10");
  assert.match(elements.get("#testQuestion").textContent, /Generated question/);
  assert.ok(audioPlays.includes("assets/sfx/a-few-moments-later-sponge-bob-sfx-fun.mp3"));
  elements.get("#testOptions").children[0].listeners.click();
  assert.equal(audioPlays.at(-1), "assets/sfx/duolingo-correct-answer-10-streak.mp3");
  elements.get("#nextTestQuestion").listeners.click();
  assert.equal(elements.get("#testProgress").textContent, "2 / 10");
  elements.get("#closeTest").listeners.click();
  assert.equal(elements.get("#tdr").hidden, true);
  for (let index = 0; index < 5; index += 1) {
    await elements.get("#copyInvite").listeners.click();
  }
  assert.equal(elements.get("#inviteCount").textContent, "5 / 5");
  assert.match(elements.get("#inviteStatus").textContent, /48-hour all-access demo pass/);
  assert.equal(elements.get("#vFuel").textContent, "100/100");
  assert.equal(JSON.parse(studyStorage.get("foldBook.studyProgress")).referralCount, 5);
  assert.equal(savedOptIns.length, 5);
  savedOptIns.length = 0;
  elements.get("#shareInvite").listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(savedOptIns.length, 1);
  assert.equal(savedOptIns[0].row.referral_count, 6);
  assert.match(elements.get("#inviteStatus").textContent, /share recorded \(6 total\)/);
  savedOptIns.length = 0;
  elements.get("#navLearn").listeners.click();

  tree.children[0].children[0].listeners.click();
  assert.equal(elements.get("#lessonPanel").hidden, false);
  assert.equal(elements.get("#answerOptions").children.length, 3);
  const firstWrongSoundIndex = audioPlays.length;
  for (let index = 0; index < 5; index += 1) {
    elements.get("#answerOptions").children[1].listeners.click();
  }
  assert.deepEqual(audioPlays.slice(firstWrongSoundIndex), [
    "assets/sfx/duolingo-wrong.mp3",
    "assets/sfx/duolingo-wrong.mp3",
    "assets/sfx/faaah.mp3",
    "assets/sfx/duolingo-wrong.mp3",
    "assets/sfx/oh-my-god-bro-oh-hell-nah-man.mp3",
  ]);
  assert.equal(audioPlays.at(-1), "assets/sfx/oh-my-god-bro-oh-hell-nah-man.mp3");
  assert.match(elements.get("#lessonFeedback").textContent, /try another answer/i);
  elements.get("#answerOptions").children[0].listeners.click();
  assert.equal(audioPlays.at(-1), "assets/sfx/duolingo-correct-answer-10-streak.mp3");
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(elements.get("#lessonFeedback").textContent, /\+20 XP/);
  assert.equal(elements.get("#cpct").textContent, "20%");
  assert.equal(elements.get("#vGems").textContent, "5");
  assert.equal(tree.children[0].children[0].className.includes("done"), true);
  assert.equal(tree.children[1].children[0].getAttribute("aria-disabled"), "false");
  assert.equal(JSON.parse(studyStorage.get("foldBook.studyProgress")).xp, 20);
  elements.get("#sndToggle").listeners.click();
  assert.equal(elements.get("#sndToggle").getAttribute("aria-pressed"), "false");
  elements.get("#sndToggle").listeners.click();
  assert.equal(elements.get("#sndToggle").getAttribute("aria-pressed"), "true");

  for (let index = 1; index < 5; index += 1) {
    tree.children[index].children[0].listeners.click();
    elements.get("#answerOptions").children[0].listeners.click();
  }
  assert.equal(elements.get("#cpct").textContent, "100%");
  assert.equal(elements.get("#examPredictorButton").disabled, false);
  assert.equal(elements.get("#examPredictorStatus").textContent, "MOCK EXAM READY");
  await elements.get("#examPredictorButton").listeners.click();
  assert.equal(elements.get("#examPredictorPanel").hidden, false);
  for (let index = 0; index < 5; index += 1) {
    elements.get("#mockExamOptions").children[index < 3 ? 1 : 0].listeners.click();
    elements.get("#mockExamNext").listeners.click();
  }
  assert.match(elements.get("#mockExamProgress").textContent, /2 \/ 5/);
  assert.ok(audioPlays.includes("assets/sfx/Complete%20test.mp3"));
  assert.equal(audioPlays.at(-1), "assets/sfx/oh-my-god-bro-oh-hell-nah-man.mp3");
  assert.equal(elements.get("#vGems").textContent, "35");
  assert.equal(JSON.parse(studyStorage.get("foldBook.studyProgress")).xp, 125);
  const form = elements.get("#lookupForm");
  const registration = elements.get("#searchRegNo");
  const fullName = elements.get("#searchFullName");
  const panel = elements.get("#results-panel");
  const status = elements.get("#results-status");
  const submittedEvent = { preventDefault() {} };

  registration.value = "001";
  fullName.value = "Gift Godspower Esther";
  form.listeners.submit(submittedEvent);
  assert.equal(panel.hidden, false);
  assert.equal(elements.get("#result-name").textContent, "Godspower Esther Gift");
  assert.equal(elements.get("#result-registration").textContent, "25/SS/EC/001");

  const resultRows = elements.get("#results-table").children;
  assert.equal(resultRows.length, 6);
  assert.deepEqual(
    resultRows.map((row) => [
      row.children[0].children.map((part) => part.textContent).join(""),
      row.children[3].textContent,
      row.children[4].textContent,
      row.children[5].textContent,
      row.children[6].children[0].textContent,
    ]),
    [
      ["ECO 121Principles of Economics II", "36", "F", "FAIL"],
      ["ECO 122Introductory Statistics II", "54", "C", "PASS"],
      ["ECO 123Introductory Mathematics II", "26", "F", "FAIL"],
      ["ECO 127ECO 127", "60", "B", "PASS"],
      ["ECO 128Intro to Transportation Economics", "50", "C", "PASS"],
      ["GST 121Nigerian People and Culture", "60", "B", "PASS"],
    ].map((cells) => [...cells, cells[2] === "B" ? "Create card" : "Unavailable"]),
  );

  const openCard = resultRows[3].children[6].children[0];
  openCard.listeners.click({ currentTarget: openCard });
  assert.equal(elements.get("#authModal").hidden, false);
  const whatsappInput = elements.get("#exportWhatsapp");
  const whatsappConsent = elements.get("#whatsappConsent");
  const optInForm = elements.get("#whatsappForm");
  whatsappInput.value = "bad-number";
  await optInForm.listeners.submit(submittedEvent);
  assert.equal(elements.get("#authModal").hidden, false);
  assert.match(elements.get("#whatsapp-status").textContent, /valid Nigerian mobile number/);
  assert.equal(elements.get("#poster-wrapper").hidden, true);
  whatsappInput.value = "08012345678";
  await optInForm.listeners.submit(submittedEvent);
  assert.match(elements.get("#whatsapp-status").textContent, /agree to the WhatsApp/);
  assert.equal(savedOptIns.length, 0);
  whatsappConsent.checked = true;
  insertResponse = { error: { message: "insert denied" } };
  await optInForm.listeners.submit(submittedEvent);
  assert.equal(elements.get("#authModal").hidden, true);
  assert.equal(elements.get("#poster-wrapper").hidden, false);
  assert.match(elements.get("#results-status").textContent, /card was created, but the WhatsApp reminder opt-in could not be saved/);

  elements.get("#dismiss-card").listeners.click();
  const retryCardButton = elements.get("#results-table").children[3].children[6].children[0];
  retryCardButton.listeners.click({ currentTarget: retryCardButton });
  whatsappInput.value = "08012345678";
  whatsappConsent.checked = true;
  insertResponse = { error: null };
  await optInForm.listeners.submit(submittedEvent);
  assert.equal(elements.get("#authModal").hidden, true);
  assert.equal(elements.get("#poster-wrapper").hidden, false);
  assert.equal(elements.get("#cardStudentName").textContent, "Godspower Esther Gift");
  assert.equal(elements.get("#cardCourse").textContent, "ECO 127");
  assert.equal(elements.get("#cardGrade").textContent, "B");
  assert.equal(elements.get("#cardScore").textContent, "60");
  assert.equal(elements.get("#gradeAsset").src, "/assets/brand/target.png");
  assert.equal(whatsappInput.value, "");
  assert.equal(whatsappConsent.checked, false);
  assert.equal(savedOptIns.length, 2);
  assert.match(savedOptIns[1].row.last_activity_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(JSON.parse(JSON.stringify(savedOptIns[1])), {
    row: {
      phone_number: "2348012345678",
      whatsapp_number: "2348012345678",
      reg_number: "25/SS/EC/001",
      full_name: "Godspower Esther Gift",
      streak_count: 6,
      activity_count: 1,
      referral_count: 6,
      avatar_url: null,
      avatar_lottie: "cat-idle.json",
      last_activity_at: savedOptIns[1].row.last_activity_at,
      opted_in: true,
    },
    options: { onConflict: "phone_number" },
  });

  elements.get("#dismiss-card").listeners.click();
  assert.equal(elements.get("#poster-wrapper").hidden, true);

  registration.value = "013";
  fullName.value = "Eric Bibiana Udayi";
  form.listeners.submit(submittedEvent);
  const aGradeCardButton = elements.get("#results-table").children[0].children[6].children[0];
  aGradeCardButton.listeners.click({ currentTarget: aGradeCardButton });
  whatsappInput.value = "08012345678";
  whatsappConsent.checked = true;
  await optInForm.listeners.submit(submittedEvent);
  assert.equal(elements.get("#cardGrade").textContent, "A");
  assert.equal(elements.get("#gradeAsset").src, "/assets/brand/trophy.png");
  assert.equal(elements.get("#gradeAsset").hidden, false);

  registration.value = "19/SS/EC/1592";
  fullName.value = "GODWIN Okwubunka";
  form.listeners.submit(submittedEvent);
  assert.equal(elements.get("#result-name").textContent, "Okwubunka Godwin");
  assert.equal(elements.get("#results-table").children.length, 1);

  registration.value = "001";
  form.listeners.submit(submittedEvent);
  registration.value = "not-a-registration";
  form.listeners.submit(submittedEvent);
  assert.equal(panel.hidden, true);
  assert.equal(status.textContent, "Invalid Registration Number or Full Name combination. Please verify your details.");

  registration.value = "25/SS/EC/999";
  fullName.value = "Any Valid Name";
  await form.listeners.submit(submittedEvent);
  assert.equal(panel.hidden, true);
  assert.equal(status.textContent, "Invalid Registration Number or Full Name combination. Please verify your details.");

  registration.value = "001";
  fullName.value = "Some Other Student";
  form.listeners.submit(submittedEvent);
  assert.equal(panel.hidden, true);
  assert.equal(status.textContent, "Invalid Registration Number or Full Name combination. Please verify your details.");

  elements.get("#adminLogout").listeners.click();
  runtime.window.location.hash = "#admin";
  windowListeners.hashchange();
  assert.equal(elements.get("#adminPasscodeGroup").hidden, false);
  elements.get("#authFullName").value = "";
  elements.get("#authRegNo").value = "";
  elements.get("#authWhatsapp").value = "";
  elements.get("#adminPasscode").value = "test-admin-passcode";
  elements.get("#authMarketingConsent").checked = false;
  const optInCountBeforeAdmin = savedOptIns.length;
  await elements.get("#appAuthForm").listeners.submit(submittedEvent);
  assert.equal(panel.hidden, true);
  assert.equal(elements.get("#adminDashboard").hidden, false);
  assert.equal(elements.get("#adminDashboard").className.includes("hide"), false);
  assert.equal(elements.get("#studentApp").className.includes("hide"), true);
  assert.equal(runtime.window.location.hash, "#adminDashboard");
  assert.equal(savedOptIns.length, optInCountBeforeAdmin);
  assert.equal(JSON.parse(studyStorage.get("foldBook.authSession")).role, "admin");
  elements.get("#adminFileUploader").files = [{
    name: "lecture-notes.txt",
    size: 25,
    async text() { return "First note.\nSecond note."; },
  }];
  await elements.get("#adminFileUploader").listeners.change();
  assert.equal(elements.get("#adminMaterialTitle").value, "lecture-notes");
  assert.equal(elements.get("#adminMaterialText").value, "First note.\nSecond note.");
  assert.equal(elements.get("#adminResults").children.length, 114);
  elements.get("#adminSearch").value = "Godspower Esther";
  elements.get("#adminSearch").listeners.input();
  assert.equal(elements.get("#adminResults").children.length, 1);
  elements.get("#adminResults").children[0].children[3].children[0].listeners.click();
  assert.equal(elements.get("#adminStudentDetail").hidden, false);
  assert.equal(elements.get("#adminStudentName").textContent, "Godspower Esther Gift");
  elements.get("#adminLogout").listeners.click();
  assert.equal(elements.get("#adminDashboard").hidden, true);
  assert.equal(elements.get("#studentApp").hidden, true);
  assert.equal(elements.get("#authView").hidden, false);

  elements.get("#launchApp").listeners.click();
  elements.get("#authFullName").value = "Godspower Esther Gift";
  elements.get("#authRegNo").value = "001";
  elements.get("#authWhatsapp").value = "08012345678";
  elements.get("#authMarketingConsent").checked = true;
  insertResponse = { error: { message: "insert denied" } };
  await elements.get("#appAuthForm").listeners.submit(submittedEvent);
  assert.equal(elements.get("#studentApp").hidden, false);
  assert.equal(elements.get("#home").hidden, false);
  assert.match(elements.get("#accessToast").textContent, /Welcome Godspower/i);
  assert.equal(JSON.parse(studyStorage.get("foldBook.authSession")).role, "student");
  elements.get("#studentSignOut").listeners.click();
  assert.equal(elements.get("#authView").hidden, false);
  assert.equal(elements.get("#studentApp").hidden, true);
  assert.equal(studyStorage.has("foldBook.authSession"), false);
  assert.equal(runtime.window.location.hash, "#authView");
  elements.get("#studentSignOut").listeners.click();
  assert.equal(elements.get("#authView").hidden, false);
  assert.equal(elements.get("#studentApp").hidden, true);
  assert.equal(studyStorage.has("foldBook.authSession"), false);
  assert.equal(runtime.window.location.hash, "#authView");
});

test("Gemini proxy keeps its key server-side and rejects invalid requests", async () => {
  const oldApiKey = process.env.GEMINI_API_KEY;
  const oldFetch = global.fetch;
  const makeRequest = (overrides = {}) => ({
    method: "POST",
    headers: { origin: "https://fold-book.example", host: "fold-book.example" },
    body: {
      system_instruction: { parts: [{ text: "Tutor the student." }] },
      contents: [{ role: "user", parts: [{ text: "Explain demand." }] }],
    },
    ...overrides,
  });
  const invoke = async (request) => {
    const response = {
      headers: {},
      status: 0,
      writeHead(status, headers) {
        this.status = status;
        Object.assign(this.headers, headers);
      },
      setHeader(name, value) {
        this.headers[name] = value;
      },
      end(body) {
        this.body = body;
      },
    };
    await drEcoHandler(request, response);
    return { ...response, json: JSON.parse(response.body) };
  };

  try {
    delete process.env.GEMINI_API_KEY;
    const notConfigured = await invoke(makeRequest());
    assert.equal(notConfigured.status, 503);
    assert.match(notConfigured.json.error, /GEMINI_API_KEY/);

    const wrongOrigin = await invoke(makeRequest({
      headers: { origin: "https://attacker.example", host: "fold-book.example" },
    }));
    assert.equal(wrongOrigin.status, 403);

    process.env.GEMINI_API_KEY = "server-only-test-key";
    let upstreamUrl;
    let upstreamBody;
    global.fetch = async (url, options) => {
      upstreamUrl = String(url);
      upstreamBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ candidates: [{ content: { parts: [{ text: "Answer." }] } }] });
        },
      };
    };
    const success = await invoke(makeRequest());
    assert.equal(success.status, 200);
    assert.match(upstreamUrl, /gemini-3\.5-flash-lite:generateContent\?key=server-only-test-key/);
    assert.equal(upstreamBody.contents[0].parts[0].text, "Explain demand.");
    assert.doesNotMatch(JSON.stringify(success.json), /server-only-test-key/);

    const invalidPayload = await invoke(makeRequest({ body: { contents: [] } }));
    assert.equal(invalidPayload.status, 400);
    const oversized = await invoke(makeRequest({ body: "x".repeat(24 * 1024 + 1) }));
    assert.equal(oversized.status, 413);
  } finally {
    global.fetch = oldFetch;
    if (oldApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldApiKey;
  }
});

test("Gemini Live provisions short-lived constrained tokens without exposing the API key", async () => {
  const oldApiKey = process.env.GEMINI_API_KEY;
  const oldModel = process.env.GEMINI_LIVE_MODEL;
  const oldFetch = global.fetch;
  const makeRequest = (overrides = {}) => ({
    method: "POST",
    headers: { origin: "https://fold-book.example", host: "fold-book.example" },
    body: {
      courseCode: "ECO 128",
      level: "100L",
      courseNotes: "Transport demand is derived from the need to travel.",
    },
    ...overrides,
  });
  const invoke = async (request) => {
    const response = {
      headers: {},
      status: 0,
      writeHead(status, headers) {
        this.status = status;
        Object.assign(this.headers, headers);
      },
      setHeader(name, value) {
        this.headers[name] = value;
      },
      end(body) {
        this.body = body;
      },
    };
    await geminiLiveTokenHandler(request, response);
    return { ...response, json: JSON.parse(response.body) };
  };

  try {
    delete process.env.GEMINI_API_KEY;
    const notConfigured = await invoke(makeRequest());
    assert.equal(notConfigured.status, 503);

    process.env.GEMINI_API_KEY = "server-only-live-test-key";
    delete process.env.GEMINI_LIVE_MODEL;
    const wrongOrigin = await invoke(makeRequest({
      headers: { origin: "https://attacker.example", host: "fold-book.example" },
    }));
    assert.equal(wrongOrigin.status, 403);

    let upstreamUrl;
    let upstreamHeaders;
    let tokenRequest;
    global.fetch = async (url, options) => {
      upstreamUrl = String(url);
      upstreamHeaders = options.headers;
      tokenRequest = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ name: "short-lived-token-value" }),
      };
    };
    const result = await invoke(makeRequest());
    assert.equal(result.status, 200);
    assert.equal(result.json.token, "short-lived-token-value");
    assert.equal(result.json.model, "models/gemini-2.5-flash-native-audio-preview-12-2025");
    assert.equal(upstreamUrl, "https://generativelanguage.googleapis.com/v1beta/auth_tokens");
    assert.equal(upstreamHeaders["x-goog-api-key"], "server-only-live-test-key");
    assert.equal(tokenRequest.uses, 1);
    assert.equal(tokenRequest.liveConnectConstraints.model, "models/gemini-2.5-flash-native-audio-preview-12-2025");
    assert.equal(tokenRequest.liveConnectConstraints.config.responseModalities[0], "AUDIO");
    assert.match(tokenRequest.liveConnectConstraints.config.systemInstruction.parts[0].text, /derived from the need to travel/);
    assert.doesNotMatch(JSON.stringify(result.json), /server-only-live-test-key/);

    const invalidCourse = await invoke(makeRequest({ body: {
      courseCode: "select *",
      level: "100L",
      courseNotes: "",
    } }));
    assert.equal(invalidCourse.status, 400);
  } finally {
    global.fetch = oldFetch;
    if (oldApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldApiKey;
    if (oldModel === undefined) delete process.env.GEMINI_LIVE_MODEL;
    else process.env.GEMINI_LIVE_MODEL = oldModel;
  }
});

test("admin passcode sessions protect server-side course material indexing", async () => {
  const oldPasscode = process.env.FOLDBOOK_ADMIN_PASSCODE;
  const oldSecret = process.env.FOLDBOOK_ADMIN_SESSION_SECRET;
  const oldSupabaseUrl = process.env.SUPABASE_URL;
  const oldServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const oldFetch = global.fetch;
  process.env.FOLDBOOK_ADMIN_PASSCODE = "test-admin-passcode";
  process.env.FOLDBOOK_ADMIN_SESSION_SECRET = "test-session-secret-that-is-at-least-32-bytes";
  process.env.SUPABASE_URL = "https://fold-book-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-service-role-test-key";

  const invoke = async (handler, request) => {
    const response = {
      headers: {},
      status: 0,
      writeHead(status, headers) {
        this.status = status;
        Object.assign(this.headers, headers);
      },
      setHeader(name, value) {
        this.headers[name] = value;
      },
      end(body) {
        this.body = body;
      },
    };
    await handler(request, response);
    return { ...response, json: JSON.parse(response.body) };
  };
  const makeRequest = (body, overrides = {}) => ({
    method: "POST",
    headers: { origin: "https://fold-book.example", host: "fold-book.example" },
    body,
    ...overrides,
  });

  try {
    const invalidPasscode = await invoke(adminSessionHandler, makeRequest({ passcode: "wrong" }));
    assert.equal(invalidPasscode.status, 401);

    const crossOrigin = await invoke(adminSessionHandler, makeRequest({ passcode: "test-admin-passcode" }, {
      headers: { origin: "https://attacker.example", host: "fold-book.example" },
    }));
    assert.equal(crossOrigin.status, 403);

    const login = await invoke(adminSessionHandler, makeRequest({ passcode: "test-admin-passcode" }));
    assert.equal(login.status, 200);
    assert.match(login.headers["Set-Cookie"], /HttpOnly/);
    assert.match(login.headers["Set-Cookie"], /SameSite=Strict/);
    const cookie = login.headers["Set-Cookie"].split(";")[0];

    const unauthenticated = await invoke(adminCourseMaterialsHandler, makeRequest({
      level: "100L",
      courseCode: "ECO 128",
      title: "Lecture notes",
      content: "Demand for transport is derived.",
    }));
    assert.equal(unauthenticated.status, 401);

    let upstreamUrl;
    let upstreamOptions;
    global.fetch = async (url, options) => {
      upstreamUrl = String(url);
      upstreamOptions = options;
      return { ok: true, status: 201 };
    };
    const indexed = await invoke(adminCourseMaterialsHandler, makeRequest({
      level: "200L",
      courseCode: "ECO 221",
      title: "Consumer theory",
      content: "Utility maximization under a budget constraint.",
    }, { headers: { origin: "https://fold-book.example", host: "fold-book.example", cookie } }));
    assert.equal(indexed.status, 201);
    assert.equal(upstreamUrl, "https://fold-book-test.supabase.co/rest/v1/course_materials");
    assert.equal(upstreamOptions.headers.apikey, "server-only-service-role-test-key");
    assert.deepEqual(JSON.parse(upstreamOptions.body), {
      level: "200L",
      course_code: "ECO 221",
      title: "Consumer theory",
      content: "Utility maximization under a budget constraint.",
    });
    assert.doesNotMatch(JSON.stringify(indexed.json), /server-only-service-role-test-key/);

    const tamperedCookie = cookie.replace(/.$/, cookie.endsWith("a") ? "b" : "a");
    const deniedTampered = await invoke(adminCourseMaterialsHandler, makeRequest({}, {
      headers: { origin: "https://fold-book.example", host: "fold-book.example", cookie: tamperedCookie },
    }));
    assert.equal(deniedTampered.status, 401);
  } finally {
    global.fetch = oldFetch;
    if (oldPasscode === undefined) delete process.env.FOLDBOOK_ADMIN_PASSCODE;
    else process.env.FOLDBOOK_ADMIN_PASSCODE = oldPasscode;
    if (oldSecret === undefined) delete process.env.FOLDBOOK_ADMIN_SESSION_SECRET;
    else process.env.FOLDBOOK_ADMIN_SESSION_SECRET = oldSecret;
    if (oldSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldSupabaseUrl;
    if (oldServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldServiceRoleKey;
  }
});

test("WhatsApp worker disables history sync and resets logged-out auth state", () => {
  const worker = fs.readFileSync(path.join(root, "worker/worker.js"), "utf8");
  const entrypoint = fs.readFileSync(path.join(root, "worker.js"), "utf8");
  const schema = fs.readFileSync(path.join(root, "worker/schema.sql"), "utf8");
  assert.match(worker, /fetchLatestBaileysVersion/);
  assert.match(worker, /syncFullHistory:\s*false/);
  assert.match(worker, /browser:\s*\["Ubuntu",\s*"Chrome",\s*"110\.0\.5563\.56"\]/);
  assert.match(worker, /generateHighQualityLinkPreview:\s*false/);
  assert.match(worker, /const BOT_PHONE_NUMBER = process\.env\.BOT_PHONE_NUMBER/);
  assert.match(worker, /requestPairingCode\(phoneNumber\)/);
  assert.match(worker, /YOUR WHATSAPP PAIRING CODE IS/);
  assert.match(worker, /!state\.creds\.registered/);
  assert.match(worker, /BOT_PHONE_NUMBER must be a Nigerian WhatsApp number/);
  assert.match(worker, /fs\.rmSync\(AUTH_DIRECTORY,\s*\{\s*recursive:\s*true,\s*force:\s*true\s*\}\)/);
  assert.match(worker, /statusCode === DisconnectReason\.loggedOut \|\| statusCode === 401/);
  assert.match(entrypoint, /http\.createServer/);
  assert.match(entrypoint, /process\.env\.PORT \|\| 10000/);
  assert.match(entrypoint, /FoldBook WhatsApp Worker Active/);
  assert.match(entrypoint, /listen\(PORT,\s*"0\.0\.0\.0"/);
  assert.match(schema, /add column if not exists referral_count integer not null default 0/);
  assert.match(schema, /add column if not exists avatar_url text/);
  assert.match(schema, /add column if not exists avatar_lottie text/);
  assert.match(schema, /add column if not exists avatar_lottie text/);
});

test("production preview serves public pages but keeps raw CSV and source files out of the site", async () => {
  for (const relativePath of publicFiles) {
    const requestPath = relativePath.split("/").map((segment) => encodeURIComponent(segment)).join("/");
    const response = await fetch(`${origin}/${requestPath}`);
    assert.equal(response.status, 200, `Expected ${relativePath} to be publicly available.`);
  }

  for (const privatePath of [
    ...privateFiles,
    "/scripts/generate_data.js",
    "/README.md",
  ]) {
    const response = await fetch(`${origin}/${privatePath.replace(/^\/+/, "")}`);
    assert.equal(response.status, 404, `Expected ${privatePath} to remain private.`);
  }

  const disallowedMethod = await fetch(origin, { method: "POST" });
  assert.equal(disallowedMethod.status, 405);

  const compiledApp = await fetch(`${origin}/assets/js/app.js`);
  const appText = await compiledApp.text();
  assert.match(appText, /const RESULT_LOOKUP = \{/);
  assert.match(appText, /Godspower Esther Gift/);

  const apiResponse = await fetch(`${origin}/api/dr-eco`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: "Tutor." }] },
      contents: [{ role: "user", parts: [{ text: "Explain demand." }] }],
    }),
  });
  assert.equal(apiResponse.status, 503);
  assert.match((await apiResponse.json()).error, /GEMINI_API_KEY/);
});
