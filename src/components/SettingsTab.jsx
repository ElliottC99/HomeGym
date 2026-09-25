const h = React.createElement;
const { useState, useRef } = React;

function Field({ label, children }) {
  return h("div", { className: "hg-field" },
    h("label", null, label),
    children
  );
}

function Button({ children, primary, danger, ...props }) {
  const classes = ["hg-button"];
  if (primary) classes.push("primary");
  if (danger) classes.push("danger");
  return h("button", { type: "button", className: classes.join(" "), ...props }, children);
}

// Subcomponent: Equipment & plate config (formerly EquipmentSection)
function EquipmentSection({ personId, data, updateData, showToast }) {
  const I = window.HG_INTERNALS || {};
  const config = window.getEquipmentConfig ? window.getEquipmentConfig(data, personId) : { plates: [1.25, 2.5, 5, 10], barbellWeight: 20, dbHandleWeight: 2 };
  
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
      }
      return [...prev, weightVal].sort((a, b) => a - b);
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
    if (window.saveEquipmentConfig) {
      window.saveEquipmentConfig(personId, newConfig, updateData);
    }
    showToast("Equipment & plates updated");
  }

  const bbJumps = window.getPossibleWeightJumps ? window.getPossibleWeightJumps(Number(barbellWeight) || 20, selectedPlates, false, 5) : [];
  const dbJumps = window.getPossibleWeightJumps ? window.getPossibleWeightJumps(Number(dbHandleWeight) || 2, selectedPlates, true, 5) : [];

  return h("div", { className: "hg-setting-section" },
    h("h3", null, "Available Weight Plates & Equipment"),
    h("p", null, "Select available weight plates to calculate progressive overload jumps."),
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
        h("input", { className: "hg-input", type: "number", value: barbellWeight, onChange: e => setBarbellWeight(e.target.value) })
      ),
      h(Field, { label: "Dumbbell Handle Weight (kg)" },
        h("input", { className: "hg-input", type: "number", value: dbHandleWeight, onChange: e => setDbHandleWeight(e.target.value) })
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

// MAIN SETTINGS TAB COMPONENT (styled as settings view/modal)
export function SettingsTab({ personId, store, pin, syncStatus, queueCount = 0, updateData, onSaveKey, onClose, showToast }) {
  const I = window.HG_INTERNALS || {};
  const [theme, setTheme] = useState(() => window.getTheme ? window.getTheme() : "system");
  const [key, setKey] = useState(pin || "");
  const [elliottStart, setElliottStart] = useState(store?.elliott?.startDate || "2026-09-07");
  const [chloeStart, setChloeStart] = useState(store?.chloe?.startDate || "2026-09-07");
  const [reminderHour, setReminderHour] = useState(() => {
    try { return Number(localStorage.getItem(`hg_reminderhour_${personId}`)) || 9; } catch { return 9; }
  });
  const [enabling, setEnabling] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deadLetters, setDeadLetters] = useState(() => window.PlatePlanSyncEngine?.getDeadLetterQueue ? window.PlatePlanSyncEngine.getDeadLetterQueue() : []);
  const backupFileInputRef = useRef(null);

  function chooseTheme(value) {
    setTheme(value);
    if (window.applyTheme) window.applyTheme(value);
  }

  function saveDates() {
    updateData("elliott", data => ({ ...data, startDate: elliottStart }));
    updateData("chloe", data => ({ ...data, startDate: chloeStart }));
    showToast("Program dates updated");
  }

  async function enableNotifications() {
    setEnabling(true);
    const ok = window.HG_enableNotifications ? await window.HG_enableNotifications(personId, reminderHour, key) : false;
    try { localStorage.setItem(`hg_reminderhour_${personId}`, String(reminderHour)); } catch {}
    setEnabling(false);
    showToast(ok ? "Notifications enabled" : "Notifications count not be enabled");
  }

  function handleExportBackup() {
    try {
      if (typeof window.exportFullBackup === "function") {
        window.exportFullBackup({ download: true });
      } else if (I.tt) {
        const payload = I.tt(store);
        const dateStr = I.W ? I.W() : new Date().toISOString().slice(0, 10);
        if (window.downloadFile) window.downloadFile(payload, `training-full-backup-${dateStr}.json`);
        showToast("Exported full backup (.json)");
      }
    } catch (err) {
      showToast("Export failed: " + (err?.message || "Unknown error"));
    }
  }

  function handleRestoreFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!window.confirm("Restoring this backup will replace current workouts and health metrics for both profiles. Continue?")) return;
        setRestoring(true);
        if (window.restoreBackupJSON) {
          await window.restoreBackupJSON(parsed, updateData, showToast);
        }
        setRestoring(false);
        onClose?.();
      } catch (err) {
        setRestoring(false);
        showToast("Restore failed: " + (err?.message || "Invalid JSON file"));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function generateKey() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    setKey(Array.from(bytes, val => val.toString(16).padStart(2, "0")).join(""));
  }

  return h("div", { className: "hg-modal-wrap", onClick: onClose },
    h("div", { className: "hg-modal", onClick: e => e.stopPropagation() },
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
        h("h3", null, "Cloud-First Architecture & Automated Sync"),
        h("p", null, `${syncStatus === "synced" ? "Cloud Synced." : syncStatus === "connecting" ? "Connecting to Firestore…" : "Local cache."} HomeGym two-way cloud sync engine automatically replicates exercise history and health metrics to Firestore.`),
        h("div", { style: { marginTop: 10, padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 } },
          h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 } },
            h("span", null, "Offline Mutation Queue:"),
            h("strong", { style: { color: queueCount > 0 ? "#f59e0b" : "#10b981" } }, queueCount > 0 ? `${queueCount} pending write(s)` : "Clean (0 pending)")
          ),
          h(Button, {
            style: { width: "100%" },
            onClick: async () => {
              showToast("Executing Two-Way Cloud Sync with Firestore…");
              if (window.PlatePlanSyncEngine?.processOfflineQueue) {
                await window.PlatePlanSyncEngine.processOfflineQueue();
                const res = await window.PlatePlanSyncEngine.syncPlatePlanWithFirestore(personId, showToast);
                if (res) {
                  updateData(personId, () => res);
                  showToast("Two-way cloud sync complete!");
                }
              }
            }
          }, "Sync Now with Firestore")
        )
      ),
      h("div", { className: "hg-setting-section" },
        h("h3", null, "Data & Full Backup"),
        h("p", null, "Export a complete JSON archive of all workout routines, logged exercise history, bodyweight logs, sleep metrics, and readiness logs for all profiles. Restoring repopulates local storage and cloud database."),
        h("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 } },
          h(Button, { primary: true, onClick: handleExportBackup }, "📥 Export Full Backup (.json)"),
          h(Button, { disabled: restoring, onClick: () => backupFileInputRef.current?.click() }, restoring ? "Restoring…" : "Restore from Backup"),
          h("input", { ref: backupFileInputRef, type: "file", accept: "application/json", style: { display: "none" }, onChange: handleRestoreFileChange })
        ),
        deadLetters.length > 0 && h("div", { style: { marginTop: 12, padding: "10px 12px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: 8, fontSize: 12.5 } },
          h("div", { style: { color: "#ef4444", fontWeight: 600, marginBottom: 4 } }, `Dead-Letter Queue: ${deadLetters.length} unprocessable mutation(s)`),
          h(Button, {
            style: { fontSize: 12, padding: "4px 10px" },
            onClick: () => {
              if (window.PlatePlanSyncEngine?.clearDeadLetterQueue) {
                window.PlatePlanSyncEngine.clearDeadLetterQueue();
                setDeadLetters([]);
                showToast("Dead-letter queue cleared");
              }
            }
          }, "Clear Dead-Letter Queue")
        )
      ),
      h("div", { className: "hg-setting-section" },
        h("h3", null, "Household sync key"),
        h("p", null, "Use the same private key on both phones. It is no longer published with the app."),
        h("div", { className: "hg-key-row" },
          h("input", { className: "hg-input", type: "text", value: key, onChange: e => setKey(e.target.value.trim()), placeholder: "Enter or generate private key" }),
          h(Button, { onClick: generateKey }, "Generate")
        ),
        h("div", { className: "hg-actions" },
          h(Button, { primary: true, disabled: !key, onClick: () => onSaveKey(key) }, "Save & sync"),
          key && h(Button, {
            onClick: async () => {
              try {
                await navigator.clipboard.writeText(key);
                showToast("Household key copied");
              } catch { showToast("Could not copy the key"); }
            }
          }, "Copy key")
        )
      ),
      h("div", { className: "hg-setting-section" },
        h("h3", null, "Program start dates"),
        h("div", { className: "hg-fields" },
          h(Field, { label: "Elliott" }, h("input", { className: "hg-input", type: "date", value: elliottStart, onChange: e => setElliottStart(e.target.value) })),
          h(Field, { label: "Chloe" }, h("input", { className: "hg-input", type: "date", value: chloeStart, onChange: e => setChloeStart(e.target.value) }))
        ),
        h("div", { className: "hg-actions" }, h(Button, { onClick: saveDates }, "Save dates"))
      ),
      h("div", { className: "hg-setting-section" },
        h("h3", null, "Workout reminder"),
        h("p", null, `Enable a reminder for this phone.`),
        h("div", { className: "hg-key-row" },
          h("select", { className: "hg-input", value: reminderHour, onChange: e => setReminderHour(Number(e.target.value)) },
            Array.from({ length: 24 }, (_, hour) => h("option", { key: hour, value: hour }, `${String(hour).padStart(2, "0")}:00`))
          ),
          h(Button, { disabled: enabling || !key, onClick: enableNotifications }, enabling ? "Enabling…" : "Enable")
        )
      ),
      h(EquipmentSection, { personId, data: store[personId], updateData, showToast })
    )
  );
}
export default SettingsTab;
