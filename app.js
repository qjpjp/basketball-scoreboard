const defaultState = {
  teams: {
    home: { name: "同曦", score: 3, fouls: 0, timeouts: 3 },
    away: { name: "新训", score: 5, fouls: 0, timeouts: 3 },
  },
  period: 1,
  periodSeconds: 600,
  clockSeconds: 600,
  clockRunning: false,
  shotClockMax: 24,
  shotClockSeconds: 24,
  shotClockRunning: false,
  possession: "home",
  soundOn: true,
  venue: "洛杉矶体育馆",
  events: [
    { kind: "start", label: "开场比分", detail: "比赛已建立 · 第 1 节", score: "3 — 5", time: "10:00", icon: "flag" },
  ],
};

let state = loadState();
let history = [];
let intervalId = null;
let shotIntervalId = null;
let toastTimer = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const appShell = document.querySelector(".app-shell");

function getViewFromHash() {
  return window.location.hash === "#control" ? "control" : "display";
}

function setView(view, updateHash = true) {
  const activeView = view === "control" ? "control" : "display";
  appShell.classList.toggle("view-display", activeView === "display");
  appShell.classList.toggle("view-control", activeView === "control");
  $$(".view-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewTarget === activeView);
  });
  $("#pageEyebrow").textContent = activeView === "control" ? "MATCH CONTROL" : "LIVE SCOREBOARD";
  $("#pageTitle").textContent = activeView === "control" ? "比赛操作台" : "实时记分";
  if (updateHash && window.location.hash !== `#${activeView}`) {
    window.history.replaceState(null, "", `#${activeView}`);
  }
  lucide.createIcons();
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const saved = localStorage.getItem("court-scoreboard-state");
    if (saved) return { ...cloneState(defaultState), ...JSON.parse(saved) };
  } catch (error) {
    console.warn("Unable to restore local state", error);
  }
  return cloneState(defaultState);
}

function persistState() {
  try {
    localStorage.setItem("court-scoreboard-state", JSON.stringify(state));
  } catch (error) {
    console.warn("Unable to persist local state", error);
  }
}

function snapshot() {
  history.push(cloneState(state));
  if (history.length > 40) history.shift();
}

function render() {
  $("#homeScore").textContent = state.teams.home.score;
  $("#awayScore").textContent = state.teams.away.score;
  $("#homeFouls").textContent = state.teams.home.fouls;
  $("#awayFouls").textContent = state.teams.away.fouls;
  $("#homeTimeouts").textContent = state.teams.home.timeouts;
  $("#awayTimeouts").textContent = state.teams.away.timeouts;
  $("#periodLabel").textContent = String(state.period).padStart(2, "0");
  $("#gameClock").textContent = formatTime(state.clockSeconds);
  $("#shotClock").textContent = state.shotClockSeconds;
  $("#periodTotal").textContent = state.teams.home.score + state.teams.away.score;
  $("#matchTotal").textContent = state.teams.home.score + state.teams.away.score;
  $("#lastEventLabel").textContent = state.events[0]?.label || "暂无记录";
  $("#displayPeriodName").textContent = state.period === 5 ? "加时" : `第 ${state.period} 节`;
  $("#shotClockState").textContent = state.shotClockRunning ? "计时中" : "准备";
  $("#clockStatus").textContent = state.clockRunning ? "比赛计时中" : state.clockSeconds === 0 ? "本节结束" : "准备开赛";
  $("#venueLabel").textContent = state.venue;

  $$(".team-name-button").forEach((button) => {
    button.textContent = state.teams[button.dataset.editTeam].name;
  });
  $$(".possession-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.possession === state.possession);
    button.textContent = state.teams[button.dataset.possession].name;
  });
  $$(".period-button").forEach((button) => button.classList.toggle("is-active", button.dataset.period === String(state.period)));
  $("#clockToggle").innerHTML = state.clockRunning
    ? '<i data-lucide="pause"></i><span>暂停计时</span>'
    : '<i data-lucide="play"></i><span>开始计时</span>';
  $("#shotClockToggle").innerHTML = state.shotClockRunning ? '<i data-lucide="pause"></i>' : '<i data-lucide="play"></i>';
  $("#soundToggle").innerHTML = state.soundOn ? '<i data-lucide="volume-2"></i>' : '<i data-lucide="volume-x"></i>';
  renderEvents();
  lucide.createIcons();
  persistState();
}

