import { normalizeExerciseName } from "../utils/normalizers.js";
import { RestTimer } from "./RestTimer.jsx";

const h = React.createElement;
const { useState, useEffect } = React;

const FEELINGS = [
  ["", "Select feeling"],
  ["great", "Great — strong / energetic"],
  ["good", "Good — standard effort"],
  ["ok", "OK — got it done"],
  ["tired", "Tired — low energy"],
  ["sore", "Sore — tight / stiff"]
];

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

export function ExerciseStep({ personId, data, session, item, weekInfo, date, active, setActive, updateData, showToast, onBack, onSkip, onSaved }) {
  const I = window.HG_INTERNALS || {};
  const exercise = item.exercise;
  const logsList = Array.isArray(data?.logs) ? data.logs : [];
  const sameDay = logsList.find(log =>
    log.type === "exercise" && log.sessionId === session.id &&
    log.exerciseId === exercise.id && log.date === date
  );
  const previous = [...logsList].filter(log =>
    log.type === "exercise" && log.exerciseId === exercise.id && log.id !== sameDay?.id
  ).sort((a, b) => b.date.localeCompare(a.date))[0];

  const prescribed = window.parsePrescription ? window.parsePrescription(exercise.setsReps) : { sets: "3", reps: "10" };
  const recommendation = window.getExerciseRecommendation ? window.getExerciseRecommendation({ exercise, data, weekInfo, personId }) : null;

  const [weight, setWeight] = useState(sameDay?.weight != null ? String(sameDay.weight) :
    recommendation?.recommendedWeight != null ? String(recommendation.recommendedWeight) :
    previous?.weight != null ? String(previous.weight) : ""
  );
  const [sets, setSets] = useState(sameDay?.sets != null ? String(sameDay.sets) : prescribed.sets);
  const [reps, setReps] = useState(sameDay?.reps != null ? String(sameDay.reps) : prescribed.reps);
  const [feeling, setFeeling] = useState(sameDay?.feeling || "");
  const [notes, setNotes] = useState(sameDay?.notes || "");

  function save() {
    if (!sets || !reps) {
      showToast("Add sets and reps first");
      return;
    }
    const parsedWeight = I.Ae ? I.Ae(weight) : (weight === "" ? null : Number(weight));
    const entry = {
      id: sameDay?.id || `${Date.now()}`,
      type: "exercise",
      sessionId: session.id,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      normalizedName: normalizeExerciseName(exercise.name),
      date,
      weight: parsedWeight,
      sets: Number.parseInt(sets, 10),
      reps: Number.parseInt(reps, 10),
      completed: true,
      feeling,
      notes: notes.trim(),
      timestamp: Date.now()
    };
    const isPr = I.ye ? I.ye(data.logs, exercise.id, entry) : false;
    if (window.GymCloudEngine?.saveExerciseLog) {
      window.GymCloudEngine.saveExerciseLog(personId, entry);
    }
    updateData(personId, current => ({
      ...current,
      logs: sameDay ? current.logs.map(log => log.id === sameDay.id ? entry : log) : [...current.logs, entry],
    }));
    showToast(isPr ? "New PR! Exercise saved" : "Exercise saved");
    onSaved();
  }

  const formattedPrev = previous
    ? `${previous.date} · ${previous.weight != null ? previous.weight + "kg · " : ""}${previous.sets} × ${previous.reps}${exercise.metric === "seconds" ? " sec" : ""}`
    : "";

  return h("div", { className: "hg-card" },
    h("div", { className: "hg-section-label", style: { margin: "0 0 7px" } }, item.groupLabel),
    h("div", { className: "hg-exercise-heading" },
      h("div", null,
        h("div", { className: "hg-card-title" }, exercise.name),
        h("div", { className: "hg-card-copy" }, `${exercise.setsReps}${exercise.restNote && exercise.restNote !== "—" ? ` · rest ${exercise.restNote}` : ""}`)
      )
    ),
    exercise.note && h("div", { className: "hg-callout" }, exercise.note),
    recommendation?.recommendedWeight != null && h("div", { className: "hg-recommendation-card" },
      h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 } },
        h("div", null,
          h("div", { className: "hg-rec-label" }, "RECOMMENDED WEIGHT"),
          h("div", { className: "hg-rec-weight" }, recommendation.formattedWeight)
        ),
        h(Button, { primary: true, onClick: () => setWeight(String(recommendation.recommendedWeight)) }, `Use ${recommendation.formattedWeight}`)
      ),
      h("div", { className: "hg-rec-reason" }, recommendation.reason)
    ),
    previous && h("div", { className: "hg-previous" },
      h("strong", null, "Previous performance"),
      h("div", null, formattedPrev)
    ),
    h("div", { className: "hg-fields" },
      h(Field, { label: `Weight (${exercise.unit || "kg"})` }, h("input", { className: "hg-input", type: "text", inputMode: "decimal", value: weight, onChange: e => setWeight(e.target.value) })),
      h(Field, { label: "Sets completed" }, h("input", { className: "hg-input", type: "number", value: sets, onChange: e => setSets(e.target.value) })),
      h(Field, { label: exercise.metric === "seconds" ? "Seconds per set" : "Reps per set" }, h("input", { className: "hg-input", type: "number", value: reps, onChange: e => setReps(e.target.value) })),
      h(Field, { label: "How did it feel?" },
        h("select", { className: "hg-input", value: feeling, onChange: e => setFeeling(e.target.value) },
          FEELINGS.map(([val, label]) => h("option", { key: val, value: val }, label))
        )
      )
    ),
    h("details", { style: { marginTop: 12 } },
      h("summary", { className: "hg-link-button" }, notes ? "Edit note" : "Add optional note"),
      h("textarea", { className: "hg-input", value: notes, onChange: e => setNotes(e.target.value), placeholder: "Notes..." })
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
export default ExerciseStep;
