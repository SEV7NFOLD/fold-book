/* FoldBook live quizzes.
 * Students: join from the 🎮 button in the top bar, play live contests and open quizzes.
 * Admins: preview before creating or starting, host the lobby, pace questions, reveal answers
 * and show the leaderboard after each one, ending on a winner's podium.
 * Relies on app.js globals: playCustomSfx, tone, soundOn, currentStudent, isMasterAdmin,
 * currentStudentLevel, retrieveCourseMaterialContext, parseGeminiJson.
 */
(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const SHAPES = ["▲", "◆", "●", "■", "★", "⬟"];
  const REG = /^(?:[0-9]{12}[A-Z]{2}|[0-9]{2}\/SS\/EC\/[0-9]{1,4})$/;
  const COURSE = /^[A-Z]{2,5}\s?\d{3,4}$/i;

  function h(tag, props, ...children) {
    const element = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") element.className = value;
        else if (key === "text") element.textContent = value;
        else if (key === "style") element.style.cssText = value;
        else if (key.startsWith("on") && typeof value === "function") element.addEventListener(key.slice(2), value);
        else if (value === true) element.setAttribute(key, "");
        else element.setAttribute(key, String(value));
      }
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      element.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return element;
  }
  const points = (value) => Number(value || 0).toLocaleString("en-NG");
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const ordinal = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

  // ---------- Sound ----------
  function sound(key) { try { playCustomSfx(key); } catch { /* sound is optional */ } }
  function tick(urgent) { try { tone(urgent ? 1180 : 880, 0, 0.07, "square", 0.035); } catch { /* optional */ } }

  // ---------- Server clock (timers stay in sync across phones) ----------
  let clockOffset = 0;
  const now = () => Date.now() + clockOffset;
  function syncClock(serverNow, sentAt) {
    if (!Number.isFinite(serverNow)) return;
    const rtt = Date.now() - sentAt;
    if (rtt > 4000) return;
    clockOffset = serverNow + rtt / 2 - Date.now();
  }

  async function post(url, body) {
    const sentAt = Date.now();
    const response = await fetch(url, {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || "The quiz service is unavailable."), { status: response.status });
    syncClock(Number(data.serverNow), sentAt);
    return data;
  }
  const studentApi = (action, data = {}) => post("/api/student/learning-profile", { action, ...data });
  const adminApi = (action, data = {}) => post("/api/admin?route=quizzes", { action, ...data });

  // ---------- Overlays ----------
  function showOverlay(overlay) {
    overlay.hidden = false;
    if (overlay.id === "quizHostOverlay") syncHostSoundButton();
    document.body.classList.add("lq-open");
    window.setTimeout(() => (overlay.querySelector("input, .lq-primary, button") || overlay).focus?.(), 30);
  }
  function hideOverlay(overlay) {
    overlay.hidden = true;
    if ($("#quizPlayOverlay")?.hidden !== false && $("#quizHostOverlay")?.hidden !== false) document.body.classList.remove("lq-open");
  }

  // ---------- Shared building blocks ----------
  function timerEl() {
    const number = h("span", { class: "lq-timer-num mono" });
    const fill = h("i");
    const element = h("div", { class: "lq-timer", role: "timer", "aria-label": "Time left" }, number, h("span", { class: "lq-timer-bar", "aria-hidden": "true" }, fill));
    element.update = (remainingMs, totalMs) => {
      number.textContent = String(Math.max(0, Math.ceil(remainingMs / 1000)));
      fill.style.transform = `scaleX(${clamp(remainingMs / totalMs, 0, 1)})`;
      element.classList.toggle("is-urgent", remainingMs > 0 && remainingMs <= 5000);
    };
    return element;
  }

  function tilesEl(options, { onPick = null, correctIndex = null, picked = null } = {}) {
    const grid = h("div", { class: "lq-tiles" + (options.length > 4 ? " lq-tiles-many" : "") });
    options.forEach((text, index) => {
      const revealed = Number.isInteger(correctIndex);
      const classes = ["lq-tile", `lq-t${index % 6}`];
      if (revealed) classes.push(index === correctIndex ? "is-correct" : "is-dim");
      if (picked === index) classes.push("is-picked");
      const tile = h(onPick ? "button" : "div", {
        class: classes.join(" "),
        type: onPick ? "button" : null,
        "aria-label": `Answer ${index + 1}: ${text}${revealed && index === correctIndex ? " (correct)" : ""}${picked === index ? " (your answer)" : ""}`,
      },
      h("span", { class: "lq-tile-shape", "aria-hidden": "true", text: SHAPES[index % 6] }),
      h("span", { class: "lq-tile-text", text }),
      revealed && index === correctIndex ? h("span", { class: "lq-tile-mark", "aria-hidden": "true", text: "✓" }) : null,
      picked === index && !revealed ? h("span", { class: "lq-tile-mark", "aria-hidden": "true", text: "•" }) : null);
      if (onPick) tile.addEventListener("click", () => onPick(index, tile, grid));
      grid.append(tile);
    });
    return grid;
  }

  function distributionEl(options, counts, correctIndex) {
    const max = Math.max(1, ...counts);
    return h("div", { class: "lq-dist", role: "img", "aria-label": options.map((option, i) => `${option}: ${counts[i] || 0}`).join(", ") },
      options.map((option, index) => h("div", { class: `lq-dist-col lq-t${index % 6}${index === correctIndex ? " is-correct" : " is-dim"}` },
        h("span", { class: "lq-dist-count mono", text: String(counts[index] || 0) }),
        h("span", { class: "lq-dist-bar", style: `--h:${Math.max(4, Math.round(((counts[index] || 0) / max) * 100))}%` }),
        h("span", { class: "lq-dist-label" }, h("b", { "aria-hidden": "true", text: SHAPES[index % 6] }), index === correctIndex ? " ✓" : ""))));
  }

  function boardEl(rows, { showChange = false } = {}) {
    return h("ol", { class: "lq-board" }, rows.map((row) => {
      const delta = showChange ? (row.previousRank || row.rank) - row.rank : 0;
      return h("li", { class: "lq-board-row" + (row.me ? " is-me" : "") + (row.rank === 1 ? " is-first" : "") },
        h("span", { class: "lq-board-rank mono", text: String(row.rank) }),
        h("span", { class: "lq-board-name", text: row.name }),
        delta ? h("span", { class: "lq-board-change " + (delta > 0 ? "is-up" : "is-down"), "aria-label": delta > 0 ? `up ${delta}` : `down ${-delta}`, text: (delta > 0 ? "▲" : "▼") + Math.abs(delta) }) : null,
        row.round ? h("span", { class: "lq-board-round mono", text: "+" + points(row.round) }) : null,
        h("span", { class: "lq-board-score mono", text: points(row.score) }));
    }));
  }

  function podiumEl(top) {
    return h("div", { class: "lq-podium" }, [1, 0, 2].map((position) => {
      const player = top[position];
      if (!player) return h("div", { class: "lq-podium-slot is-empty", "aria-hidden": "true" });
      return h("div", { class: `lq-podium-slot lq-place-${position + 1}` + (player.me ? " is-me" : "") },
        position === 0 ? h("span", { class: "lq-podium-crown", "aria-hidden": "true", text: "🏆" }) : null,
        h("span", { class: "lq-podium-name", text: player.name }),
        h("span", { class: "lq-podium-score mono", text: points(player.score) + " pts" }),
        h("span", { class: "lq-podium-block" }, h("b", { text: String(position + 1) })));
    }));
  }

  function centerCard(...children) { return h("div", { class: "lq-center" }, ...children); }

  // =====================================================================
  //  STUDENT
  // =====================================================================
  const player = { code: "", key: "", data: null, poll: 0, ticker: 0, lastTick: 0, locked: false, available: [], availablePoll: 0, active: false };

  function stopPlayerTimers() {
    window.clearTimeout(player.poll); player.poll = 0;
    window.clearInterval(player.ticker); player.ticker = 0;
  }

  function studentReady() {
    return Boolean(typeof currentStudent !== "undefined" && currentStudent && !isMasterAdmin && $("#studentApp") && !$("#studentApp").hidden);
  }

  function playStage() { return $("#quizPlayStage"); }
  function setPlayHeader(title, meta = "", score = null) {
    $("#quizPlayTitle").textContent = title;
    $("#quizPlayMeta").textContent = meta;
    const scoreEl = $("#quizPlayScore");
    scoreEl.hidden = score === null;
    if (score !== null) scoreEl.textContent = points(score) + " pts";
  }

  async function refreshAvailable() {
    if (!studentReady()) return;
    try {
      const data = await studentApi("list", { level: typeof currentStudentLevel === "string" ? currentStudentLevel : "" });
      player.available = Array.isArray(data.quizzes) ? data.quizzes : [];
    } catch { player.available = []; }
    const live = player.available;
    const dot = $("#quizJoinDot");
    if (dot) dot.hidden = !live.length;
    const banner = $("#quizLiveBanner");
    if (banner) {
      banner.hidden = !live.length || player.active;
      if (live.length) {
        const first = live[0];
        $("#quizLiveBannerTitle").textContent = live.length > 1 ? `${live.length} quizzes are open for you` : first.title;
        $("#quizLiveBannerMeta").textContent = live.length > 1 ? "Tap to choose one" : `${first.course_code} · ${describeAvailability(first)}`;
      }
    }
    if (!$("#quizPlayOverlay").hidden && !player.code) renderAvailableList();
  }

  function describeAvailability(quiz) {
    if (quiz.quiz_type === "open") return "Open quiz · go at your own pace";
    return quiz.status === "lobby" ? "Live contest · lobby open" : "Live contest · in progress";
  }

  function startAvailabilityPolling() {
    window.clearInterval(player.availablePoll);
    void refreshAvailable();
    player.availablePoll = window.setInterval(() => { if (document.visibilityState === "visible") void refreshAvailable(); }, 30000);
  }
  function stopAvailabilityPolling() { window.clearInterval(player.availablePoll); player.availablePoll = 0; }

  function openJoin(prefill = "", autoJoin = false) {
    if (!studentReady()) return;
    stopPlayerTimers();
    player.code = ""; player.key = ""; player.data = null; player.active = false;
    setPlayHeader("Join a quiz", "Enter the code on your host’s screen");
    const input = h("input", { class: "lq-code-input mono", id: "quizCodeInput", maxlength: "6", autocomplete: "off", autocapitalize: "characters", spellcheck: "false", inputmode: "text", placeholder: "ABC123", "aria-label": "Quiz code", value: prefill });
    const error = h("p", { class: "lq-error", role: "alert" });
    const button = h("button", { class: "lq-primary", type: "submit", text: "Join" });
    input.addEventListener("input", () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); error.textContent = ""; });
    const form = h("form", { class: "lq-join-form", novalidate: true },
      h("label", { for: "quizCodeInput", class: "lq-label", text: "Quiz code" }), input, button, error);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const code = input.value.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) { error.textContent = "Quiz codes have six letters and numbers."; input.focus(); return; }
      button.disabled = true; button.textContent = "Joining…";
      joinQuiz(code).catch((e) => { error.textContent = e.message; button.disabled = false; button.textContent = "Join"; });
    });
    playStage().replaceChildren(h("div", { class: "lq-join" },
      h("div", { class: "lq-join-hero" }, h("span", { class: "lq-join-icon", "aria-hidden": "true", text: "🎮" }), h("h2", { text: "Ready to play?" }), h("p", { text: "Type the six-character code your host shared, or pick a quiz that’s open for you." })),
      form,
      h("section", { class: "lq-available", "aria-label": "Quizzes open for you" }, h("h3", { text: "Open for you" }), h("div", { id: "quizAvailableList", class: "lq-available-list" }, h("p", { class: "lq-muted", text: "Checking for open quizzes…" })))));
    showOverlay($("#quizPlayOverlay"));
    void refreshAvailable();
    if (autoJoin && /^[A-Z0-9]{6}$/.test(prefill)) form.requestSubmit();
  }

  function renderAvailableList() {
    const list = $("#quizAvailableList");
    if (!list) return;
    if (!player.available.length) { list.replaceChildren(h("p", { class: "lq-muted", text: "Nothing open right now. When your host opens a lobby it shows up here." })); return; }
    list.replaceChildren(...player.available.map((quiz) => h("button", {
      type: "button", class: "lq-available-item",
      onclick: (event) => { event.currentTarget.disabled = true; joinQuiz(quiz.join_code).catch((e) => { event.currentTarget.disabled = false; const err = $(".lq-error", playStage()); if (err) err.textContent = e.message; }); },
    }, h("span", { class: "lq-available-title", text: quiz.title }), h("span", { class: "lq-available-meta", text: `${quiz.course_code} · ${describeAvailability(quiz)}` }), h("span", { class: "lq-available-go", "aria-hidden": "true", text: "Join" }))));
  }

  async function joinQuiz(code) {
    const data = await studentApi("join", { joinCode: code });
    player.code = code; player.key = ""; player.active = true;
    const banner = $("#quizLiveBanner"); if (banner) banner.hidden = true;
    setPlayHeader(data.quiz.title, `${data.quiz.course_code} · Code ${code}`);
    playStage().replaceChildren(centerCard(h("p", { class: "lq-muted", text: "Joining…" })));
    await pollPlayer();
  }

  async function pollPlayer() {
    window.clearTimeout(player.poll);
    if (!player.code || $("#quizPlayOverlay").hidden) return;
    let delay = 1500;
    try {
      const data = await studentApi("state", { joinCode: player.code });
      renderPlayer(data);
      const quiz = data.quiz;
      if (quiz.status === "finished" || (quiz.quiz_type === "open" && data.studentFinished)) return;
      delay = quiz.quiz_type === "open" ? 5000 : (quiz.status === "live" && quiz.phase === "question" ? 1000 : 1500);
      $(".lq-offline", playStage())?.remove();
    } catch (error) {
      if (error.status === 403 || error.status === 404) { openJoin(); const err = $(".lq-error", playStage()); if (err) err.textContent = error.message; return; }
      if (!$(".lq-offline", playStage())) playStage().prepend(h("p", { class: "lq-offline", role: "status", text: "Reconnecting…" }));
      delay = 2500;
    }
    player.poll = window.setTimeout(() => { void pollPlayer(); }, delay);
  }

  function playerKey(data) {
    const quiz = data.quiz;
    if (quiz.status === "lobby") return "lobby";
    if (quiz.status === "finished") return "finished";
    if (quiz.quiz_type === "open") return data.studentFinished ? "open:done" : `open:${data.questionIndex}`;
    return `c:${data.questionIndex}:${quiz.phase}`;
  }

  function renderPlayer(data) {
    const key = playerKey(data);
    const previous = player.key;
    player.data = data;
    const quiz = data.quiz;
    setPlayHeader(quiz.title, `${quiz.course_code} · Code ${quiz.join_code}`, quiz.status === "lobby" ? null : data.me.score);
    if (key === previous) { updatePlayer(data); return; }
    player.key = key;
    window.clearInterval(player.ticker); player.ticker = 0;

    // Transition sounds
    if (previous === "lobby" && key.startsWith("c:")) sound("momentsLater");
    if (previous && /^c:\d+:question$/.test(previous) && key.endsWith(":reveal")) {
      if (!data.myAnswer) sound("fah");
      else sound(data.myAnswer.correct ? "correct" : "wrong");
    }
    if (previous && previous !== "finished" && key === "finished") sound(quiz.quiz_type === "contest" && data.me.correct === 0 ? "failTest" : "complete");

    if (key === "lobby") return playerLobby(data);
    if (key === "finished") return playerFinished(data);
    if (key === "open:done") return playerOpenDone(data);
    if (key.startsWith("open:")) return playerOpenQuestion(data);
    if (quiz.phase === "question") return playerContestQuestion(data);
    if (quiz.phase === "reveal") return playerReveal(data);
    return playerLeaderboard(data);
  }

  function updatePlayer(data) {
    const count = $("#quizLobbyCount", playStage());
    if (count && Number.isFinite(data.playerCount)) count.textContent = data.playerCount === 1 ? "1 player is in" : `${data.playerCount} players are in`;
  }

  function playerLobby(data) {
    const name = (typeof currentStudent !== "undefined" && currentStudent?.name) || "You";
    playStage().replaceChildren(centerCard(
      h("span", { class: "lq-badge-ok", "aria-hidden": "true", text: "✓" }),
      h("h2", { class: "lq-big", text: "You’re in!" }),
      h("p", { class: "lq-name-tag", text: name }),
      h("p", { text: "Watch the host’s screen. The first question appears here when they press Start." }),
      h("p", { class: "lq-pill-stat", id: "quizLobbyCount", text: "" }),
      h("span", { class: "lq-waiting-dots", "aria-hidden": "true" }, h("i"), h("i"), h("i"))));
    updatePlayer(data);
  }

  function playerContestQuestion(data) {
    const quiz = data.quiz, question = data.question;
    if (!question) return;
    const opensAt = Date.parse(quiz.question_started_at || "") || now();
    const totalMs = (quiz.question_seconds || 20) * 1000;
    const timer = timerEl();
    const readyNum = h("b", { class: "lq-ready-num mono" });
    const ready = h("div", { class: "lq-ready", "aria-live": "assertive" }, h("span", { text: `Question ${data.questionIndex + 1}` }), readyNum);
    const note = h("p", { class: "lq-note", role: "status" });
    player.locked = Boolean(data.myAnswer);
    const tiles = tilesEl(question.options, {
      picked: data.myAnswer ? data.myAnswer.answerIndex : null,
      onPick: (index, tile, grid) => {
        if (player.locked) return;
        player.locked = true;
        grid.querySelectorAll(".lq-tile").forEach((item) => { item.disabled = true; if (item !== tile) item.classList.add("is-dim"); });
        tile.classList.add("is-picked");
        note.textContent = "Locked in. Waiting for everyone else…";
        studentApi("answer", { joinCode: player.code, questionIndex: data.questionIndex, answerIndex: index }).catch((error) => {
          if (error.status === 409) { note.textContent = error.message; return; }
          player.locked = false;
          grid.querySelectorAll(".lq-tile").forEach((item) => { item.disabled = false; item.classList.remove("is-dim", "is-picked"); });
          note.textContent = error.message + " Tap again.";
        });
      },
    });
    if (player.locked) {
      tiles.querySelectorAll(".lq-tile").forEach((item) => { item.disabled = true; if (!item.classList.contains("is-picked")) item.classList.add("is-dim"); });
      note.textContent = "Locked in. Waiting for everyone else…";
    }
    const body = h("div", { class: "lq-question" },
      h("div", { class: "lq-question-top" }, h("span", { class: "lq-step mono", text: `${data.questionIndex + 1} / ${quiz.total_questions}` }), timer),
      h("h2", { class: "lq-prompt", text: question.prompt }), tiles, note);
    playStage().replaceChildren(ready, body);
    player.lastTick = 0;
    const update = () => {
      const t = now();
      if (t < opensAt) {
        ready.hidden = false; body.classList.add("is-waiting");
        readyNum.textContent = String(Math.ceil((opensAt - t) / 1000));
        return;
      }
      ready.hidden = true; body.classList.remove("is-waiting");
      const remaining = opensAt + totalMs - t;
      timer.update(remaining, totalMs);
      const second = Math.ceil(remaining / 1000);
      if (second <= 5 && second > 0 && second !== player.lastTick && !player.locked) { player.lastTick = second; tick(second <= 3); }
      if (remaining <= 0 && !player.locked) {
        player.locked = true;
        tiles.querySelectorAll(".lq-tile").forEach((item) => { item.disabled = true; item.classList.add("is-dim"); });
        note.textContent = "Time’s up! Waiting for the answer…";
      }
    };
    update();
    player.ticker = window.setInterval(update, 200);
  }

  function playerReveal(data) {
    const quiz = data.quiz, question = data.question, mine = data.myAnswer;
    const verdict = !mine ? { cls: "is-timeout", title: "Time’s up", line: "No answer this round." }
      : mine.correct ? { cls: "is-right", title: "Correct!", line: `+${points(mine.points)} points` }
        : { cls: "is-wrong", title: "Not quite", line: "Keep going — next one’s yours." };
    playStage().replaceChildren(h("div", { class: "lq-question" },
      h("div", { class: `lq-verdict ${verdict.cls}` }, h("strong", { text: verdict.title }), h("span", { text: verdict.line })),
      h("h2", { class: "lq-prompt lq-prompt-small", text: question.prompt }),
      tilesEl(question.options, { correctIndex: question.answerIndex, picked: mine ? mine.answerIndex : null }),
      question.explanation ? h("p", { class: "lq-explain", text: question.explanation }) : null,
      h("p", { class: "lq-muted lq-center-text", text: `Total ${points(data.me.score)} pts · the leaderboard is next` })));
  }

  function playerLeaderboard(data) {
    const rank = data.myRank;
    playStage().replaceChildren(centerCard(
      h("p", { class: "lq-muted", text: data.isLastQuestion ? "Final results are next" : "Next question coming up" }),
      h("h2", { class: "lq-big mono", text: rank ? ordinal(rank) : "—" }),
      h("p", { text: rank ? `of ${data.playerCount} · ${points(data.me.score)} pts` : `${points(data.me.score)} pts` }),
      boardEl(data.top || [])));
  }

  function playerFinished(data) {
    const rank = data.myRank;
    const won = rank === 1;
    playStage().replaceChildren(centerCard(
      h("h2", { class: "lq-big", text: won ? "You won!" : "That’s a wrap" }),
      podiumEl(data.top || []),
      h("p", { class: "lq-result-line", text: rank ? `You finished ${ordinal(rank)} of ${data.playerCount} with ${points(data.me.score)} pts` : `${points(data.me.score)} pts` }),
      h("p", { class: "lq-muted", text: `${data.me.correct} of ${data.quiz.total_questions} answered correctly` }),
      (data.top || []).length > 3 ? boardEl(data.top.slice(3)) : null,
      h("button", { class: "lq-primary", type: "button", text: "Done", onclick: closePlayer })));
  }

  function playerOpenQuestion(data) {
    const quiz = data.quiz, question = data.question, index = data.questionIndex;
    if (!question) return;
    const note = h("p", { class: "lq-note", role: "status" });
    const next = h("button", { class: "lq-primary", type: "button", hidden: true, text: index + 1 >= quiz.total_questions ? "See my result" : "Next question" });
    next.addEventListener("click", () => { next.disabled = true; player.key = ""; void pollPlayer(); });
    const explain = h("p", { class: "lq-explain", hidden: true });
    let busy = false;
    const tiles = tilesEl(question.options, {
      onPick: async (picked, tile, grid) => {
        if (busy) return;
        busy = true;
        grid.querySelectorAll(".lq-tile").forEach((item) => { item.disabled = true; });
        tile.classList.add("is-picked");
        try {
          const result = await studentApi("answer", { joinCode: player.code, questionIndex: index, answerIndex: picked });
          grid.querySelectorAll(".lq-tile").forEach((item, i) => item.classList.add(i === result.answerIndex ? "is-correct" : "is-dim"));
          note.textContent = result.correct ? `Correct! +${result.points}` : "Not quite.";
          note.className = "lq-note " + (result.correct ? "is-right" : "is-wrong");
          sound(result.correct ? "correct" : "wrong");
          if (result.explanation) { explain.textContent = result.explanation; explain.hidden = false; }
          setPlayHeader(quiz.title, `${quiz.course_code} · Code ${quiz.join_code}`, result.score);
          next.hidden = false; next.focus();
        } catch (error) {
          if (error.status === 409) { next.hidden = false; note.textContent = error.message; return; }
          busy = false;
          grid.querySelectorAll(".lq-tile").forEach((item) => { item.disabled = false; item.classList.remove("is-picked"); });
          note.textContent = error.message;
        }
      },
    });
    playStage().replaceChildren(h("div", { class: "lq-question" },
      h("div", { class: "lq-question-top" },
        h("span", { class: "lq-step mono", text: `${index + 1} / ${quiz.total_questions}` }),
        h("span", { class: "lq-progress", "aria-hidden": "true" }, h("i", { style: `transform:scaleX(${index / Math.max(1, quiz.total_questions)})` }))),
      h("h2", { class: "lq-prompt", text: question.prompt }), tiles, note, explain, next));
  }

  function playerOpenDone(data) {
    if (player.key === "open:done" && !$(".lq-done", playStage())) sound("complete");
    playStage().replaceChildren(centerCard(
      h("div", { class: "lq-done" }),
      h("h2", { class: "lq-big", text: "All done!" }),
      h("p", { class: "lq-result-line", text: `${data.me.correct} of ${data.quiz.total_questions} correct · ${points(data.me.score)} pts` }),
      data.myRank ? h("p", { class: "lq-muted", text: `You’re ${ordinal(data.myRank)} of ${data.playerCount} so far` }) : null,
      boardEl(data.top || []),
      h("button", { class: "lq-primary", type: "button", text: "Done", onclick: closePlayer })));
  }

  function closePlayer() {
    stopPlayerTimers();
    player.code = ""; player.key = ""; player.active = false;
    hideOverlay($("#quizPlayOverlay"));
    void refreshAvailable();
  }

  // =====================================================================
  //  ADMIN: Quiz Studio, preview, host screen
  // =====================================================================
  const host = { id: "", data: null, key: "", poll: 0, ticker: 0, busy: false, seen: new Set(), autoReveal: -1, lastTick: 0, previewIndex: 0 };
  const hostStage = () => $("#quizHostStage");
  const studioStatus = (text) => { const el = $("#quizAdminStatus"); if (el) el.textContent = text; };

  function stopHostTimers() {
    window.clearTimeout(host.poll); host.poll = 0;
    window.clearInterval(host.ticker); host.ticker = 0;
  }

  function setHostHeader(title, meta) {
    $("#quizHostTitle").textContent = title;
    $("#quizHostMeta").textContent = meta || "";
  }

  function audienceLabel(quiz) {
    if (quiz.target_type === "level") return `${quiz.target_level} only`;
    if (quiz.target_type === "students") return `${(quiz.target_registrations || []).length} invited students`;
    return "All students";
  }

  // ----- Preview (before creating, and before starting a draft) -----
  function openPreview(quiz, actions) {
    stopHostTimers();
    host.id = ""; host.key = "preview"; host.previewIndex = 0;
    setHostHeader(`Preview · ${quiz.title || "Untitled quiz"}`, "This is exactly what students will see");
    renderPreview(quiz, actions);
    showOverlay($("#quizHostOverlay"));
  }

  function renderPreview(quiz, actions) {
    const questions = quiz.questions || [];
    const index = clamp(host.previewIndex, 0, Math.max(0, questions.length - 1));
    const question = questions[index];
    const chips = h("div", { class: "lq-chips" },
      h("span", { class: "lq-chip", text: quiz.course_code }),
      h("span", { class: "lq-chip", text: quiz.quiz_type === "contest" ? "Live contest · host-paced" : "Open quiz · self-paced" }),
      h("span", { class: "lq-chip", text: audienceLabel(quiz) }),
      quiz.quiz_type === "contest" ? h("span", { class: "lq-chip", text: `${quiz.question_seconds || 20} s per question` }) : null,
      h("span", { class: "lq-chip", text: `${questions.length} questions` }),
      quiz.join_code ? h("span", { class: "lq-chip lq-chip-code mono", text: `Code ${quiz.join_code}` }) : null);
    const strip = h("div", { class: "lq-strip", role: "tablist", "aria-label": "Questions" }, questions.map((_, i) => h("button", {
      type: "button", role: "tab", class: "lq-strip-item mono" + (i === index ? " is-active" : ""), "aria-selected": String(i === index), text: String(i + 1),
      onclick: () => { host.previewIndex = i; renderPreview(quiz, actions); },
    })));
    const card = question ? h("div", { class: "lq-question lq-preview-card" },
      h("div", { class: "lq-question-top" }, h("span", { class: "lq-step mono", text: `Question ${index + 1} of ${questions.length}` }),
        quiz.quiz_type === "contest" ? h("span", { class: "lq-chip mono", text: `${quiz.question_seconds || 20} s` }) : null),
      h("h2", { class: "lq-prompt", text: question.prompt }),
      (() => { const tiles = tilesEl(question.options, { correctIndex: question.answerIndex }); tiles.classList.add("lq-tiles-preview"); return tiles; })(),
      question.explanation ? h("p", { class: "lq-explain", text: question.explanation }) : h("p", { class: "lq-muted", text: "No explanation for this question." }))
      : h("p", { class: "lq-muted", text: "This quiz has no questions yet." });
    const nav = h("div", { class: "lq-preview-nav" },
      h("button", { type: "button", class: "lq-secondary", disabled: index === 0, text: "Previous", onclick: () => { host.previewIndex = index - 1; renderPreview(quiz, actions); } }),
      h("button", { type: "button", class: "lq-secondary", disabled: index >= questions.length - 1, text: "Next", onclick: () => { host.previewIndex = index + 1; renderPreview(quiz, actions); } }));
    const error = h("p", { class: "lq-error", role: "alert" });
    const footer = h("div", { class: "lq-actions" }, actions.map((action) => h("button", {
      type: "button", class: action.primary ? "lq-primary" : "lq-secondary", text: action.label,
      onclick: async (event) => {
        const button = event.currentTarget;
        footer.querySelectorAll("button").forEach((item) => { item.disabled = true; });
        error.textContent = "";
        try { await action.run(); }
        catch (e) { error.textContent = e.message; footer.querySelectorAll("button").forEach((item) => { item.disabled = false; }); button.focus(); }
      },
    })), error);
    hostStage().replaceChildren(h("div", { class: "lq-preview" }, chips, strip, card, nav, footer));
  }

  function draftActions(quiz) {
    const startLabel = quiz.quiz_type === "contest" ? "Open lobby" : "Publish to students";
    return [
      { label: "Close", run: async () => { closeHost(); } },
      { label: startLabel, primary: true, run: async () => {
        const data = await adminApi("control", { id: quiz.id, step: quiz.quiz_type === "contest" ? "open_lobby" : "publish" });
        studioStatus(quiz.quiz_type === "contest" ? `Lobby open for “${quiz.title}”. Code ${quiz.join_code}.` : `“${quiz.title}” is live for students.`);
        startHosting(data);
        void renderAdminList();
      } },
    ];
  }

  // ----- Host screen -----
  async function openHost(id) {
    stopHostTimers();
    host.id = id; host.key = ""; host.seen = new Set(); host.autoReveal = -1;
    setHostHeader("Loading…", "");
    hostStage().replaceChildren(centerCard(h("p", { class: "lq-muted", text: "Loading the quiz…" })));
    showOverlay($("#quizHostOverlay"));
    try { startHosting(await adminApi("host_state", { id })); }
    catch (error) { hostStage().replaceChildren(centerCard(h("p", { class: "lq-error", text: error.message }))); }
  }

  function startHosting(data) {
    stopHostTimers();
    host.id = data.quiz.id; host.key = ""; host.seen = new Set(data.players.map((p) => p.reg_number));
    showOverlay($("#quizHostOverlay"));
    renderHost(data, { initial: true });
    scheduleHostPoll();
  }

  function scheduleHostPoll() {
    window.clearTimeout(host.poll);
    const quiz = host.data?.quiz;
    if (!quiz || quiz.status === "finished" || $("#quizHostOverlay").hidden) return;
    const delay = quiz.status === "live" && quiz.quiz_type === "contest" && quiz.phase === "question" ? 1000 : quiz.status === "lobby" ? 1500 : 2500;
    host.poll = window.setTimeout(async () => {
      try { renderHost(await adminApi("host_state", { id: host.id })); $(".lq-offline", hostStage())?.remove(); }
      catch { if (!$(".lq-offline", hostStage())) hostStage().prepend(h("p", { class: "lq-offline", role: "status", text: "Reconnecting…" })); }
      scheduleHostPoll();
    }, delay);
  }

  async function hostControl(step) {
    if (host.busy || !host.data) return;
    host.busy = true;
    hostStage().querySelectorAll(".lq-actions button").forEach((button) => { button.disabled = true; });
    try {
      const data = await adminApi("control", { id: host.id, step, expected_question: host.data.quiz.current_question });
      renderHost(data);
      void renderAdminList();
    } catch (error) {
      const err = $(".lq-actions .lq-error", hostStage());
      if (err) err.textContent = error.message;
    } finally {
      host.busy = false;
      hostStage().querySelectorAll(".lq-actions button").forEach((button) => { button.disabled = Boolean(button.dataset.locked); });
      scheduleHostPoll();
    }
  }

  function hostKey(data) {
    const quiz = data.quiz;
    if (quiz.status === "lobby") return "lobby";
    if (quiz.status === "finished") return "finished";
    if (quiz.status === "draft") return "draft";
    if (quiz.quiz_type === "open") return "open";
    return `c:${quiz.current_question}:${quiz.phase}`;
  }

  function actionsEl(buttons) {
    return h("div", { class: "lq-actions" }, buttons.filter(Boolean).map((button) => {
      const element = h("button", { type: "button", class: button.primary ? "lq-primary" : (button.danger ? "lq-ghost-danger" : "lq-secondary"), text: button.label, disabled: Boolean(button.disabled) });
      if (button.disabled) element.dataset.locked = "1";
      element.addEventListener("click", button.run);
      return element;
    }), h("p", { class: "lq-error", role: "alert" }));
  }

  function confirmEnd() {
    if (window.confirm("End this quiz now? Students will see the final results.")) void hostControl("finish");
  }

  function renderHost(data, { initial = false } = {}) {
    const key = hostKey(data);
    const previous = host.key;
    host.data = data;
    const quiz = data.quiz;
    setHostHeader(quiz.title, `${quiz.course_code} · Code ${quiz.join_code} · ${quiz.quiz_type === "contest" ? "Live contest" : "Open quiz"}`);

    if (key === "draft") { openPreview(quiz, draftActions(quiz)); return; }
    if (key === previous) { updateHost(data); return; }
    host.key = key;
    window.clearInterval(host.ticker); host.ticker = 0;

    if (!initial) {
      if (previous === "lobby" && key.startsWith("c:")) sound("momentsLater");
      if (/^c:\d+:question$/.test(previous) && key.endsWith(":reveal")) sound("correct");
      if (previous && key === "finished") sound("complete");
    }

    if (key === "lobby") return hostLobby(data);
    if (key === "finished") return hostFinished(data);
    if (key === "open") return hostOpen(data);
    if (quiz.phase === "question") return hostQuestion(data);
    if (quiz.phase === "reveal") return hostReveal(data);
    return hostLeaderboard(data);
  }

  function updateHost(data) {
    const key = host.key;
    if (key === "lobby") updateLobby(data);
    else if (key === "open") hostOpen(data);
    else if (key.endsWith(":question")) {
      const answered = $("#quizHostAnswered", hostStage());
      if (answered) answered.textContent = `${data.answeredCount} / ${data.playerCount}`;
    }
  }

  function joinLink(quiz) { return `${window.location.origin}/?quiz=${quiz.join_code}`; }

  function hostLobby(data) {
    const quiz = data.quiz;
    const copy = h("button", { type: "button", class: "lq-secondary lq-copy", text: "Copy join link" });
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(joinLink(quiz)); copy.textContent = "Link copied"; }
      catch { window.prompt("Copy this join link", joinLink(quiz)); }
      window.setTimeout(() => { copy.textContent = "Copy join link"; }, 1800);
    });
    hostStage().replaceChildren(h("div", { class: "lq-lobby" },
      h("section", { class: "lq-lobby-join" },
        h("p", { class: "lq-lobby-how", text: "On FoldBook, tap 🎮 Join quiz and enter" }),
        h("p", { class: "lq-lobby-code mono", "aria-label": `Join code ${quiz.join_code.split("").join(" ")}`, text: quiz.join_code }),
        h("p", { class: "lq-muted", text: `${quiz.questions.length} questions · ${quiz.question_seconds || 20} s each · ${audienceLabel(quiz)}` }),
        copy),
      h("section", { class: "lq-lobby-players", "aria-label": "Players in the lobby" },
        h("div", { class: "lq-lobby-count" }, h("b", { class: "mono", id: "quizHostPlayerCount", text: "0" }), h("span", { id: "quizHostPlayerLabel", text: "players" })),
        h("div", { class: "lq-player-chips", id: "quizHostChips" })),
      h("div", { id: "quizHostLobbyActions" })));
    updateLobby(data, true);
  }

  function updateLobby(data, first = false) {
    const chips = $("#quizHostChips", hostStage());
    if (!chips) return;
    let joinedNow = 0;
    const known = new Set([...chips.children].map((chip) => chip.dataset.reg));
    data.players.forEach((p) => {
      if (known.has(p.reg_number)) return;
      const isNew = !first && !host.seen.has(p.reg_number);
      const chip = h("span", { class: "lq-player-chip" + (isNew ? " is-new" : ""), "data-reg": p.reg_number },
        h("span", { class: "lq-player-name", text: p.display_name }),
        h("button", { type: "button", class: "lq-player-remove", "aria-label": `Remove ${p.display_name}`, title: "Remove from lobby", text: "×", onclick: async (event) => {
          if (!window.confirm(`Remove ${p.display_name} from the lobby?`)) return;
          event.currentTarget.disabled = true;
          try { await adminApi("remove_participant", { id: host.id, reg_number: p.reg_number }); chip.remove(); host.seen.delete(p.reg_number); }
          catch (error) { event.currentTarget.disabled = false; const err = $(".lq-actions .lq-error", hostStage()); if (err) err.textContent = error.message; }
        } }));
      chips.append(chip);
      if (isNew) joinedNow += 1;
      host.seen.add(p.reg_number);
    });
    const present = new Set(data.players.map((p) => p.reg_number));
    [...chips.querySelectorAll(".lq-player-chip")].forEach((chip) => { if (!present.has(chip.dataset.reg)) chip.remove(); });
    if (joinedNow) sound("deadClick");
    $("#quizHostPlayerCount", hostStage()).textContent = String(data.playerCount);
    $("#quizHostPlayerLabel", hostStage()).textContent = data.playerCount === 1 ? "player" : "players";
    if (!data.playerCount && !chips.querySelector(".lq-muted")) chips.append(h("p", { class: "lq-muted", text: "Waiting for players to join…" }));
    if (data.playerCount) chips.querySelector(".lq-muted")?.remove();
    const holder = $("#quizHostLobbyActions", hostStage());
    const wantDisabled = data.playerCount === 0;
    const current = holder.querySelector(".lq-primary");
    if (!current || Boolean(current.dataset.locked) !== wantDisabled) {
      holder.replaceChildren(actionsEl([
        { label: "End lobby", danger: true, run: confirmEnd },
        { label: wantDisabled ? "Waiting for players" : `Start with ${data.playerCount}`, primary: true, disabled: wantDisabled, run: () => hostControl("start") },
      ]));
    } else if (!wantDisabled) current.textContent = `Start with ${data.playerCount}`;
  }

  function hostQuestion(data) {
    const quiz = data.quiz, index = quiz.current_question, question = quiz.questions[index];
    const opensAt = Date.parse(quiz.question_started_at || "") || now();
    const totalMs = (quiz.question_seconds || 20) * 1000;
    const timer = timerEl();
    const readyNum = h("b", { class: "lq-ready-num mono" });
    const ready = h("div", { class: "lq-ready" }, h("span", { text: `Question ${index + 1} of ${quiz.questions.length}` }), h("p", { class: "lq-ready-prompt", text: question.prompt }), readyNum);
    const body = h("div", { class: "lq-question lq-host-question" },
      h("div", { class: "lq-question-top" },
        h("span", { class: "lq-step mono", text: `${index + 1} / ${quiz.questions.length}` }),
        timer,
        h("span", { class: "lq-answered" }, h("b", { class: "mono", id: "quizHostAnswered", text: `${data.answeredCount} / ${data.playerCount}` }), h("span", { text: "answered" }))),
      h("h2", { class: "lq-prompt", text: question.prompt }),
      tilesEl(question.options),
      actionsEl([{ label: "End quiz", danger: true, run: confirmEnd }, { label: "Reveal answer now", primary: true, run: () => hostControl("reveal") }]));
    hostStage().replaceChildren(ready, body);
    host.lastTick = 0;
    const update = () => {
      const t = now();
      if (t < opensAt) { ready.hidden = false; body.classList.add("is-waiting"); readyNum.textContent = String(Math.ceil((opensAt - t) / 1000)); return; }
      ready.hidden = true; body.classList.remove("is-waiting");
      const remaining = opensAt + totalMs - t;
      timer.update(remaining, totalMs);
      const second = Math.ceil(remaining / 1000);
      if (second <= 5 && second > 0 && second !== host.lastTick) { host.lastTick = second; tick(second <= 3); }
      const everyone = host.data.playerCount > 0 && host.data.answeredCount >= host.data.playerCount;
      // Auto-reveal once time runs out (plus a beat for late taps) or everyone has answered.
      if ((remaining <= -800 || everyone) && host.autoReveal !== index && !host.busy) {
        host.autoReveal = index;
        void hostControl("reveal");
      }
    };
    update();
    host.ticker = window.setInterval(update, 200);
  }

  function hostReveal(data) {
    const quiz = data.quiz, index = quiz.current_question, question = quiz.questions[index];
    const correct = data.distribution[question.answerIndex] || 0;
    const answered = data.distribution.reduce((sum, n) => sum + n, 0);
    hostStage().replaceChildren(h("div", { class: "lq-question lq-host-reveal" },
      h("div", { class: "lq-question-top" }, h("span", { class: "lq-step mono", text: `${index + 1} / ${quiz.questions.length}` }),
        h("span", { class: "lq-answered" }, h("b", { class: "mono", text: `${correct} / ${answered || 0}` }), h("span", { text: "got it right" }))),
      h("h2", { class: "lq-prompt lq-prompt-small", text: question.prompt }),
      distributionEl(question.options, data.distribution, question.answerIndex),
      tilesEl(question.options, { correctIndex: question.answerIndex }),
      question.explanation ? h("p", { class: "lq-explain", text: question.explanation }) : null,
      actionsEl([{ label: "End quiz", danger: true, run: confirmEnd }, { label: "Show leaderboard", primary: true, run: () => hostControl("leaderboard") }])));
  }

  function hostLeaderboard(data) {
    const quiz = data.quiz, index = quiz.current_question;
    const last = index >= quiz.questions.length - 1;
    const rows = data.players.slice(0, 5).map((p) => ({ rank: p.rank, previousRank: p.previous_rank, name: p.display_name, score: p.score, round: p.round_points }));
    hostStage().replaceChildren(h("div", { class: "lq-host-board" },
      h("h2", { class: "lq-big", text: "Leaderboard" }),
      h("p", { class: "lq-muted", text: `After question ${index + 1} of ${quiz.questions.length}` }),
      rows.length ? boardEl(rows, { showChange: index > 0 }) : h("p", { class: "lq-muted", text: "No one has scored yet." }),
      actionsEl([
        { label: "End quiz", danger: true, run: confirmEnd },
        last ? { label: "Show final results", primary: true, run: () => hostControl("finish") }
          : { label: `Next question (${index + 2} of ${quiz.questions.length})`, primary: true, run: () => hostControl("next") },
      ])));
  }

  function hostFinished(data) {
    const quiz = data.quiz;
    const top = data.players.slice(0, 3).map((p) => ({ name: p.display_name, score: p.score }));
    const winner = data.players[0];
    const total = quiz.questions.length;
    hostStage().replaceChildren(h("div", { class: "lq-host-final" },
      h("h2", { class: "lq-big", text: winner ? `${winner.display_name} wins!` : "Quiz ended" }),
      winner ? h("p", { class: "lq-muted", text: `${points(winner.score)} pts · ${winner.correct_count} of ${total} correct` }) : h("p", { class: "lq-muted", text: "Nobody joined this one." }),
      top.length ? podiumEl(top) : null,
      data.players.length ? h("div", { class: "lq-table-wrap" }, h("table", { class: "lq-table" },
        h("thead", null, h("tr", null, h("th", { scope: "col", text: "#" }), h("th", { scope: "col", text: "Student" }), h("th", { scope: "col", text: "Correct" }), h("th", { scope: "col", text: "Score" }))),
        h("tbody", null, data.players.map((p) => h("tr", null,
          h("td", { class: "mono", text: String(p.rank) }), h("td", { text: p.display_name }),
          h("td", { class: "mono", text: `${p.correct_count}/${total}` }), h("td", { class: "mono", text: points(p.score) }))))))
        : null,
      actionsEl([{ label: "Back to Quiz Studio", primary: true, run: closeHost }])));
  }

  function hostOpen(data) {
    const quiz = data.quiz, total = quiz.questions.length;
    const finished = data.players.filter((p) => p.finished).length;
    const average = data.players.length ? Math.round(data.players.reduce((sum, p) => sum + p.correct_count, 0) / data.players.length * 10) / 10 : 0;
    const list = data.players.length ? h("ol", { class: "lq-progress-list" }, data.players.map((p) => h("li", { class: "lq-progress-row" },
      h("span", { class: "lq-board-rank mono", text: String(p.rank) }),
      h("span", { class: "lq-board-name", text: p.display_name }),
      h("span", { class: "lq-progress", "aria-label": `${p.answered_count} of ${total} answered` }, h("i", { style: `transform:scaleX(${p.answered_count / Math.max(1, total)})` })),
      h("span", { class: "lq-progress-count mono", text: p.finished ? "Done" : `${p.answered_count}/${total}` }),
      h("span", { class: "lq-board-score mono", text: points(p.score) }))))
      : h("p", { class: "lq-muted", text: "No one has started yet. Share the code or link." });
    const existing = $("#quizHostOpen", hostStage());
    const stats = h("div", { class: "lq-stats" },
      h("div", null, h("b", { class: "mono", text: String(data.playerCount) }), h("span", { text: "started" })),
      h("div", null, h("b", { class: "mono", text: String(finished) }), h("span", { text: "finished" })),
      h("div", null, h("b", { class: "mono", text: `${average}/${total}` }), h("span", { text: "average correct" })));
    if (existing) { existing.querySelector(".lq-stats").replaceWith(stats); existing.querySelector(".lq-open-list").replaceChildren(list); return; }
    hostStage().replaceChildren(h("div", { class: "lq-host-open", id: "quizHostOpen" },
      h("div", { class: "lq-open-head" }, h("p", { class: "lq-lobby-code lq-lobby-code-small mono", text: quiz.join_code }), h("p", { class: "lq-muted", text: "Students join with this code and answer at their own pace. Close the quiz to crown the winner." })),
      stats,
      h("div", { class: "lq-open-list" }, list),
      actionsEl([{ label: "Close quiz and show winner", primary: true, run: () => { if (window.confirm("Close this quiz? Students can’t answer after it closes.")) void hostControl("finish"); } }])));
  }

  function closeHost() {
    stopHostTimers();
    host.id = ""; host.key = ""; host.data = null;
    hideOverlay($("#quizHostOverlay"));
    void renderAdminList();
  }

  // ----- Quiz Studio list -----
  const STATUS_LABEL = { draft: "Draft", lobby: "Lobby open", live: "Live", finished: "Finished" };

  async function renderAdminList() {
    const box = $("#quizAdminList");
    if (!box || $("#adminDashboard")?.hidden) return;
    try {
      const data = await adminApi("list");
      const quizzes = data.quizzes || [];
      if (!quizzes.length) { box.replaceChildren(h("p", { class: "lq-muted", text: "No quizzes yet. Draft some questions above, then preview and create." })); return; }
      box.replaceChildren(...quizzes.map((quiz) => {
        const players = Array.isArray(quiz.foldbook_quiz_participants) ? quiz.foldbook_quiz_participants : [];
        const count = Array.isArray(quiz.questions) ? quiz.questions.length : 0;
        const meta = [quiz.course_code, quiz.quiz_type === "contest" ? `Live contest · ${quiz.question_seconds || 20} s` : "Open quiz", `${count} questions`, audienceLabel(quiz)];
        if (quiz.status !== "draft") meta.push(`${players.length} joined`);
        const buttons = [];
        if (quiz.status === "draft") {
          buttons.push(h("button", { type: "button", class: "card-secondary-button", text: "Preview", onclick: () => openPreview(quiz, draftActions(quiz)) }));
          buttons.push(h("button", { type: "button", class: "results-submit", text: quiz.quiz_type === "contest" ? "Open lobby" : "Publish", onclick: async (event) => {
            event.currentTarget.disabled = true;
            try { startHosting(await adminApi("control", { id: quiz.id, step: quiz.quiz_type === "contest" ? "open_lobby" : "publish" })); void renderAdminList(); }
            catch (e) { studioStatus(e.message); event.currentTarget.disabled = false; }
          } }));
        }
        if (quiz.status === "draft" || quiz.status === "lobby") {
          buttons.push(h("button", { type: "button", class: "card-secondary-button", text: "Edit questions", onclick: () => editQuiz(quiz) }));
        }
        if (quiz.status === "lobby" || quiz.status === "live") {
          buttons.push(h("button", { type: "button", class: "results-submit", text: quiz.status === "lobby" ? "Open lobby screen" : "Open host screen", onclick: () => openHost(quiz.id) }));
          buttons.push(h("button", { type: "button", class: "card-secondary-button", text: "Preview questions", onclick: () => openPreview(quiz, [{ label: "Close", run: async () => closeHost() }]) }));
        }
        if (quiz.status === "finished") buttons.push(h("button", { type: "button", class: "results-submit", text: "View results", onclick: () => openHost(quiz.id) }));
        if (quiz.status === "draft" || quiz.status === "finished") {
          buttons.push(h("button", { type: "button", class: "card-secondary-button lq-delete", text: "Delete", onclick: async () => {
            if (!window.confirm(`Delete “${quiz.title}”? This removes its scores too.`)) return;
            try { await adminApi("delete", { id: quiz.id }); studioStatus(`Deleted “${quiz.title}”.`); void renderAdminList(); } catch (e) { studioStatus(e.message); }
          } }));
        }
        return h("article", { class: "quiz-admin-card" },
          h("div", { class: "quiz-admin-card-head" },
            h("strong", { text: quiz.title }),
            h("span", { class: `lq-status lq-status-${quiz.status}`, text: STATUS_LABEL[quiz.status] || quiz.status })),
          h("p", null, h("span", { class: "mono lq-code-inline", text: quiz.join_code }), " · ", meta.join(" · ")),
          h("div", { class: "quiz-admin-card-actions" }, buttons));
      }));
    } catch (error) { studioStatus(error.message); }
  }

  // ----- Studio form: the question editor in app.js owns drafting and editing; this adds preview → create -----
  // Reads the form and the visual question editor, with the same checks the server applies.
  function readStudioForm() {
    const title = $("#quizTitle").value.trim();
    const course = $("#quizCourse").value;
    const target = $("#quizTarget").value;
    const registrations = $("#quizRegistrations").value.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
    if (title.length < 3) { $("#quizTitle").focus(); throw new Error("Give the quiz a title of at least 3 characters."); }
    const questions = quizQuestionsFromEditor();
    if (!quizEditingId) {
      if (!COURSE.test(course || "")) throw new Error("Choose a course.");
      if (target === "students") {
        if (!registrations.length) throw new Error("Add at least one registration number, or change who can join.");
        const bad = registrations.find((reg) => !REG.test(reg));
        if (bad) throw new Error(`“${bad}” isn’t a valid registration number.`);
      }
    }
    return {
      title, course_code: course, target_type: target, target_level: $("#quizLevel").value, target_registrations: target === "students" ? registrations : [],
      quiz_type: $("#quizMode").value, question_seconds: Number($("#quizQuestionSeconds")?.value) || 20, questions,
    };
  }

  function previewFromStudio() {
    let form;
    try { form = readStudioForm(); } catch (error) { studioStatus(error.message); return; }
    studioStatus("");
    if (quizEditingId) {
      const editing = editingQuiz || {};
      const merged = { ...editing, ...form, course_code: editing.course_code || form.course_code, quiz_type: editing.quiz_type || form.quiz_type,
        target_type: editing.target_type || form.target_type, target_level: editing.target_level, target_registrations: editing.target_registrations || [],
        question_seconds: editing.question_seconds || form.question_seconds };
      openPreview(merged, [
        { label: "Back to editing", run: async () => closeHost() },
        { label: "Save changes", primary: true, run: async () => {
          const data = await adminApi("update", { id: quizEditingId, title: form.title, questions: form.questions, question_seconds: form.question_seconds });
          setQuizEditMode(null); setQuizDraft([]); $("#quizTitle").value = ""; editingQuiz = null;
          studioStatus(`Saved changes to “${data.quiz?.title || form.title}”.`);
          closeHost();
        } },
      ]);
      return;
    }
    openPreview(form, [
      { label: "Back to editing", run: async () => closeHost() },
      { label: "Create quiz", primary: true, run: async () => {
        const data = await adminApi("create", form);
        const quiz = data.quiz;
        setQuizDraft([]); $("#quizTitle").value = "";
        studioStatus(`Created “${quiz.title}” as a draft. Code ${quiz.join_code}.`);
        void renderAdminList();
        setHostHeader(`Created · ${quiz.title}`, `Draft · Code ${quiz.join_code} · students can’t see it yet`);
        renderPreview(quiz, [
          { label: "Later", run: async () => closeHost() },
          ...draftActions(quiz).slice(1),
        ]);
      } },
    ]);
  }

  let editingQuiz = null;
  function editQuiz(quiz) {
    editingQuiz = quiz;
    startEditingQuiz(quiz);
    const seconds = $("#quizQuestionSeconds");
    if (seconds) seconds.value = String(quiz.question_seconds || 20);
  }

  function openStudio() {
    if (!$("#quizCourse")?.options.length) void loadQuizCourseOptions();
    void renderAdminList();
  }

  // =====================================================================
  //  Wiring
  // =====================================================================
  function syncHostSoundButton() {
    const button = $("#quizHostSound");
    if (!button) return;
    button.textContent = soundOn ? "🔊" : "🔇";
    button.setAttribute("aria-pressed", String(soundOn));
    button.setAttribute("aria-label", soundOn ? "Mute quiz sounds" : "Turn quiz sounds on");
  }

  function init() {
    $("#quizJoinButton")?.addEventListener("click", () => openJoin());
    $("#quizLiveBanner")?.addEventListener("click", () => {
      if (player.available.length === 1) openJoin(player.available[0].join_code, true);
      else openJoin();
    });
    $("#quizPlayClose")?.addEventListener("click", () => {
      const quiz = player.data?.quiz;
      if (player.code && quiz && quiz.status !== "finished" && !(quiz.quiz_type === "open" && player.data.studentFinished)
        && !window.confirm("Leave the quiz screen? You can rejoin with the same code and keep your score.")) return;
      closePlayer();
    });
    $("#quizHostClose")?.addEventListener("click", closeHost);
    $("#quizCancelEdit")?.addEventListener("click", () => { editingQuiz = null; });
    $("#quizHostSound")?.addEventListener("click", () => { soundOn = !soundOn; syncHostSoundButton(); });
    $("#createQuiz")?.addEventListener("click", previewFromStudio);
    $("#quizMode")?.addEventListener("change", (event) => {
      $("#quizQuestionSeconds").disabled = event.currentTarget.value !== "contest";
      if (quizEditingId) return;
      studioStatus(event.currentTarget.value === "contest"
        ? "Live contest: you open a lobby, students join with the code, and you move through each question with a timer, answer reveal and leaderboard."
        : "Open quiz: students answer at their own pace and see the right answer straight away.");
    });
    if ($("#quizMode") && $("#quizQuestionSeconds")) $("#quizQuestionSeconds").disabled = $("#quizMode").value !== "contest";

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!$("#quizHostOverlay").hidden && host.key === "preview") closeHost();
      else if (!$("#quizPlayOverlay").hidden && !player.code) closePlayer();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (player.code && !$("#quizPlayOverlay").hidden) void pollPlayer();
    });
    $("#studentSignOut")?.addEventListener("click", () => { closePlayer(); stopAvailabilityPolling(); });
    $("#adminLogout")?.addEventListener("click", () => { closeHost(); });

    // Join links (?quiz=CODE) open the join screen once the student is signed in.
    const params = new URLSearchParams(window.location.search);
    let pendingCode = (params.get("quiz") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (pendingCode) {
      params.delete("quiz");
      const query = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
    }
    const onStage = (stage) => {
      if (stage === "studentApp" && studentReady()) {
        startAvailabilityPolling();
        if (pendingCode) { const code = pendingCode; pendingCode = ""; openJoin(code, true); }
      } else {
        stopAvailabilityPolling();
        if (!$("#quizPlayOverlay").hidden) closePlayer();
      }
      if (stage !== "adminDashboard" && !$("#quizHostOverlay").hidden) closeHost();
    };
    document.addEventListener("foldbook:stage", (event) => onStage(event.detail?.stage));
    if (studentReady()) onStage("studentApp");
    syncHostSoundButton();
  }

  window.FoldBookLiveQuiz = { refreshAvailable: () => { if (studentReady()) startAvailabilityPolling(); }, openStudio, openJoin };
  init();
})();
