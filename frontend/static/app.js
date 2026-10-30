/* ============================================================
   Darts — home prototype (vanilla JS, no build step)
   ============================================================ */
(() => {
  "use strict";

  /* ---------- icons ---------- */
  const ICON = {
    chevron:
      '<svg class="od-icon" style="--od-icon-size:1rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    trash:
      '<svg class="od-icon" style="--od-icon-size:1.05rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12"/></svg>',
    target:
      '<svg class="od-icon" style="--od-icon-size:2rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>',
    trophy:
      '<svg class="od-icon" style="--od-icon-size:2rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/><path d="M12 13v4M8 21h8M9 21v-2h6v2"/></svg>',
    check:
      '<svg class="od-icon" style="--od-icon-size:1.5rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>',
    cross:
      '<svg class="od-icon" style="--od-icon-size:1.5rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  /* ---------- data ---------- */
  const LEGACY_SEED_PLAYER_IDS = new Set(["gerwen", "wright", "price", "smith"]);
  const LEGACY_SEED_RECENT_KEYS = new Set([
    "Today · 14:20|01 · 501|van Gerwen won 3–2",
    "Today · 12:05|Cricket|Wright won 2–1",
    "Yesterday|Practice · Target|18 hits",
    "Yesterday|Practice · Checkout|Cleared",
    "Fri 16 Oct|01 · 301|van Gerwen won 2–1",
    "Thu 15 Oct|Practice · Target|11 hits",
    "Thu 15 Oct|01 · 501|Price won 3–1",
  ]);

  const DIFFICULTIES = [
    { id: "beginner", label: "Beginner", rank: 1, desc: "Loose grouping, misses doubles" },
    { id: "casual", label: "Casual", rank: 2, desc: "Finds singles, occasional treble" },
    { id: "steady", label: "Steady", rank: 3, desc: "Reliable scoring, closes methodically" },
    { id: "sharp", label: "Sharp", rank: 4, desc: "Heavy T20 scoring, confident doubles" },
    { id: "expert", label: "Expert", rank: 5, desc: "Pinpoint trebles, clinical checkouts" },
  ];

  const LOCAL_OPPONENTS = DIFFICULTIES.map((d) => ({
    id: d.id, label: d.label, rank: d.rank, desc: d.desc, difficulty: d.id,
  }));

  const LEN_LABEL = { 1: "Single", 3: "Best of 3", 5: "Best of 5", 7: "Best of 7" };

  /* ---------- repositories ---------- */
  /* The UI only talks to `repo`. Swap the adapter for an HTTP client that
     implements the same get/put/remove contract when the backend lands. */
  const PROFILES_KEY = "od.darts.profiles";
  const LEGACY_KEYS = { players: "od.darts.players", active: "od.darts.active", recent: "od.darts.recent", profile: "od.darts.profile" };
  const DATA_RESOURCES = ["players", "active", "recent"];
  const scopedKey = (id, resource) => `od.darts.u.${id}.${resource}`;
  const TOMBSTONE_KEY = "od.darts.deletedProfiles";

  function readTombstones() {
    try {
      const raw = JSON.parse(localStorage.getItem(TOMBSTONE_KEY) || "[]");
      return new Set(Array.isArray(raw) ? raw.filter((id) => typeof id === "string") : []);
    } catch { return new Set(); }
  }
  function writeTombstones(ids) {
    try { localStorage.setItem(TOMBSTONE_KEY, JSON.stringify([...ids])); } catch {}
  }

  const scopedDirtyKey = (id, resource) => `${scopedKey(id, resource)}.dirty`;
  function isScopedDirty(id, resource) {
    try { return localStorage.getItem(scopedDirtyKey(id, resource)) === "1"; } catch { return false; }
  }
  function markScopedDirty(id, resource) {
    try { localStorage.setItem(scopedDirtyKey(id, resource), "1"); } catch {}
  }
  function clearScopedDirty(id, resource) {
    try { localStorage.removeItem(scopedDirtyKey(id, resource)); } catch {}
  }

  function createStorageAdapter(keyFor) {
    let writes = Promise.resolve();
    const write = (resource, value) => {
      try { localStorage.setItem(keyFor(resource), JSON.stringify(value)); } catch {}
    };
    return {
      has: (resource) => {
        try { return localStorage.getItem(keyFor(resource)) !== null; } catch { return false; }
      },
      read: (resource) => {
        try {
          const raw = localStorage.getItem(keyFor(resource));
          return raw === null ? null : JSON.parse(raw);
        } catch { return null; }
      },
      write,
      remove: (resource) => {
        try { localStorage.removeItem(keyFor(resource)); } catch {}
      },
      persist(resource, value) {
        writes = writes.then(() => write(resource, value), () => write(resource, value));
        return writes.catch(() => {});
      },
      flush: () => writes.catch(() => {}),
    };
  }

  function createRepository(adapter) {
    const repository = {
      players: { list: () => adapter.read("players"), save: (list) => adapter.persist("players", list) },
      activeGames: { list: () => adapter.read("active"), save: (list) => adapter.persist("active", list) },
      recentResults: { list: () => adapter.read("recent"), save: (list) => adapter.persist("recent", list) },
    };
    repository.hydrate = async () => {
      const load = (resource) => (adapter.load ? adapter.load(resource) : repository[resource === "active" ? "activeGames" : resource === "recent" ? "recentResults" : "players"].list());
      const [players, active, recent] = await Promise.all([
        load("players"),
        load("active"),
        load("recent"),
      ]);
      return { players, active, recent };
    };
    repository.clear = async () => {
      DATA_RESOURCES.forEach((resource) => adapter.remove(resource));
      await adapter.flush();
    };
    repository.flush = () => adapter.flush();
    return repository;
  }

  /* ---------- backend sync ---------- */
  const API_BASE = "/api";
  const profileURL = (id) => `/profiles/${encodeURIComponent(id)}`;

  async function apiJSON(path, options = {}) {
    const init = { ...options, headers: { Accept: "application/json", ...(options.headers || {}) } };
    if (options.body && !init.headers["Content-Type"]) init.headers["Content-Type"] = "application/json";
    const res = await fetch(API_BASE + path, init);
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const payload = await res.json();
        if (payload && payload.error) message = payload.error;
      } catch {}
      throw new Error(message);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  let syncStatus = "idle";
  function renderSyncStatus() {
    const chip = $("#sync-status");
    if (!chip) return;
    const labels = { idle: "Local", loading: "Loading", saving: "Saving", saved: "Synced", offline: "Offline" };
    chip.dataset.state = syncStatus;
    chip.querySelector(".syncchip__label").textContent = labels[syncStatus] || "Local";
    chip.title = syncStatus === "offline"
      ? "Backend unreachable — changes are saved on this device and will retry."
      : syncStatus === "saved" ? "All changes saved to the backend." : "Syncing with the backend…";
  }
  function setSyncStatus(next) {
    syncStatus = next;
    renderSyncStatus();
  }

  function sanitizeScopedValue(resource, value) {
    if (!Array.isArray(value)) return [];
    if (resource === "players") {
      return value.filter((p) => p && !LEGACY_SEED_PLAYER_IDS.has(String(p.id)));
    }
    if (resource === "active") {
      return value.filter((g) => g && !String(g.id || "").startsWith("seed-"));
    }
    if (resource === "recent") {
      return value.filter((r) => r && !LEGACY_SEED_RECENT_KEYS.has(`${r.when}|${r.type}|${r.result}`));
    }
    return value;
  }

  function scopedDataForUpload(profileId) {
    const scoped = createStorageAdapter((resource) => scopedKey(profileId, resource));
    const out = {};
    for (const resource of DATA_RESOURCES) {
      const value = scoped.read(resource);
      if (Array.isArray(value)) out[resource] = sanitizeScopedValue(resource, value);
    }
    return out;
  }

  async function pushDirtyScopedData(profileId) {
    const scoped = createStorageAdapter((resource) => scopedKey(profileId, resource));
    for (const resource of DATA_RESOURCES) {
      if (!isScopedDirty(profileId, resource)) continue;
      const value = scoped.read(resource);
      if (value === null) { clearScopedDirty(profileId, resource); continue; }
      try {
        await apiJSON(`${profileURL(profileId)}/data/${resource}`, { method: "PUT", body: JSON.stringify(value) });
        clearScopedDirty(profileId, resource);
      } catch {
        setSyncStatus("offline");
        return false;
      }
    }
    return true;
  }

  function createRemoteStorageAdapter(profileId) {
    const local = createStorageAdapter((resource) => scopedKey(profileId, resource));
    const resourceURL = (resource) => `${profileURL(profileId)}/data/${resource}`;
    let timer = null;
    let flushing = null;
    let queued = false;

    async function push() {
      setSyncStatus("saving");
      for (const resource of DATA_RESOURCES) {
        if (!isScopedDirty(profileId, resource)) continue;
        const value = local.read(resource);
        if (value === null) { clearScopedDirty(profileId, resource); continue; }
        try {
          await apiJSON(resourceURL(resource), { method: "PUT", body: JSON.stringify(value) });
          clearScopedDirty(profileId, resource);
        } catch {
          setSyncStatus("offline");
          return false;
        }
      }
      setSyncStatus("saved");
      return true;
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; flush(); }, 450);
    }

    function flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (flushing) { queued = true; return flushing; }
      flushing = push().finally(() => {
        flushing = null;
        if (queued) { queued = false; schedule(); }
      });
      return flushing;
    }

    return {
      has: local.has,
      read: local.read,
      write: local.write,
      remove(resource) {
        local.remove(resource);
        clearScopedDirty(profileId, resource);
      },
      persist(resource, value) {
        local.write(resource, value);
        markScopedDirty(profileId, resource);
        schedule();
        return Promise.resolve();
      },
      flush,
      async load(resource) {
        const localValue = local.read(resource);
        if (isScopedDirty(profileId, resource)) {
          if (localValue === null) { clearScopedDirty(profileId, resource); return null; }
          try {
            setSyncStatus("saving");
            await apiJSON(resourceURL(resource), { method: "PUT", body: JSON.stringify(localValue) });
            clearScopedDirty(profileId, resource);
            setSyncStatus("saved");
            return localValue;
          } catch {
            setSyncStatus("offline");
            return localValue;
          }
        }
        try {
          setSyncStatus("loading");
          const value = await apiJSON(resourceURL(resource));
          if (Array.isArray(value)) {
            local.write(resource, value);
            setSyncStatus("saved");
            return value;
          }
        } catch {}
        setSyncStatus("offline");
        return localValue;
      },
    };
  }

  function createRepositoryFor(profileId) {
    return createRepository(createRemoteStorageAdapter(profileId));
  }

  const profilesAdapter = createStorageAdapter(() => PROFILES_KEY);
  const legacyAdapter = createStorageAdapter((resource) => LEGACY_KEYS[resource]);

  let repo = null;

  /* ---------- state ---------- */
  let players = [];
  let opponents = LOCAL_OPPONENTS.slice();
  let state = {
    mode: "match",
    game: "01",
    score: 501,
    len: 1,
    practice: "target",
    darts: 20,
    g9variant: "cricket",
    atwMarks: 1,
    slots: [
      { source: "known", playerId: null, difficulty: "steady" },
      { source: "ai", playerId: null, difficulty: "sharp" },
    ],
    firstThrower: 0,
  };

  let active = [];
  function normalizeRecentTimestamps(rows, now = Date.now()) {
    let changed = false;
    const next = rows.map((row, idx) => {
      if (Number.isFinite(row.at) && row.at > 0) return row;
      changed = true;
      return { ...row, at: now - idx * 6 * 60 * 60 * 1000 };
    });
    return { rows: next, changed };
  }
  let recent = [];

  const CHECKOUT_ROUTES = {
    170: "T20 · T20 · Double bull",
    121: "T20 · T11 · D14",
    100: "T20 · D20",
    80: "T20 · D10",
    62: "T14 · D10",
    50: "18 · D16",
    40: "D20",
    32: "D16",
    20: "D10",
  };

  const routeForScore = (n) =>
    CHECKOUT_ROUTES[n] || (n >= 2 && n <= 40 && n % 2 === 0 ? `D${n / 2}` : "");

  /* play view state */
  let playId = null;
  let playMult = 1;
  let playMsg = "";
  let goHomeAfterSheet = false;
  let aiTimer = null;

  /* view state: "home" | "hub" | "stats" */
  let view = "home";
  let booted = false;
  let appLoading = false;

  function setAppLoading(on) {
    appLoading = on;
    const el = $("#app-loading");
    if (el) el.hidden = !on;
  }

  /* practice hub quick start */
  let hubMode = "target";
  let hubDarts = 20;
  let hubG9Variant = "cricket";

  /* profile identity (display name shown in greeting, chip, and profile page) */
  let profiles = { list: [], activeId: null };
  let profile = { name: "Player", initials: "P" };
  let profileToken = 0;
  let profilesFromStorage = false;
  let profileSyncTimer = null;

  const activeProfile = () => profiles.list.find((p) => p.id === profiles.activeId) || profiles.list[0] || null;
  const newProfileId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  function normalizeProfileRecord(p) {
    if (!p || typeof p !== "object" || !p.id) return null;
    const name = String(p.name || "Player").replace(/\s+/g, " ").trim().slice(0, 40) || "Player";
    return { id: String(p.id), name, initials: p.initials || initialsOf(name) };
  }

  async function pushProfiles() {
    if (!profiles.list.length) return false;
    try {
      for (const p of profiles.list) {
        await apiJSON("/profiles", { method: "POST", body: JSON.stringify({ id: p.id, name: p.name, initials: p.initials }) });
        await apiJSON(profileURL(p.id), { method: "PATCH", body: JSON.stringify({ name: p.name, initials: p.initials }) });
      }
      if (profiles.activeId) {
        await apiJSON("/profiles/active", { method: "PUT", body: JSON.stringify({ activeId: profiles.activeId }) });
      }
      setSyncStatus("saved");
      return true;
    } catch {
      setSyncStatus("offline");
      return false;
    }
  }

  function scheduleProfileSync() {
    if (profileSyncTimer) clearTimeout(profileSyncTimer);
    profileSyncTimer = setTimeout(() => { profileSyncTimer = null; pushProfiles(); }, 600);
  }

  async function saveProfiles() {
    await profilesAdapter.persist("profiles", profiles);
    scheduleProfileSync();
  }

  async function loadProfiles() {
    const saved = await profilesAdapter.read("profiles");
    if (saved && Array.isArray(saved.list) && saved.list.length) {
      const list = saved.list.map(normalizeProfileRecord).filter(Boolean);
      if (list.length) {
        profilesFromStorage = true;
        profiles = { list, activeId: saved.activeId };
        if (!list.some((p) => p.id === profiles.activeId)) profiles.activeId = list[0].id;
        return;
      }
    }

    /* first run on this build: bring the single legacy profile forward */
    const legacyProfile = await legacyAdapter.read("profile");
    const legacyName = legacyProfile && typeof legacyProfile.name === "string" && legacyProfile.name.trim()
      ? legacyProfile.name.trim() : "Player";
    const record = {
      id: "default", name: legacyName,
      initials: (legacyProfile && legacyProfile.initials) || initialsOf(legacyName),
    };
    profiles = { list: [record], activeId: record.id };

    const scoped = createStorageAdapter((resource) => scopedKey(record.id, resource));
    for (const resource of DATA_RESOURCES) {
      if (scoped.has(resource) || !legacyAdapter.has(resource)) continue;
      const value = await legacyAdapter.read(resource);
      if (value !== null) scoped.write(resource, value);
    }
    await profilesAdapter.persist("profiles", profiles);
  }

  async function syncProfiles() {
    setSyncStatus("loading");
    const tombstones = readTombstones();
    try {
      for (const id of tombstones) {
        try { await apiJSON(profileURL(id), { method: "DELETE" }); } catch {}
      }

      const fetchList = async () => {
        const remote = await apiJSON("/profiles");
        const raw = remote && Array.isArray(remote.list) ? remote.list : [];
        const list = raw.map(normalizeProfileRecord).filter((p) => p && !tombstones.has(p.id));
        return { list, activeId: remote && remote.activeId };
      };

      let remote = await fetchList();
      const localList = profiles.list.filter((p) => !tombstones.has(p.id));
      const shouldImportMissing = profilesFromStorage || remote.list.length === 0;
      const missing = shouldImportMissing ? localList.filter((p) => !remote.list.some((r) => r.id === p.id)) : [];
      if (missing.length) {
        const data = {};
        for (const p of missing) data[p.id] = scopedDataForUpload(p.id);
        await apiJSON("/import/local", {
          method: "POST",
          body: JSON.stringify({ profiles: { list: missing, activeId: profiles.activeId }, data }),
        });
        remote = await fetchList();
      }

      if (remote.list.length) {
        const merged = remote.list.map((rp) => localList.find((lp) => lp.id === rp.id) || rp);
        const localActive = profiles.activeId;
        const activeId = merged.some((p) => p.id === localActive)
          ? localActive
          : (merged.some((p) => p.id === remote.activeId) ? remote.activeId : merged[0].id);
        profiles = { list: merged, activeId };
      }
      await profilesAdapter.persist("profiles", profiles);

      const remoteIds = new Set(remote.list.map((p) => p.id));
      let tombstonesChanged = false;
      for (const id of [...tombstones]) {
        if (!remoteIds.has(id)) { tombstones.delete(id); tombstonesChanged = true; }
      }
      if (tombstonesChanged) writeTombstones(tombstones);

      await pushProfiles();
      for (const p of profiles.list) {
        if (!(await pushDirtyScopedData(p.id))) break;
      }
    } catch {
      setSyncStatus("offline");
    }
  }

  async function hydrate(targetRepo = repo, profileId = profiles.activeId, token = null) {
    const saved = await targetRepo.hydrate();
    if (token !== null && token !== profileToken) return false;
    players = Array.isArray(saved.players) ? saved.players : [];
    active = Array.isArray(saved.active) ? saved.active : [];
    recent = Array.isArray(saved.recent) ? saved.recent : [];
    const stamped = normalizeRecentTimestamps(recent);
    recent = stamped.rows;
    if (stamped.changed) targetRepo.recentResults.save(recent);
    active.forEach((g) => { if (g.kind === "practice") normalizePlay(g); });
    state.slots.forEach((slot) => {
      if (slot.source === "known" && !playerById(slot.playerId)) {
        slot.playerId = players[0] ? players[0].id : null;
      }
    });
    return true;
  }

  /* ---------- helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const targetName = (t) => (t === "SB" ? "Single bull" : t === "DB" ? "Double bull" : t);
  const playerById = (id) => players.find((p) => p.id === id);
  const diffById = (id) => opponents.find((d) => d.id === id);
  const defaultOpponent = () => opponents[Math.min(2, opponents.length - 1)] || opponents[0] || LOCAL_OPPONENTS[2];

  function applyOpponents(list) {
    if (!Array.isArray(list) || !list.length) return;
    opponents = list;
    state.slots.forEach((slot) => {
      if (slot.source === "ai" && !diffById(slot.difficulty)) slot.difficulty = defaultOpponent().id;
    });
  }

  async function hydrateOpponents() {
    try {
      applyOpponents(await opponent.listOpponents());
      if (booted) { renderSlots(); renderFirstThrower(); }
    } catch {}
  }
  const initialsOf = (name) =>
    name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

  function timeAgo(ts) {
    const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  }

  function toast(msg) {
    const box = $("#toaster");
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<span class="toast__dot" aria-hidden="true"></span><span>${esc(msg)}</span>`;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-in"));
    setTimeout(() => {
      el.classList.remove("is-in");
      setTimeout(() => el.remove(), 250);
    }, 2600);
  }

  /* ---------- segmented controls ---------- */
  function bindSegGroup(container, attr, onPick, forceDefault) {
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(`[${attr}]`);
      if (!btn || !container.contains(btn)) return;
      $$(`[${attr}]`, container).forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", String(on));
      });
      onPick(btn.getAttribute(attr), btn);
    });
    if (forceDefault) onPick(forceDefault);
  }

  /* ---------- player slots ---------- */
  function slotDisplay(slot, i) {
    if (slot.source === "ai") {
      const d = diffById(slot.difficulty) || defaultOpponent();
      return { initials: "AI", name: `AI · ${d.label}`, isAi: true };
    }
    const p = playerById(slot.playerId);
    if (!p) return { initials: "+", name: "Choose player", isAi: false };
    return { initials: p.initials || initialsOf(p.name), name: p.short || p.name, isAi: false };
  }

  function renderSlots() {
    const wrap = $("#slots");
    wrap.innerHTML = state.slots.map((slot, i) => {
      const d = slotDisplay(slot, i);
      const knownBody = `
        <div class="chips">
          ${players.map((p) => `
            <button type="button" class="chip ${slot.source === "known" && slot.playerId === p.id ? "is-active" : ""}"
              data-slot="${i}" data-pick="${p.id}">${esc(p.short || p.name)}</button>
          `).join("")}
          <button type="button" class="chip chip--add" data-slot="${i}" data-add="1">+ New player</button>
        </div>`;
      const aiBody = `
        <div class="diffs" data-slot="${i}">
          ${opponents.map((df) => `
            <button type="button" class="diff ${slot.difficulty === df.id ? "is-active" : ""}"
              data-slot="${i}" data-diff="${df.id}" aria-pressed="${slot.difficulty === df.id}">
              <span class="diff__body">
                <span class="diff__label">${esc(df.label)}</span>
                <span class="diff__desc">${esc(df.desc)}</span>
              </span>
              <span class="diff__pips" aria-hidden="true">
                ${[1, 2, 3, 4, 5].map((n) => `<span class="pip ${n <= df.rank ? "pip--on" : ""}"></span>`).join("")}
              </span>
            </button>
          `).join("")}
        </div>`;

      return `
        <div class="slot" data-slotcard="${i}">
          <div class="slot__top">
            <span class="slot__avatar ${d.isAi ? "slot__avatar--ai" : ""}">${esc(d.initials)}</span>
            <span class="slot__meta">
              <span class="slot__role">Player ${i + 1}</span>
              <span class="slot__name">${esc(d.name)}</span>
            </span>
          </div>
          <div class="seg slot__source" role="group" aria-label="Player ${i + 1} opponent type">
            <button type="button" class="seg__btn ${slot.source === "known" ? "is-active" : ""}"
              data-slot="${i}" data-src="known" aria-pressed="${slot.source === "known"}">Human</button>
            <button type="button" class="seg__btn ${slot.source === "ai" ? "is-active" : ""}"
              data-slot="${i}" data-src="ai" aria-pressed="${slot.source === "ai"}">AI opponent</button>
          </div>
          <div class="slot__body">${slot.source === "ai" ? aiBody : knownBody}</div>
        </div>`;
    }).join("");
  }

  function renderFirstThrower() {
    const wrap = $("#firstthrow");
    wrap.innerHTML = state.slots.map((slot, i) => {
      const d = slotDisplay(slot, i);
      return `<button type="button" class="chip ${state.firstThrower === i ? "is-active" : ""}"
        data-first="${i}">${esc(d.name)}</button>`;
    }).join("");
  }

  /* ---------- active games ---------- */
  function activeMeta(g) {
    if (g.kind === "practice") {
      if (g.practice === "target") return { title: `Target practice · ${targetName(g.target)}`, meta: `${g.done} / ${g.darts} darts`, fill: (g.done / g.darts) * 100 };
      if (g.practice === "checkout") return { title: `Checkout practice · ${g.score}`, meta: `${g.darts} darts used`, fill: Math.min(100, (g.darts / 3) * 100) };
      const seq = Array.isArray(g.seq) && g.seq.length ? g.seq : g9Seq(g.variant);
      const idx = Math.max(0, Math.min(seq.length, Number(g.idx) || 0));
      const target = seq[idx];
      return {
        title: `Game of 9 · ${g.variant === "501" ? "501 order" : "Cricket order"}`,
        meta: target === "bull"
          ? `Bull · ${g.bullStreak || 0} of 3 rounds in a row`
          : `${g9TargetName(target)} · ${g.streak || 0} of 9 in a row`,
        fill: (idx / seq.length) * 100,
      };
    }
    const firstTo = Math.ceil(g.len / 2);
    const played = g.legsWon[0] + g.legsWon[1];
    const total = firstTo * 2 - 1;
    const label = g.game === "cricket" ? "Cricket" : g.game === "atw" ? `Around the world${Number(g.marksPer) === 3 ? " · 3 marks" : ""}` : `01 · ${g.starting}`;
    const legText = g.len === 1 ? `${label} · In progress` : `${label} · Leg ${g.legsWon[0] + g.legsWon[1] + 1}`;
    return {
      title: `${g.players[0].name} vs ${g.players[1].name}`,
      meta: legText,
      score: `${g.legsWon[0]}–${g.legsWon[1]}`,
      fill: (played / total) * 100,
    };
  }

  const badgeOf = (g) => {
    if (g.kind === "practice") {
      return g.practice === "target" ? "Target" : g.practice === "checkout" ? "Checkout" : "Game of 9";
    }
    return g.game === "cricket" ? "Cricket" : g.game === "atw" ? "Around the world" : `01 · ${g.starting}`;
  };

  function activeCardHtml(g) {
    const m = activeMeta(g);
    const score = "score" in m
      ? `<span class="active-card__score od-nowrap">${esc(m.score)}</span>` : "";
    return `
      <article class="active-card" data-id="${g.id}">
        <div class="active-card__top">
          <span class="badge badge--live">${esc(badgeOf(g))}</span>
          ${score}
        </div>
        <div class="od-stack" style="--od-gap:2px">
          <h3 class="od-truncate" style="font-size:var(--fs-sm);color:var(--text-strong)">${esc(m.title)}</h3>
          <span class="active-card__meta" style="font-size:var(--fs-xs);color:var(--muted)">${esc(m.meta)} · started ${timeAgo(g.startedAt)}</span>
        </div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(m.fill)}" aria-label="Progress">
          <div class="progress__fill" style="width:${Math.max(4, Math.min(100, m.fill))}%"></div>
        </div>
        <div class="active-card__foot">
          <button type="button" class="btn btn--ghost" data-resume="${g.id}">Resume ${ICON.chevron}</button>
          <button type="button" class="iconbtn iconbtn--danger" data-discard="${g.id}" aria-label="Discard this game">${ICON.trash}</button>
        </div>
      </article>`;
  }

  function emptyActiveHtml(title, body) {
    return `
      <div class="empty">
        <span class="empty__icon">${ICON.target}</span>
        <span class="empty__title">${esc(title)}</span>
        <span class="empty__body">${esc(body)}</span>
      </div>`;
  }

  function renderActive() {
    const wrap = $("#active-list");
    const count = $("#active-count");
    count.hidden = active.length === 0;
    count.textContent = `${active.length} live`;

    if (active.length === 0) {
      wrap.innerHTML = emptyActiveHtml(
        "Nothing on the board",
        "Start a match or a practice above — anything you leave unfinished shows up here so you can pick it straight back up."
      );
      return;
    }

    wrap.innerHTML = active.map(activeCardHtml).join("");
  }

  /* hub: practice-only active list */
  function renderHubActive() {
    const wrap = $("#hub-active-list");
    const count = $("#hub-active-count");
    if (!wrap || !count) return;
    const practiceActive = active.filter((g) => g.kind === "practice");
    count.hidden = practiceActive.length === 0;
    count.textContent = `${practiceActive.length} live`;

    if (practiceActive.length === 0) {
      wrap.innerHTML = emptyActiveHtml(
        "No practice running",
        "Start a session with Quick start — anything you leave unfinished shows up here to pick straight back up."
      );
      return;
    }

    wrap.innerHTML = practiceActive.map(activeCardHtml).join("");
  }

  /* ---------- recent results ---------- */
  function resultRowHtml(r) {
    let matchup;
    if (r.a) {
      const aWin = r.winner === "a";
      matchup = `<span class="${aWin ? "win" : ""}">${esc(r.a)}</span> <span style="color:var(--faint)">vs</span> <span class="${!aWin ? "win" : ""}">${esc(r.b)}</span>`;
    } else {
      matchup = esc(r.label);
    }
    return `
        <tr>
          <td class="cell-when" data-label="When">${esc(r.when)}</td>
          <td class="cell-type" data-label="Type">${esc(r.type)}</td>
          <td class="cell-matchup" data-label="Matchup">${matchup}</td>
          <td class="cell-result" data-label="Result">${esc(r.result)}</td>
          <td class="cell-stat" data-label="Key stat">${esc(r.stat)}</td>
        </tr>`;
  }

  function renderRecent() {
    const body = $("#recent-body");
    if (!body) return;
    body.innerHTML = recent.map(resultRowHtml).join("");
    const empty = $("#recent-empty");
    const wrap = $("#recent-wrap");
    if (empty) empty.hidden = recent.length > 0;
    if (wrap) wrap.hidden = recent.length === 0;
  }

  function renderHomeStats() {
    const matches = matchRows();
    const avgs = matches.map(avgOf).filter((n) => n !== null);
    const matchCount = avgs.length;
    const bestAvg = matchCount ? Math.max(...avgs) : null;
    const checkouts = recent.map(clearDartsOf).filter((n) => n !== null);
    const bestCheckout = checkouts.length ? Math.min(...checkouts) : null;
    const checkoutRow = bestCheckout === null ? null : recent.find((r) => clearDartsOf(r) === bestCheckout);

    const avgEl = $("#home-avg");
    if (avgEl) avgEl.textContent = bestAvg === null ? "—" : bestAvg.toFixed(1);
    const avgNote = $("#home-avg-note");
    if (avgNote) avgNote.textContent = bestAvg === null
      ? "No matches yet"
      : `${matchCount} match${matchCount === 1 ? "" : "es"}`;

    const checkoutEl = $("#home-checkout");
    if (checkoutEl) checkoutEl.innerHTML = bestCheckout === null
      ? "—" : `${bestCheckout}<span class="stat__unit">${bestCheckout === 1 ? "dart" : "darts"}</span>`;
    const checkoutNote = $("#home-checkout-note");
    if (checkoutNote) checkoutNote.textContent = checkoutRow
      ? `${checkoutRow.label || checkoutRow.type} · ${checkoutRow.when}` : "No checkouts yet";

    const resultsEl = $("#home-results");
    if (resultsEl) resultsEl.textContent = String(recent.length);
    const resultsNote = $("#home-results-note");
    if (resultsNote) resultsNote.textContent = recent.length ? "Matches and practice" : "Start a session";

    const sub = $("#home-sub");
    if (sub) {
      if (bestAvg !== null) {
        sub.innerHTML = `Your best 3-dart average is <strong>${bestAvg.toFixed(1)}</strong> across ${matchCount} match${matchCount === 1 ? "" : "es"}. Keep the run going.`;
      } else if (recent.length) {
        sub.textContent = `${recent.length} result${recent.length === 1 ? "" : "s"} logged for this profile. Finish an 01 match to build a 3-dart average.`;
      } else {
        sub.textContent = "No results yet for this profile. Start a match or practice session to build your history.";
      }
    }
  }

  function renderHome() {
    renderHomeStats();
    renderActive();
    renderRecent();
  }

  /* ---------- practice hub ---------- */
  const typeOf = (r) => String(r.type || "");
  const is01 = (r) => /^01 · /.test(typeOf(r));
  const pctOf = (r) => {
    const m = /(\d+)\s*%/.exec(String(r.stat));
    return m ? Number(m[1]) : null;
  };
  const practiceRows = () => recent.filter((r) => typeOf(r).startsWith("Practice"));
  const matchRows = () => recent.filter((r) => r.a && r.b);
  const avgOf = (r) => {
    if (!is01(r)) return null;
    const m = /([\d.]+)\s*avg/i.exec(String(r.stat));
    return m ? Number(m[1]) : null;
  };
  const rateOf = (r) => (typeOf(r) === "Practice · Target" ? pctOf(r) : null);
  const atwRateOf = (r) => (typeOf(r) === "Around the world" ? pctOf(r) : null);
  const mprOf = (r) => {
    if (typeOf(r) !== "Cricket") return null;
    const m = /([\d.]+)\s*MPR/i.exec(String(r.stat));
    return m ? Number(m[1]) : null;
  };
  const checkoutDartsOf = (r) => {
    const m = /(\d+)\s*dart/.exec(String(r.stat));
    return typeOf(r) === "Practice · Checkout" && m ? Number(m[1]) : null;
  };
  const clearDartsOf = (r) => (r.result === "Cleared" ? checkoutDartsOf(r) : null);
  const g9Rows = () => practiceRows().filter((r) => typeOf(r) === "Practice · Game of 9");
  const g9TargetsOf = (r) => {
    if (Number.isFinite(r.targets) && r.targets > 0) return r.targets;
    const m = /·\s*(\d+)\s*targets?/i.exec(String(r.label));
    return m ? Number(m[1]) : null;
  };
  const g9VariantOf = (r) => (r.variant === "501" || /^501\b/.test(String(r.label)) ? "501" : "Cricket");
  const g9ClearedOf = (r) => {
    if (Number.isFinite(r.cleared)) return r.cleared;
    const targets = g9TargetsOf(r);
    if (r.result === "Cleared") return targets;
    const stopped = /^Stopped at (.+)$/.exec(String(r.result));
    if (!stopped) return null;
    const order = g9VariantOf(r) === "501"
      ? Array.from({ length: 20 }, (_, i) => String(i + 1)).concat("Bull")
      : ["20", "19", "18", "17", "16", "15", "Bull"];
    const idx = order.indexOf(stopped[1]);
    return idx >= 0 ? idx : null;
  };
  const g9DartsOf = (r) => {
    if (Number.isFinite(r.darts)) return r.darts;
    const m = /(\d+)\s*dart/.exec(String(r.stat));
    return m ? Number(m[1]) : null;
  };
  const g9PctOf = (r) => {
    const targets = g9TargetsOf(r);
    const cleared = g9ClearedOf(r);
    return targets && Number.isFinite(cleared) ? (cleared / targets) * 100 : null;
  };

  function renderHubRecent() {
    if (!$("#hub-recent-body")) return;
    const rows = practiceRows();
    $("#hub-recent-empty").hidden = rows.length > 0;
    $("#hub-recent-wrap").hidden = rows.length === 0;
    $("#hub-recent-body").innerHTML = rows.map((r) => `
        <tr>
          <td class="cell-when" data-label="When">${esc(r.when)}</td>
          <td class="cell-type" data-label="Mode">${esc(String(r.type).replace(/^Practice · /, ""))}</td>
          <td class="cell-matchup" data-label="Session">${esc(r.label)}</td>
          <td class="cell-result" data-label="Result">${esc(r.result)}</td>
          <td class="cell-stat" data-label="Key stat">${esc(r.stat)}</td>
        </tr>`).join("");
  }

  function renderHubBests() {
    if (!$("#best-hit")) return;
    const rows = practiceRows();
    let bestRate = null, bestRateFrom = "";
    let fastest = null, fastestFrom = "";
    rows.forEach((r) => {
      const v = rateOf(r);
      if (v !== null && (bestRate === null || v > bestRate)) {
        bestRate = v;
        bestRateFrom = `${r.label} · ${r.when}`;
      }
      const d = clearDartsOf(r);
      if (d !== null && (fastest === null || d < fastest)) {
        fastest = d;
        fastestFrom = `${r.label} · ${r.when}`;
      }
    });

    $("#best-hit").innerHTML = bestRate === null
      ? "—" : `${bestRate}<span class="stat__unit">%</span>`;
    $("#best-hit-note").textContent = bestRate === null ? "No sessions yet" : bestRateFrom;

    $("#best-checkout").innerHTML = fastest === null
      ? "—" : `${fastest}<span class="stat__unit">${fastest === 1 ? "dart" : "darts"}</span>`;
    $("#best-checkout-note").textContent = fastest === null ? "No sessions yet" : fastestFrom;

    $("#best-sessions").textContent = String(rows.length);
    $("#best-sessions-note").textContent = rows.length ? "In your recent results" : "Finish one to start the count";
  }

  function renderHub() {
    renderHubActive();
    renderHubRecent();
    renderHubBests();
  }

  /* ---------- profile ---------- */
  function applyProfileChrome() {
    const name = profile.name || "Player";
    const initials = profile.initials || initialsOf(name);
    const hero = $("#hero-title");
    if (hero) hero.textContent = `Good evening, ${name}`;
    const chipName = $("#pf-chip-name");
    if (chipName) chipName.textContent = name;
    const chipBadge = $("#pf-chip-badge");
    if (chipBadge) chipBadge.textContent = initials;
  }

  function renderProfile() {
    if (!$("#pf-avatar")) return;
    const name = profile.name || "Player";
    $("#pf-avatar").textContent = profile.initials || initialsOf(name);
    $("#stats-title").textContent = name;
    const total = players.length;
    $("#pf-sub").textContent =
      `${total} player${total === 1 ? "" : "s"} · ${recent.length} result${recent.length === 1 ? "" : "s"} logged`;

    const wrap = $("#roster");
    if (!wrap) return;
    wrap.innerHTML = players.map((p) => {
      const short = (p.short || p.name).split(/\s+/)[0];
      const mentions = recent.filter((r) =>
        (r.a && (r.a === p.name || r.b === p.name || r.a.includes(short) || r.b.includes(short))) ||
        (r.label && r.label.includes(short)) ||
        (r.result && r.result.includes(short))
      ).length;
      return `
      <div class="roster__row">
        <span class="roster__avatar roster__avatar--you">${esc(p.initials || initialsOf(p.name))}</span>
        <span class="roster__body">
          <span class="roster__name">${esc(p.name)}</span>
          <span class="roster__meta">${mentions ? `In ${mentions} of your results` : "No results yet"}</span>
        </span>
        <span class="badge-soft badge-soft--win">Player</span>
      </div>`;
    }).join("");
  }

  const cleanProfileName = (value) => String(value || "").trim().replace(/\s+/g, " ").slice(0, 40);

  function profileNameError(name, exceptId = null) {
    if (!name) return "Enter a display name.";
    if (profiles.list.some((p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase())) {
      return "That name is already in use.";
    }
    return "";
  }

  function showProfileNameError(input, errorId, message) {
    const error = $(`#${errorId}`);
    if (error) { error.textContent = message; error.hidden = false; }
    if (input) input.focus();
  }

  function clearProfileNameError(input, errorId) {
    const error = $(`#${errorId}`);
    if (error) { error.hidden = true; error.textContent = ""; }
    if (input) input.removeAttribute("aria-invalid");
  }

  async function purgeProfileData(id) {
    if (repo) await repo.flush();
    const tombstones = readTombstones();
    tombstones.add(id);
    writeTombstones(tombstones);
    try { await apiJSON(profileURL(id), { method: "DELETE" }); } catch {}
    const scoped = createStorageAdapter((resource) => scopedKey(id, resource));
    DATA_RESOURCES.forEach((resource) => scoped.remove(resource));
    await scoped.flush();
    if (id === "default") {
      ["players", "active", "recent", "profile"].forEach((resource) => legacyAdapter.remove(resource));
      await legacyAdapter.flush();
    }
  }

  async function activateProfile(id, { persist = true, message = "" } = {}) {
    const next = profiles.list.find((p) => p.id === id);
    if (!next) return false;
    if (playId) {
      toast("Finish or leave this game before switching profiles.");
      return false;
    }
    const token = ++profileToken;
    profiles.activeId = next.id;
    if (persist) {
      await saveProfiles();
      try {
        await apiJSON("/profiles", { method: "POST", body: JSON.stringify({ id: next.id, name: next.name, initials: next.initials }) });
      } catch {}
    }
    if (repo) await repo.flush();
    const nextRepo = createRepositoryFor(next.id);
    repo = nextRepo;
    const ready = await hydrate(nextRepo, next.id, token);
    setAppLoading(false);
    if (!ready || token !== profileToken) return false;

    profile = next;
    applyProfileChrome();
    renderSlots();
    renderFirstThrower();
    if (view === "home") renderHome();
    else if (view === "hub") renderHub();
    else { renderStats(); renderProfile(); }
    if (message) toast(message);
    return true;
  }

  function openProfileSwitcher() {
    if (playId) {
      toast("Finish or leave this game before switching profiles.");
      return;
    }
    const rows = profiles.list.map((p) => {
      const isActive = p.id === profiles.activeId;
      const initials = p.initials || initialsOf(p.name);
      return `
        <div class="profilerow ${isActive ? "is-active" : ""}">
          <button type="button" class="profilerow__main" data-switch-profile="${esc(p.id)}"
            aria-current="${isActive ? "true" : "false"}">
            <span class="profilerow__avatar">${esc(initials)}</span>
            <span class="profilerow__body">
              <span class="profilerow__name">${esc(p.name)}</span>
              <span class="profilerow__meta">${isActive ? "Current profile" : "Switch to this profile"}</span>
            </span>
            ${isActive ? `<span class="profilerow__check" aria-hidden="true">${ICON.check}</span>` : ""}
          </button>
          ${profiles.list.length > 1 ? `
            <button type="button" class="iconbtn iconbtn--danger profilerow__del" data-delete-profile="${esc(p.id)}"
              aria-label="Delete ${esc(p.name)}">${ICON.trash}</button>` : ""}
        </div>`;
    }).join("");

    openSheet("Profiles", `
      <p class="note">Each profile keeps its own sessions, results, and added players.</p>
      <div class="proflist">${rows}</div>
      <button type="button" class="btn btn--ghost btn--block" id="pf-add">+ Add profile</button>
      <div class="sheet__actions">
        <button type="button" class="btn btn--ghost" id="pf-switch-close">Close</button>
        <button type="button" class="btn btn--primary" id="pf-view-stats">Profile &amp; stats</button>
      </div>`);

    $$("[data-switch-profile]", $("#sheet-body")).forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-switch-profile");
        if (id === profiles.activeId) { closeSheet(); return; }
        const next = profiles.list.find((p) => p.id === id);
        btn.disabled = true;
        const switched = await activateProfile(id, { message: `Now playing as ${next ? next.name : "this profile"}` });
        if (switched) closeSheet();
        else btn.disabled = false;
      });
    });
    $$("[data-delete-profile]", $("#sheet-body")).forEach((btn) => {
      btn.addEventListener("click", () => openDeleteProfile(btn.getAttribute("data-delete-profile")));
    });
    $("#pf-add").addEventListener("click", openNewProfile);
    $("#pf-switch-close").addEventListener("click", closeSheet);
    $("#pf-view-stats").addEventListener("click", () => {
      closeSheet();
      if (view !== "stats") location.hash = "#/stats";
    });
    const focusRow = $(".profilerow.is-active .profilerow__main") || $(".profilerow__main");
    if (focusRow) setTimeout(() => { if (!$("#sheet").hidden) focusRow.focus(); }, 240);
  }

  function openNewProfile() {
    openSheet("New profile", `
      <p class="note">Each profile keeps its own sessions, results, and added players.</p>
      <div class="field">
        <label class="field__label" for="pf-name-input">Display name</label>
        <input class="input" id="pf-name-input" type="text" value="" autocomplete="off" maxlength="40">
        <span class="field__hint field__hint--error" id="pf-name-error" hidden></span>
      </div>
      <div class="sheet__actions">
        <button type="button" class="btn btn--ghost" id="pf-create-cancel">Cancel</button>
        <button type="button" class="btn btn--primary" id="pf-create-save">Create profile</button>
      </div>`);
    const input = $("#pf-name-input");
    setTimeout(() => input.focus(), 240);
    input.addEventListener("input", () => clearProfileNameError(input, "pf-name-error"));
    const create = async () => {
      const name = cleanProfileName(input.value);
      const error = profileNameError(name);
      if (error) { showProfileNameError(input, "pf-name-error", error); return; }
      const record = { id: newProfileId(), name, initials: initialsOf(name) };
      profiles.list.push(record);
      $("#pf-create-save").disabled = true;
      const switched = await activateProfile(record.id, { message: `Now playing as ${name}` });
      if (switched) closeSheet();
      else {
        profiles.list = profiles.list.filter((p) => p.id !== record.id);
        await saveProfiles();
        $("#pf-create-save").disabled = false;
      }
    };
    $("#pf-create-save").addEventListener("click", create);
    $("#pf-create-cancel").addEventListener("click", openProfileSwitcher);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") create(); });
  }

  function openDeleteProfile(id) {
    const record = profiles.list.find((p) => p.id === id);
    if (!record) return;
    if (profiles.list.length <= 1) { toast("Keep at least one profile."); return; }
    openSheet("Delete profile?", `
      <p class="note">Delete <strong>${esc(record.name)}</strong>? This removes their sessions, results, and added players from this device. This can't be undone.</p>
      <div class="sheet__actions">
        <button type="button" class="btn btn--ghost" id="pf-del-cancel">Cancel</button>
        <button type="button" class="btn btn--danger" id="pf-del-confirm">Delete profile</button>
      </div>`);
    $("#pf-del-cancel").addEventListener("click", openProfileSwitcher);
    $("#pf-del-confirm").addEventListener("click", async () => {
      const wasActive = profiles.activeId === id;
      profiles.list = profiles.list.filter((p) => p.id !== id);
      const next = wasActive ? profiles.list[0] : activeProfile();
      profiles.activeId = next.id;
      $("#pf-del-confirm").disabled = true;
      await saveProfiles();
      await purgeProfileData(id);
      if (wasActive) {
        const switched = await activateProfile(next.id, { persist: false, message: `Now playing as ${next.name}` });
        if (switched) closeSheet();
      } else {
        toast("Profile deleted");
        openProfileSwitcher();
      }
    });
  }

  function openRenameProfile() {
    const current = activeProfile();
    if (!current) return;
    openSheet("Edit display name", `
      <p class="note">This name shows in the greeting, profile chip, and profile page for this profile.</p>
      <div class="field">
        <label class="field__label" for="rename-input">Display name</label>
        <input class="input" id="rename-input" type="text" value="${esc(current.name)}" autocomplete="off" maxlength="40">
        <span class="field__hint field__hint--error" id="rename-error" hidden></span>
      </div>
      <div class="sheet__actions">
        <button type="button" class="btn btn--ghost" id="rename-cancel">Cancel</button>
        <button type="button" class="btn btn--primary" id="rename-save">Save name</button>
      </div>`);
    const input = $("#rename-input");
    setTimeout(() => { input.focus(); input.select(); }, 240);
    input.addEventListener("input", () => clearProfileNameError(input, "rename-error"));
    const save = async () => {
      const name = cleanProfileName(input.value);
      const error = profileNameError(name, current.id);
      if (error) { showProfileNameError(input, "rename-error", error); return; }
      current.name = name;
      current.initials = initialsOf(name);
      profile = current;
      await saveProfiles();
      applyProfileChrome();
      renderProfile();
      if (view === "home") renderHome();
      closeSheet();
      toast("Name updated");
    };
    $("#rename-save").addEventListener("click", save);
    $("#rename-cancel").addEventListener("click", closeSheet);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
  }

  /* ---------- stats ---------- */
  const statValues = (rows, fn) => rows
    .map((r) => ({ r, v: fn(r) }))
    .filter((x) => Number.isFinite(x.v));
  const statBest = (rows, fn) => {
    const values = statValues(rows, fn).map((x) => x.v);
    return values.length ? Math.max(...values) : null;
  };
  const statMean = (rows, fn) => {
    const values = statValues(rows, fn).map((x) => x.v);
    return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
  };
  const setText = (sel, value) => {
    const el = $(sel);
    if (el) el.textContent = value;
  };
  const fmt1 = (value) => (Number.isFinite(value) ? value.toFixed(1) : "—");
  const fmt2 = (value) => (Number.isFinite(value) ? value.toFixed(2) : "—");
  const fmtPct = (value) => (Number.isFinite(value) ? `${Math.round(value)}%` : "—");
  const toggleCard = (emptySel, bodySel, hasData) => {
    const empty = $(emptySel);
    const body = $(bodySel);
    if (empty) empty.hidden = hasData;
    if (body) body.hidden = !hasData;
  };

  const monthDay = (at) => new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const fullDate = (at) => new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const chartLabel = (r) => String(r.label || r.type || "Session");

  function trendChartHtml(rows, valueOf, opts = {}) {
    const points = statValues(rows, valueOf)
      .map(({ r, v }, idx) => ({
        r, v,
        at: Number.isFinite(r.at) ? r.at : Date.now() - idx * 6 * 60 * 60 * 1000,
      }))
      .sort((a, b) => a.at - b.at);
    if (!points.length) return { count: 0, html: "" };
    const format = opts.format || ((v) => String(v));
    const axisFormat = opts.axisFormat || format;
    const values = points.map((p) => p.v);
    let lo, hi;
    if (opts.scale === "percent") {
      lo = 0;
      hi = 100;
    } else {
      lo = Math.min(...values);
      hi = Math.max(...values);
      const pad = lo === hi ? Math.max(Math.abs(lo) * 0.1, 1) : (hi - lo) * 0.15;
      lo = Math.max(0, lo - pad);
      hi += pad;
    }
    const W = 320, H = 132, L = 34, R = 8, T = 12, B = 24;
    const plotW = W - L - R;
    const plotH = H - T - B;
    const first = points[0].at;
    const last = points[points.length - 1].at;
    const span = last - first;
    const xOf = (i) => {
      if (points.length === 1) return L + plotW / 2;
      if (span > 0) return L + ((points[i].at - first) / span) * plotW;
      return L + (i / (points.length - 1)) * plotW;
    };
    const yOf = (v) => T + (1 - (v - lo) / (hi - lo)) * plotH;
    const coords = points.map((p, i) => ({ x: xOf(i), y: yOf(p.v), p }));
    const line = coords.map((c, i) => `${i ? "L" : "M"}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
    const area = coords.length > 1
      ? `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${(T + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(T + plotH).toFixed(1)} Z`
      : "";
    const grid = [0, 0.5, 1].map((t) => {
      const v = hi - (hi - lo) * t;
      const y = yOf(v);
      return `<line class="trend__grid" x1="${L}" y1="${y.toFixed(1)}" x2="${W - R}" y2="${y.toFixed(1)}"></line>
        <text class="trend__axis" x="${L - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${esc(axisFormat(v))}</text>`;
    }).join("");
    const dots = coords.map((c, i) => {
      const isLatest = i === coords.length - 1;
      const extra = opts.dotClassOf ? opts.dotClassOf(c.p.r) : "";
      const value = format(c.p.v);
      return `<circle class="trend__dot${isLatest ? " trend__dot--latest" : ""}${extra ? ` ${extra}` : ""}" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${isLatest ? 4 : 3}" tabindex="-1"><title>${esc(`${chartLabel(c.p.r)} · ${fullDate(c.p.at)} · ${value}`)}</title></circle>`;
    }).join("");
    const firstLabel = monthDay(first);
    const lastLabel = monthDay(last);
    const range = firstLabel === lastLabel ? firstLabel : `${firstLabel} – ${lastLabel}`;
    const xLabels = points.length === 1
      ? `<text class="trend__axis" x="${(L + plotW / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(firstLabel)}</text>`
      : `<text class="trend__axis" x="${L}" y="${H - 6}" text-anchor="start">${esc(firstLabel)}</text>
         <text class="trend__axis" x="${W - R}" y="${H - 6}" text-anchor="end">${esc(lastLabel)}</text>`;
    const latest = points[points.length - 1];
    const aria = `${opts.title || "Trend"} over ${points.length} ${points.length === 1 ? "session" : "sessions"} from ${range}. Latest ${format(latest.v)}.`;
    return {
      count: points.length,
      html: `
      <div class="trend__meta"><span>${points.length} ${points.length === 1 ? "session" : "sessions"} · latest ${esc(format(latest.v))}</span><span>${esc(range)}</span></div>
      <svg class="trend__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">
        ${grid}
        ${area ? `<path class="trend__area" d="${area}"></path>` : ""}
        ${coords.length > 1 ? `<path class="trend__line" d="${line}"></path>` : ""}
        ${dots}
        ${xLabels}
      </svg>`,
    };
  }

  function fillTrend(chartSel, hintSel, rows, valueOf, opts = {}) {
    const el = $(chartSel);
    if (!el) return 0;
    const chart = trendChartHtml(rows, valueOf, opts);
    el.innerHTML = chart.html;
    el.hidden = chart.count === 0;
    if (hintSel) $(hintSel).hidden = chart.count === 0;
    return chart.count;
  }

  function renderStats() {
    if (!$("#st-results-body")) return;
    const matches = matchRows();
    const practice = practiceRows();
    const cricket = matches.filter((r) => typeOf(r) === "Cricket");

    /* summary strip */
    $("#st-matches").textContent = String(matches.length);
    $("#st-matches-note").textContent = matches.length ? "01, Cricket and Around the world" : "Finish one to start the count";
    $("#st-practice").textContent = String(practice.length);
    $("#st-practice-note").textContent = practice.length ? "Target, Checkout and Game of 9" : "Finish one to start the count";

    let bestAvg = null, bestAvgFrom = "";
    matches.forEach((r) => {
      const a = avgOf(r);
      if (a !== null && (bestAvg === null || a > bestAvg)) {
        bestAvg = a;
        bestAvgFrom = `${r.when} · ${r.type}`;
      }
    });
    $("#st-avg").textContent = bestAvg === null ? "—" : bestAvg.toFixed(1);
    $("#st-avg-note").textContent = bestAvg === null ? "No 01 games yet" : bestAvgFrom;

    let bestRate = null, bestRateFrom = "";
    practice.forEach((r) => {
      const v = rateOf(r);
      if (v !== null && (bestRate === null || v > bestRate)) {
        bestRate = v;
        bestRateFrom = `${r.label} · ${r.when}`;
      }
    });
    $("#st-rate").textContent = bestRate === null ? "—" : `${bestRate}%`;
    $("#st-rate-note").textContent = bestRate === null ? "No Target sessions yet" : bestRateFrom;

    /* 01 — 3-dart average over time */
    setText("#st-01-best", fmt1(statBest(matches, avgOf)));
    setText("#st-01-avg", fmt1(statMean(matches, avgOf)));
    const has01 = fillTrend("#st-01-chart", "#st-01-hint", matches, avgOf, {
      format: (v) => v.toFixed(1),
      title: "01 3-dart average",
    }) > 0;
    toggleCard("#st-01-empty", "#st-01-body", has01);

    /* Cricket — MPR over time */
    setText("#st-cricket-best", fmt2(statBest(cricket, mprOf)));
    setText("#st-cricket-avg", fmt2(statMean(cricket, mprOf)));
    const hasCricket = fillTrend("#st-cricket-chart", "#st-cricket-hint", cricket, mprOf, {
      format: (v) => v.toFixed(2),
      title: "Cricket marks per round",
    }) > 0;
    toggleCard("#st-cricket-empty", "#st-cricket-body", hasCricket);

    /* Around the World — hit rate over time */
    const atw = matches.filter((r) => typeOf(r) === "Around the world");
    setText("#st-atw-best", fmtPct(statBest(atw, atwRateOf)));
    setText("#st-atw-avg", fmtPct(statMean(atw, atwRateOf)));
    const hasAtw = fillTrend("#st-atw-chart", "#st-atw-hint", atw, atwRateOf, {
      format: fmtPct, axisFormat: (v) => `${Math.round(v)}%`, scale: "percent", title: "Around the World hit rate",
    }) > 0;
    toggleCard("#st-atw-empty", "#st-atw-body", hasAtw);

    /* Target — session hit rate over time */
    const targets = practice.filter((r) => typeOf(r) === "Practice · Target");
    setText("#st-target-best", fmtPct(statBest(targets, rateOf)));
    setText("#st-target-avg", fmtPct(statMean(targets, rateOf)));
    const hasTargets = fillTrend("#st-target-chart", "#st-target-hint", targets, rateOf, {
      format: fmtPct, axisFormat: (v) => `${Math.round(v)}%`, scale: "percent", title: "Target hit rate",
    }) > 0;
    toggleCard("#st-target-empty", "#st-target-body", hasTargets);

    /* Checkout — cleared vs stopped, clear rate, fastest and average darts */
    const checkouts = practice.filter((r) => typeOf(r) === "Practice · Checkout");
    const cleared = checkouts.filter((r) => r.result === "Cleared");
    const clearDarts = statValues(cleared, clearDartsOf);
    const fastestClear = clearDarts.length
      ? clearDarts.reduce((best, x) => (x.v < best.v ? x : best))
      : null;
    setText("#st-co-cleared", String(cleared.length));
    setText("#st-co-stopped", String(checkouts.length - cleared.length));
    setText("#st-co-rate", checkouts.length
      ? fmtPct((cleared.length / checkouts.length) * 100) : "—");
    setText("#st-co-fastest", fastestClear
      ? `${fastestClear.v} ${fastestClear.v === 1 ? "dart" : "darts"} · ${fastestClear.r.label}`
      : "—");
    setText("#st-co-avg", clearDarts.length
      ? `${fmt1(clearDarts.reduce((sum, x) => sum + x.v, 0) / clearDarts.length)} darts`
      : "—");
    const hasCheckouts = fillTrend("#st-checkout-chart", "#st-checkout-hint", checkouts, checkoutDartsOf, {
      format: (v) => `${Math.round(v)} ${Math.round(v) === 1 ? "dart" : "darts"}`,
      axisFormat: (v) => String(Math.round(v)),
      title: "Checkout darts used",
      dotClassOf: (r) => (r.result === "Cleared" ? "" : "trend__dot--miss"),
    }) > 0;
    toggleCard("#st-checkout-empty", "#st-checkout-body", hasCheckouts);

    /* Game of 9 — sessions, clear rate, darts and targets cleared */
    const g9 = g9Rows();
    const g9Cleared = g9.filter((r) => r.result === "Cleared");
    const g9Darts = statValues(g9, g9DartsOf);
    const g9Fastest = statValues(g9Cleared, g9DartsOf)
      .reduce((best, x) => (best === null || x.v < best.v ? x : best), null);
    setText("#st-g9-sessions", String(g9.length));
    setText("#st-g9-cleared", String(g9Cleared.length));
    setText("#st-g9-rate", g9.length
      ? fmtPct((g9Cleared.length / g9.length) * 100) : "—");
    setText("#st-g9-fastest", g9Fastest
      ? `${g9Fastest.v} darts · ${g9VariantOf(g9Fastest.r)}` : "—");
    setText("#st-g9-darts", g9Darts.length
      ? `${fmt1(g9Darts.reduce((sum, x) => sum + x.v, 0) / g9Darts.length)} darts`
      : "—");
    setText("#st-g9-targets", fmt1(statMean(g9, g9ClearedOf)));
    const hasG9 = fillTrend("#st-g9-chart", "#st-g9-hint", g9, g9PctOf, {
      format: fmtPct, axisFormat: (v) => `${Math.round(v)}%`, scale: "percent", title: "Game of 9 targets cleared",
    }) > 0;
    toggleCard("#st-g9-empty", "#st-g9-body", hasG9);

    /* all results */
    $("#st-results-empty").hidden = recent.length > 0;
    $("#st-results-wrap").hidden = recent.length === 0;
    $("#st-results-body").innerHTML = recent.map(resultRowHtml).join("");
  }

  /* ---------- sheet ---------- */
  let sheetHideTimer = 0;
  function openSheet(title, bodyHtml) {
    clearTimeout(sheetHideTimer);
    $("#sheet-title").textContent = title;
    $("#sheet-body").innerHTML = bodyHtml;
    $("#scrim").hidden = false;
    $("#sheet").hidden = false;
    requestAnimationFrame(() => {
      $("#scrim").classList.add("is-open");
      $("#sheet").classList.add("is-open");
    });
  }
  function closeSheet() {
    const sc = $("#scrim"), sh = $("#sheet");
    sh.classList.remove("is-open");
    sc.classList.remove("is-open");
    clearTimeout(sheetHideTimer);
    sheetHideTimer = setTimeout(() => { sh.hidden = true; sc.hidden = true; }, 220);
    if (goHomeAfterSheet) {
      goHomeAfterSheet = false;
      const back = routeFor(view);
      if ((location.hash || "") !== back) location.hash = back;
    }
  }

  /* ---------- sheet: new player ---------- */
  function openNewPlayer(slotIndex = null) {
    openSheet("Add a player", `
      <p class="note">New players join the list you can pick in either slot.</p>
      <div class="field">
        <label class="field__label" for="new-player-name">Player name</label>
        <input class="input" id="new-player-name" type="text" placeholder="e.g. Jamie Fox" autocomplete="off" maxlength="40">
      </div>
      <div class="sheet__actions">
        <button type="button" class="btn btn--ghost" id="np-cancel">Cancel</button>
        <button type="button" class="btn btn--primary" id="np-save">Save player</button>
      </div>`);
    const input = $("#new-player-name");
    setTimeout(() => input.focus(), 240);

    const save = () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      const existing = players.find((p) => p.name.toLowerCase() === name.toLowerCase());
      const player = existing || {
        id: `u${Date.now().toString(36)}`,
        name,
        short: name.split(/\s+/)[0],
        initials: initialsOf(name),
      };
      if (!existing) {
        players.push(player);
        repo.players.save(players);
      }
      if (slotIndex !== null) {
        state.slots[slotIndex] = { source: "known", playerId: player.id, difficulty: "steady" };
        renderSlots(); renderFirstThrower();
      }
      renderProfile();
      closeSheet();
      toast(`${name} added`);
    };
    $("#np-save").addEventListener("click", save);
    $("#np-cancel").addEventListener("click", closeSheet);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
  }

  /* ---------- sheet: resume ---------- */
  function openResume(id) {
    const g = active.find((x) => x.id === id);
    if (!g) return;
    let rows = "";
    let title = "";
    if (g.kind === "practice") {
      if (g.practice === "target") {
        title = `Target practice · ${targetName(g.target)}`;
        rows = `<div class="summary__row"><dt>Progress</dt><dd>${g.done} / ${g.darts} darts</dd></div>`;
      } else if (g.practice === "checkout") {
        title = `Checkout practice · ${g.score}`;
        rows = `<div class="summary__row"><dt>Darts used</dt><dd>${g.darts}</dd></div>`;
      } else {
        const seq = Array.isArray(g.seq) && g.seq.length ? g.seq : g9Seq(g.variant);
        const idx = Math.max(0, Math.min(seq.length, Number(g.idx) || 0));
        title = `Game of 9 · ${g.variant === "501" ? "501 order" : "Cricket order"}`;
        rows = `
          <div class="summary__row"><dt>Targets cleared</dt><dd>${idx} / ${seq.length}</dd></div>
          <div class="summary__row"><dt>Now</dt><dd>${esc(g9TargetName(seq[idx] || "bull"))}${idx >= seq.length ? " · complete" : ""}</dd></div>`;
      }
      rows += `<div class="summary__row"><dt>Started</dt><dd>${timeAgo(g.startedAt)}</dd></div>`;
    } else {
      const label = badgeOf(g);
      const pts = Array.isArray(g.points) ? g.points : [0, 0];
      title = `${g.players[0].name} vs ${g.players[1].name}`;
      rows = `
        <div class="summary__row"><dt>Type</dt><dd>${esc(label)}</dd></div>
        <div class="summary__row"><dt>Match length</dt><dd>${LEN_LABEL[g.len]}</dd></div>
        <div class="summary__row"><dt>Score</dt><dd>${g.legsWon[0]}–${g.legsWon[1]}</dd></div>
        ${g.game === "cricket"
          ? `<div class="summary__row"><dt>Points</dt><dd>${pts[0]} · ${pts[1]}</dd></div>` : ""}
        ${g.game === "atw"
          ? `<div class="summary__row"><dt>Marks</dt><dd>${Number(g.marksPer) === 3 ? "3 per number" : "1 per number"}</dd></div>` : ""}
        <div class="summary__row"><dt>Started</dt><dd>${timeAgo(g.startedAt)}</dd></div>`;
    }
    openSheet("Resume", `
      <div>
        <p style="font-weight:600;color:var(--text-strong);margin-bottom:var(--s2)">${esc(title)}</p>
        <dl class="summary">${rows}</dl>
      </div>
      <button type="button" class="btn btn--primary btn--block" id="resume-open">Resume ${g.kind === "match" ? "match" : "session"}</button>`);
    $("#resume-open").addEventListener("click", () => { closeSheet(); location.hash = `#/play/${g.id}`; });
  }

  /* ---------- start handlers ---------- */
  function startMatch() {
    const [s0, s1] = state.slots;
    if (s0.source === "known" && !playerById(s0.playerId)) {
      toast("Add a player for Player 1 first.");
      openNewPlayer(0);
      return;
    }
    if (s1.source === "known" && !playerById(s1.playerId)) {
      toast("Add a player for Player 2 first.");
      openNewPlayer(1);
      return;
    }
    if (s0.source === "known" && s1.source === "known" && s0.playerId === s1.playerId) {
      toast("Pick two different players, or make one an AI opponent.");
      return;
    }
    const toCfg = (slot) => {
      if (slot.source === "ai") {
        const d = diffById(slot.difficulty) || defaultOpponent();
        return {
          name: `AI · ${d.label}`, short: `AI · ${d.label}`, kind: "ai",
          difficulty: d.difficulty || d.id, opponent: d.id,
        };
      }
      const p = playerById(slot.playerId);
      if (!p) return { name: "Player", short: "Player", kind: "known" };
      return { name: p.name, short: p.short || p.name, kind: "known" };
    };
    const game = {
      id: `g-${Date.now()}`,
      kind: "match",
      game: state.game,
      starting: state.game === "01" ? state.score : undefined,
      marksPer: state.game === "atw" ? state.atwMarks : undefined,
      atwMarks: state.game === "atw" ? [0, 0] : undefined,
      len: state.len,
      players: [toCfg(state.slots[0]), toCfg(state.slots[1])],
      legsWon: [0, 0],
      firstThrower: state.firstThrower,
      startedAt: Date.now(),
    };
    active.unshift(game);
    repo.activeGames.save(active);
    renderActive();
    renderHubActive();
    location.hash = `#/play/${game.id}`;
  }

  function makeTargetGame(target, darts) {
    return {
      id: `g-${Date.now()}`, kind: "practice", practice: "target",
      target, darts, done: 0, hits: 0, streak: 0, best: 0,
      current: [], startedAt: Date.now(),
    };
  }

  function makeCheckoutGame(score) {
    return {
      id: `g-${Date.now()}`, kind: "practice", practice: "checkout",
      score, remaining: score, darts: 0, visits: 0,
      current: [], visitStart: score, startedAt: Date.now(),
    };
  }

  /* Game of 9 · A-Z Darts practice routine — full pie, 9 in a row, bull by rounds */
  const G9_CRICKET = ["20", "19", "18", "17", "16", "15", "bull"];
  const G9_501 = Array.from({ length: 20 }, (_, i) => String(i + 1)).concat("bull");
  const g9Seq = (variant) => (variant === "501" ? G9_501.slice() : G9_CRICKET.slice());
  const g9TargetName = (t) => (t === "bull" ? "Bull" : t);

  function makeGame9Game(variant) {
    const order = variant === "501" ? "501" : "cricket";
    return {
      id: `g-${Date.now()}`, kind: "practice", practice: "game9",
      variant: order, seq: g9Seq(order),
      idx: 0, streak: 0, best: 0, cleared: 0, darts: 0,
      visit: [], bullStreak: 0, startedAt: Date.now(),
    };
  }

  function startPractice() {
    const game = state.practice === "target"
      ? makeTargetGame($("#target-select").value, state.darts)
      : state.practice === "checkout"
        ? makeCheckoutGame(Number($("#checkout-select").value))
        : makeGame9Game(state.g9variant);
    launchPractice(game);
  }

  function launchPractice(game) {
    active.unshift(game);
    repo.activeGames.save(active);
    renderActive();
    renderHubActive();
    location.hash = `#/play/${game.id}`;
  }

  function startHubPractice() {
    const game = hubMode === "target"
      ? makeTargetGame($("#hub-target-select").value, hubDarts)
      : hubMode === "checkout"
        ? makeCheckoutGame(Number($("#hub-checkout-select").value))
        : makeGame9Game(hubG9Variant);
    launchPractice(game);
  }

  /* ---------- play view: practice screens ---------- */
  function normalizePlay(g) {
    if (g.kind === "match") { normalizeMatch(g); return; }
    if (g.practice === "target") {
      g.darts = g.darts || 20;
      g.done = g.done || 0;
      g.hits = g.hits ?? (g.done ? Math.round(g.done * 0.6) : 0);
      g.streak = g.streak ?? 0;
      g.best = g.best ?? g.hits;
      g.current = Array.isArray(g.current) ? g.current : [];
    } else if (g.practice === "checkout") {
      g.score = Number(g.score);
      g.remaining = Number(g.remaining ?? g.score);
      g.darts = g.darts || 0;
      g.visits = g.visits || 0;
      g.current = Array.isArray(g.current) ? g.current : [];
      g.visitStart = g.visitStart ?? g.remaining;
    } else {
      g.variant = g.variant === "501" ? "501" : "cricket";
      const seq = g9Seq(g.variant);
      if (!Array.isArray(g.seq) || g.seq.length !== seq.length || g.seq.some((t, i) => t !== seq[i])) g.seq = seq;
      g.idx = Math.max(0, Math.min(seq.length, Math.floor(Number(g.idx)) || 0));
      g.streak = Math.max(0, Math.min(9, Math.floor(Number(g.streak)) || 0));
      g.best = Math.max(g.streak, Math.floor(Number(g.best)) || 0);
      g.cleared = g.idx;
      g.darts = Math.max(0, Math.floor(Number(g.darts)) || 0);
      g.visit = Array.isArray(g.visit) ? g.visit.slice(0, 3).map((v) => (v ? 1 : 0)) : [];
      g.bullStreak = Math.max(0, Math.min(3, Math.floor(Number(g.bullStreak)) || 0));
    }
  }

  function normalizeMatch(g) {
    if (typeof g.turn !== "number") g.turn = typeof g.firstThrower === "number" ? g.firstThrower : 0;
    if (typeof g.legFirst !== "number") g.legFirst = g.turn;
    g.current = Array.isArray(g.current) ? g.current : [];
    g.history = Array.isArray(g.history) ? g.history : [];
    /* historical visits carry the player's name, not a setup slot index */
    g.history.forEach((h) => {
      if (!h.name && Number.isInteger(h.p) && g.players && g.players[h.p]) {
        h.name = playerShort(g, h.p);
      }
      delete h.p;
    });
    if (!Array.isArray(g.legsWon) || g.legsWon.length !== 2) g.legsWon = [0, 0];
    if (g.game === "atw") {
      g.marksPer = Number(g.marksPer) === 3 ? 3 : 1;
      g.progress = Array.isArray(g.progress) && g.progress.length === 2
        ? g.progress.map((n) => Math.max(0, Math.min(21, Math.floor(Number(n)) || 0)))
        : [0, 0];
      g.atwMarks = Array.isArray(g.atwMarks) && g.atwMarks.length === 2
        ? g.atwMarks.map((n) => Math.max(0, Math.min(g.marksPer - 1, Math.floor(Number(n)) || 0)))
        : [0, 0];
      g.stats = Array.isArray(g.stats) && g.stats.length === 2
        ? g.stats.map((s) => ({
          hits: Math.max(0, Math.floor(Number(s && s.hits) || 0)),
          darts: Math.max(0, Math.floor(Number(s && s.darts) || 0)),
        }))
        : [{ hits: 0, darts: 0 }, { hits: 0, darts: 0 }];
      return;
    }
    if (g.game === "cricket") {
      g.points = Array.isArray(g.points) && g.points.length === 2
        ? g.points.map((n) => Number(n) || 0) : [0, 0];
      g.marks = Array.isArray(g.marks) && g.marks.length === 2
        ? g.marks.map((m) => {
          const o = emptyMarks();
          CRICKET_KEYS.forEach((k) => {
            const n = m ? Number(m[k]) : 0;
            if (n > 0) o[k] = Math.floor(n);
          });
          return o;
        })
        : [emptyMarks(), emptyMarks()];
      g.stats = Array.isArray(g.stats) && g.stats.length === 2
        ? g.stats.map((s) => ({
          marks: Number(s && s.marks) > 0 ? Math.floor(Number(s.marks)) : 0,
          darts: Number(s && s.darts) > 0 ? Math.floor(Number(s.darts)) : 0,
        }))
        : [{ marks: 0, darts: 0 }, { marks: 0, darts: 0 }];
      g.visitStart = g.points[g.turn];
      return;
    }
    g.starting = Number(g.starting) || 501;
    if (!Array.isArray(g.scores) || g.scores.length !== 2) g.scores = [g.starting, g.starting];
    if (typeof g.visitStart !== "number") g.visitStart = g.scores[g.turn];
    if (!Array.isArray(g.stats) || g.stats.length !== 2) g.stats = [{ scored: 0, darts: 0 }, { scored: 0, darts: 0 }];
    g.stats.forEach((s) => { s.scored = s.scored || 0; s.darts = s.darts || 0; });
  }

  const playTitle = (g) =>
    g.practice === "target" ? `Target practice · ${targetName(g.target)}`
      : g.practice === "checkout" ? `Checkout practice · ${g.score}`
        : `Game of 9 · ${g.variant === "501" ? "501 order" : "Cricket order"}`;

  const currentPlay = () => (playId ? active.find((x) => x.id === playId) : null);

  function targetHtml(g) {
    const pct = g.darts ? Math.min(100, Math.round((g.done / g.darts) * 100)) : 0;
    const rate = g.done ? Math.round((g.hits / g.done) * 100) : 0;
    const full = g.current.length >= 3;
    const idx = full ? "Visit complete" : `Dart ${g.current.length + 1} of 3`;
    const slots = [0, 1, 2].map((i) => {
      const v = g.current[i];
      const cls = v === 1 ? " is-hit" : v === 0 ? " is-miss" : "";
      const inner = v === 1 ? ICON.check : v === 0 ? ICON.cross : "";
      return `<span class="dslot${cls}" aria-hidden="true">${inner}</span>`;
    }).join("");
    const srVisit = g.current.length
      ? g.current.map((v) => (v ? "hit" : "miss")).join(", ")
      : "no darts yet";
    return `
      <div class="playhero">
        <span class="playhero__label">Focus segment</span>
        <span class="playhero__big">${esc(targetName(g.target))}</span>
        <div class="playhero__foot">
          <span class="playhero__sub od-nowrap">${g.done} / ${g.darts} darts</span>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${g.darts}" aria-valuenow="${g.done}" aria-label="Darts thrown">
            <div class="progress__fill" style="width:${pct}%"></div>
          </div>
        </div>
      </div>
      <div class="playstats">
        <div class="od-stat"><span class="stat__value">${g.hits}</span><span class="stat__label">Hits</span></div>
        <div class="od-stat"><span class="stat__value">${rate}<span class="stat__unit">%</span></span><span class="stat__label">Hit rate</span></div>
        <div class="od-stat"><span class="stat__value">${g.streak}</span><span class="stat__label">Streak</span></div>
        <div class="od-stat"><span class="stat__value">${g.best}</span><span class="stat__label">Best streak</span></div>
      </div>
      <section class="visit" aria-labelledby="visit-h">
        <div class="visit__head">
          <h2 class="visit__title" id="visit-h">This visit</h2>
          <span class="visit__idx od-nowrap">${idx}</span>
        </div>
        <div class="visit__darts">${slots}</div>
        <span class="sr-only">This visit: ${srVisit}</span>
        <div class="visit__actions">
          <button type="button" class="bigbtn bigbtn--hit" data-t="hit" data-focus-key="hit">${ICON.check}<span>Hit</span></button>
          <button type="button" class="bigbtn bigbtn--miss" data-t="miss" data-focus-key="miss">${ICON.cross}<span>Miss</span></button>
        </div>
      </section>`;
  }

  function padSection() {
    let padBtns = "";
    for (let n = 1; n <= 20; n++) {
      padBtns += `<button type="button" class="pad__btn" data-pad="${n}" data-focus-key="pad-${n}">${n}</button>`;
    }
    const multBtn = (v, label) =>
      `<button type="button" class="seg__btn ${playMult === v ? "is-active" : ""}" data-mult="${v}"
        aria-pressed="${playMult === v}" data-focus-key="m${v}">${label}</button>`;
    return `
      <section class="pad" aria-label="Enter your dart">
        <div class="seg" role="group" aria-label="Dart value">
          ${multBtn(1, "Single")}${multBtn(2, "Double")}${multBtn(3, "Treble")}
        </div>
        <div class="pad__grid">${padBtns}</div>
        <div class="pad__extras">
          <button type="button" class="pad__extra" data-fixed="25" data-focus-key="fx25">Single bull</button>
          <button type="button" class="pad__extra" data-fixed="50" data-focus-key="fx50">Double bull</button>
          <button type="button" class="pad__extra" data-miss="1" data-focus-key="fmiss">Miss</button>
        </div>
      </section>`;
  }

  function checkoutHtml(g) {
    const route = routeForScore(g.remaining);
    const full = g.current.length >= 3;
    const idx = full ? "Visit complete" : `Dart ${g.current.length + 1} of 3`;
    const chips = [0, 1, 2].map((i) => {
      const d = g.current[i];
      return d
        ? `<span class="dchip">${esc(d.label)}</span>`
        : `<span class="dchip is-empty" aria-hidden="true">–</span>`;
    }).join("");
    const srVisit = g.current.length
      ? g.current.map((d) => d.label).join(", ")
      : "no darts yet";
    return `
      <div class="playhero">
        <span class="playhero__label">Remaining</span>
        <span class="playhero__big">${g.remaining}</span>
        <span class="playhero__route od-nowrap">${route ? `Aim: ${esc(route)}` : ""}</span>
        <div class="playhero__foot">
          <span class="playhero__sub od-nowrap">Visit ${g.visits + 1} · ${g.darts} darts used</span>
        </div>
      </div>
      <section class="visit" aria-labelledby="visit-h">
        <div class="visit__head">
          <h2 class="visit__title" id="visit-h">This visit</h2>
          <span class="visit__idx od-nowrap">${idx}</span>
        </div>
        <div class="visit__darts">${chips}</div>
        <span class="sr-only">This visit: ${srVisit}</span>
      </section>
      ${padSection()}`;
  }

  function game9Html(g) {
    const seq = g.seq;
    const total = seq.length;
    const idx = Math.max(0, Math.min(total, g.idx));
    const target = seq[Math.min(idx, total - 1)];
    const isBull = target === "bull";
    const need = isBull ? 3 : 9;
    const filled = isBull ? g.bullStreak : g.streak;
    const pct = total ? Math.round((idx / total) * 100) : 0;
    const full = g.visit.length >= 3;
    const slots = [0, 1, 2].map((i) => {
      const v = g.visit[i];
      const cls = v === 1 ? " is-hit" : v === 0 ? " is-miss" : "";
      const inner = v === 1 ? ICON.check : v === 0 ? ICON.cross : "";
      return `<span class="dslot${cls}" aria-hidden="true">${inner}</span>`;
    }).join("");
    const chips = seq.map((t, i) => {
      const cls = i < idx ? " is-done" : i === idx ? " is-now" : "";
      return `<span class="g9chip${cls}">${t === "bull" ? "B" : esc(t)}</span>`;
    }).join("");
    const pips = Array.from({ length: need }, (_, i) =>
      `<span class="g9pip${i < filled ? " is-on" : ""}"></span>`).join("");
    const srVisit = g.visit.length
      ? g.visit.map((v) => (v ? (isBull ? "bull" : "hit") : "miss")).join(", ")
      : "no darts yet";
    const hint = isBull
      ? "A round counts with at least one bull — outer or inner. Three scoring rounds in a row clear it."
      : "Any single, double, or treble in the pie counts. A miss restarts the count for this number only.";
    return `
      <div class="playhero">
        <span class="playhero__label">Game of 9 · ${g.variant === "501" ? "501 order" : "Cricket order"}</span>
        <span class="playhero__big">${isBull ? "Bull" : esc(String(target))}</span>
        <span class="playhero__route od-nowrap">${isBull ? "1 bull per round · 3 rounds in a row" : "9 consecutive hits · full pie counts"}</span>
        <div class="playhero__foot">
          <span class="playhero__sub od-nowrap">Target ${Math.min(idx + 1, total)} of ${total} · ${g.darts} darts thrown</span>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${idx}" aria-label="Targets cleared">
            <div class="progress__fill" style="width:${pct}%"></div>
          </div>
        </div>
      </div>
      <div class="playstats">
        <div class="od-stat"><span class="stat__value">${filled}<span class="stat__unit">/${need}</span></span><span class="stat__label">${isBull ? "Rounds in a row" : "Hits in a row"}</span></div>
        <div class="od-stat"><span class="stat__value">${g.best}</span><span class="stat__label">Best streak</span></div>
        <div class="od-stat"><span class="stat__value">${g.darts}</span><span class="stat__label">Darts thrown</span></div>
        <div class="od-stat"><span class="stat__value">${idx}<span class="stat__unit">/${total}</span></span><span class="stat__label">Targets cleared</span></div>
      </div>
      <section class="g9board" aria-label="Game of 9 progress">
        <div class="g9ladder" aria-hidden="true">${chips}</div>
        <div class="g9need">
          <span class="g9need__label">${isBull ? "3 scoring rounds in a row" : "9 consecutive hits"}</span>
          <div class="g9rail${isBull ? " g9rail--bull" : ""}" role="group" aria-label="${isBull ? "Bull rounds banked" : "Consecutive hits"}">${pips}</div>
        </div>
        <p class="g9hint">${hint}</p>
      </section>
      <section class="visit" aria-labelledby="visit-h">
        <div class="visit__head">
          <h2 class="visit__title" id="visit-h">${isBull ? "This round" : "This visit"}</h2>
          <span class="visit__idx od-nowrap">${full ? "Visit complete" : `Dart ${g.visit.length + 1} of 3`}</span>
        </div>
        <div class="visit__darts">${slots}</div>
        <span class="sr-only">This visit: ${srVisit}</span>
        <div class="visit__actions">
          <button type="button" class="bigbtn bigbtn--hit" data-g9hit data-focus-key="g9hit">${ICON.check}<span>${isBull ? "Bull" : "Hit"}</span></button>
          <button type="button" class="bigbtn bigbtn--miss" data-g9miss data-focus-key="g9miss">${ICON.cross}<span>${isBull ? "No bull" : "Miss"}</span></button>
        </div>
      </section>`;
  }

  /* ---------- match play: scoreboard, history ---------- */
  const CRICKET_KEYS = ["20", "19", "18", "17", "16", "15", "b"];
  const emptyMarks = () => ({ "20": 0, "19": 0, "18": 0, "17": 0, "16": 0, "15": 0, b: 0 });
  const playerShort = (g, i) => (g.players[i] && (g.players[i].short || g.players[i].name)) || "";
  const historyName = (g, h) => h.name
    || (Number.isInteger(h.p) && g.players[h.p] ? playerShort(g, h.p) : "");
  const cricketClosedCount = (g, i) => CRICKET_KEYS.filter((k) => g.marks[i][k] >= 3).length;
  const cricketRounds = (g, i) => g.history.filter((h) => historyName(g, h) === playerShort(g, i)).length;
  const mprStr = (g, i) => {
    const rounds = cricketRounds(g, i);
    return (rounds ? g.stats[i].marks / rounds : 0).toFixed(2);
  };

  const atwStepLabel = (s) => (s >= 21 ? "Done" : s === 20 ? "Bull" : String(s + 1));
  const atwHitPct = (g, i) => (g.stats[i].darts ? Math.round((g.stats[i].hits / g.stats[i].darts) * 100) : 0);
  const atwNextLabel = (g, i) => (g.progress[i] >= 21
    ? "Done"
    : g.marksPer === 3
      ? `${atwStepLabel(g.progress[i])} · ${g.atwMarks[i] || 0}/3`
      : atwStepLabel(g.progress[i]));

  /* dart → cricket target + marks, derived from the button label */
  function cricketDart(label) {
    if (label === "Single bull") return { key: "b", marks: 1, val: 25 };
    if (label === "Double bull") return { key: "b", marks: 2, val: 25 };
    let m = /^T(\d+)$/.exec(label);
    if (!m) m = /^D(\d+)$/.exec(label) || /^(\d+)$/.exec(label);
    const n = m ? Number(m[1]) : 0;
    if (n < 15 || n > 20) return { key: null, marks: 0, val: 0 };
    const marks = label[0] === "T" ? 3 : label[0] === "D" ? 2 : 1;
    return { key: String(n), marks, val: n };
  }

  const matchTitle = (g) =>
    g.game === "cricket"
      ? `Cricket · ${g.players[0].short} vs ${g.players[1].short}`
      : g.game === "atw"
        ? `Around the world · ${g.players[0].short} vs ${g.players[1].short}`
        : `01 · ${g.starting} · ${g.players[0].short} vs ${g.players[1].short}`;

  function msbCardHtml(g, i) {
    const p = g.players[i];
    const turn = g.turn === i;
    const st = g.stats[i];
    const cricket = g.game === "cricket";
    const atw = g.game === "atw";
    const big = cricket ? g.points[i] : atw ? 21 - g.progress[i] : g.scores[i];
    const sub = cricket
      ? `Closed ${cricketClosedCount(g, i)}/7`
      : atw ? `Next: ${atwNextLabel(g, i)}`
        : turn ? `Aim: ${esc(routeForScore(g.scores[i]))}` : "";
    const foot2 = cricket
      ? `<span><b>${mprStr(g, i)}</b> MPR</span>`
      : atw
        ? `<span><b>${atwHitPct(g, i)}%</b> hits</span>`
        : `<span><b>${st.darts ? (st.scored / st.darts * 3).toFixed(1) : "—"}</b> avg</span>`;
    const name = p.short || p.name;
    return `
    <div class="msb__card ${turn ? "is-turn" : ""}">
      <span class="msb__chip">${turn ? "To throw" : ""}</span>
      <span class="msb__name">${esc(name)}</span>
      <span class="msb__big">${big}</span>
      <span class="msb__route od-nowrap">${sub}</span>
      <span class="msb__foot od-nowrap">
        <span><b>${g.legsWon[i]}</b> leg${g.legsWon[i] === 1 ? "" : "s"}</span>
        ${foot2}
      </span>
    </div>`;
  }

  function mhistHtml(g) {
    if (!g.history.length) {
      return `<p class="mhist__empty">No visits yet — committed visits land here, newest first.</p>`;
    }
    const rows = g.history.slice(-14).reverse();
    let lastLeg = null;
    const items = rows.map((h) => {
      let div = "";
      if (h.leg !== lastLeg) {
        div = `<li class="mhist__leg">Leg ${h.leg}</li>`;
        lastLeg = h.leg;
      }
      const name = historyName(g, h);
      if (g.game === "atw") {
        const cls = h.done ? " is-co" : "";
        const score = g.marksPer === 3
          ? `${h.marks || 0} mark${h.marks === 1 ? "" : "s"}`
          : `${h.hits} hit${h.hits === 1 ? "" : "s"}`;
        const rem = h.done ? "Done" : atwStepLabel(h.step);
        return `${div}<li class="mhist__row${cls}">
          <span class="mhist__who">${esc(name)}</span>
          <span class="mhist__darts">${esc(h.darts.join(" · "))}</span>
          <span class="mhist__score od-nowrap">${score}</span>
          <span class="mhist__rem od-nowrap">${rem}</span>
        </li>`;
      }
      if (g.game === "cricket") {
        const cls = h.pts > 0 ? " is-gain" : "";
        const score = h.pts > 0 ? `+${h.pts}` : "0";
        return `${div}<li class="mhist__row${cls}">
          <span class="mhist__who">${esc(name)}</span>
          <span class="mhist__darts">${esc(h.darts.join(" · "))}</span>
          <span class="mhist__score od-nowrap">${score}</span>
          <span class="mhist__rem od-nowrap">${h.points}</span>
        </li>`;
      }
      const cls = h.bust ? " is-bust" : h.checkout ? " is-co" : "";
      const score = h.bust ? "Bust" : `−${h.score}`;
      return `${div}<li class="mhist__row${cls}">
        <span class="mhist__who">${esc(name)}</span>
        <span class="mhist__darts">${esc(h.darts.join(" · "))}</span>
        <span class="mhist__score od-nowrap">${score}</span>
        <span class="mhist__rem od-nowrap">${h.remaining}</span>
      </li>`;
    }).join("");
    const more = g.history.length > 14
      ? `<p class="mhist__more">Showing last 14 of ${g.history.length} visits</p>` : "";
    return `<ol class="mhist__list">${items}</ol>${more}`;
  }

  function visitHtml(g) {
    const full = g.current.length >= 3;
    const idx = full ? "Visit complete" : `Dart ${g.current.length + 1} of 3`;
    const chips = [0, 1, 2].map((i) => {
      const d = g.current[i];
      return d
        ? `<span class="dchip">${esc(d.label)}</span>`
        : `<span class="dchip is-empty" aria-hidden="true">–</span>`;
    }).join("");
    const srVisit = g.current.length ? g.current.map((d) => d.label).join(", ") : "no darts yet";
    return `
      <section class="visit" aria-labelledby="visit-h">
        <div class="visit__head">
          <h2 class="visit__title" id="visit-h">This visit — ${esc(g.players[g.turn].short || g.players[g.turn].name)}</h2>
          <span class="visit__idx od-nowrap">${idx}</span>
        </div>
        <div class="visit__darts">${chips}</div>
        <span class="sr-only">This visit: ${srVisit}</span>
      </section>`;
  }

  function inputHtml(g, hint) {
    const p = g.players[g.turn];
    const name = p.short || p.name;
    if (p.kind === "ai") {
      return `
      <div class="aiwait" role="status">
        <span class="aiwait__dot" aria-hidden="true"></span>
        <span><strong style="color:var(--text-strong)">${esc(name)}</strong> is throwing…</span>
        <span style="font-size:var(--fs-xs)">Score updates dart by dart.</span>
      </div>`;
    }
    if (g.game === "cricket") return "";
    return padSection();
  }

  function cricketBoardHtml(g) {
    const ai = g.players[g.turn].kind === "ai";
    const dis = ai ? " disabled" : "";
    const markState = (i, k) => {
      const m = g.marks[i][k];
      const closed = m >= 3;
      const shown = closed ? "Ø" : m === 2 ? "X" : m === 1 ? "/" : "·";
      return { m, closed, shown };
    };
    const row = (k) => {
      const t = k === "b" ? "B" : String(k);
      const p0 = markState(0, k);
      const p1 = markState(1, k);
      const where = k === "b" ? "bull" : k;
      const n0 = esc(g.players[0].short || g.players[0].name);
      const n1 = esc(g.players[1].short || g.players[1].name);
      const s0 = p0.closed ? "closed" : p0.m ? `${p0.m} of 3 marks` : "open";
      const s1 = p1.closed ? "closed" : p1.m ? `${p1.m} of 3 marks` : "open";
      const done = p0.closed && p1.closed;
      const dc = done ? " is-done" : "";
      return `<span class="cboard__cell cboard__cell--p0${p0.closed ? " is-closed" : ""}${dc}${g.turn === 0 ? " is-turn" : ""}"
          aria-label="${n0} on ${where}: ${s0}">${p0.shown}</span>
        <button type="button" class="cboard__mark cboard__hit${dc}" data-cri="${t}" data-m="2" aria-label="Double ${t==='B'?'bull':t}"${dis}>D</button>
        <button type="button" class="cboard__tgt cboard__hit${dc}" data-cri="${t}" data-m="1" aria-label="Single ${t==='B'?'bull':t}"${dis}>${t}</button>
        <button type="button" class="cboard__mark cboard__hit${dc}${k === "b" ? " is-na" : ""}" data-cri="${t}" data-m="3"${k === "b" ? ' aria-label="No treble bull in cricket" disabled' : ` aria-label="Treble ${t}"${dis}`}>T</button>
        <span class="cboard__cell cboard__cell--p1${p1.closed ? " is-closed" : ""}${dc}${g.turn === 1 ? " is-turn" : ""}"
          aria-label="${n1} on ${where}: ${s1}">${p1.shown}</span>`;
    };
    return `
      <section class="cboard" aria-label="Cricket marks board, 20 down to 15 and bull">
        <div class="cboard__grid cboard__grid--vert">
          ${row(20)}${row(19)}${row(18)}${row(17)}${row(16)}${row(15)}${row("b")}
        </div>
        <div class="cboard__foot">
          <button type="button" class="cboard__miss" data-miss="1" data-focus-key="cri-miss"${dis}>Miss</button>
          <span class="cboard__hint">Tap D, the number or T to score — three darts a visit, no busts. Marks: / = 1, X = 2, Ø = closed. Miss spends a dart and scores nothing.</span>
        </div>
      </section>`;
  }

  function cricketHtml(g) {
    const firstTo = Math.ceil(g.len / 2);
    const leg = g.legsWon[0] + g.legsWon[1] + 1;
    const hint = "Tap a target: D = Double, T = Treble, number = Single. Every visit is three darts, no busts.";
    return `
      <div class="msb" role="group" aria-label="Cricket scoreboard, first to ${firstTo} legs">
        ${msbCardHtml(g, 0)}${msbCardHtml(g, 1)}
      </div>
      ${cricketBoardHtml(g)}
      ${visitHtml(g)}
      ${inputHtml(g, hint)}
      <section class="mhist" aria-labelledby="mhist-h">
        <div class="visit__head">
          <h2 class="visit__title" id="mhist-h">Turn history</h2>
          <span class="visit__idx od-nowrap">First to ${firstTo} · Leg ${leg}</span>
        </div>
        ${mhistHtml(g)}
      </section>`;
  }

  function atwStripHtml(g, i) {
    const s = g.progress[i];
    const turn = g.turn === i;
    const name = esc(g.players[i].short || g.players[i].name);
    const chips = Array.from({ length: 21 }, (_, idx) => {
      const label = idx === 20 ? "B" : String(idx + 1);
      const cls = idx < s ? " is-done" : idx === s ? " is-now" : "";
      return `<span class="atwchip${cls}" aria-hidden="true">${label}</span>`;
    }).join("");
    const sr = s >= 21
      ? "circuit complete"
      : `at ${atwStepLabel(s)}, ${21 - s} to go${g.marksPer === 3 ? `, ${g.atwMarks[i] || 0} of 3 marks` : ""}`;
    return `
    <div class="atwstrip ${turn ? "is-turn" : ""}">
      <span class="atwstrip__who">${name}</span>
      <div class="atwstrip__chips" role="img" aria-label="${name}: ${sr}">${chips}</div>
    </div>`;
  }

  function atwHtml(g) {
    const firstTo = Math.ceil(g.len / 2);
    const leg = g.legsWon[0] + g.legsWon[1] + 1;
    const hint = g.marksPer === 3
      ? "Hit the required number for marks — single = 1, double = 2, treble = 3. Three marks move you on; bull = 1 or 2."
      : "Hit the required number — any segment counts. Bull completes the circuit.";
    return `
      <div class="msb" role="group" aria-label="Around the world scoreboard, first to ${firstTo} legs">
        ${msbCardHtml(g, 0)}${msbCardHtml(g, 1)}
      </div>
      <section class="atw" aria-label="Circuit progress">
        ${atwStripHtml(g, 0)}${atwStripHtml(g, 1)}
      </section>
      ${visitHtml(g)}
      ${inputHtml(g, hint)}
      <section class="mhist" aria-labelledby="mhist-h">
        <div class="visit__head">
          <h2 class="visit__title" id="mhist-h">Turn history</h2>
          <span class="visit__idx od-nowrap">First to ${firstTo} · Leg ${leg}</span>
        </div>
        ${mhistHtml(g)}
      </section>`;
  }

  function matchHtml(g) {
    if (g.game === "cricket") return cricketHtml(g);
    if (g.game === "atw") return atwHtml(g);
    const firstTo = Math.ceil(g.len / 2);
    const leg = g.legsWon[0] + g.legsWon[1] + 1;
    return `
      <div class="msb" role="group" aria-label="Scoreboard, first to ${firstTo} legs">
        ${msbCardHtml(g, 0)}${msbCardHtml(g, 1)}
      </div>
      ${visitHtml(g)}
      ${inputHtml(g, "Double-out — finish on a double or bull. Single bull is 25, double bull is 50. Miss scores nothing.")}
      <section class="mhist" aria-labelledby="mhist-h">
        <div class="visit__head">
          <h2 class="visit__title" id="mhist-h">Turn history</h2>
          <span class="visit__idx od-nowrap">First to ${firstTo} · Leg ${leg}</span>
        </div>
        ${mhistHtml(g)}
      </section>`;
  }

  function renderPlay() {
    const g = currentPlay();
    if (!g) return;
    normalizePlay(g);
    const isMatch = g.kind === "match";
    $("#play-title").textContent = isMatch ? matchTitle(g) : playTitle(g);
    $("[data-play-finish]").hidden = isMatch;
    const body = $("#play-body");
    const ae = document.activeElement;
    const key = ae && ae.getAttribute ? ae.getAttribute("data-focus-key") : null;
    body.innerHTML = isMatch
      ? matchHtml(g)
      : g.practice === "target" ? targetHtml(g)
        : g.practice === "checkout" ? checkoutHtml(g)
          : game9Html(g);
    if (key) {
      const el = body.querySelector(`[data-focus-key="${key}"]`);
      if (el) el.focus();
    }
    $("#play-note").textContent = playMsg;
    const cricket = isMatch && g.game === "cricket";
    const atw = isMatch && g.game === "atw";
    $("#play-live").textContent = cricket
      ? `${g.players[0].short} ${g.points[0]} points, ${cricketClosedCount(g, 0)}/7 closed; ${g.players[1].short} ${g.points[1]} points, ${cricketClosedCount(g, 1)}/7 closed. ${g.players[g.turn].short} to throw.`
      : atw
        ? `${g.players[0].short} at ${atwStepLabel(g.progress[0])}, ${g.players[1].short} at ${atwStepLabel(g.progress[1])}. ${g.players[g.turn].short} to throw.`
        : isMatch
          ? `${g.players[0].short} ${g.scores[0]}, ${g.players[1].short} ${g.scores[1]}. ${g.players[g.turn].short} to throw.`
          : g.practice === "target"
            ? `${g.done} of ${g.darts} darts thrown, ${g.hits} hits.`
            : g.practice === "checkout"
              ? `Remaining ${g.remaining}. ${g.current.length >= 3 ? "Visit complete." : `Dart ${g.current.length + 1} of 3.`}`
              : `Game of 9. Target ${g9TargetName(g.seq[Math.min(g.idx, g.seq.length - 1)])}, ${g.idx} of ${g.seq.length} cleared. ${g.seq[g.idx] === "bull" ? `${g.bullStreak} of 3 scoring rounds in a row.` : `${g.streak} of 9 hits in a row.`}`;
  }

  function recordTarget(g, hit) {
    if (g.done >= g.darts) return;
    if (g.current.length >= 3) g.current = [];
    g.done += 1;
    g.current.push(hit ? 1 : 0);
    if (hit) {
      g.hits += 1;
      g.streak += 1;
      if (g.streak > g.best) g.best = g.streak;
    } else {
      g.streak = 0;
    }
    playMsg = g.current.length >= 3 ? "Visit complete — next dart opens a new visit." : "";
    repo.activeGames.save(active);
    if (g.done >= g.darts) { finishSession(g); return; }
    renderPlay();
  }

  function recordGame9(g, hit) {
    if (g.idx >= g.seq.length) return;
    if (g.visit.length >= 3) g.visit = [];
    const target = g.seq[g.idx];
    g.darts += 1;
    g.visit.push(hit ? 1 : 0);
    let justFinished = false;

    if (target === "bull") {
      if (g.visit.length >= 3) {
        const bulls = g.visit.reduce((n, v) => n + v, 0);
        g.bullStreak = bulls > 0 ? g.bullStreak + 1 : 0;
        if (g.bullStreak >= 3) {
          g.idx += 1;
          g.cleared = g.idx;
          g.bullStreak = 0;
          g.visit = [];
          playMsg = g.idx >= g.seq.length ? "" : "Bull cleared — next target.";
          justFinished = g.idx >= g.seq.length;
        } else {
          playMsg = bulls > 0
            ? `Round banked — ${g.bullStreak} of 3 in a row.`
            : "No bull that round — restart the 3-round count.";
        }
      } else {
        playMsg = hit ? "Bull — the round is alive." : "";
      }
    } else if (hit) {
      g.streak += 1;
      if (g.streak > g.best) g.best = g.streak;
      if (g.streak >= 9) {
        const name = g9TargetName(target);
        g.idx += 1;
        g.cleared = g.idx;
        g.streak = 0;
        g.visit = [];
        playMsg = g.idx >= g.seq.length ? "" : `${name} cleared — next up ${g9TargetName(g.seq[g.idx])}.`;
        justFinished = g.idx >= g.seq.length;
      } else {
        playMsg = `Hit — ${g.streak} of 9 in a row.`;
      }
    } else {
      g.streak = 0;
      playMsg = `Miss — ${g9TargetName(target)} count back to zero.`;
    }

    repo.activeGames.save(active);
    if (justFinished) { finishSession(g); return; }
    renderPlay();
  }

  function enterDart(g, v, label, dbl) {
    if (g.current.length >= 3) { g.current = []; g.visitStart = g.remaining; g.visits += 1; }
    g.darts += 1;
    g.current.push({ v, label });
    const start = g.visitStart;
    const next = g.remaining - v;
    if (next < 0 || next === 1 || (next === 0 && !dbl)) {
      g.remaining = start;
      g.current = [];
      g.visits += 1;
      g.visitStart = g.remaining;
      playMsg =
        next === 0
          ? `Bust — you must finish on a double. Score restored to ${start}.`
          : next === 1
            ? `Bust — you can't leave 1. Score restored to ${start}.`
            : `Bust — that goes below zero. Score restored to ${start}.`;
    } else if (next === 0) {
      g.remaining = 0;
      playMsg = "";
      repo.activeGames.save(active);
      finishSession(g);
      return;
    } else {
      g.remaining = next;
      playMsg = g.current.length >= 3 ? "Visit over — three darts thrown. Next dart starts a new visit." : "";
    }
    repo.activeGames.save(active);
    renderPlay();
  }

  /* ---------- match play: 01 scoring, legs, AI ---------- */
  const AI_SKILL = {
    beginner: { miss: 0.34, t20: 0.03, t19: 0.02, dbl: 0.16 },
    casual: { miss: 0.22, t20: 0.08, t19: 0.05, dbl: 0.34 },
    steady: { miss: 0.12, t20: 0.18, t19: 0.10, dbl: 0.55 },
    sharp: { miss: 0.07, t20: 0.30, t19: 0.15, dbl: 0.72 },
    expert: { miss: 0.04, t20: 0.42, t19: 0.18, dbl: 0.88 },
  };

  function aiThrowDart(view) {
    const sk = AI_SKILL[view.difficulty] || AI_SKILL.steady;
    const rem = view.scores[view.turn];
    const rnd = Math.random();

    /* on a clean finish — go for the double */
    if (rem % 2 === 0 && rem >= 2 && rem <= 40) {
      if (rnd < sk.dbl) return { v: rem, label: `D${rem / 2}`, dbl: true };
      if (rnd < sk.dbl + 0.4 && rem / 2 <= 20 && rem / 2 >= 1) return { v: rem / 2, label: `${rem / 2}`, dbl: false };
      return { v: 0, label: "Miss", dbl: false };
    }
    if (rem === 50) {
      if (rnd < sk.dbl) return { v: 50, label: "Double bull", dbl: true };
      return { v: 20, label: "20", dbl: false };
    }

    /* scoring visit — never throw past the score */
    if (rnd < sk.miss) return { v: 0, label: "Miss", dbl: false };
    if (rnd < sk.miss + sk.t20 && rem >= 62) return { v: 60, label: "T20", dbl: false };
    if (rnd < sk.miss + sk.t20 + sk.t19 && rem >= 59) return { v: 57, label: "T19", dbl: false };
    const hi = Math.min(20, Math.max(1, rem - 2));
    let s = 10 + Math.floor(Math.random() * Math.max(1, hi - 9));
    if (s > hi) s = hi;
    if (rem - s === 1) s = Math.max(1, s - 1);
    return { v: s, label: `${s}`, dbl: false };
  }

  /* cricket target ladder: danger → own open → scoring, all 20→15 with bull last */
  function aiThrowCricket(view) {
    const sk = AI_SKILL[view.difficulty] || AI_SKILL.steady;
    const t = view.turn, o = 1 - t;
    const closed = (i, k) => view.marks[i][k] >= 3;
    let target = CRICKET_KEYS.find((k) => closed(o, k) && !closed(t, k))
      || CRICKET_KEYS.find((k) => !closed(t, k))
      || CRICKET_KEYS.find((k) => !closed(o, k))
      || "20";

    if (Math.random() < sk.miss) return { v: 0, label: "Miss", dbl: false };
    if (target === "b") {
      const r = Math.random();
      if (r < sk.dbl) return { v: 50, label: "Double bull", dbl: true };
      if (r < sk.dbl + 0.5) return { v: 25, label: "Single bull", dbl: false };
      return { v: 0, label: "Miss", dbl: false };
    }
    const n = Number(target);
    const r = Math.random();
    if (r < sk.t20) return { v: n * 3, label: `T${n}`, dbl: false };
    if (r < sk.t20 + sk.t19) return { v: n * 2, label: `D${n}`, dbl: true };
    return { v: n, label: `${n}`, dbl: false };
  }

  const ATW_HIT = { beginner: 0.32, casual: 0.46, steady: 0.6, sharp: 0.72, expert: 0.84 };

  /* aims at the required number for each step, bull last */
  function aiThrowAtw(view) {
    const sk = AI_SKILL[view.difficulty] || AI_SKILL.steady;
    const chance = ATW_HIT[view.difficulty] ?? 0.6;
    if (Math.random() >= chance) return { v: 0, label: "Miss", dbl: false };
    const s = view.progress[view.turn];
    const marksMode = Number(view.marksPer) === 3;
    if (s >= 20) {
      if (marksMode) return { v: 50, label: "Double bull", dbl: true };
      if (Math.random() < sk.dbl * 0.5) return { v: 50, label: "Double bull", dbl: true };
      return { v: 25, label: "Single bull", dbl: false };
    }
    const n = s + 1;
    if (marksMode) return { v: n * 3, label: `T${n}`, dbl: false };
    return { v: n, label: `${n}`, dbl: false };
  }

  /* ---------- opponent providers ---------- */
  /* "local" runs the bundled engine. "backend" POSTs the opponent view to
     OPPONENT_ENDPOINT and expects { v, label, dbl } back; the local engine
     stays available as an offline fallback. Set the window flags to switch. */
  const OPPONENT_PROVIDER = window.DARTS_OPPONENT_PROVIDER || "local";
  const OPPONENT_ENDPOINT = window.DARTS_OPPONENT_ENDPOINT || "/api/opponent/throw";
  const OPPONENT_LIST_ENDPOINT = window.DARTS_OPPONENTS_ENDPOINT || "/api/opponents";

  function normalizeOpponent(raw) {
    if (!raw || typeof raw.id !== "string" || typeof raw.label !== "string") return null;
    const id = raw.id.trim();
    const label = raw.label.trim();
    if (!id || !label) return null;
    const difficulty = typeof raw.difficulty === "string" && AI_SKILL[raw.difficulty] ? raw.difficulty : "steady";
    const rank = Number.isFinite(raw.rank) ? Math.max(1, Math.min(5, Math.round(raw.rank))) : 3;
    const desc = typeof raw.desc === "string" && raw.desc.trim() ? raw.desc.trim() : "Custom opponent";
    return { id, label, rank, desc, difficulty };
  }

  function opponentView(g) {
    const view = {
      game: g.game, turn: g.turn,
      difficulty: g.players[g.turn].difficulty || "steady",
      opponent: g.players[g.turn].opponent || g.players[g.turn].difficulty || "steady",
    };
    if (g.game === "cricket") {
      view.points = g.points.slice();
      view.marks = g.marks.map((m) => ({ ...m }));
    } else if (g.game === "atw") {
      view.progress = g.progress.slice();
      view.atwMarks = Array.isArray(g.atwMarks) ? g.atwMarks.slice() : [0, 0];
      view.marksPer = Number(g.marksPer) === 3 ? 3 : 1;
    } else {
      view.scores = g.scores.slice();
      view.starting = g.starting;
    }
    return view;
  }

  function createLocalOpponentProvider() {
    return {
      async choose(view) {
        if (view.game === "cricket") return aiThrowCricket(view);
        if (view.game === "atw") return aiThrowAtw(view);
        return aiThrowDart(view);
      },
      async listOpponents() {
        return LOCAL_OPPONENTS.map((o) => ({ ...o }));
      },
    };
  }

  function createBackendOpponentProvider(endpoint, listEndpoint) {
    return {
      async listOpponents() {
        const res = await fetch(listEndpoint, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`Opponent roster failed (${res.status})`);
        const payload = await res.json();
        const rows = Array.isArray(payload) ? payload : payload && Array.isArray(payload.opponents) ? payload.opponents : [];
        const list = rows.map(normalizeOpponent).filter(Boolean);
        if (!list.length) throw new Error("Opponent roster was empty");
        return list;
      },
      async choose(view) {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(view),
        });
        if (!res.ok) throw new Error(`Opponent provider failed (${res.status})`);
        const dart = await res.json();
        if (!dart || typeof dart.v !== "number" || typeof dart.label !== "string") {
          throw new Error("Opponent provider returned an invalid dart");
        }
        return { v: dart.v, label: dart.label, dbl: Boolean(dart.dbl) };
      },
    };
  }

  function createOpponentProvider(mode, endpoint, listEndpoint) {
    const local = createLocalOpponentProvider();
    if (mode !== "backend") return local;
    const remote = createBackendOpponentProvider(endpoint, listEndpoint);
    return {
      async choose(view) {
        try { return await remote.choose(view); }
        catch { return local.choose(view); }
      },
      async listOpponents() {
        try { return await remote.listOpponents(); }
        catch { return local.listOpponents(); }
      },
    };
  }

  const opponent = createOpponentProvider(OPPONENT_PROVIDER, OPPONENT_ENDPOINT, OPPONENT_LIST_ENDPOINT);

  function maybeAiThrow(g) {
    clearTimeout(aiTimer);
    if (!g || g.kind !== "match" || (g.game !== "01" && g.game !== "cricket" && g.game !== "atw")) return;
    if (playId !== g.id) return;
    if (g.players[g.turn].kind !== "ai") return;
    aiTimer = setTimeout(async () => {
      if (playId !== g.id) return;
      const cur = currentPlay();
      if (!cur || cur.kind !== "match" || cur.players[cur.turn].kind !== "ai") return;
      playMsg = "AI opponent is thinking…";
      const view = opponentView(cur);
      const dart = await opponent.choose(view).catch(() => createLocalOpponentProvider().choose(view));
      /* discard a late answer if the view closed or the turn changed meanwhile */
      if (playId !== g.id || currentPlay() !== cur || cur.players[cur.turn].kind !== "ai") return;
      if (cur.game === "cricket") enterCricketDart(cur, dart.v, dart.label, dart.dbl);
      else if (cur.game === "atw") enterAtwDart(cur, dart.v, dart.label, dart.dbl);
      else enterMatchDart(cur, dart.v, dart.label, dart.dbl);
    }, 850);
  }

  function commitMatchVisit(g, p, info) {
    g.history.push({
      name: playerShort(g, p),
      leg: g.legsWon[0] + g.legsWon[1] + 1,
      darts: g.current.map((d) => d.label),
      score: info.score,
      remaining: info.remaining,
      bust: info.bust,
      checkout: info.checkout,
    });
    g.current = [];
    g.visitStart = g.scores[p];
  }

  function passTurn(g) { g.turn = 1 - g.turn; }

  function commitCricketVisit(g, p) {
    const marks = g.current.reduce((s, d) => s + (d.marks || 0), 0);
    const pts = g.current.reduce((s, d) => s + (d.pts || 0), 0);
    g.history.push({
      name: playerShort(g, p),
      leg: g.legsWon[0] + g.legsWon[1] + 1,
      darts: g.current.map((d) => d.label),
      marks, pts,
      points: g.points[p],
    });
    g.current = [];
    g.visitStart = g.points[p];
    return { marks, pts };
  }

  /* null → keep playing · "tie" → replay the leg · number → that player wins the leg */
  function cricketLegResult(g) {
    const closed = (i) => CRICKET_KEYS.every((k) => g.marks[i][k] >= 3);
    const c0 = closed(0), c1 = closed(1);
    if (c0 && g.points[0] > g.points[1]) return 0;
    if (c1 && g.points[1] > g.points[0]) return 1;
    if (c0 && c1 && g.points[0] === g.points[1]) return "tie";
    return null;
  }

  function cricketTieReplay(g) {
    g.points = [0, 0];
    g.marks = [emptyMarks(), emptyMarks()];
    g.current = [];
    g.turn = g.legFirst;
    g.visitStart = 0;
    playMsg = "Tied leg — both players closed out level. The leg is replayed.";
    repo.activeGames.save(active);
    renderPlay();
    maybeAiThrow(g);
  }

  function enterCricketDart(g, v, label, dbl) {
    if (g.current.length >= 3) return;
    const t = g.turn;
    const o = 1 - t;
    const d = cricketDart(label);
    let pts = 0;
    if (d.marks) {
      const wasClosed = g.marks[t][d.key] >= 3;
      const oppClosed = g.marks[o][d.key] >= 3;
      if (wasClosed && !oppClosed) {
        pts = d.marks * d.val;
        g.points[t] += pts;
      }
      g.stats[t].marks += d.marks;
      g.marks[t][d.key] += d.marks;
    }
    g.stats[t].darts += 1;
    g.current.push({ v, label, marks: d.marks, pts });

    const result = cricketLegResult(g);
    if (result !== null) {
      commitCricketVisit(g, t);
      repo.activeGames.save(active);
      if (result === "tie") cricketTieReplay(g);
      else winLeg(g);
      return;
    }
    if (g.current.length >= 3) {
      const sum = commitCricketVisit(g, t);
      passTurn(g);
      playMsg =
        `Visit: ${sum.marks} mark${sum.marks === 1 ? "" : "s"}, ${sum.pts ? `+${sum.pts} points` : "no points"}. `
        + `${g.players[g.turn].short || g.players[g.turn].name} to throw.`;
    } else {
      playMsg = "";
    }
    repo.activeGames.save(active);
    renderPlay();
    maybeAiThrow(g);
  }

  function commitAtwVisit(g, p, done) {
    const hits = g.current.reduce((s, d) => s + (d.hit ? 1 : 0), 0);
    const marks = g.current.reduce((s, d) => s + (d.marks || 0), 0);
    g.history.push({
      name: playerShort(g, p),
      leg: g.legsWon[0] + g.legsWon[1] + 1,
      darts: g.current.map((d) => d.label),
      hits, marks, step: g.progress[p], done,
    });
    g.current = [];
    return { hits, marks };
  }

  function atwMarkValue(label) {
    if (label === "Single bull") return 1;
    if (label === "Double bull" || label[0] === "D") return 2;
    if (label[0] === "T") return 3;
    return 1;
  }

  function enterAtwDart(g, v, label, dbl) {
    if (g.current.length >= 3) return;
    const t = g.turn;
    if (g.marksPer === 3 && !Array.isArray(g.atwMarks)) g.atwMarks = [0, 0];
    const s = g.progress[t];
    if (s >= 21) return;
    const isBull = label === "Single bull" || label === "Double bull";
    const m = /^(?:[TD])?(\d+)$/.exec(label);
    const n = m ? Number(m[1]) : 0;
    const hit = s >= 20 ? isBull : n === s + 1;
    const gained = hit && g.marksPer === 3 ? atwMarkValue(label) : 0;
    g.stats[t].darts += 1;
    if (hit) {
      g.stats[t].hits += 1;
      if (g.marksPer === 3) {
        g.atwMarks[t] = Math.min(3, (g.atwMarks[t] || 0) + gained);
        if (g.atwMarks[t] >= 3) {
          g.progress[t] = s + 1;
          g.atwMarks[t] = 0;
        }
      } else {
        g.progress[t] = s + 1;
      }
    }
    g.current.push({ v, label, hit, marks: gained });

    if (g.progress[t] >= 21) {
      commitAtwVisit(g, t, true);
      playMsg = "";
      repo.activeGames.save(active);
      winLeg(g);
      return;
    }
    if (g.current.length >= 3) {
      const visit = commitAtwVisit(g, t, false);
      passTurn(g);
      const tally = g.marksPer === 3
        ? `${visit.marks} mark${visit.marks === 1 ? "" : "s"}`
        : `${visit.hits} hit${visit.hits === 1 ? "" : "s"}`;
      playMsg = `Visit: ${tally}. ${g.players[g.turn].short || g.players[g.turn].name} to throw.`;
    } else {
      playMsg = "";
    }
    repo.activeGames.save(active);
    renderPlay();
    maybeAiThrow(g);
  }

  function enterMatchDart(g, v, label, dbl) {
    if (g.current.length >= 3) return;
    const t = g.turn;
    g.current.push({ v, label });
    g.stats[t].darts += 1;
    const start = g.visitStart;
    const next = g.scores[t] - v;

    if (next < 0 || next === 1 || (next === 0 && !dbl)) {
      /* bust — the whole visit scores zero */
      const prevScored = g.current.reduce((s, d) => s + d.v, 0) - v;
      g.stats[t].scored -= prevScored;
      g.scores[t] = start;
      commitMatchVisit(g, t, { bust: true, score: 0, remaining: start, checkout: false });
      passTurn(g);
      playMsg =
        (next === 0 ? "Bust — you must finish on a double. "
          : next === 1 ? "Bust — you can't leave 1. "
            : "Bust — that goes below zero. ")
        + `${g.players[t].short || g.players[t].name} restored to ${start}. `
        + `${g.players[g.turn].short || g.players[g.turn].name} to throw.`;
    } else if (next === 0) {
      g.scores[t] = 0;
      g.stats[t].scored += v;
      commitMatchVisit(g, t, { bust: false, score: v, remaining: 0, checkout: true });
      playMsg = "";
      repo.activeGames.save(active);
      winLeg(g);
      return;
    } else {
      g.scores[t] = next;
      g.stats[t].scored += v;
      if (g.current.length >= 3) {
        const visitScore = g.current.reduce((s, d) => s + d.v, 0);
        commitMatchVisit(g, t, { bust: false, score: visitScore, remaining: next, checkout: false });
        passTurn(g);
        playMsg = `Visit: ${visitScore}. ${g.players[g.turn].short || g.players[g.turn].name} to throw.`;
      } else {
        playMsg = "";
      }
    }
    repo.activeGames.save(active);
    renderPlay();
    maybeAiThrow(g);
  }

  function winLeg(g) {
    g.legsWon[g.turn] += 1;
    const firstTo = Math.ceil(g.len / 2);
    if (g.legsWon[g.turn] >= firstTo) {
      repo.activeGames.save(active);
      finishMatch(g, g.turn);
      return;
    }
    if (g.game === "atw") {
      g.progress = [0, 0];
      g.atwMarks = [0, 0];
    } else if (g.game === "cricket") {
      g.points = [0, 0];
      g.marks = [emptyMarks(), emptyMarks()];
      g.visitStart = 0;
    } else {
      g.scores = [g.starting, g.starting];
      g.visitStart = g.starting;
    }
    g.legFirst = 1 - g.legFirst;
    g.turn = g.legFirst;
    g.current = [];
    playMsg = `Leg ${g.legsWon[0] + g.legsWon[1] + 1} — ${g.players[g.turn].short || g.players[g.turn].name} throws first.`;
    repo.activeGames.save(active);
    renderPlay();
    maybeAiThrow(g);
  }

  function finishMatch(g, winnerIdx) {
    clearTimeout(aiTimer);
    const winner = g.players[winnerIdx];
    const wname = winner.short || winner.name;
    const cricket = g.game === "cricket";
    if (cricket) {
      recent.unshift({
        when: "Just now", at: Date.now(), type: "Cricket",
        a: g.players[0].name, b: g.players[1].name,
        winner: winnerIdx === 0 ? "a" : "b",
        result: `${wname} won ${g.legsWon[0]}–${g.legsWon[1]}`,
        stat: `${mprStr(g, winnerIdx)} MPR`,
      });
    } else if (g.game === "atw") {
      recent.unshift({
        when: "Just now", at: Date.now(), type: "Around the world",
        a: g.players[0].name, b: g.players[1].name,
        winner: winnerIdx === 0 ? "a" : "b",
        result: `${wname} won ${g.legsWon[0]}–${g.legsWon[1]}`,
        stat: `${atwHitPct(g, winnerIdx)}% hits`,
      });
    } else {
      recent.unshift({
        when: "Just now", at: Date.now(), type: `01 · ${g.starting}`,
        a: g.players[0].name, b: g.players[1].name,
        winner: winnerIdx === 0 ? "a" : "b",
        result: `${wname} won ${g.legsWon[0]}–${g.legsWon[1]}`,
        stat: `${(() => {
          const ws = g.stats[winnerIdx];
          return ws.darts ? ((ws.scored / ws.darts) * 3).toFixed(1) : "0.0";
        })()} avg`,
      });
    }
    active = active.filter((x) => x.id !== g.id);
    repo.activeGames.save(active);
    repo.recentResults.save(recent.slice(0, 40));
    playMsg = "";
    goHomeAfterSheet = true;
    const pName = (i) => esc(g.players[i].short || g.players[i].name);
    let summaryHtml;
    if (cricket) {
      summaryHtml = `<dl class="summary">
        <div class="summary__row"><dt>Result</dt><dd>${esc(wname)} won ${g.legsWon[0]}–${g.legsWon[1]}</dd></div>
        <div class="summary__row"><dt>${pName(0)}</dt><dd>${mprStr(g, 0)} MPR · ${g.stats[0].darts} darts</dd></div>
        <div class="summary__row"><dt>${pName(1)}</dt><dd>${mprStr(g, 1)} MPR · ${g.stats[1].darts} darts</dd></div>
        <div class="summary__row"><dt>Points</dt><dd>${g.points[0]} · ${g.points[1]}</dd></div>
        <div class="summary__row"><dt>Most marks</dt><dd>${
          g.history.reduce((m, h) => Math.max(m, h.marks || 0), 0) || "—"
        }</dd></div>
      </dl>`;
    } else if (g.game === "atw") {
      const pct = (i) => `${atwHitPct(g, i)}% hits · ${g.stats[i].darts} darts`;
      const marksMode = g.marksPer === 3;
      const best = marksMode
        ? g.history.reduce((m, h) => Math.max(m, h.marks || 0), 0)
        : g.history.reduce((m, h) => Math.max(m, h.hits || 0), 0);
      summaryHtml = `<dl class="summary">
        <div class="summary__row"><dt>Result</dt><dd>${esc(wname)} won ${g.legsWon[0]}–${g.legsWon[1]}</dd></div>
        <div class="summary__row"><dt>${pName(0)}</dt><dd>${pct(0)}</dd></div>
        <div class="summary__row"><dt>${pName(1)}</dt><dd>${pct(1)}</dd></div>
        <div class="summary__row"><dt>Marks</dt><dd>${marksMode ? "3 per number" : "1 per number"}</dd></div>
        <div class="summary__row"><dt>Best visit</dt><dd>${best ? `${best} ${marksMode ? "mark" : "hit"}${best === 1 ? "" : "s"}` : "—"}</dd></div>
      </dl>`;
    } else {
      const ws = g.stats[winnerIdx];
      const avg = ws.darts ? (ws.scored / ws.darts) * 3 : 0;
      const hi = g.history.reduce((m, h) => (h.bust ? m : Math.max(m, h.score)), 0);
      const pAvg = (i) => (g.stats[i].darts ? ((g.stats[i].scored / g.stats[i].darts) * 3).toFixed(1) : "—");
      summaryHtml = `<dl class="summary">
        <div class="summary__row"><dt>Result</dt><dd>${esc(wname)} won ${g.legsWon[0]}–${g.legsWon[1]}</dd></div>
        <div class="summary__row"><dt>${pName(0)}</dt><dd>${pAvg(0)} avg · ${g.stats[0].darts} darts</dd></div>
        <div class="summary__row"><dt>${pName(1)}</dt><dd>${pAvg(1)} avg · ${g.stats[1].darts} darts</dd></div>
        <div class="summary__row"><dt>High visit</dt><dd>${hi || "—"}</dd></div>
      </dl>`;
    }
    openSheet(`${wname} wins`, `
      ${summaryHtml}
      <p class="note">Saved to Recent results.</p>
      <button type="button" class="btn btn--primary btn--block" id="summary-done">Done</button>`);
    const sd = $("#summary-done"); if (sd) sd.addEventListener("click", closeSheet);
  }

  function finishSession(g) {
    const title = playTitle(g);
    let summaryHtml;
    if (g.practice === "target") {
      const rate = g.done ? Math.round((g.hits / g.done) * 100) : 0;
      recent.unshift({
        when: "Just now", at: Date.now(), type: "Practice · Target",
        label: `${targetName(g.target)} · ${g.darts} darts`, result: `${g.hits} hits`, stat: `${rate}%`,
      });
      summaryHtml = `
        <dl class="summary">
          <div class="summary__row"><dt>Focus</dt><dd>${esc(targetName(g.target))}</dd></div>
          <div class="summary__row"><dt>Darts thrown</dt><dd>${g.done} / ${g.darts}</dd></div>
          <div class="summary__row"><dt>Hits</dt><dd>${g.hits}</dd></div>
          <div class="summary__row"><dt>Hit rate</dt><dd>${rate}%</dd></div>
          <div class="summary__row"><dt>Best streak</dt><dd>${g.best}</dd></div>
        </dl>`;
    } else if (g.practice === "checkout") {
      const cleared = g.remaining === 0;
      const routeTxt = g.current.length ? g.current.map((d) => d.label).join(" · ") : "—";
      recent.unshift({
        when: "Just now", at: Date.now(), type: "Practice · Checkout",
        label: `${g.score} · double out`,
        result: cleared ? "Cleared" : `Stopped · ${g.remaining} left`,
        stat: `${g.darts} darts`,
      });
      summaryHtml = `
        <dl class="summary">
          <div class="summary__row"><dt>Checkout</dt><dd>${g.score}</dd></div>
          <div class="summary__row"><dt>Result</dt><dd>${cleared ? `Cleared in ${g.darts} darts` : `${g.remaining} left`}</dd></div>
          <div class="summary__row"><dt>Darts used</dt><dd>${g.darts}</dd></div>
          <div class="summary__row"><dt>Route</dt><dd>${esc(routeTxt)}</dd></div>
        </dl>`;
    } else {
      const complete = g.idx >= g.seq.length;
      const lastTarget = g9TargetName(g.seq[Math.min(g.idx, g.seq.length - 1)]);
      const order = g.variant === "501" ? "501 · 1→20→bull" : "Cricket · 20→15→bull";
      recent.unshift({
        when: "Just now", at: Date.now(), type: "Practice · Game of 9",
        label: `${g.variant === "501" ? "501" : "Cricket"} · ${g.seq.length} targets`,
        result: complete ? "Cleared" : `Stopped at ${lastTarget}`,
        stat: `${g.darts} darts`,
        variant: g.variant === "501" ? "501" : "Cricket",
        targets: g.seq.length,
        cleared: g.cleared,
        best: g.best,
      });
      summaryHtml = `
        <dl class="summary">
          <div class="summary__row"><dt>Order</dt><dd>${order}</dd></div>
          <div class="summary__row"><dt>Targets cleared</dt><dd>${g.cleared} / ${g.seq.length}</dd></div>
          <div class="summary__row"><dt>Darts thrown</dt><dd>${g.darts}</dd></div>
          <div class="summary__row"><dt>Best hit streak</dt><dd>${g.best}</dd></div>
        </dl>`;
    }
    active = active.filter((x) => x.id !== g.id);
    repo.activeGames.save(active);
    repo.recentResults.save(recent.slice(0, 40));
    goHomeAfterSheet = true;
    openSheet(title, `
      ${summaryHtml}
      <p class="note">Saved to Recent results.</p>
      <button type="button" class="btn btn--primary btn--block" id="summary-done">Done</button>`);
    const sd = $("#summary-done"); if (sd) sd.addEventListener("click", closeSheet);
  }

  /* ---------- view routing: #/stats · #/practice (hub) · #/play/<id> (play) · home ---------- */
  const routeFor = (v) => (v === "hub" ? "#/practice" : v === "stats" ? "#/stats" : "");
  const viewEl = () => (view === "hub" ? $("#hub") : view === "stats" ? $("#stats") : $("#main"));

  function syncNav() {
    const want = view === "hub" ? "practice" : view === "stats" ? "stats" : "play";
    $$("[data-nav]").forEach((el) => {
      const on = el.getAttribute("data-nav") === want;
      el.classList.toggle("is-active", on);
      if (on) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
  }

  function setView(next, { focus = false } = {}) {
    view = next;
    const vis = (sel, on) => { const el = $(sel); if (el) el.hidden = !on; };
    vis("#main", next === "home");
    vis("#hub", next === "hub");
    vis("#stats", next === "stats");
    document.title = next === "hub" ? "Darts — Practice"
      : next === "stats" ? "Darts — Stats" : "Darts — Home";
    const skip = $(".skiplink");
    if (skip) skip.setAttribute("href", next === "hub" ? "#hub" : next === "stats" ? "#stats" : "#main");
    if (next === "home") renderHome();
    if (next === "hub") renderHub();
    if (next === "stats") { renderStats(); renderProfile(); }
    syncNav();
    if (focus && booted) { const el = viewEl(); if (el) el.focus(); }
  }

  function openPlay(id) {
    const g = active.find((x) => x.id === id);
    if (!g) { backFromPlay(); return; }
    const playable = g.kind === "practice"
      || (g.kind === "match" && (g.game === "01" || g.game === "cricket" || g.game === "atw"));
    if (!playable) {
      backFromPlay();
      toast("That game type isn't playable yet.");
      return;
    }
    playId = id;
    playMult = 1;
    playMsg = "";
    normalizePlay(g);
    document.body.classList.add("is-play");
    $("#play").hidden = false;
    $("[data-play-back]").setAttribute(
      "aria-label",
      view === "hub" ? "Back to practice" : view === "stats" ? "Back to stats" : "Back to home"
    );
    renderPlay();
    $("#play-title").focus();
    maybeAiThrow(g);
  }

  function backFromPlay() {
    const back = routeFor(view);
    if ((location.hash || "") !== back) location.hash = back;
    else if (playId) closePlay();
  }

  function closePlay() {
    clearTimeout(aiTimer);
    playId = null;
    playMsg = "";
    goHomeAfterSheet = false;
    document.body.classList.remove("is-play");
    $("#play").hidden = true;
    renderHome();
    if (view === "hub") renderHub();
    if (view === "stats") { renderStats(); renderProfile(); }
    const el = viewEl();
    if (el) el.focus();
  }

  function route() {
    const hash = location.hash || "";
    const m = /^#\/play\/(.+)$/.exec(hash);
    if (m) {
      if (playId !== m[1]) openPlay(m[1]);
      return;
    }
    if (playId) closePlay();
    const want = hash === "#/practice" ? "hub"
      : hash === "#/stats" ? "stats"
      : (hash === "" || hash === "#" || hash === "#/") ? "home"
      : null;
    if (want && view !== want) setView(want, { focus: true });
  }

  /* ---------- wiring ---------- */
  async function init() {
    /* hydrate profiles and the active profile's data before any view renders */
    setAppLoading(true);
    try {
      await loadProfiles();
      await syncProfiles();
      profile = activeProfile() || profile;
      if (profile && profile.id) {
        repo = createRepositoryFor(profile.id);
        await hydrate();
      }
    } catch {}
    setAppLoading(false);

    /* routing first — navigation must survive any later wiring failure */
    window.addEventListener("hashchange", route);
    route();

    /* delegated nav: works even when hashchange never fires (mixed/cached assets) */
    document.addEventListener("click", (e) => {
      const nav = e.target.closest("a[data-nav]");
      if (!nav) return;
      e.preventDefault();
      const href = nav.getAttribute("href") || "";
      if ((location.hash || "") !== href) location.hash = href;
      route();
    });

    /* header date */
    const d = new Date();
    $("#hero-date").textContent = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

    /* profile identity */
    applyProfileChrome();
    const pfChip = $("#pf-chip");
    if (pfChip) pfChip.addEventListener("click", openProfileSwitcher);
    const pfSwitch = $("#pf-switch");
    if (pfSwitch) pfSwitch.addEventListener("click", openProfileSwitcher);
    const pfEdit = $("#pf-edit");
    if (pfEdit) pfEdit.addEventListener("click", openRenameProfile);
    const rosterAdd = $("#roster-add");
    if (rosterAdd) rosterAdd.addEventListener("click", () => openNewPlayer(null));

    /* mode toggle */
    bindSegGroup($("[data-mode]").parentElement, "data-mode", (val) => {
      state.mode = val;
      $$("[data-pane]").forEach((p) => { p.hidden = p.getAttribute("data-pane") !== val; });
    }, "match");

    /* game type */
    bindSegGroup($('[data-game]').parentElement, "data-game", (val) => {
      state.game = val;
      $$('[data-when]').forEach((f) => { f.hidden = f.getAttribute("data-when") !== val; });
    }, "01");

    /* starting score */
    bindSegGroup($('[data-score]').parentElement, "data-score", (val) => { state.score = Number(val); }, "501");

    /* around the world: marks per target */
    if ($('[data-atwmarks]')) {
      bindSegGroup($('[data-atwmarks]').parentElement, "data-atwmarks", (val) => { state.atwMarks = Number(val); }, "1");
    }

    /* match length */
    bindSegGroup($('[data-len]').parentElement, "data-len", (val) => { state.len = Number(val); }, "1");

    /* practice mode */
    bindSegGroup($('[data-practice]').parentElement, "data-practice", (val) => {
      state.practice = val;
      $$('[data-pwhen]').forEach((f) => { f.hidden = f.getAttribute("data-pwhen") !== val; });
    }, "target");

    if ($('[data-darts]')) {
      bindSegGroup($('[data-darts]').parentElement, "data-darts", (val) => { state.darts = Number(val); }, "20");
    }

    if ($('[data-g9variant]')) {
      bindSegGroup($('[data-g9variant]').parentElement, "data-g9variant", (val) => { state.g9variant = val; }, "cricket");
    }

    /* hamburger-free: slot interactions via delegation */
    const slotsEl = $("#slots");
    if (slotsEl) slotsEl.addEventListener("click", (e) => {
      const src = e.target.closest("[data-src]");
      if (src) {
        const i = Number(src.getAttribute("data-slot"));
        state.slots[i].source = src.getAttribute("data-src");
        state.firstThrower = Math.min(state.firstThrower, 1);
        renderSlots(); renderFirstThrower();
        return;
      }
      const pick = e.target.closest("[data-pick]");
      if (pick) {
        const i = Number(pick.getAttribute("data-slot"));
        state.slots[i].playerId = pick.getAttribute("data-pick");
        renderSlots(); renderFirstThrower();
        return;
      }
      const diff = e.target.closest("[data-diff]");
      if (diff) {
        const i = Number(diff.getAttribute("data-slot"));
        state.slots[i].difficulty = diff.getAttribute("data-diff");
        renderSlots(); renderFirstThrower();
        return;
      }
      const add = e.target.closest("[data-add]");
      if (add) { openNewPlayer(Number(add.getAttribute("data-slot"))); return; }
    });

    $("#firstthrow").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-first]");
      if (!btn) return;
      state.firstThrower = Number(btn.getAttribute("data-first"));
      renderFirstThrower();
    });

    $("#start-match").addEventListener("click", startMatch);
    $("#start-practice").addEventListener("click", startPractice);

    /* practice hub quick start (guarded — hub markup may be absent) */
    if ($("[data-hubmode]")) {
      bindSegGroup($("[data-hubmode]").parentElement, "data-hubmode", (val) => {
        hubMode = val;
        $$("[data-hubpane]").forEach((p) => { p.hidden = p.getAttribute("data-hubpane") !== val; });
      }, "target");

      bindSegGroup($("[data-hubdarts]").parentElement, "data-hubdarts", (val) => { hubDarts = Number(val); }, "20");

      if ($("[data-hubg9variant]")) {
        bindSegGroup($("[data-hubg9variant]").parentElement, "data-hubg9variant", (val) => { hubG9Variant = val; }, "cricket");
      }

      $("#hub-random-target").addEventListener("click", () => {
        const sel = $("#hub-target-select");
        sel.selectedIndex = Math.floor(Math.random() * sel.options.length);
        toast(`Focus: ${targetName(sel.value)}`);
      });
      $("#hub-random-checkout").addEventListener("click", () => {
        const sel = $("#hub-checkout-select");
        sel.selectedIndex = Math.floor(Math.random() * sel.options.length);
        toast(`Checkout: ${sel.value}`);
      });
      $("#hub-start-target").addEventListener("click", startHubPractice);
      $("#hub-start-checkout").addEventListener("click", startHubPractice);
      $("#hub-start-game9").addEventListener("click", startHubPractice);
    }

    $("#random-target").addEventListener("click", () => {
      const sel = $("#target-select");
      sel.selectedIndex = Math.floor(Math.random() * sel.options.length);
      toast(`Focus: ${targetName(sel.value)}`);
    });
    $("#random-checkout").addEventListener("click", () => {
      const sel = $("#checkout-select");
      sel.selectedIndex = Math.floor(Math.random() * sel.options.length);
      toast(`Checkout: ${sel.value}`);
    });

    /* active list actions (home + hub share the markup) */
    const onListClick = (e) => {
      const res = e.target.closest("[data-resume]");
      if (res) { openResume(res.getAttribute("data-resume")); return; }
      const disc = e.target.closest("[data-discard]");
      if (disc) {
        const id = disc.getAttribute("data-discard");
        if (disc.dataset.confirm === "1") {
          active = active.filter((g) => g.id !== id);
          repo.activeGames.save(active);
          renderActive();
          renderHubActive();
          toast("Game discarded.");
        } else {
          disc.dataset.confirm = "1";
          disc.classList.add("is-confirm");
          disc.setAttribute("aria-label", "Confirm discard");
          disc.textContent = "Sure?";
          setTimeout(() => { renderActive(); renderHubActive(); }, 3000);
        }
      }
    };
    if ($("#active-list")) $("#active-list").addEventListener("click", onListClick);
    if ($("#hub-active-list")) $("#hub-active-list").addEventListener("click", onListClick);

    /* sheet + scrim */
    $("#sheet-close").addEventListener("click", closeSheet);
    $("#scrim").addEventListener("click", closeSheet);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });

    /* play view */
    $("#play-head").addEventListener("click", (e) => {
      if (e.target.closest("[data-play-back]")) {
        backFromPlay();
        return;
      }
      if (e.target.closest("[data-play-finish]")) {
        const g = currentPlay();
        if (!g || g.kind === "match") return;
        finishSession(g);
      }
    });
    $("#play-body").addEventListener("click", (e) => {
      const g = currentPlay();
      if (!g) return;
      const isMatch = g.kind === "match";
      if (isMatch && g.players[g.turn].kind === "ai") return;
      const submit = (v, label, dbl) => {
        playMsg = "";
        if (g.game === "cricket") enterCricketDart(g, v, label, dbl);
        else if (g.game === "atw") enterAtwDart(g, v, label, dbl);
        else if (isMatch) enterMatchDart(g, v, label, dbl);
        else enterDart(g, v, label, dbl);
      };

      const cri = e.target.closest("[data-cri]");
      if (cri) {
        if (cri.disabled) return;
        const k = cri.dataset.cri === "B" ? "b" : parseInt(cri.dataset.cri);
        const m = parseInt(cri.dataset.m || "1");
        if (g.players[g.turn].kind === "ai") return;
        const label = k === "b" ? (m === 2 ? "Double bull" : "Single bull") : (m === 3 ? "T" + k : (m === 2 ? "D" + k : String(k)));
        const v = k === "b" ? (m === 2 ? 50 : 25) : (m === 3 ? k * 3 : (m === 2 ? k * 2 : k));
        submit(v, label, m === 2);
        return;
      }
      const g9 = e.target.closest("[data-g9hit],[data-g9miss]");
      if (g9) {
        playMsg = "";
        recordGame9(g, g9.hasAttribute("data-g9hit"));
        return;
      }
      const t = e.target.closest("[data-t]");
      if (t) {
        playMsg = "";
        recordTarget(g, t.getAttribute("data-t") === "hit");
        return;
      }
      const mult = e.target.closest("[data-mult]");
      if (mult) {
        playMult = Number(mult.getAttribute("data-mult"));
        $$("#play-body [data-mult]").forEach((b) => {
          const on = b === mult;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-pressed", String(on));
        });
        return;
      }
      if (e.target.closest("[data-miss]")) {
        submit(0, "Miss", false);
        return;
      }
      const fixed = e.target.closest("[data-fixed]");
      if (fixed) {
        if (fixed.getAttribute("data-fixed") === "25") submit(25, "Single bull", false);
        else submit(50, "Double bull", true);
        return;
      }
      const num = e.target.closest("[data-pad]");
      if (num) {
        const n = Number(num.getAttribute("data-pad"));
        const label = playMult === 1 ? `${n}` : playMult === 2 ? `D${n}` : `T${n}`;
        submit(n * playMult, label, playMult === 2);
      }
    });

    /* placeholder destinations */
    document.addEventListener("click", (e) => {
      const soon = e.target.closest("[data-soon]");
      if (!soon) return;
      e.preventDefault();
      toast(`${soon.getAttribute("data-soon")} is coming in a later page build.`);
    });

    renderSlots();
    renderFirstThrower();
    renderHome();
    booted = true;
    hydrateOpponents();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
