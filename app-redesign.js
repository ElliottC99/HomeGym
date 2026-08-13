(function () {
  "use strict";

  const I = window.HG_INTERNALS;
  if (!I || !window.React || !window.ReactDOM) {
    document.getElementById("root").textContent = "Home Gym could not start. Please close and reopen the app.";
    return;
  }

  const h = React.createElement;
  const { useState, useEffect, useCallback, useRef } = React;
  const FEELINGS = [
    ["very_easy", "Very easy"],
    ["good", "Good"],
    ["challenging", "Challenging"],
    ["very_hard", "Very hard"],
    ["pain", "Pain / discomfort"],
  ];
  const FEELING_LABELS = Object.fromEntries(FEELINGS);
  const NAV = [
    ["today", "◉", "Today"],
    ["history", "≡", "History"],
    ["progress", "↗", "Progress"],
    ["metrics", "◇", "Metrics"],
    ["plan", "☰", "Plan"],
  ];
  const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function storageGet(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function activeKey(personId) {
    return `hg_active_workout_v1:${personId}`;
  }

  function loadActive(personId) {
    return storageGet(activeKey(personId), null);
  }

  function saveActive(personId, value) {
    if (value) storageSet(activeKey(personId), value);
    else {
      try { localStorage.removeItem(activeKey(personId)); } catch {}
    }
  }

  function applyTheme(theme) {
    const safe = ["system", "light", "dark"].includes(theme) ? theme : "system";
    try { localStorage.setItem("hg_appearance", safe); } catch {}
    if (safe === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = safe;
    document.documentElement.style.colorScheme = safe === "system" ? "light dark" : safe;
    const dark = safe === "dark" ||
      (safe === "system" && window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#111214" : "#F7F6F2");
  }

  function getTheme() {
    try { return localStorage.getItem("hg_appearance") || "system"; }
    catch { return "system"; }
  }

  function lockPortrait() {
    const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true ||
      document.fullscreenElement;
    if (!standalone || !screen.orientation?.lock) return Promise.resolve(false);
    return screen.orientation.lock("portrait-primary").then(() => true).catch(() => false);
  }

  function formatElapsed(startedAt) {
    const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    const minutes = Math.floor(seconds / 60);
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }

  function parsePrescription(text) {
    const values = String(text || "").match(/\d+(?:\.\d+)?/g) || [];
    return { sets: values[0] || "", reps: values[1] || "" };
  }

  function rpeToFeeling(rpe) {
    if (rpe == null || rpe === "") return "good";
    const value = Number(rpe);
    if (value <= 3) return "very_easy";
    if (value <= 6) return "good";
    if (value <= 8) return "challenging";
    return "very_hard";
  }

  // --- Equipment & Progressive Overload Helpers ---

  function getAvailablePlates(data, personId) {
    if (Array.isArray(data?.equipment?.plates) && data.equipment.plates.length > 0) {
      return data.equipment.plates;
    }
    const saved = storageGet(`hg_equipment_${personId}`, null);
    if (Array.isArray(saved?.plates) && saved.plates.length > 0) {
      return saved.plates;
    }
    return [1.5, 2.5, 5]; // Default plates requested by user (5kg, 2.5kg, 1.5kg)
  }

  function getEquipmentConfig(data, personId) {
    const custom = data?.equipment || storageGet(`hg_equipment_${personId}`, null) || {};
    return {
      plates: Array.isArray(custom.plates) && custom.plates.length > 0 ? custom.plates : [1.5, 2.5, 5],
      barbellWeight: Number(custom.barbellWeight) || 20,
      dbHandleWeight: Number(custom.dbHandleWeight) || 2,
    };
  }

  function saveEquipmentConfig(personId, config, updateData) {
    storageSet(`hg_equipment_${personId}`, config);
    if (updateData) {
      updateData(personId, current => ({
        ...current,
        equipment: config,
      }));
    }
  }

  function getAchievableIncrements(plates, isPerSide) {
    const sortedPlates = [...new Set(plates.map(Number))].filter(p => p > 0).sort((a, b) => a - b);
    if (sortedPlates.length === 0) return [1.5, 2.5, 5];

    const jumps = new Set();
    if (isPerSide) {
      // Dumbbells per handle
      for (const p of sortedPlates) {
        jumps.add(p);
        jumps.add(p * 2);
      }
      for (let i = 0; i < sortedPlates.length; i++) {
        for (let j = i + 1; j < sortedPlates.length; j++) {
          jumps.add(sortedPlates[i] + sortedPlates[j]);
          jumps.add(sortedPlates[i] * 2 + sortedPlates[j] * 2);
        }
      }
    } else {
      // Barbells (pairs added to both sides)
      for (const p of sortedPlates) {
        jumps.add(p * 2);
      }
      for (let i = 0; i < sortedPlates.length; i++) {
        for (let j = i + 1; j < sortedPlates.length; j++) {
          jumps.add(sortedPlates[i] * 2 + sortedPlates[j] * 2);
        }
      }
      for (const p of sortedPlates) {
        jumps.add(p * 4);
      }
    }
    return Array.from(jumps).sort((a, b) => a - b);
  }

  function getPossibleWeightJumps(currentWeight, plates, isPerSide, count = 4) {
    const base = Number(currentWeight) || 0;
    const increments = getAchievableIncrements(plates, isPerSide);
    const possible = increments.map(inc => ({
      increment: inc,
      totalWeight: Math.round((base + inc) * 100) / 100,
      label: `+${inc}kg (${Math.round((base + inc) * 100) / 100}kg)`
    }));
    return possible.slice(0, count);
  }

  function snapToAchievable(rawWeight, currentWeight, plates, isPerSide) {
    if (rawWeight == null || !Number.isFinite(Number(rawWeight))) return rawWeight;
    const target = Number(rawWeight);
    const base = currentWeight != null && Number.isFinite(Number(currentWeight)) ? Number(currentWeight) : null;
    
    if (base != null && target > base) {
      const jumps = getPossibleWeightJumps(base, plates, isPerSide, 12);
      let best = jumps[0]?.totalWeight || target;
      let minDiff = Math.abs(best - target);
      for (const j of jumps) {
        const diff = Math.abs(j.totalWeight - target);
        if (diff < minDiff) {
          minDiff = diff;
          best = j.totalWeight;
        }
      }
      return best;
    }
    return Math.round(target * 2) / 2;
  }

  function getExerciseRecommendation({ exercise, data, weekInfo, personId }) {
    if (!exercise) return null;
    
    const plates = getAvailablePlates(data, personId);
    const isPerSide = exercise.weightMode === "perSide";

    const logs = [...(data?.logs || [])].filter(l => l.exerciseId === exercise.id && l.weight != null && Number.isFinite(Number(l.weight)));
    logs.sort((a, b) => b.date.localeCompare(a.date));
    const previous = logs[0] || null;

    const isDeload = weekInfo?.isDeload;
    const blockTarget = exercise.primary ? I.de(exercise, weekInfo) : null;

    let recWeight = null;
    let reason = "";
    let overloadType = "maintain";
    let weightDiff = 0;

    if (isDeload) {
      const baseVal = previous?.weight ?? blockTarget ?? exercise.startValue ?? 20;
      recWeight = Math.round((baseVal * 0.8) * 2) / 2;
      reason = "Deload week: Lightened load (80%) for active recovery";
      overloadType = "deload";
    } else if (previous) {
      const prevW = Number(previous.weight);
      const feel = previous.feeling || rpeToFeeling(previous.rpe);

      if (feel === "very_easy" || feel === "good") {
        overloadType = "increase";
        const possibleJumps = getPossibleWeightJumps(prevW, plates, isPerSide, 4);
        
        if (blockTarget && blockTarget > prevW) {
          const snapped = snapToAchievable(blockTarget, prevW, plates, isPerSide);
          recWeight = snapped;
          weightDiff = Math.round((recWeight - prevW) * 10) / 10;
          reason = `Progressive overload: Target ${recWeight}kg for Week ${weekInfo?.blockWeeksLabel || "this block"} (+${weightDiff}kg over last ${prevW}kg)`;
        } else {
          const smallestJump = possibleJumps[0];
          recWeight = smallestJump ? smallestJump.totalWeight : prevW + (isPerSide ? 1.5 : 3.0);
          weightDiff = Math.round((recWeight - prevW) * 10) / 10;
          reason = `Progressive overload: +${weightDiff}kg over previous ${prevW}kg (last session felt ${FEELING_LABELS[feel] || "good"})`;
        }
      } else if (feel === "very_hard" || feel === "pain") {
        recWeight = prevW;
        reason = `Maintain ${prevW}kg — last session felt ${FEELING_LABELS[feel] || "very hard"}`;
        overloadType = "maintain";
      } else {
        if (blockTarget && blockTarget > prevW) {
          const snapped = snapToAchievable(blockTarget, prevW, plates, isPerSide);
          recWeight = snapped;
          weightDiff = Math.round((recWeight - prevW) * 10) / 10;
          reason = `Block target: ${recWeight}kg (+${weightDiff}kg over previous ${prevW}kg)`;
          overloadType = "increase";
        } else {
          recWeight = prevW;
          reason = `Consolidate at ${prevW}kg before increasing load`;
          overloadType = "maintain";
        }
      }
    } else {
      if (blockTarget != null) {
        recWeight = snapToAchievable(blockTarget, 0, plates, isPerSide);
        reason = `Program starting target for Week ${weekInfo?.blockWeeksLabel || "1"}`;
        overloadType = "initial";
      } else if (exercise.startValue != null) {
        recWeight = exercise.startValue;
        reason = `Starting plan weight: ${exercise.startValue}kg`;
        overloadType = "initial";
      } else {
        recWeight = null;
        reason = exercise.startLabel || "Bodyweight / Band";
        overloadType = "initial";
      }
    }

    let possibleJumps = [];
    if (recWeight != null && Number.isFinite(recWeight)) {
      const baseW = previous ? Number(previous.weight) : recWeight;
      possibleJumps = getPossibleWeightJumps(baseW, plates, isPerSide, 4);
    }

    return {
      recommendedWeight: recWeight,
      formattedWeight: recWeight != null ? I.z(recWeight, isPerSide) : (exercise.startLabel || "Bodyweight"),
      reason,
      overloadType,
      previousWeight: previous?.weight ?? null,
      possibleJumps,
      plates,
    };
  }

  function EquipmentSection({ personId, data, updateData, showToast }) {
    const config = getEquipmentConfig(data, personId);
    const [selectedPlates, setSelectedPlates] = useState(config.plates);
    const [barbellWeight, setBarbellWeight] = useState(String(config.barbellWeight));
    const [dbHandleWeight, setDbHandleWeight] = useState(String(config.dbHandleWeight));
    const [customPlate, setCustomPlate] = useState("");

    const ALL_COMMON_PLATES = [0.5, 1.25, 1.5, 2.5, 5, 10, 15, 20];

    function togglePlate(weightVal) {
      setSelectedPlates(prev => {
        if (prev.includes(weightVal)) {
          if (prev.length <= 1) return prev;
          return prev.filter(p => p !== weightVal);
        } else {
          return [...prev, weightVal].sort((a, b) => a - b);
        }
      });
    }

    function addCustomPlate() {
      const val = parseFloat(customPlate);
      if (!val || val <= 0) return;
      if (!selectedPlates.includes(val)) {
        setSelectedPlates(prev => [...prev, val].sort((a, b) => a - b));
      }
      setCustomPlate("");
    }

    function saveEquipment() {
      const newConfig = {
        plates: selectedPlates,
        barbellWeight: Number(barbellWeight) || 20,
        dbHandleWeight: Number(dbHandleWeight) || 2,
      };
      saveEquipmentConfig(personId, newConfig, updateData);
      showToast("Equipment & plates updated");
    }

    const bbJumps = getPossibleWeightJumps(Number(barbellWeight) || 20, selectedPlates, false, 5);
    const dbJumps = getPossibleWeightJumps(Number(dbHandleWeight) || 2, selectedPlates, true, 5);

    return h("div", { className: "hg-setting-section" },
      h("h3", null, "Available Weight Plates & Equipment"),
      h("p", null, "Select available weight plates (e.g., 1.5kg, 2.5kg, 5kg) to calculate progressive overload jumps."),
      
      h("div", { className: "hg-field", style: { marginBottom: 12 } },
        h("label", null, "Available Weight Plates (kg)"),
        h("div", { className: "hg-plates-grid" },
          ALL_COMMON_PLATES.map(p => {
            const isSel = selectedPlates.includes(p);
            return h("button", {
              key: p,
              type: "button",
              className: `hg-plate-tag${isSel ? " selected" : ""}`,
              onClick: () => togglePlate(p)
            }, isSel ? `✓ ${p}kg` : `+ ${p}kg`);
          })
        )
      ),

      h("div", { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 14 } },
        h("input", {
          className: "hg-input",
          type: "number",
          step: ".25",
          placeholder: "Custom plate kg",
          value: customPlate,
          onChange: e => setCustomPlate(e.target.value),
          style: { width: 150 }
        }),
        h(Button, { onClick: addCustomPlate }, "Add plate")
      ),

      h("div", { className: "hg-fields" },
        h(Field, { label: "Empty Barbell Weight (kg)" },
          h("input", { className: "hg-input", type: "number", step: "1", value: barbellWeight, onChange: e => setBarbellWeight(e.target.value) })
        ),
        h(Field, { label: "Dumbbell Handle Weight (kg)" },
          h("input", { className: "hg-input", type: "number", step: ".5", value: dbHandleWeight, onChange: e => setDbHandleWeight(e.target.value) })
        )
      ),

      h("div", { className: "hg-callout", style: { marginTop: 12 } },
        h("strong", null, "Calculated Weight Increases:"),
        h("div", { style: { marginTop: 4, fontSize: 12 } },
          `Barbell (+2 plates): ${bbJumps.map(j => j.label).join(", ")}`,
          h("br"),
          `Dumbbells (per side): ${dbJumps.map(j => j.label).join(", ")}`
        )
      ),

      h("div", { className: "hg-actions" },
        h(Button, { primary: true, onClick: saveEquipment }, "Save equipment")
      )
    );
  }

  function randomHouseholdKey() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  }

  function flattenExercises(session) {
    if (!session || session.type !== "strength") return [];
    return (session.groups || []).flatMap(group =>
      (group.exercises || []).map(exercise => ({ exercise, groupLabel: group.label }))
    );
  }

  function findExercise(data, sessionId, exerciseId) {
    const session = data.sessions.find(item => item.id === sessionId);
    if (!session || session.type !== "strength") return null;
    for (const group of session.groups || []) {
      const exercise = (group.exercises || []).find(item => item.id === exerciseId);
      if (exercise) return { session, group, exercise };
    }
    return null;
  }

  function todaySessions(data) {
    const today = I.W();
    const monday = I.j(today);
    const day = I.De(today);
    return data.sessions.filter(session => I.ue(data, session, monday) === day);
  }

  function nextScheduled(data) {
    const today = I.W();
    for (let offset = 1; offset <= 7; offset += 1) {
      const date = I.ae(today, offset);
      const monday = I.j(date);
      const day = I.De(date);
      const session = data.sessions.find(item => I.ue(data, item, monday) === day);
      if (session) return { session, date, day };
    }
    return null;
  }

  function mutateLegacyStyles() {
    const styles = I.o;
    if (!styles || styles.__hg2) return;
    styles.__hg2 = true;
    const surface = "var(--hg-surface)";
    const background = "var(--hg-bg)";
    const border = "1px solid var(--hg-border)";
    const text = "var(--hg-text)";
    const text2 = "var(--hg-text-2)";
    for (const key of ["formCard", "sessionCard", "liftCard", "statCard", "modal"]) {
      if (styles[key]) Object.assign(styles[key], { background: surface, border });
    }
    for (const key of ["input", "select", "daySelect", "targetHint", "noteBox", "restTimer"]) {
      if (styles[key]) Object.assign(styles[key], { background, border, color: text });
    }
    if (styles.smallBtn) Object.assign(styles.smallBtn, { border, color: text2, minHeight: 44 });
    if (styles.primaryBtn) Object.assign(styles.primaryBtn, { minHeight: 46 });
    if (styles.label) styles.label.color = text2;
    if (styles.emptyState) styles.emptyState.color = text2;
    if (styles.sectionTitle) styles.sectionTitle.color = text2;
  }

  mutateLegacyStyles();
  applyTheme(getTheme());

  function Field({ label, full, children }) {
    return h("div", { className: `hg-field${full ? " full" : ""}` },
      h("label", null, label),
      children
    );
  }

  function Button({ children, primary, ghost, danger, ...props }) {
    const classes = ["hg-button"];
    if (primary) classes.push("primary");
    if (ghost) classes.push("ghost");
    if (danger) classes.push("danger");
    return h("button", { type: "button", className: classes.join(" "), ...props }, children);
  }

  function RestTimer({ defaultSeconds, timerEndAt, onTimerChange }) {
    const [duration, setDuration] = useState(defaultSeconds || 90);
    const [now, setNow] = useState(Date.now());
    const remaining = timerEndAt ? Math.max(0, Math.ceil((timerEndAt - now) / 1000)) : duration;
    const wasRunning = useRef(Boolean(timerEndAt));

    useEffect(() => {
      if (!timerEndAt) {
        wasRunning.current = false;
        return undefined;
      }
      const interval = setInterval(() => setNow(Date.now()), 250);
      return () => clearInterval(interval);
    }, [timerEndAt]);

    useEffect(() => {
      if (timerEndAt && remaining === 0 && wasRunning.current) {
        wasRunning.current = false;
        onTimerChange(null);
        if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
        try {
          const Context = window.AudioContext || window.webkitAudioContext;
          if (Context) {
            const context = new Context();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.frequency.value = 880;
            gain.gain.setValueAtTime(.12, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .35);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + .35);
          }
        } catch {}
      }
    }, [remaining, timerEndAt, onTimerChange]);

    function start() {
      wasRunning.current = true;
      setNow(Date.now());
      onTimerChange(Date.now() + duration * 1000);
    }

    return h("div", { className: "hg-timer" },
      h("div", null,
        h("div", { className: "hg-timer-value" },
          `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
        ),
        h("div", { className: "hg-history-meta" }, timerEndAt ? "Resting" : "Rest timer")
      ),
      h("div", { style: { display: "flex", gap: 7, alignItems: "center" } },
        !timerEndAt && h("select", {
          className: "hg-input",
          value: duration,
          "aria-label": "Rest duration",
          style: { width: 88, minHeight: 42, padding: "6px 8px" },
          onChange: event => setDuration(Number(event.target.value)),
        }, [30, 45, 60, 75, 90, 120, 180].map(value =>
          h("option", { key: value, value }, `${value}s`)
        )),
        h(Button, {
          onClick: timerEndAt ? () => onTimerChange(null) : start,
        }, timerEndAt ? "Stop" : "Start")
      )
    );
  }

  function ReadinessInline({ personId, showToast }) {
    const key = `hg_readiness_${personId}`;
    const today = I.W();
    const records = storageGet(key, []);
    const current = records.find(item => item.date === today);
    const [open, setOpen] = useState(!current);

    const initialHours = current?.sleepHours != null ? current.sleepHours : (current?.sleep != null ? Math.floor(Number(current.sleep)) : "");
    const initialMins = current?.sleepMins != null ? current.sleepMins : (current?.sleep != null ? Math.round((Number(current.sleep) % 1) * 60) : "");

    const [sleepHours, setSleepHours] = useState(current ? String(initialHours) : "7");
    const [sleepMins, setSleepMins] = useState(current ? String(initialMins) : "30");
    const [soreness, setSoreness] = useState(current ? String(current.soreness) : "3");
    const [motivation, setMotivation] = useState(current ? String(current.motivation) : "3");

    function save() {
      const hrs = Number(sleepHours) || 0;
      const mins = Number(sleepMins) || 0;
      if (!sleepHours && !sleepMins) {
        showToast("Add hours and minutes of sleep");
        return;
      }
      const decimalSleep = Math.round((hrs + mins / 60) * 100) / 100;
      const entry = {
        id: current?.id || `read_${Date.now()}`,
        date: today,
        sleep: decimalSleep,
        sleepHours: hrs,
        sleepMins: mins,
        soreness: Number(soreness),
        motivation: Number(motivation),
      };
      storageSet(key, [...records.filter(item => item.date !== today), entry]);
      setOpen(false);
      showToast("Readiness saved");
    }

    const formatSleepSummary = (item) => {
      if (!item) return "";
      const h = item.sleepHours != null ? item.sleepHours : Math.floor(Number(item.sleep) || 0);
      const m = item.sleepMins != null ? item.sleepMins : Math.round(((Number(item.sleep) || 0) % 1) * 60);
      return `${h}h ${m}m sleep`;
    };

    return h("div", { className: "hg-callout" },
      h("div", { style: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" } },
        h("div", null,
          h("strong", null, "Today's readiness"),
          current && !open && h("div", { className: "hg-history-meta" },
            `${formatSleepSummary(current)} · soreness ${current.soreness}/5 · motivation ${current.motivation}/5`
          )
        ),
        h("button", { type: "button", className: "hg-link-button", onClick: () => setOpen(value => !value) },
          open ? "Close" : current ? "Edit" : "Check in"
        )
      ),
      open && h(React.Fragment, null,
        h("div", { className: "hg-fields" },
          h(Field, { label: "Sleep duration", full: true },
            h("div", { style: { display: "flex", gap: 10, alignItems: "center" } },
              h("div", { style: { display: "flex", alignItems: "center", gap: 6, flex: 1 } },
                h("input", {
                  className: "hg-input",
                  type: "number",
                  min: "0",
                  max: "24",
                  placeholder: "7",
                  value: sleepHours,
                  onChange: event => setSleepHours(event.target.value)
                }),
                h("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--hg-text-2)" } }, "hrs")
              ),
              h("div", { style: { display: "flex", alignItems: "center", gap: 6, flex: 1 } },
                h("input", {
                  className: "hg-input",
                  type: "number",
                  min: "0",
                  max: "59",
                  step: "5",
                  placeholder: "30",
                  value: sleepMins,
                  onChange: event => setSleepMins(event.target.value)
                }),
                h("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--hg-text-2)" } }, "mins")
              )
            )
          ),
          h(Field, { label: "Soreness (1–5)" },
            h("input", { className: "hg-input", type: "number", min: 1, max: 5, value: soreness, onChange: event => setSoreness(event.target.value) })
          ),
          h(Field, { label: "Motivation (1–5)" },
            h("input", { className: "hg-input", type: "number", min: 1, max: 5, value: motivation, onChange: event => setMotivation(event.target.value) })
          )
        ),
        h("div", { className: "hg-actions" }, h(Button, { onClick: save }, "Save readiness"))
      )
    );
  }

  function ChecklistStep({ title, copy, items, checked, onToggle, onNext, onBack, showReadiness, personId, showToast }) {
    return h("div", { className: "hg-card" },
      h("div", { className: "hg-card-title" }, title),
      copy && h("div", { className: "hg-card-copy" }, copy),
      showReadiness && h(ReadinessInline, { personId, showToast }),
      items.length > 0 ? h("div", { className: "hg-checklist" },
        items.map((item, index) => {
          const key = `${title}:${index}`;
          return h("label", { className: "hg-check", key },
            h("input", { type: "checkbox", checked: checked.includes(key), onChange: () => onToggle(key) }),
            h("div", null, h("strong", null, item.name), item.detail && h("span", null, item.detail))
          );
        })
      ) : h("div", { className: "hg-callout" }, "No movements are listed for this step."),
      h("div", { className: "hg-actions" },
        onBack && h(Button, { onClick: onBack }, "Back"),
        h(Button, { primary: true, onClick: onNext }, items.length ? "Done — continue" : "Continue")
      )
    );
  }

  function ExerciseStep({ personId, data, session, item, weekInfo, date, active, setActive, updateData, showToast, onBack, onSkip, onSaved }) {
    const exercise = item.exercise;
    const sameDay = data.logs.find(log =>
      log.type === "exercise" && log.sessionId === session.id &&
      log.exerciseId === exercise.id && log.date === date
    );
    const previous = [...data.logs].filter(log =>
      log.type === "exercise" && log.exerciseId === exercise.id && log.id !== sameDay?.id
    ).sort((a, b) => b.date.localeCompare(a.date))[0];
    const prescribed = parsePrescription(exercise.setsReps);

    const recommendation = getExerciseRecommendation({ exercise, data, weekInfo, personId });

    const initialWeight = sameDay?.weight != null ? String(sameDay.weight) :
      recommendation?.recommendedWeight != null ? String(recommendation.recommendedWeight) :
      previous?.weight != null ? String(previous.weight) : "";

    const [weight, setWeight] = useState(initialWeight);
    const [sets, setSets] = useState(sameDay?.sets != null ? String(sameDay.sets) : prescribed.sets);
    const [reps, setReps] = useState(sameDay?.reps != null ? String(sameDay.reps) : prescribed.reps);
    const [feeling, setFeeling] = useState(sameDay?.feeling || rpeToFeeling(sameDay?.rpe));
    const [notes, setNotes] = useState(sameDay?.notes || "");
    const target = I.de(exercise, weekInfo);

    useEffect(() => {
      if (!sameDay && recommendation?.recommendedWeight != null && (weight === "" || weight === undefined)) {
        setWeight(String(recommendation.recommendedWeight));
      }
    }, [exercise.id, sameDay]);

    function save() {
      if (!sets || !reps) {
        showToast("Add sets and reps first");
        return;
      }
      const entry = {
        id: sameDay?.id || `${Date.now()}`,
        type: "exercise",
        sessionId: session.id,
        exerciseId: exercise.id,
        date,
        weight: I.Ae(weight),
        sets: Number.parseInt(sets, 10),
        reps: Number.parseInt(reps, 10),
        completed: true,
        feeling,
        rpe: sameDay?.rpe ?? null,
        notes: notes.trim(),
      };
      const isPr = I.ye(data.logs, exercise.id, entry);
      updateData(personId, current => ({
        ...current,
        logs: sameDay
          ? current.logs.map(log => log.id === sameDay.id ? entry : log)
          : [...current.logs, entry],
      }));
      showToast(isPr ? "New PR! Exercise saved" : "Exercise saved");
      onSaved();
    }

    return h("div", { className: "hg-card" },
      h("div", { className: "hg-section-label", style: { margin: "0 0 7px" } }, item.groupLabel),
      h("div", { className: "hg-exercise-heading" },
        h("div", null,
          h("div", { className: "hg-card-title" }, exercise.name),
          h("div", { className: "hg-card-copy" },
            exercise.setsReps,
            exercise.restNote && exercise.restNote !== "—" ? ` · rest ${exercise.restNote}` : ""
          )
        ),
        h("div", { className: "hg-exercise-target" },
          target != null ? I.z(target, exercise.weightMode === "perSide") : I.re(exercise)
        )
      ),
      exercise.note && h("div", { className: "hg-callout" }, exercise.note),
      recommendation && recommendation.recommendedWeight != null && h("div", { className: "hg-recommendation-card" },
        h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 } },
          h("div", null,
            h("div", { className: "hg-rec-label" }, "RECOMMENDED WEIGHT (PROGRESSIVE OVERLOAD)"),
            h("div", { className: "hg-rec-weight" }, recommendation.formattedWeight)
          ),
          h("button", {
            type: "button",
            className: "hg-button primary",
            style: { minHeight: 36, padding: "6px 12px", fontSize: 13 },
            onClick: () => setWeight(String(recommendation.recommendedWeight))
          }, "Use " + recommendation.formattedWeight)
        ),
        h("div", { className: "hg-rec-reason" }, recommendation.reason),
        recommendation.possibleJumps && recommendation.possibleJumps.length > 0 && h("div", { className: "hg-rec-jumps" },
          h("span", { className: "hg-rec-jumps-title" }, `Possible increases with your ${recommendation.plates.join("kg, ")}kg plates:`),
          recommendation.possibleJumps.map(j =>
            h("button", {
              key: j.totalWeight,
              type: "button",
              className: `hg-jump-chip${String(weight) === String(j.totalWeight) ? " active" : ""}`,
              onClick: () => setWeight(String(j.totalWeight))
            }, j.label)
          )
        )
      ),
      previous && h("div", { className: "hg-previous" },
        h("strong", null, "Previous performance"),
        h("div", null,
          `${previous.date} · ${previous.weight != null ? I.je(previous.weight, exercise.weightMode === "perSide") + " · " : ""}${previous.sets} × ${previous.reps}${exercise.metric === "seconds" ? " sec" : ""}`,
          previous.feeling ? ` · ${FEELING_LABELS[previous.feeling] || previous.feeling}` :
            previous.rpe != null ? ` · RPE ${previous.rpe}` : ""
        )
      ),
      h("div", { className: "hg-fields" },
        h(Field, { label: `Weight (${exercise.unit}${exercise.weightMode === "perSide" ? " each" : ""})` },
          h("input", { className: "hg-input", type: "text", inputMode: "decimal", value: weight, onChange: event => setWeight(event.target.value), placeholder: I.re(exercise) })
        ),
        h(Field, { label: "Sets completed" },
          h("input", { className: "hg-input", type: "number", min: 0, value: sets, onChange: event => setSets(event.target.value) })
        ),
        h(Field, { label: exercise.metric === "seconds" ? "Seconds per set" : "Reps per set" },
          h("input", { className: "hg-input", type: "number", min: 0, value: reps, onChange: event => setReps(event.target.value) })
        ),
        h(Field, { label: "How did it feel?" },
          h("select", { className: "hg-input", value: feeling, onChange: event => setFeeling(event.target.value) },
            FEELINGS.map(([value, label]) => h("option", { key: value, value }, label))
          )
        )
      ),
      h("details", { style: { marginTop: 13 } },
        h("summary", { className: "hg-link-button", style: { cursor: "pointer", display: "inline-flex", alignItems: "center" } }, notes ? "Edit note" : "Add optional note"),
        h("textarea", { className: "hg-input", value: notes, onChange: event => setNotes(event.target.value), placeholder: "Anything worth remembering?" })
      ),
      h(RestTimer, {
        defaultSeconds: exercise.restSec || 90,
        timerEndAt: active.timerEndAt || null,
        onTimerChange: timerEndAt => setActive({ ...active, timerEndAt }),
      }),
      h("div", { className: "hg-actions" },
        h(Button, { onClick: onBack }, "Back"),
        h(Button, { ghost: true, onClick: onSkip }, "Skip"),
        h(Button, { primary: true, onClick: save }, sameDay ? "Update & next" : "Save & next")
      )
    );
  }

  function RunStep({ personId, data, session, date, updateData, showToast, onSaved, onSkip }) {
    const sameDay = data.logs.find(log => log.type === "run" && log.sessionId === session.id && log.date === date);
    const [distance, setDistance] = useState(sameDay ? String(sameDay.distance) : String(session.targetKm || ""));
    const [duration, setDuration] = useState(sameDay ? String(sameDay.duration) : "");
    const [effort, setEffort] = useState(sameDay?.effort || "easy");
    const [notes, setNotes] = useState(sameDay?.notes || "");
    const phase = session.runPhases?.[I.Re(data.startDate).cycleWeek <= 4 ? 0 : 1] || session.runPhases?.[0];

    function save() {
      if (!distance || !duration) {
        showToast("Add distance and duration first");
        return;
      }
      const entry = {
        id: sameDay?.id || `${Date.now()}`,
        type: "run",
        sessionId: session.id,
        exerciseId: session.id,
        date,
        distance: Number(distance),
        duration: Number(duration),
        effort,
        notes: notes.trim(),
      };
      updateData(personId, current => ({
        ...current,
        logs: sameDay
          ? current.logs.map(log => log.id === sameDay.id ? entry : log)
          : [...current.logs, entry],
      }));
      showToast("Run saved");
      onSaved();
    }

    return h("div", { className: "hg-card" },
      h("div", { className: "hg-card-title" }, session.name),
      h("div", { className: "hg-card-copy" }, session.duration),
      phase && h("div", { className: "hg-callout" },
        h("strong", null, phase.label),
        phase.items.map((item, index) => h("div", { key: index, style: { marginTop: 5 } }, `${item.label}: ${item.value}`))
      ),
      h("div", { className: "hg-fields" },
        h(Field, { label: "Distance (km)" },
          h("input", { className: "hg-input", type: "number", step: ".1", value: distance, onChange: event => setDistance(event.target.value) })
        ),
        h(Field, { label: "Duration (minutes)" },
          h("input", { className: "hg-input", type: "number", value: duration, onChange: event => setDuration(event.target.value) })
        ),
        h(Field, { label: "Effort", full: true },
          h("select", { className: "hg-input", value: effort, onChange: event => setEffort(event.target.value) },
            h("option", { value: "easy" }, "Easy / Zone 2"),
            h("option", { value: "moderate" }, "Moderate"),
            h("option", { value: "hard" }, "Hard / intervals")
          )
        )
      ),
      h("details", { style: { marginTop: 13 } },
        h("summary", { className: "hg-link-button", style: { cursor: "pointer", display: "inline-flex" } }, notes ? "Edit note" : "Add optional note"),
        h("textarea", { className: "hg-input", value: notes, onChange: event => setNotes(event.target.value) })
      ),
      h("div", { className: "hg-actions" },
        h(Button, { ghost: true, onClick: onSkip }, "Skip"),
        h(Button, { primary: true, onClick: save }, sameDay ? "Update & finish" : "Save & finish")
      )
    );
  }

  function GuidedWorkout({ personId, data, meta, active, setActive, updateData, showToast, onClose, onHistory }) {
    const session = data.sessions.find(item => item.id === active.sessionId);
    const weekInfo = I.HGgetDeload(personId) === I.j(I.W())
      ? { ...I.Re(data.startDate), isDeload: true }
      : I.Re(data.startDate);
    const exercises = flattenExercises(session);
    const steps = session?.type === "run"
      ? [{ type: "run", key: "run" }, { type: "complete", key: "complete" }]
      : [
          { type: "warmup", key: "warmup" },
          ...exercises.map((item, index) => ({ type: "exercise", key: `exercise:${item.exercise.id}:${index}`, item })),
          { type: "cooldown", key: "cooldown" },
          { type: "complete", key: "complete" },
        ];
    const stepIndex = Math.min(active.step || 0, Math.max(steps.length - 1, 0));
    const step = steps[stepIndex];

    useEffect(() => {
      lockPortrait();
      const onVisible = () => { if (!document.hidden) lockPortrait(); };
      document.addEventListener("visibilitychange", onVisible);
      return () => document.removeEventListener("visibilitychange", onVisible);
    }, []);

    useEffect(() => { saveActive(personId, active); }, [personId, active]);

    if (!session || !step) {
      saveActive(personId, null);
      return h("div", { className: "hg-workout" },
        h("div", { className: "hg-card hg-empty" },
          h("h2", null, "This workout is no longer in the plan"),
          h(Button, { primary: true, onClick: onClose }, "Return to Today")
        )
      );
    }

    function advance() {
      setActive({ ...active, step: Math.min(stepIndex + 1, steps.length - 1), timerEndAt: null });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function back() {
      setActive({ ...active, step: Math.max(0, stepIndex - 1), timerEndAt: null });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function skip() {
      const skipped = Array.from(new Set([...(active.skipped || []), step.key]));
      setActive({ ...active, skipped, step: Math.min(stepIndex + 1, steps.length - 1), timerEndAt: null });
      showToast("Skipped — you can go back if needed");
    }

    function toggleCheck(key) {
      const current = active.completedRefs || [];
      setActive({
        ...active,
        completedRefs: current.includes(key) ? current.filter(item => item !== key) : [...current, key],
      });
    }

    function endWorkout() {
      if (!window.confirm("End this workout now? Saved exercises will stay in History.")) return;
      saveActive(personId, null);
      onClose();
    }

    const progress = steps.length <= 1 ? 100 : Math.round((stepIndex / (steps.length - 1)) * 100);
    const sessionLogs = data.logs.filter(log => log.sessionId === session.id && log.date === active.date);
    const prCount = sessionLogs.filter(log => log.type === "exercise" && I.ye(data.logs, log.exerciseId, log)).length;

    return h("div", { className: "hg-workout", style: { "--person-accent": meta.accent } },
      h("div", { className: "hg-workout-top" },
        h("strong", null, session.name),
        step.type !== "complete" && h(Button, { ghost: true, danger: true, onClick: endWorkout }, "End workout")
      ),
      h("div", { className: "hg-progress-track", "aria-label": `${progress}% complete` },
        h("span", { style: { width: `${progress}%` } })
      ),
      h("div", { className: "hg-step-count" },
        step.type === "complete" ? "Workout complete" : `Step ${stepIndex + 1} of ${steps.length - 1}`
      ),
      step.type === "warmup" && h(ChecklistStep, {
        title: "Warm-up",
        copy: "Get ready, then move into the first exercise.",
        items: session.warmup || [],
        checked: active.completedRefs || [],
        onToggle: toggleCheck,
        onNext: advance,
        showReadiness: true,
        personId,
        showToast,
      }),
      step.type === "exercise" && h(ExerciseStep, {
        key: step.key,
        personId, data, session, item: step.item, weekInfo, date: active.date,
        active, setActive, updateData, showToast,
        onBack: back, onSkip: skip, onSaved: advance,
      }),
      step.type === "cooldown" && h(ChecklistStep, {
        title: "Cool-down",
        copy: "Finish the session and give yourself a head start on recovery.",
        items: session.cooldown || [],
        checked: active.completedRefs || [],
        onToggle: toggleCheck,
        onNext: advance,
        onBack: back,
        personId,
        showToast,
      }),
      step.type === "run" && h(RunStep, {
        personId, data, session, date: active.date, updateData, showToast,
        onSaved: advance, onSkip: skip,
      }),
      step.type === "complete" && h("div", { className: "hg-card" },
        h("div", { className: "hg-pill success" }, "Workout complete"),
        h("div", { className: "hg-card-title", style: { marginTop: 12 } }, "Nicely done."),
        h("div", { className: "hg-complete-number" }, sessionLogs.length),
        h("div", { className: "hg-card-copy" },
          session.type === "run" ? "run logged" : `of ${exercises.length} exercises logged`
        ),
        h("div", { className: "hg-stats", style: { marginTop: 16 } },
          h("div", { className: "hg-stat" }, h("span", null, "Duration"), h("strong", null, formatElapsed(active.startedAt))),
          h("div", { className: "hg-stat" }, h("span", null, "PRs"), h("strong", null, prCount))
        ),
        (active.skipped || []).length > 0 && h("div", { className: "hg-callout" },
          `${active.skipped.length} step${active.skipped.length === 1 ? "" : "s"} skipped. The session remains partial until every exercise is logged.`
        ),
        h("div", { className: "hg-actions" },
          h(Button, { onClick: back }, "Go back"),
          h(Button, {
            primary: true,
            onClick: () => {
              saveActive(personId, null);
              onClose();
            },
          }, "Finish"),
          h(Button, {
            onClick: () => {
              saveActive(personId, null);
              onHistory();
            },
          }, "View history")
        )
      )
    );
  }

  function TodayView({ personId, data, meta, active, onStart, updateData, showToast }) {
    const sessions = todaySessions(data);
    const next = nextScheduled(data);
    const today = I.W();
    const monday = I.j(today);
    const todayDay = I.De(today);
    const [sessionToMove, setSessionToMove] = useState(null);
    const [bringToTodayOpen, setBringToTodayOpen] = useState(false);
    const [rearrangeWeekOpen, setRearrangeWeekOpen] = useState(false);
    const otherSessions = data.sessions.filter(session =>
      I.ue(data, session, monday) !== todayDay
    );

    function moveWorkout(session, targetDay) {
      if (!session || !targetDay) return;
      updateData(personId, current => {
        const weekOverrides = I.dt(current, monday, session.id, targetDay);
        return { ...current, weekOverrides };
      });
      setSessionToMove(null);
      setBringToTodayOpen(false);
      setRearrangeWeekOpen(false);
      showToast(`${session.name} moved to ${targetDay === todayDay ? "today" : I._[targetDay]} for this week`);
    }

    return h(React.Fragment, null,
      h("div", { className: "hg-view-header" },
        h("h1", null, "Today"),
        h("p", null, new Date(`${today}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }))
      ),
      sessions.length === 0 && h("div", { className: "hg-card hg-empty" },
        h("div", { className: "hg-pill success" }, "Rest day"),
        h("h2", { style: { marginTop: 13 } }, "Nothing scheduled today"),
        h("p", null, next ? `Next: ${next.session.name} on ${I._[next.day]}.` : "Your next session will appear here."),
        otherSessions.length > 0 && h("div", { className: "hg-actions", style: { justifyContent: "center" } },
          h(Button, { primary: true, onClick: () => setBringToTodayOpen(true) }, "Move a workout here"),
          h(Button, { onClick: () => setRearrangeWeekOpen(true) }, "Rearrange this week")
        )
      ),
      sessions.map(session => {
        const status = I.Fe(data, session, today, today);
        const count = session.type === "run" ? 1 : flattenExercises(session).length;
        const isActive = active?.sessionId === session.id;
        return h("div", { className: "hg-card", key: session.id },
          h("div", { className: `hg-pill ${status === "done" ? "success" : status === "partial" ? "danger" : ""}` },
            status === "done" ? "Completed" : status === "partial" ? "In progress" : session.badge || "Today's workout"
          ),
          h("div", { className: "hg-card-title", style: { marginTop: 11 } }, session.name),
          h("div", { className: "hg-card-copy" }, session.duration),
          h("div", { className: "hg-meta" },
            h("span", null, session.type === "run" ? `Target ${session.targetKm}km` : `${count} exercises`),
            session.type === "strength" && h("span", null, `${session.groups?.length || 0} groups`)
          ),
          session.notes && h("details", { style: { marginTop: 10 } },
            h("summary", { className: "hg-link-button", style: { cursor: "pointer", display: "inline-flex" } }, "Session notes"),
            h("div", { className: "hg-callout", style: { marginTop: 4 } }, session.notes)
          ),
          session.type === "strength" && h("details", { style: { marginTop: 10 } },
            h("summary", { className: "hg-link-button", style: { cursor: "pointer", display: "inline-flex" } }, "Exercises & Recommended Weights"),
            h("div", { className: "hg-callout", style: { marginTop: 4, display: "grid", gap: 6 } },
              flattenExercises(session).map(({ exercise }) => {
                const rec = getExerciseRecommendation({ exercise, data, weekInfo: I.Re(data.startDate), personId });
                return h("div", { key: exercise.id, style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13 } },
                  h("span", { style: { fontWeight: 600 } }, exercise.name),
                  h("span", { style: { color: "var(--person-accent, var(--hg-action))", fontWeight: 700, fontFamily: "monospace" } },
                    rec?.recommendedWeight != null ? `Rec: ${rec.formattedWeight}` : (exercise.startLabel || exercise.setsReps)
                  )
                );
              })
            )
          ),
          h("div", { className: "hg-actions" },
            status !== "done" && h(Button, {
              primary: true,
              onClick: () => onStart(session),
            }, isActive ? "Resume workout" : status === "partial" ? "Continue workout" : "Start workout"),
            status !== "done" && h(Button, {
              onClick: () => setSessionToMove(session),
            }, "Move workout"),
            status === "done" && h(Button, { primary: true, onClick: () => onStart(session) }, "Start workout")
          )
        );
      }),
      sessions.length > 0 && h("div", { className: "hg-actions" },
        otherSessions.length > 0 && h(Button, { onClick: () => setBringToTodayOpen(true) }, "Add another workout today"),
        h(Button, { onClick: () => setRearrangeWeekOpen(true) }, "Rearrange this week")
      ),
      sessions.length > 0 && h("div", { className: "hg-callout" },
        h("strong", null, `${I.Re(data.startDate).blockWeeksLabel} · Week ${I.Re(data.startDate).week}`),
        h("div", { className: "hg-history-meta" }, "Your targets and previous performance will appear inside the workout.")
      ),
      sessionToMove && h("div", {
        className: "hg-modal-wrap",
        role: "presentation",
        onClick: () => setSessionToMove(null),
      },
        h("div", {
          className: "hg-modal",
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "move-workout-title",
          onClick: event => event.stopPropagation(),
        },
          h("div", { className: "hg-modal-head" },
            h("div", null,
              h("h2", { id: "move-workout-title" }, "Move workout"),
              h("p", { className: "hg-card-copy" },
                `${sessionToMove.name} is currently on ${I._[I.ue(data, sessionToMove, monday)]}. Choose a new day.`
              )
            ),
            h("button", {
              type: "button",
              className: "hg-icon-button",
              onClick: () => setSessionToMove(null),
              "aria-label": "Close workout mover",
            }, "×")
          ),
          h("div", { className: "hg-callout", style: { marginTop: 0 } },
            "Only this week changes. Choosing an occupied day will put both workouts there; the current day becomes free."
          ),
          h("div", { className: "hg-swap-options" },
            WEEK_DAYS.filter(day => day !== I.ue(data, sessionToMove, monday)).map(day => {
              const workoutsThere = data.sessions.filter(option =>
                option.id !== sessionToMove.id && I.ue(data, option, monday) === day
              );
              return h("button", {
                key: day,
                type: "button",
                className: "hg-swap-option",
                onClick: () => moveWorkout(sessionToMove, day),
              },
                h("span", null,
                  h("strong", null, I._[day]),
                  h("small", null, workoutsThere.length
                    ? `Also scheduled: ${workoutsThere.map(option => option.name).join(", ")}`
                    : "Free slot")
                ),
                h("span", { className: "hg-swap-days" }, workoutsThere.length ? "Double up" : "Move here")
              );
            })
          ),
          h("div", { className: "hg-actions" },
            h(Button, { onClick: () => setSessionToMove(null) }, "Cancel")
          )
        )
      ),
      rearrangeWeekOpen && h("div", {
        className: "hg-modal-wrap",
        role: "presentation",
        onClick: () => setRearrangeWeekOpen(false),
      },
        h("div", {
          className: "hg-modal",
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "rearrange-week-title",
          onClick: event => event.stopPropagation(),
        },
          h("div", { className: "hg-modal-head" },
            h("div", null,
              h("h2", { id: "rearrange-week-title" }, "Rearrange this week"),
              h("p", { className: "hg-card-copy" }, "Choose any workout, then choose its new day.")
            ),
            h("button", {
              type: "button",
              className: "hg-icon-button",
              onClick: () => setRearrangeWeekOpen(false),
              "aria-label": "Close weekly rearranger",
            }, "×")
          ),
          h("div", { className: "hg-callout", style: { marginTop: 0 } },
            "You can repeat this as many times as needed. Free slots and doubled-up days are both supported."
          ),
          h("div", { className: "hg-swap-options" },
            [...data.sessions]
              .sort((a, b) =>
                WEEK_DAYS.indexOf(I.ue(data, a, monday)) - WEEK_DAYS.indexOf(I.ue(data, b, monday))
              )
              .map(option => {
                const optionDay = I.ue(data, option, monday);
                return h("button", {
                  key: option.id,
                  type: "button",
                  className: "hg-swap-option",
                  onClick: () => {
                    setRearrangeWeekOpen(false);
                    setSessionToMove(option);
                  },
                },
                  h("span", null,
                    h("strong", null, option.name),
                    h("small", null, option.duration)
                  ),
                  h("span", { className: "hg-swap-days" }, I._[optionDay])
                );
              })
          ),
          h("div", { className: "hg-actions" },
            h(Button, { onClick: () => setRearrangeWeekOpen(false) }, "Cancel")
          )
        )
      ),
      bringToTodayOpen && h("div", {
        className: "hg-modal-wrap",
        role: "presentation",
        onClick: () => setBringToTodayOpen(false),
      },
        h("div", {
          className: "hg-modal",
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "bring-workout-title",
          onClick: event => event.stopPropagation(),
        },
          h("div", { className: "hg-modal-head" },
            h("div", null,
              h("h2", { id: "bring-workout-title" }, "Add a workout today"),
              h("p", { className: "hg-card-copy" }, sessions.length
                ? "Choose another workout to double up today."
                : "Choose a workout from later this week.")
            ),
            h("button", {
              type: "button",
              className: "hg-icon-button",
              onClick: () => setBringToTodayOpen(false),
              "aria-label": "Close workout picker",
            }, "×")
          ),
          h("div", { className: "hg-callout", style: { marginTop: 0 } },
            "The workout moves here and its original day becomes free. Your usual plan is unchanged."
          ),
          h("div", { className: "hg-swap-options" },
            otherSessions.map(option => {
              const optionDay = I.ue(data, option, monday);
              return h("button", {
                key: option.id,
                type: "button",
                className: "hg-swap-option",
                onClick: () => moveWorkout(option, todayDay),
              },
                h("span", null,
                  h("strong", null, option.name),
                  h("small", null, `${I._[optionDay]} · ${option.duration}`)
                ),
                h("span", { className: "hg-swap-days" }, "Move to today")
              );
            })
          ),
          h("div", { className: "hg-actions" },
            h(Button, { onClick: () => setBringToTodayOpen(false) }, "Cancel")
          )
        )
      )
    );
  }

  function logDisplay(data, log) {
    if (log.type === "run") return `${log.distance}km · ${log.duration} min`;
    const found = findExercise(data, log.sessionId, log.exerciseId);
    const exercise = found?.exercise;
    return `${log.weight != null ? I.je(log.weight, exercise?.weightMode === "perSide") + " · " : ""}${log.sets} × ${log.reps}${exercise?.metric === "seconds" ? " sec" : ""}`;
  }

  function HistoryEditor({ personId, data, initialLog, updateData, showToast, onClose }) {
    const options = [];
    data.sessions.forEach(session => {
      if (session.type === "run") options.push({ value: `${session.id}|run`, label: session.name, session, type: "run" });
      else flattenExercises(session).forEach(({ exercise, groupLabel }) =>
        options.push({ value: `${session.id}|${exercise.id}`, label: `${session.name} — ${exercise.name}`, session, exercise, groupLabel, type: "exercise" })
      );
    });
    const initialValue = initialLog
      ? `${initialLog.sessionId}|${initialLog.type === "run" ? "run" : initialLog.exerciseId}`
      : options[0]?.value || "";
    const [selection, setSelection] = useState(initialValue);
    const selected = options.find(item => item.value === selection) || options[0];
    const [date, setDate] = useState(initialLog?.date || I.W());
    const [weight, setWeight] = useState(initialLog?.weight != null ? String(initialLog.weight) : "");
    const prescribed = parsePrescription(selected?.exercise?.setsReps);
    const [sets, setSets] = useState(initialLog?.sets != null ? String(initialLog.sets) : prescribed.sets);
    const [reps, setReps] = useState(initialLog?.reps != null ? String(initialLog.reps) : prescribed.reps);
    const [feeling, setFeeling] = useState(initialLog?.feeling || rpeToFeeling(initialLog?.rpe));
    const [distance, setDistance] = useState(initialLog?.distance != null ? String(initialLog.distance) : String(selected?.session?.targetKm || ""));
    const [duration, setDuration] = useState(initialLog?.duration != null ? String(initialLog.duration) : "");
    const [effort, setEffort] = useState(initialLog?.effort || "easy");
    const [notes, setNotes] = useState(initialLog?.notes || "");

    useEffect(() => {
      if (!initialLog && selected?.exercise) {
        const parsed = parsePrescription(selected.exercise.setsReps);
        setSets(parsed.sets);
        setReps(parsed.reps);
        const previous = [...data.logs].filter(log => log.exerciseId === selected.exercise.id).sort((a,b) => b.date.localeCompare(a.date))[0];
        setWeight(previous?.weight != null ? String(previous.weight) : "");
      }
      if (!initialLog && selected?.type === "run") setDistance(String(selected.session.targetKm || ""));
    }, [selection]);

    function save() {
      if (!selected) return;
      let entry;
      if (selected.type === "run") {
        if (!distance || !duration) return showToast("Add distance and duration");
        entry = {
          id: initialLog?.id || `${Date.now()}`, type: "run", sessionId: selected.session.id,
          exerciseId: selected.session.id, date, distance: Number(distance), duration: Number(duration),
          effort, notes: notes.trim(),
        };
      } else {
        if (!sets || !reps) return showToast("Add sets and reps");
        entry = {
          id: initialLog?.id || `${Date.now()}`, type: "exercise", sessionId: selected.session.id,
          exerciseId: selected.exercise.id, date, weight: I.Ae(weight), sets: Number(sets),
          reps: Number(reps), completed: true, feeling, rpe: initialLog?.rpe ?? null, notes: notes.trim(),
        };
      }
      updateData(personId, current => ({
        ...current,
        logs: initialLog ? current.logs.map(log => log.id === initialLog.id ? entry : log) : [...current.logs, entry],
      }));
      showToast(initialLog ? "Entry updated" : "Entry added");
      onClose();
    }

    return h("div", { className: "hg-modal-wrap", onClick: onClose },
      h("div", { className: "hg-modal", onClick: event => event.stopPropagation() },
        h("div", { className: "hg-modal-head" },
          h("h2", null, initialLog ? "Edit history" : "Add past entry"),
          h("button", { className: "hg-icon-button", type: "button", onClick: onClose, "aria-label": "Close" }, "×")
        ),
        h("div", { className: "hg-fields" },
          h(Field, { label: "Activity", full: true },
            h("select", { className: "hg-input", value: selection, disabled: Boolean(initialLog), onChange: event => setSelection(event.target.value) },
              options.map(option => h("option", { key: option.value, value: option.value }, option.label))
            )
          ),
          h(Field, { label: "Date", full: true },
            h("input", { className: "hg-input", type: "date", value: date, onChange: event => setDate(event.target.value) })
          ),
          selected?.type === "run" ? h(React.Fragment, null,
            h(Field, { label: "Distance (km)" }, h("input", { className: "hg-input", type: "number", step: ".1", value: distance, onChange: event => setDistance(event.target.value) })),
            h(Field, { label: "Duration (minutes)" }, h("input", { className: "hg-input", type: "number", value: duration, onChange: event => setDuration(event.target.value) })),
            h(Field, { label: "Effort", full: true },
              h("select", { className: "hg-input", value: effort, onChange: event => setEffort(event.target.value) },
                h("option", { value: "easy" }, "Easy / Zone 2"),
                h("option", { value: "moderate" }, "Moderate"),
                h("option", { value: "hard" }, "Hard / intervals")
              )
            )
          ) : h(React.Fragment, null,
            h(Field, { label: "Weight" }, h("input", { className: "hg-input", type: "text", inputMode: "decimal", value: weight, onChange: event => setWeight(event.target.value) })),
            h(Field, { label: "Sets" }, h("input", { className: "hg-input", type: "number", value: sets, onChange: event => setSets(event.target.value) })),
            h(Field, { label: selected?.exercise?.metric === "seconds" ? "Seconds" : "Reps" }, h("input", { className: "hg-input", type: "number", value: reps, onChange: event => setReps(event.target.value) })),
            h(Field, { label: "How did it feel?" },
              h("select", { className: "hg-input", value: feeling, onChange: event => setFeeling(event.target.value) },
                FEELINGS.map(([value, label]) => h("option", { key: value, value }, label))
              )
            )
          ),
          h(Field, { label: "Optional note", full: true },
            h("textarea", { className: "hg-input", value: notes, onChange: event => setNotes(event.target.value) })
          )
        ),
        h("div", { className: "hg-actions" },
          h(Button, { primary: true, onClick: save }, initialLog ? "Save changes" : "Add entry"),
          h(Button, { onClick: onClose }, "Cancel")
        )
      )
    );
  }

  function HistoryView({ personId, data, updateData, showToast }) {
    const [editor, setEditor] = useState(null);
    const sorted = [...data.logs].sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id))).slice(0, 50);

    function remove(log) {
      if (!window.confirm("Delete this history entry? This cannot be undone.")) return;
      updateData(personId, current => ({ ...current, logs: current.logs.filter(item => item.id !== log.id) }));
      showToast("Entry deleted");
    }

    return h(React.Fragment, null,
      h("div", { className: "hg-view-header" },
        h("h1", null, "History"),
        h("p", null, "Review workouts or add a manual and backdated entry.")
      ),
      h("div", { className: "hg-actions", style: { margin: "0 0 16px" } },
        h(Button, { primary: true, onClick: () => setEditor({ mode: "new" }) }, "Add past entry")
      ),
      sorted.length === 0 ? h("div", { className: "hg-card hg-empty" },
        h("h2", null, "No workouts logged yet"),
        h("p", null, "Completed exercises will appear here.")
      ) : h("div", { className: "hg-card" },
        sorted.map(log => {
          const found = log.type === "exercise" ? findExercise(data, log.sessionId, log.exerciseId) : null;
          const session = data.sessions.find(item => item.id === log.sessionId);
          return h("div", { className: "hg-history-row", key: log.id },
            h("div", null,
              h("div", { className: "hg-history-result" }, log.type === "run" ? session?.name || "Run" : found?.exercise?.name || log.exerciseId),
              h("div", null, logDisplay(data, log)),
              h("div", { className: "hg-history-meta" },
                `${log.date}${log.feeling ? ` · ${FEELING_LABELS[log.feeling] || log.feeling}` : log.rpe != null ? ` · RPE ${log.rpe}` : ""}${log.type === "run" ? ` · ${log.effort}` : ""}`
              ),
              log.notes && h("div", { className: "hg-history-meta" }, log.notes)
            ),
            h("div", null,
              h("button", { className: "hg-link-button", type: "button", onClick: () => setEditor({ mode: "edit", log }) }, "Edit"),
              h("button", { className: "hg-link-button", type: "button", style: { color: "var(--hg-danger)" }, onClick: () => remove(log) }, "Delete")
            )
          );
        })
      ),
      editor && h(HistoryEditor, {
        personId, data, initialLog: editor.log || null, updateData, showToast,
        onClose: () => setEditor(null),
      })
    );
  }

  function ProgressView({ personId, data, meta, weekInfo, showToast }) {
    const streak = I.HGcurrentStreak(data);
    const completed = data.logs.filter(log => log.date.slice(0, 7) === I.W().slice(0, 7)).length;
    return h(React.Fragment, null,
      h("div", { className: "hg-view-header" },
        h("h1", null, "Progress"),
        h("p", null, "Consistency, personal bests, and exercise trends.")
      ),
      h("div", { className: "hg-stats" },
        h("div", { className: "hg-stat" }, h("span", null, "Week streak"), h("strong", null, streak)),
        h("div", { className: "hg-stat" }, h("span", null, "Logs this month"), h("strong", null, completed))
      ),
      h("div", { className: "hg-legacy-wrap" },
        h(I.Ct, { meta, data, weekInfo })
      )
    );
  }

  function PlanView({ personId, data, store, meta, updateData, showToast }) {
    return h(React.Fragment, null,
      h("div", { className: "hg-view-header" },
        h("h1", null, "Plan"),
        h("p", null, "Schedule, progression, deloads, backups, and plan editing.")
      ),
      h(EquipmentSection, { personId, data, updateData, showToast }),
      h("div", { className: "hg-card", style: { marginBottom: 18 } },
        h("div", { className: "hg-card-title" }, "Recovery controls"),
        h("div", { className: "hg-card-copy" }, "Use a manual deload when fatigue is unusually high."),
        h("div", { className: "hg-actions" },
          h(Button, {
            onClick: () => {
              const monday = I.j(I.W());
              const active = I.HGgetDeload(personId) === monday;
              I.HGsetDeload(personId, active ? null : monday);
              showToast(active ? "Deload override cleared" : "Deload set for this week");
            },
          }, I.HGgetDeload(personId) === I.j(I.W()) ? "Clear this week's deload" : "Deload this week")
        )
      ),
      h("div", { className: "hg-legacy-wrap" },
        h(I.Et, { meta, personId, store, data, updateData, showToast })
      )
    );
  }

  function SettingsModal({ personId, store, pin, syncStatus, updateData, onSaveKey, onClose, showToast }) {
    const [theme, setTheme] = useState(getTheme());
    const [key, setKey] = useState(pin || "");
    const [elliottStart, setElliottStart] = useState(store.elliott.startDate);
    const [chloeStart, setChloeStart] = useState(store.chloe.startDate);
    const [reminderHour, setReminderHour] = useState(() => storageGet(`hg_reminderhour_${personId}`, 9));
    const [enabling, setEnabling] = useState(false);

    function chooseTheme(value) {
      setTheme(value);
      applyTheme(value);
    }

    function saveDates() {
      updateData("elliott", data => ({ ...data, startDate: elliottStart }));
      updateData("chloe", data => ({ ...data, startDate: chloeStart }));
      showToast("Program dates updated");
    }

    async function enableNotifications() {
      setEnabling(true);
      const ok = window.HG_enableNotifications
        ? await window.HG_enableNotifications(personId, reminderHour, key)
        : false;
      storageSet(`hg_reminderhour_${personId}`, reminderHour);
      setEnabling(false);
      showToast(ok ? "Notifications enabled" : "Notifications could not be enabled");
    }

    return h("div", { className: "hg-modal-wrap", onClick: onClose },
      h("div", { className: "hg-modal", onClick: event => event.stopPropagation() },
        h("div", { className: "hg-modal-head" },
          h("h2", null, "Settings"),
          h("button", { type: "button", className: "hg-icon-button", onClick: onClose, "aria-label": "Close settings" }, "×")
        ),
        h("div", { className: "hg-setting-section" },
          h("h3", null, "Appearance"),
          h("p", null, "Follow this phone or choose a fixed theme."),
          h("div", { className: "hg-segment", role: "group", "aria-label": "Appearance" },
            ["system", "light", "dark"].map(value =>
              h("button", { key: value, type: "button", "aria-pressed": theme === value, onClick: () => chooseTheme(value) },
                value[0].toUpperCase() + value.slice(1)
              )
            )
          )
        ),
        h("div", { className: "hg-setting-section" },
          h("h3", null, "Household sync key"),
          h("p", null,
            `${syncStatus === "synced" ? "Synced." : syncStatus === "connecting" ? "Connecting…" : "Local only."} Use the same private key on both phones. It is no longer published with the app.`
          ),
          h("div", { className: "hg-key-row" },
            h("input", { className: "hg-input", type: "text", value: key, onChange: event => setKey(event.target.value.trim()), placeholder: "Enter or generate a private key" }),
            h(Button, { onClick: () => setKey(randomHouseholdKey()) }, "Generate")
          ),
          h("div", { className: "hg-actions" },
            h(Button, { primary: true, disabled: !key, onClick: () => onSaveKey(key) }, "Save & sync"),
            key && h(Button, {
              onClick: async () => {
                try {
                  await navigator.clipboard.writeText(key);
                  showToast("Household key copied");
                } catch { showToast("Could not copy the key"); }
              },
            }, "Copy key")
          )
        ),
        h("div", { className: "hg-setting-section" },
          h("h3", null, "Program start dates"),
          h("div", { className: "hg-fields" },
            h(Field, { label: "Elliott" }, h("input", { className: "hg-input", type: "date", value: elliottStart, onChange: event => setElliottStart(event.target.value) })),
            h(Field, { label: "Chloe" }, h("input", { className: "hg-input", type: "date", value: chloeStart, onChange: event => setChloeStart(event.target.value) }))
          ),
          h("div", { className: "hg-actions" }, h(Button, { onClick: saveDates }, "Save dates"))
        ),
        h("div", { className: "hg-setting-section" },
          h("h3", null, "Workout reminder"),
          h("p", null, `Enable a reminder for ${I.ie[personId].label} on this phone.`),
          h("div", { className: "hg-key-row" },
            h("select", { className: "hg-input", value: reminderHour, onChange: event => setReminderHour(Number(event.target.value)) },
              Array.from({ length: 24 }, (_, hour) => h("option", { key: hour, value: hour }, `${String(hour).padStart(2, "0")}:00`))
            ),
            h(Button, { disabled: enabling || !key, onClick: enableNotifications }, enabling ? "Enabling…" : "Enable")
          )
        ),
        h(EquipmentSection, { personId, data: store[personId], updateData, showToast })
      )
    );
  }

  function Header({ personId, setPersonId, syncStatus, onSettings }) {
    return h("header", { className: "hg-header" },
      h("div", { className: "hg-brand" },
        h("div", { className: "hg-eyebrow" }, syncStatus === "synced" ? "Synced" : syncStatus === "connecting" ? "Connecting" : "Home training"),
        h("div", { className: "hg-brand-name" }, "Home Gym")
      ),
      h("div", { className: "hg-header-actions" },
        h("div", { className: "hg-person-switch", role: "group", "aria-label": "Person" },
          I.J.map(id => h("button", {
            key: id,
            type: "button",
            "aria-pressed": personId === id,
            onClick: () => setPersonId(id),
            style: personId === id ? { background: I.ie[id].accent } : null,
          }, I.ie[id].label))
        ),
        h("button", { type: "button", className: "hg-icon-button", onClick: onSettings, "aria-label": "Settings" }, "⚙")
      )
    );
  }

  function Navigation({ view, setView, mobile }) {
    const className = mobile ? "hg-bottom-nav" : "hg-sidebar";
    const element = mobile ? "nav" : "aside";
    return h(element, { className, "aria-label": "Main navigation" },
      NAV.map(([id, icon, label]) => h("button", {
        key: id,
        type: "button",
        "aria-current": view === id ? "page" : undefined,
        onClick: () => setView(id),
      }, mobile ? h(React.Fragment, null, h("span", { "aria-hidden": "true" }, icon), label) : label))
    );
  }

  function UpdateNotice() {
    const [available, setAvailable] = useState(Boolean(window.HG_UPDATE_AVAILABLE));
    useEffect(() => {
      const listener = () => setAvailable(true);
      window.addEventListener("hg-update-available", listener);
      return () => window.removeEventListener("hg-update-available", listener);
    }, []);
    if (!available) return null;
    return h("div", { className: "hg-update", role: "status" },
      h("div", null, h("strong", null, "Update available"), h("div", { className: "hg-history-meta" }, "Install the newest HomeGym version.")),
      h(Button, { primary: true, onClick: () => window.HG_applyUpdate?.() }, "Update now")
    );
  }

  function App() {
    const [personId, setPersonIdState] = useState(() => {
      try {
        const saved = localStorage.getItem("hg_selected_person");
        return I.J.includes(saved) ? saved : "elliott";
      } catch { return "elliott"; }
    });
    const [store, setStore] = useState({ elliott: null, chloe: null });
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState("today");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [toast, setToast] = useState("");
    const [pin, setPin] = useState(I.qe());
    const [syncStatus, setSyncStatus] = useState(pin ? "connecting" : "local-only");
    const [authEpoch, setAuthEpoch] = useState(0);
    const [active, setActiveState] = useState(() => loadActive(personId));
    const dbRef = useRef(null);
    const toastTimer = useRef(null);

    useEffect(() => {
      Promise.all([I.fe("elliott"), I.fe("chloe")]).then(([elliott, chloe]) => {
        setStore({ elliott, chloe });
        setLoading(false);
      });
    }, []);

    useEffect(() => {
      if (!window.firebase?.auth) return undefined;
      I.Ke();
      const auth = window.firebase.auth();
      const unsubscribe = auth.onAuthStateChanged(user => {
        if (user) setAuthEpoch(value => value + 1);
        else auth.signInAnonymously().catch(error => {
          console.warn("Anonymous Firebase authentication is not enabled:", error?.message);
        });
      });
      return unsubscribe;
    }, []);

    useEffect(() => {
      const database = I.Ke();
      dbRef.current = database;
      if (!database || !pin) {
        setSyncStatus("local-only");
        return undefined;
      }
      setSyncStatus("connecting");
      let received = false;
      const update = id => remote => {
        received = true;
        setSyncStatus("synced");
        setStore(current => I.Ze(current, id, remote));
      };
      const offElliott = I.be(database, pin, "elliott", update("elliott"), () => setSyncStatus("local-only"));
      const offChloe = I.be(database, pin, "chloe", update("chloe"), () => setSyncStatus("local-only"));
      const timeout = setTimeout(() => {
        if (!received) setSyncStatus("local-only");
      }, 5000);
      return () => {
        offElliott();
        offChloe();
        clearTimeout(timeout);
      };
    }, [pin, authEpoch]);

    useEffect(() => {
      setActiveState(loadActive(personId));
    }, [personId]);

    const showToast = useCallback(message => {
      setToast(message);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(""), 2800);
    }, []);

    const updateData = useCallback((id, updater) => {
      setStore(current => {
        if (!current[id]) return current;
        const next = { ...updater(current[id]), updatedAt: Date.now() };
        I.Ee(id, next);
        I.Ye(dbRef.current, pin, id, next);
        return { ...current, [id]: next };
      });
    }, [pin]);

    function setPersonId(id) {
      if (!I.J.includes(id)) return;
      try { localStorage.setItem("hg_selected_person", id); } catch {}
      setPersonIdState(id);
      setView("today");
    }

    function setActive(value) {
      setActiveState(value);
      saveActive(personId, value);
    }

    function startWorkout(session) {
      const existing = loadActive(personId);
      if (existing?.sessionId === session.id && existing.date === I.W()) {
        setActive(existing);
      } else {
        const status = I.Fe(store[personId], session, I.W(), I.W());
        const firstIncomplete = session.type === "strength"
          ? flattenExercises(session).findIndex(({ exercise }) =>
              !store[personId].logs.some(log => log.sessionId === session.id && log.exerciseId === exercise.id && log.date === I.W())
            )
          : -1;
        setActive({
          schemaVersion: 1,
          sessionId: session.id,
          date: I.W(),
          step: status === "partial" && firstIncomplete >= 0 ? firstIncomplete + 1 : 0,
          skipped: [],
          completedRefs: [],
          startedAt: Date.now(),
          timerEndAt: null,
        });
      }
      lockPortrait();
    }

    function saveHouseholdKey(value) {
      I.Je(value);
      setPin(value);
      const database = I.Ke();
      if (database) {
        I.J.forEach(id => {
          if (store[id]) I.Ye(database, value, id, { ...store[id], updatedAt: Date.now() });
        });
      }
      setSettingsOpen(false);
      showToast("Household key saved on this phone");
    }

    if (loading || !store[personId]) {
      return h("div", { className: "hg-app", style: { display: "grid", placeItems: "center", minHeight: "100dvh" } },
        h("div", { className: "hg-card" }, "Loading Home Gym…")
      );
    }

    const data = store[personId];
    const meta = I.ie[personId];
    const weekInfo = I.HGgetDeload(personId) === I.j(I.W())
      ? { ...I.Re(data.startDate), isDeload: true }
      : I.Re(data.startDate);

    if (active) {
      return h("div", { className: "hg-app", style: { "--person-accent": meta.accent } },
        h(GuidedWorkout, {
          personId, data, meta, active, setActive, updateData, showToast,
          onClose: () => setActive(null),
          onHistory: () => { setActive(null); setView("history"); },
        }),
        toast && h("div", { className: "hg-toast", role: "status" }, toast),
        h(UpdateNotice)
      );
    }

    let content;
    if (view === "today") content = h(TodayView, { personId, data, meta, active, onStart: startWorkout, updateData, showToast });
    if (view === "history") content = h(HistoryView, { personId, data, updateData, showToast });
    if (view === "progress") content = h(ProgressView, { personId, data, meta, weekInfo, showToast });
    if (view === "metrics") content = h(React.Fragment, null,
      h("div", { className: "hg-view-header" }, h("h1", null, "Metrics"), h("p", null, "Body-weight trend and check-in history.")),
      h("div", { className: "hg-legacy-wrap" }, h(I.HGMetricsTab, { meta, personId, showToast }))
    );
    if (view === "plan") content = h(PlanView, { personId, data, store, meta, updateData, showToast });

    return h("div", { className: "hg-app", style: { "--person-accent": meta.accent } },
      h("div", { className: "hg-app-shell" },
        h(Header, { personId, setPersonId, syncStatus, onSettings: () => setSettingsOpen(true) }),
        h("div", { className: "hg-layout" },
          h(Navigation, { view, setView, mobile: false }),
          h("main", { className: "hg-main" }, content)
        ),
        h(Navigation, { view, setView, mobile: true })
      ),
      settingsOpen && h(SettingsModal, {
        personId, store, pin, syncStatus, updateData,
        onSaveKey: saveHouseholdKey,
        onClose: () => setSettingsOpen(false),
        showToast,
      }),
      toast && h("div", { className: "hg-toast", role: "status" }, toast),
      h(UpdateNotice)
    );
  }

  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(h(App));
})();
