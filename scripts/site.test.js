"use strict";

const assert = require("node:assert/strict");
const vm = require("node:vm");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");

const root = path.join(__dirname, "..");
const output = path.join(root, "dist");
const host = "127.0.0.1";
const port = 18371;
const origin = `http://${host}:${port}`;
const publicFiles = [
  "index.html",
  "assets/brand/mark.svg",
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
  const lookupMatch = app.match(/^const RESULT_LOOKUP = (\{.*\});$/m);

  assert.match(styles, /color-scheme:\s*dark\b/);
  assert.match(html, /id="registration-number"/);
  assert.match(html, /id="results-table"/);
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
      this.classList = {
        toggle: () => {},
      };
      this.hidden = false;
      this.textContent = "";
      this.value = "";
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

    focus() {}
  }

  const elements = new Map([
    "#timetable-list",
    "#timetable-status",
    "#announcements-list",
    "#announcements-status",
    "#results-form",
    "#registration-number",
    "#results-status",
    "#results-panel",
    "#result-name",
    "#result-registration",
    "#result-summary",
    "#results-table",
    "#results-empty",
  ].map((selector) => [selector, new Element()]));
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
    createElement() {
      return new Element();
    },
    createDocumentFragment() {
      return new Element();
    },
  };

  const app = fs.readFileSync(path.join(output, "assets/js/app.js"), "utf8");
  vm.runInNewContext(app, {
    document,
    fetch: async () => ({ ok: true, text: async () => "" }),
  });

  const form = elements.get("#results-form");
  const registration = elements.get("#registration-number");
  const panel = elements.get("#results-panel");
  const status = elements.get("#results-status");
  const submittedEvent = { preventDefault() {} };

  registration.value = "001";
  form.listeners.submit(submittedEvent);
  assert.equal(panel.hidden, false);
  assert.equal(elements.get("#result-name").textContent, "Godspower Esther Gift");
  assert.equal(elements.get("#result-registration").textContent, "25/SS/EC/001");

  const resultRows = elements.get("#results-table").children;
  assert.equal(resultRows.length, 6);
  assert.deepEqual(
    resultRows.map((row) => row.children.map((cell, index) => index === 0
      ? cell.children.map((part) => part.textContent).join("")
      : cell.textContent)),
    [
      ["ECO 121Principles of Economics II", "11", "25", "36", "F", "FAIL"],
      ["ECO 122Introductory Statistics II", "16", "38", "54", "C", "PASS"],
      ["ECO 123Introductory Mathematics II", "8", "18", "26", "F", "FAIL"],
      ["ECO 127ECO 127", "18", "42", "60", "B", "PASS"],
      ["ECO 128Intro to Transportation Economics", "15", "35", "50", "C", "PASS"],
      ["GST 121Nigerian People and Culture", "18", "42", "60", "B", "PASS"],
    ],
  );

  registration.value = "19/SS/EC/1592";
  form.listeners.submit(submittedEvent);
  assert.equal(elements.get("#result-name").textContent, "Okwubunka Godwin");
  assert.equal(elements.get("#results-table").children.length, 1);

  registration.value = "not-a-registration";
  form.listeners.submit(submittedEvent);
  assert.equal(panel.hidden, true);
  assert.match(status.textContent, /Enter a valid registration number/);

  registration.value = "25/SS/EC/999";
  form.listeners.submit(submittedEvent);
  assert.equal(panel.hidden, true);
  assert.match(status.textContent, /No student or results found/);
});

test("production preview serves public pages but keeps raw CSV and source files out of the site", async () => {
  for (const relativePath of publicFiles) {
    const response = await fetch(`${origin}/${relativePath}`);
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
