"use strict";

const assert = require("node:assert/strict");
const vm = require("node:vm");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");

const root = path.join(__dirname, "..");
const output = path.join(root, "dist");
const brandDirectory = path.join(root, "assets", "brand");
const lottieDirectory = path.join(root, "assets", "lottie");
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
    env: { ...process.env, PORT: String(port) },
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
  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const lookupMatch = app.match(/^const RESULT_LOOKUP = (\{.*\});$/m);

  assert.match(styles, /color-scheme:\s*dark\b/);
  assert.match(html, /id="searchRegNo"/);
  assert.match(html, /id="searchFullName"/);
  assert.match(html, /id="results-table"/);
  assert.match(html, /id="navLearn"[^>]+data-tab="home"/);
  assert.match(html, /id="navBoard"[^>]+data-tab="board"/);
  assert.match(html, /id="navResults"[^>]+data-tab="results"/);
  assert.match(html, /id="navChat"[^>]+data-tab="chat"/);
  assert.match(html, /id="navInvite"[^>]+data-tab="invite"/);
  assert.match(html, /id="mobileLearn"[^>]+data-tab="home"/);
  assert.match(html, /FoldBook/);
  assert.doesNotMatch(html, /Fold Book V2|FOLD BOOK V2/);
  assert.match(html, /@dotlottie\/player-component/);
  assert.match(html, /id="tdr"/);
  assert.match(html, /id="fuel"/);
  assert.match(html, /id="pathTree"/);
  assert.match(html, /id="weekTracker"/);
  assert.match(html, /id="leaderboardList"/);
  assert.match(html, /id="sndToggle"/);
  assert.match(html, /id="examPredictorButton"/);
  assert.match(html, /id="examPredictorPanel"/);
  assert.match(app, /const STUDY_MODULES = \[/);
  assert.match(app, /function saveStudyProgress/);
  assert.match(app, /function renderMascot/);
  assert.match(app, /function tone/);
  assert.match(app, /101010/);
  assert.match(app, /Nssien/);
  assert.match(app, /function setCourse/);
  assert.match(app, /SpeechRecognition/);
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
  assert.match(app, /function normalizeRegistration/);
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
    "#home",
    "#chat",
    "#board",
    "#invite",
    "#results",
    "#navChat",
    "#navLearn",
    "#navBoard",
    "#navInvite",
    "#navResults",
    "#mobileLearn",
    "#mobileBoard",
    "#mobileChat",
    "#mobileInvite",
    "#mobileResults",
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
    "#simulateInvite",
    "#leaderboardPodium",
    "#yourRank",
    "#yourXp",
    "#adminPanel",
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
    ["#navResults", "results"],
    ["#mobileLearn", "home"],
    ["#mobileBoard", "board"],
    ["#mobileChat", "chat"],
    ["#mobileInvite", "invite"],
    ["#mobileResults", "results"],
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
  elements.get("#home").hidden = false;
  elements.get("#chat").hidden = true;
  elements.get("#board").hidden = true;
  elements.get("#invite").hidden = true;
  elements.get("#results").hidden = true;
  elements.get("#authModal").hidden = true;
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
      return [];
    },
    addEventListener() {},
    getElementById(id) {
      return this.querySelector(`#${id}`);
    },
    createElement() {
      return new Element();
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
  const insertedOptIns = [];
  const studyStorage = new Map();
  const runtime = {
    document,
    console: { error() {} },
    window: {
      print() {},
      location: { origin, pathname: "/" },
      setTimeout() { return 1; },
      navigator: { vibrate() { return true; } },
      localStorage: {
        getItem(key) {
          return studyStorage.get(key) || null;
        },
        setItem(key, value) {
          studyStorage.set(key, value);
        },
      },
      supabase: {
        createClient(url, key) {
          assert.equal(url, "https://fdutgltyptcqeyajsnua.supabase.co");
          assert.equal(key, "header.payload.signature");
          return {
            from(table) {
              assert.equal(table, "whatsapp_optins");
              return {
                async insert(rows) {
                  insertedOptIns.push(...rows);
                  return insertResponse;
                },
              };
            },
          };
        },
      },
    },
    fetch: async () => ({ ok: true, json: async () => [] }),
  };
  vm.runInNewContext(app, runtime);

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
  elements.get("#examPredictorButton").listeners.click();
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
  elements.get("#chatInput").value = "Explain peak-load pricing";
  elements.get("#chatForm").listeners.submit({ preventDefault() {} });
  assert.match(elements.get("#chatMessages").children.at(-1).children[0].textContent, /Peak-load pricing charges more/);
  assert.equal(elements.get("#vFuel").textContent, "83/100");
  elements.get("#questionCount").value = "10";
  elements.get("#openTest").listeners.click();
  assert.equal(elements.get("#tdr").hidden, false);
  assert.equal(elements.get("#testProgress").textContent, "1 / 10");
  elements.get("#testOptions").children[0].listeners.click();
  elements.get("#nextTestQuestion").listeners.click();
  assert.equal(elements.get("#testProgress").textContent, "2 / 10");
  elements.get("#closeTest").listeners.click();
  assert.equal(elements.get("#tdr").hidden, true);
  for (let index = 0; index < 5; index += 1) elements.get("#simulateInvite").listeners.click();
  assert.equal(elements.get("#inviteCount").textContent, "5 / 5");
  assert.match(elements.get("#inviteStatus").textContent, /48-hour unlimited study fuel/);
  assert.equal(elements.get("#vFuel").textContent, "∞ PASS");
  elements.get("#navLearn").listeners.click();

  tree.children[0].children[0].listeners.click();
  assert.equal(elements.get("#lessonPanel").hidden, false);
  assert.equal(elements.get("#answerOptions").children.length, 3);
  elements.get("#answerOptions").children[1].listeners.click();
  assert.match(elements.get("#lessonFeedback").textContent, /try another answer/i);
  elements.get("#answerOptions").children[0].listeners.click();
  assert.match(elements.get("#lessonFeedback").textContent, /\+20 XP/);
  assert.equal(elements.get("#cpct").textContent, "20%");
  assert.equal(elements.get("#vGems").textContent, "5");
  assert.equal(tree.children[0].children[0].className.includes("done"), true);
  assert.equal(tree.children[1].children[0].getAttribute("aria-disabled"), "false");
  assert.equal(JSON.parse(studyStorage.get("foldBook.studyProgress")).xp, 20);
  elements.get("#sndToggle").listeners.click();
  assert.equal(elements.get("#sndToggle").getAttribute("aria-pressed"), "false");

  for (let index = 1; index < 5; index += 1) {
    tree.children[index].children[0].listeners.click();
    elements.get("#answerOptions").children[0].listeners.click();
  }
  assert.equal(elements.get("#cpct").textContent, "100%");
  assert.equal(elements.get("#examPredictorButton").disabled, false);
  assert.equal(elements.get("#examPredictorStatus").textContent, "MOCK EXAM READY");
  elements.get("#examPredictorButton").listeners.click();
  assert.equal(elements.get("#examPredictorPanel").hidden, false);
  for (let index = 0; index < 5; index += 1) {
    elements.get("#mockExamOptions").children[0].listeners.click();
    elements.get("#mockExamNext").listeners.click();
  }
  assert.match(elements.get("#mockExamProgress").textContent, /5 \/ 5/);
  assert.equal(elements.get("#vGems").textContent, "35");
  assert.equal(JSON.parse(studyStorage.get("foldBook.studyProgress")).xp, 125);
  elements.get("#navResults").listeners.click();
  assert.equal(elements.get("#results").hidden, false);

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
  assert.match(elements.get("#whatsapp-status").textContent, /valid WhatsApp number/);
  assert.equal(elements.get("#poster-wrapper").hidden, true);
  whatsappInput.value = "08012345678";
  await optInForm.listeners.submit(submittedEvent);
  assert.match(elements.get("#whatsapp-status").textContent, /agree to the WhatsApp/);
  assert.equal(insertedOptIns.length, 0);
  whatsappConsent.checked = true;
  insertResponse = { error: { message: "insert denied" } };
  await optInForm.listeners.submit(submittedEvent);
  assert.equal(elements.get("#authModal").hidden, false);
  assert.equal(elements.get("#poster-wrapper").hidden, true);
  assert.match(elements.get("#whatsapp-status").textContent, /couldn't save your opt-in/);
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
  assert.deepEqual(JSON.parse(JSON.stringify(insertedOptIns[1])), {
    reg_number: "25/SS/EC/001",
    full_name: "Godspower Esther Gift",
    whatsapp_number: "08012345678",
    course_code: "ECO 127",
    grade: "B",
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
  form.listeners.submit(submittedEvent);
  assert.equal(panel.hidden, true);
  assert.equal(status.textContent, "Invalid Registration Number or Full Name combination. Please verify your details.");

  registration.value = "001";
  fullName.value = "Some Other Student";
  form.listeners.submit(submittedEvent);
  assert.equal(panel.hidden, true);
  assert.equal(status.textContent, "Invalid Registration Number or Full Name combination. Please verify your details.");

  registration.value = "101010";
  fullName.value = "Nssien";
  form.listeners.submit(submittedEvent);
  assert.equal(panel.hidden, true);
  assert.equal(elements.get("#adminPanel").hidden, false);
  assert.equal(elements.get("#adminResults").children.length, 114);
  elements.get("#adminSearch").value = "Godspower Esther";
  elements.get("#adminSearch").listeners.input();
  assert.equal(elements.get("#adminResults").children.length, 1);
  elements.get("#adminResults").children[0].children[3].children[0].listeners.click();
  assert.equal(elements.get("#adminStudentDetail").hidden, false);
  assert.equal(elements.get("#adminStudentName").textContent, "Godspower Esther Gift");
  elements.get("#adminLogout").listeners.click();
  assert.equal(elements.get("#adminPanel").hidden, true);
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
});