function renderEvents() {
  const list = $("#eventList");
  if (!state.events.length) {
    list.innerHTML = '<div class="empty-events">还没有比赛记录</div>';
    return;
  }
  list.innerHTML = state.events
    .slice(0, 8)
    .map(
      (event) => `
        <div class="event-item">
          <span class="event-time">${event.time}</span>
          <div class="event-main">
            <span class="event-icon"><i data-lucide="${event.icon || "circle-dot"}"></i></span>
            <span class="event-copy"><strong>${escapeHtml(event.label)}</strong><span>${escapeHtml(event.detail)}</span></span>
          </div>
          <span class="event-score">${event.score || ""}</span>
        </div>
      `,
    )
    .join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function addEvent(label, detail, icon = "circle-dot", score = "") {
  state.events.unshift({ label, detail, icon, score, time: formatTime(state.clockSeconds) });
}

function setClockRunning(shouldRun) {
  state.clockRunning = shouldRun && state.clockSeconds > 0;
  if (state.clockRunning && !intervalId) {
    intervalId = window.setInterval(() => {
      state.clockSeconds = Math.max(0, state.clockSeconds - 1);
      if (state.clockSeconds === 0) {
        setClockRunning(false);
        showToast("本节计时结束");
        addEvent("本节结束", `第 ${state.period} 节计时归零`, "bell");
      }
      render();
    }, 1000);
  }
  if (!state.clockRunning && intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  render();
}

function setShotClockRunning(shouldRun) {
  state.shotClockRunning = shouldRun && state.shotClockSeconds > 0;
  if (state.shotClockRunning && !shotIntervalId) {
    shotIntervalId = window.setInterval(() => {
      state.shotClockSeconds = Math.max(0, state.shotClockSeconds - 1);
      if (state.shotClockSeconds === 0) {
        setShotClockRunning(false);
        showToast("进攻时间结束");
        addEvent("进攻时间结束", "24 秒计时归零", "timer");
      }
      render();
    }, 1000);
  }
  if (!state.shotClockRunning && shotIntervalId) {
    clearInterval(shotIntervalId);
    shotIntervalId = null;
  }
  render();
}

function changeScore(team, amount) {
  snapshot();
  const nextScore = Math.max(0, state.teams[team].score + amount);
  state.teams[team].score = nextScore;
  const label = amount > 0 ? `${state.teams[team].name} +${amount} 分` : `${state.teams[team].name} ${amount} 分`;
  addEvent(label, `${amount > 0 ? "完成得分" : "修正比分"} · 第 ${state.period} 节`, amount === 3 ? "sparkles" : "plus-circle", `${state.teams.home.score} — ${state.teams.away.score}`);
  render();
}

function changeFoul(team) {
  snapshot();
  state.teams[team].fouls += 1;
  addEvent(`${state.teams[team].name} 犯规`, `个人 / 球队犯规记录 +1`, "triangle-alert");
  render();
}

function changeTimeout(team) {
  snapshot();
  if (state.teams[team].timeouts <= 0) {
    showToast(`${state.teams[team].name} 已没有暂停`);
    return;
  }
  state.teams[team].timeouts -= 1;
  addEvent(`${state.teams[team].name} 暂停`, `剩余暂停 ${state.teams[team].timeouts} 次`, "timer");
  render();
}

function selectPeriod(period) {
  snapshot();
  state.period = period === "OT" ? 5 : Number(period);
  state.clockSeconds = state.period === 5 ? 300 : state.periodSeconds;
  state.shotClockSeconds = state.shotClockMax;
  state.clockRunning = false;
  state.shotClockRunning = false;
  addEvent(state.period === 5 ? "进入加时" : `进入第 ${state.period} 节`, "比赛节次已切换", "arrow-right");
  stopIntervals();
  render();
}

function stopIntervals() {
  if (intervalId) clearInterval(intervalId);
  if (shotIntervalId) clearInterval(shotIntervalId);
  intervalId = null;
  shotIntervalId = null;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function openSettings() {
  $("#homeTeamInput").value = state.teams.home.name;
  $("#awayTeamInput").value = state.teams.away.name;
  $("#venueInput").value = state.venue;
  $("#periodLengthInput").value = state.periodSeconds;
  $("#shotClockLengthInput").value = state.shotClockMax;
  $("#settingsModal").classList.add("is-open");
  $("#settingsModal").setAttribute("aria-hidden", "false");
  $("#homeTeamInput").focus();
}

function closeSettings() {
  $("#settingsModal").classList.remove("is-open");
  $("#settingsModal").setAttribute("aria-hidden", "true");
}

function saveSettings() {
  snapshot();
  state.teams.home.name = $("#homeTeamInput").value.trim() || "主队";
  state.teams.away.name = $("#awayTeamInput").value.trim() || "客队";
  state.venue = $("#venueInput").value.trim() || "比赛场馆";
  state.periodSeconds = Number($("#periodLengthInput").value);
  state.shotClockMax = Number($("#shotClockLengthInput").value);
  state.clockSeconds = state.periodSeconds;
  state.shotClockSeconds = state.shotClockMax;
  addEvent("更新比赛设置", `${state.teams.home.name} vs ${state.teams.away.name}`, "settings-2");
  closeSettings();
  render();
  showToast("比赛设置已保存");
}

function bindEvents() {
  $$(".view-tab").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.viewTarget));
  });
  window.addEventListener("hashchange", () => setView(getViewFromHash(), false));
  $$(".score-button").forEach((button) => {
    button.addEventListener("click", () => {
      const [team, amount] = button.dataset.scoreAction.split(":");
      changeScore(team, Number(amount));
    });
  });
  $$(".foul-action").forEach((button) => button.addEventListener("click", () => changeFoul(button.dataset.foulAction)));
  $$(".period-button").forEach((button) => button.addEventListener("click", () => selectPeriod(button.dataset.period)));
  $$(".possession-button").forEach((button) => {
    button.addEventListener("click", () => {
      snapshot();
      state.possession = button.dataset.possession;
      addEvent("球权交换", `球权归属 ${state.teams[state.possession].name}`, "repeat-2");
      render();
    });
  });
  $$("[data-clock-adjust]").forEach((button) => {
    button.addEventListener("click", () => {
      snapshot();
      state.clockSeconds = Math.max(0, state.clockSeconds + Number(button.dataset.clockAdjust));
      addEvent("调整比赛时间", `${button.textContent.trim()} · ${formatTime(state.clockSeconds)}`, "clock-3");
      render();
    });
  });
  $("#clockToggle").addEventListener("click", () => {
    if (!state.clockRunning) {
      addEvent("开始计时", `第 ${state.period} 节 · ${formatTime(state.clockSeconds)}`, "play");
    }
    setClockRunning(!state.clockRunning);
  });
  $("#clockReset").addEventListener("click", () => {
    snapshot();
    state.clockRunning = false;
    state.clockSeconds = state.period === 5 ? 300 : state.periodSeconds;
    stopIntervals();
    addEvent("重置比赛计时", `第 ${state.period} 节 · ${formatTime(state.clockSeconds)}`, "rotate-ccw");
    render();
  });
  $("#shotClockToggle").addEventListener("click", () => setShotClockRunning(!state.shotClockRunning));
  $("#shotClockReset").addEventListener("click", () => {
    snapshot();
    state.shotClockSeconds = state.shotClockMax;
    state.shotClockRunning = false;
    if (shotIntervalId) clearInterval(shotIntervalId);
    shotIntervalId = null;
    addEvent("重置进攻时间", `${state.shotClockMax} 秒`, "rotate-ccw");
    render();
  });
  $("#timeoutButton").addEventListener("click", () => changeTimeout(state.possession));
  $("#undoButton").addEventListener("click", () => {
    if (!history.length) {
      showToast("没有可撤销的操作");
      return;
    }
    state = history.pop();
    stopIntervals();
    render();
    showToast("已撤销上一步操作");
  });
  $("#clearEventsButton").addEventListener("click", () => {
    snapshot();
    state.events = [];
    render();
    showToast("比赛记录已清空");
  });
  $$(".quick-action").forEach((button) => {
    button.addEventListener("click", () => {
      snapshot();
      const labels = { jumpball: "跳球", steal: "抢断", rebound: "篮板", technical: "技术犯规" };
      const icons = { jumpball: "circle-dot", steal: "hand", rebound: "move-up", technical: "triangle-alert" };
      const label = labels[button.dataset.quickAction];
      addEvent(label, `快捷事件 · 第 ${state.period} 节`, icons[button.dataset.quickAction]);
      render();
      showToast(`已记录：${label}`);
    });
  });
  $("#soundToggle").addEventListener("click", () => {
    state.soundOn = !state.soundOn;
    render();
    showToast(state.soundOn ? "声音提醒已开启" : "声音提醒已关闭");
  });
  $("#settingsButton").addEventListener("click", openSettings);
  $("#closeSettingsButton").addEventListener("click", closeSettings);
  $("#cancelSettingsButton").addEventListener("click", closeSettings);
  $("#saveSettingsButton").addEventListener("click", saveSettings);
  $("#settingsModal").addEventListener("click", (event) => {
    if (event.target === $("#settingsModal")) closeSettings();
  });
  $("#swapSidesButton").addEventListener("click", () => {
    snapshot();
    [state.teams.home, state.teams.away] = [state.teams.away, state.teams.home];
    state.possession = state.possession === "home" ? "away" : "home";
    addEvent("交换场地", "主客队显示已交换", "repeat-2");
    render();
    showToast("已交换主客队");
  });
  $("#finishButton").addEventListener("click", () => {
    setClockRunning(false);
    setShotClockRunning(false);
    addEvent("比赛结束", `${state.teams.home.name} ${state.teams.home.score} — ${state.teams.away.score} ${state.teams.away.name}`, "flag");
    render();
    showToast("比赛已结束，记录已保留");
  });
  $("#fullscreenButton").addEventListener("click", async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
    else await document.exitFullscreen?.();
  });
  document.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      $("#clockToggle").click();
    }
    if (event.key === "Escape") closeSettings();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const currentDate = new Date();
  $("#matchDate").textContent = `${currentDate.getFullYear()} / ${String(currentDate.getMonth() + 1).padStart(2, "0")} / ${String(currentDate.getDate()).padStart(2, "0")}`;
  setView(getViewFromHash(), false);
  bindEvents();
  render();
});
