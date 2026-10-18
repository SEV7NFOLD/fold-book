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
const host = "127.0.0.1";
const port = 18371;
const origin = `http://${host}:${port}`;
const publicFiles = [
  "index.html",
  ...fs.readdirSync(brandDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `assets/brand/${entry.name}`),
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
<<<<<<< HEAD
  assert.match(html, /class="sf-poster-card" id="exportCard"/);
  assert.match(html, /class="sf-result-box"/);
  assert.match(html, /id="cardStudentName"/);
  assert.match(html, /viewBox="0 0 100 120"/);
  assert.match(html, /<circle cx="50" cy="12" r="4\.5"/);
  assert.match(html, /<path d="M15 25 H85 L50 95 L15 25 Z"/);
  assert.match(html, /<path d="M32 37 H68 L50 72 L38 50 H62"/);
  assert.match(html, /<circle cx="50" cy="108" r="4\.5"/);
  assert.match(html, /href="https:\/\/bignssien\.wixstudio\.com\/sev7nfold"/);
  assert.doesNotMatch(html, /www\.sevenfold\.agency/);
  assert.match(html, /Built to move student careers &amp; brands forward\./);
  assert.match(styles, /\.sf-poster-card::before/);
=======
  assert.match(html, /class="brand-mark" src="\/assets\/brand\/Seven%20fold%20logo%20svg%20WHITE\.svg"/);
  assert.match(html, /src="\/assets\/brand\/Seven%20fold%20logo%20svg%20WHITE\.svg" alt="" class="art-mark"/);
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
  assert.match(contentSecurityPolicy, /script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
  assert.match(contentSecurityPolicy, /connect-src 'self' https:\/\/fdutgltyptcqeyajsnua\.supabase\.co/);
>>>>>>> 0e87989 (Feat: Add gated full-name auth, master key 101010, deferred WhatsApp opt-in, and Supabase integration)
  assert.match(app, /function normalizeRegistration/);
  assert.match(app, /context\.fillStyle = "#F7F5F0"/);
  assert.match(app, /bignssien\.wixstudio\.com\/sev7nfold/);
  assert.doesNotMatch(app, /www\.sevenfold\.agency/);
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
  const downloads = [];
  const canvases = [];
  class Element {
    constructor() {
      this.children = [];
      this.listeners = Object.create(null);
      this.attributes = Object.create(null);
      this.dataset = Object.create(null);
      this.className = "";
      this.classList = {
        toggle: () => {},
      };
      this.hidden = false;
      this.textContent = "";
      this.value = "";
      this.checked = false;
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
  }

  const elements = new Map([
    "#timetable-list",
    "#timetable-status",
    "#announcements-list",
    "#announcements-status",
    "#lookupForm",
    "#searchRegNo",
    "#searchFullName",
    "#results-status",
    "#results-panel",
    "#result-name",
    "#result-registration",
    "#result-summary",
    "#results-table",
    "#results-empty",
<<<<<<< HEAD
    "#celebration-modal",
    "#celebration-close",
    "#celebration-title",
    "#celebration-course-count",
    "#celebration-course-nav",
    "#celebration-course-position",
    "#celebration-previous",
    "#celebration-next",
    "#celebration-export",
    "#celebration-export-status",
    "#cardStudentName",
    "#cardRegNo",
    "#cardGrade",
    "#cardCourse",
    "#cardCourseTitle",
    "#cardScore",
    "#cardRemark",
=======
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
>>>>>>> 0e87989 (Feat: Add gated full-name auth, master key 101010, deferred WhatsApp opt-in, and Supabase integration)
  ].map((selector) => [selector, new Element()]));
  elements.get("#authModal").hidden = true;
  elements.get("#poster-wrapper").hidden = true;
  elements.get("#poster-wrapper").scrollIntoView = () => {};
  elements.get("#whatsappForm").querySelector = (selector) => {
    assert.equal(selector, 'button[type="submit"]');
    return elements.get("#whatsapp-submit");
  };
  const filterButtons = ["all", "Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => {
    const button = new Element();
    button.dataset.day = day;
    return button;
  });
  const document = {
    querySelector(selector) {
      assert.ok(elements.has(selector), `Unexpected document selector: ${selector}`);
      return elements.get(selector);
    },
    querySelectorAll(selector) {
      assert.equal(selector, ".filter-button");
      return filterButtons;
    },
<<<<<<< HEAD
    createElement(tagName) {
      const element = new Element();
      element.tagName = tagName;
      if (tagName === "canvas") {
        const context = new Proxy({
          measureText: (text) => ({ width: String(text).length * 5 }),
        }, {
          get(target, property) {
            return property in target ? target[property] : () => {};
          },
        });
        element.getContext = () => context;
        element.toBlob = (callback, mimeType) => callback({ type: mimeType });
        canvases.push(element);
      }
      return element;
=======
    addEventListener() {},
    createElement() {
      return new Element();
>>>>>>> 0e87989 (Feat: Add gated full-name auth, master key 101010, deferred WhatsApp opt-in, and Supabase integration)
    },
    createDocumentFragment() {
      return new Element();
    },
  };

<<<<<<< HEAD
  const app = fs.readFileSync(path.join(output, "assets/js/app.js"), "utf8");
  const audioFrequencies = [];
  class TestAudioContext {
    currentTime = 0;
    destination = {};

    createOscillator() {
      return {
        frequency: { setValueAtTime: (value) => audioFrequencies.push(value) },
        connect() {},
        start() {},
        stop() {},
      };
    }

    createBiquadFilter() {
      return { frequency: { setValueAtTime() {} }, connect() {} };
    }

    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      };
    }

    resume() {
      return Promise.resolve();
    }
  }

  const runtime = {
    document,
    AudioContext: TestAudioContext,
=======
  const app = fs.readFileSync(path.join(output, "assets/js/app.js"), "utf8")
    .replace(/const SUPABASE_ANON_KEY = .*;/, 'const SUPABASE_ANON_KEY = "header.payload.signature";');
  let insertResponse = { error: null };
  const insertedOptIns = [];
  vm.runInNewContext(app, {
    document,
    console: { error() {} },
    window: {
      print() {},
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
>>>>>>> 0e87989 (Feat: Add gated full-name auth, master key 101010, deferred WhatsApp opt-in, and Supabase integration)
    fetch: async () => ({ ok: true, text: async () => "" }),
    URL: {
      createObjectURL: (blob) => {
        assert.equal(blob.type, "image/png");
        return "blob:grade-card";
      },
      revokeObjectURL: (url) => assert.equal(url, "blob:grade-card"),
    },
    setTimeout: (callback) => callback(),
  };
  vm.runInNewContext(app, runtime);
  const lookup = vm.runInNewContext("RESULT_LOOKUP", runtime);

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
  const celebration = elements.get("#celebration-modal");
  assert.equal(celebration.open, true);
  assert.deepEqual(audioFrequencies, [523.25, 659.25, 783.99, 1046.5]);
  assert.equal(elements.get("#cardGrade").textContent, "B");
  assert.equal(elements.get("#cardCourse").textContent, "ECO 127");
  assert.match(elements.get("#celebration-course-count").textContent, /2 courses earned an A or B/);
  elements.get("#celebration-next").listeners.click();
  assert.equal(elements.get("#cardCourse").textContent, "GST 121");
  elements.get("#celebration-previous").listeners.click();
  assert.equal(elements.get("#cardCourse").textContent, "ECO 127");
  elements.get("#celebration-export").listeners.click();
  assert.equal(canvases[0].width, 1080);
  assert.equal(canvases[0].height, 1920);
  assert.equal(canvases[0].width / canvases[0].height, 9 / 16);
  assert.deepEqual(downloads, [{
    download: "GODSPOWER_ESTHER_GIFT_ECO_127_SevenFold_Grade.png",
    href: "blob:grade-card",
  }]);
  assert.match(elements.get("#celebration-export-status").textContent, /1080 × 1920 PNG/);
  elements.get("#celebration-close").listeners.click();
  assert.equal(celebration.open, false);

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
<<<<<<< HEAD
      ["ECO 121Principles of Economics II", "11", "25", "36", "F", "FAIL"],
      ["ECO 122Introductory Statistics II", "16", "38", "54", "C", "PASS"],
      ["ECO 123Introductory Mathematics II", "8", "18", "26", "F", "FAIL"],
      ["ECO 127ECO 127", "18", "42", "60", "B", "PASS"],
      ["ECO 128Intro to Transportation Economics", "15", "35", "50", "C", "PASS"],
      ["GST 121Nigerian People and Culture", "18", "42", "60", "B", "PASS"],
    ],
  );

  const eco127 = lookup["25/SS/EC/001"].results.find((result) => result.course === "ECO 127");
  eco127.grade = "A";
  eco127.total = 75;
  form.listeners.submit(submittedEvent);
  assert.equal(elements.get("#cardGrade").textContent, "A");
  assert.equal(elements.get("#cardScore").textContent, "75");
  eco127.grade = "B";
  eco127.total = 60;
=======
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
>>>>>>> 0e87989 (Feat: Add gated full-name auth, master key 101010, deferred WhatsApp opt-in, and Supabase integration)

  registration.value = "19/SS/EC/1592";
  fullName.value = "GODWIN Okwubunka";
  form.listeners.submit(submittedEvent);
  assert.equal(elements.get("#result-name").textContent, "Okwubunka Godwin");
  assert.equal(elements.get("#results-table").children.length, 1);
  assert.equal(celebration.open, false);

  registration.value = "001";
  form.listeners.submit(submittedEvent);
  assert.equal(celebration.open, true);
  registration.value = "not-a-registration";
  form.listeners.submit(submittedEvent);
  assert.equal(panel.hidden, true);
<<<<<<< HEAD
  assert.equal(celebration.open, false);
  assert.match(status.textContent, /Enter a valid registration number/);
=======
  assert.equal(status.textContent, "Invalid Registration Number or Full Name combination. Please verify your details.");
>>>>>>> 0e87989 (Feat: Add gated full-name auth, master key 101010, deferred WhatsApp opt-in, and Supabase integration)

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
  assert.equal(status.textContent, "Invalid Registration Number or Full Name combination. Please verify your details.");
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
