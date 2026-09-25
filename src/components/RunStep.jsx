import { normalizeExerciseName } from "../utils/normalizers.js";

const h = React.createElement;
const { useState } = React;

function Field({ label, full, children }) {
  return h("div", { className: `hg-field${full ? " full" : ""}` },
    h("label", null, label),
    children
  );
}

function Button({ children, primary, ghost, ...props }) {
  const classes = ["hg-button"];
  if (primary) classes.push("primary");
  if (ghost) classes.push("ghost");
  return h("button", { type: "button", className: classes.join(" "), ...props }, children);
}

export function RunStep({ personId, data, session, date, updateData, showToast, onSaved, onSkip }) {
  const sameDay = data.logs.find(log => log.type === "run" && log.sessionId === session.id && log.date === date);
  const [distance, setDistance] = useState(sameDay ? String(sameDay.distance) : String(session.targetKm || ""));
  const [duration, setDuration] = useState(sameDay ? String(sameDay.duration) : "");
  const [effort, setEffort] = useState(sameDay?.effort || "easy");
  const [notes, setNotes] = useState(sameDay?.notes || "");

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
      exerciseName: session.name || "Run",
      normalizedName: normalizeExerciseName(session.name || "run"),
      date,
      distance: Number(distance),
      duration: Number(duration),
      effort,
      notes: notes.trim(),
      timestamp: Date.now()
    };
    if (window.GymCloudEngine?.saveExerciseLog) {
      window.GymCloudEngine.saveExerciseLog(personId, entry);
    }
    updateData(personId, current => ({
      ...current,
      logs: sameDay ? current.logs.map(log => log.id === sameDay.id ? entry : log) : [...current.logs, entry],
    }));
    showToast("Run saved");
    onSaved();
  }

  return h("div", { className: "hg-card" },
    h("div", { className: "hg-card-title" }, session.name),
    h("div", { className: "hg-card-copy" }, session.duration),
    h("div", { className: "hg-fields" },
      h(Field, { label: "Distance (km)" }, h("input", { className: "hg-input", type: "number", step: "0.1", value: distance, onChange: e => setDistance(e.target.value) })),
      h(Field, { label: "Duration (mins)" }, h("input", { className: "hg-input", type: "number", value: duration, onChange: e => setDuration(e.target.value) })),
      h(Field, { label: "Effort", full: true },
        h("select", { className: "hg-input", value: effort, onChange: e => setEffort(e.target.value) },
          h("option", { value: "easy" }, "Easy / Zone 2"),
          h("option", { value: "moderate" }, "Moderate"),
          h("option", { value: "hard" }, "Hard / intervals")
        )
      )
    ),
    h("details", { style: { marginTop: 12 } },
      h("summary", { className: "hg-link-button" }, notes ? "Edit note" : "Add optional note"),
      h("textarea", { className: "hg-input", value: notes, onChange: e => setNotes(e.target.value) })
    ),
    h("div", { className: "hg-actions" },
      h(Button, { ghost: true, onClick: onSkip }, "Skip"),
      h(Button, { primary: true, onClick: save }, sameDay ? "Update & finish" : "Save & finish")
    )
  );
}
export default RunStep;
