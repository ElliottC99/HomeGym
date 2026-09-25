import { ChecklistStep } from "./ChecklistStep.jsx";
import { ExerciseStep } from "./ExerciseStep.jsx";
import { RunStep } from "./RunStep.jsx";

const h = React.createElement;

function Button({ children, primary, ghost, danger, ...props }) {
  const classes = ["hg-button"];
  if (primary) classes.push("primary");
  if (ghost) classes.push("ghost");
  if (danger) classes.push("danger");
  return h("button", { type: "button", className: classes.join(" "), ...props }, children);
}

export function WorkoutLogger({ personId, data, meta, active, setActive, updateData, showToast, onClose, onHistory }) {
  const session = data.sessions.find(item => item.id === active.sessionId);
  if (!session) return null;

  const flattenExercisesLocal = (s) => {
    if (!s || s.type !== "strength") return [];
    return (s.groups || []).flatMap(g =>
      (g.exercises || []).map(ex => ({ exercise: ex, groupLabel: g.label }))
    );
  };

  const exercises = flattenExercisesLocal(session);
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

  const advance = () => {
    setActive({ ...active, step: Math.min(stepIndex + 1, steps.length - 1), timerEndAt: null });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const back = () => {
    setActive({ ...active, step: Math.max(0, stepIndex - 1), timerEndAt: null });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const skip = () => {
    const skipped = Array.from(new Set([...(active.skipped || []), step.key]));
    setActive({ ...active, skipped, step: Math.min(stepIndex + 1, steps.length - 1), timerEndAt: null });
    showToast("Skipped — you can go back if needed");
  };

  const toggleCheck = (key) => {
    const current = active.completedRefs || [];
    setActive({
      ...active,
      completedRefs: current.includes(key) ? current.filter(item => item !== key) : [...current, key],
    });
  };

  const progress = steps.length <= 1 ? 100 : Math.round((stepIndex / (steps.length - 1)) * 100);
  const logsList = Array.isArray(data?.logs) ? data.logs : [];
  const sessionLogs = logsList.filter(log => log.sessionId === session.id && log.date === active.date);

  const formatElapsed = (startedAt) => {
    const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    const minutes = Math.floor(seconds / 60);
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };

  return h("div", { className: "hg-workout", style: { "--person-accent": meta.accent } },
    h("div", { className: "hg-workout-top" },
      h("strong", null, session.name),
      step.type !== "complete" && h(Button, { ghost: true, danger: true, onClick: () => {
        if (window.confirm("End workout now? Saved entries will remain.")) {
          setActive(null);
          onClose();
        }
      } }, "End workout")
    ),
    h("div", { className: "hg-progress-track" }, h("span", { style: { width: `${progress}%` } })),
    h("div", { className: "hg-step-count" }, step.type === "complete" ? "Workout complete" : `Step ${stepIndex + 1} of ${steps.length - 1}`),

    step.type === "warmup" && h(ChecklistStep, {
      title: "Warm-up",
      copy: "Get ready, then move into the first exercise.",
      items: session.warmup || [],
      checked: active.completedRefs || [],
      onToggle: toggleCheck,
      onNext: advance,
      showReadiness: true,
      personId,
      data,
      updateData,
      showToast,
    }),
    step.type === "exercise" && h(ExerciseStep, {
      key: step.key,
      personId, data, session, item: step.item, date: active.date,
      active, setActive, updateData, showToast,
      onBack: back, onSkip: skip, onSaved: advance,
    }),
    step.type === "cooldown" && h(ChecklistStep, {
      title: "Cool-down",
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
      h("div", { className: "hg-card-copy" }, session.type === "run" ? "run logged" : `of ${exercises.length} exercises logged`),
      h("div", { className: "hg-stats", style: { marginTop: 16 } },
        h("div", { className: "hg-stat" }, h("span", null, "Duration"), h("strong", null, formatElapsed(active.startedAt)))
      ),
      h("div", { className: "hg-actions" },
        h(Button, { onClick: back }, "Go back"),
        h(Button, { primary: true, onClick: () => { setActive(null); onClose(); } }, "Finish")
      )
    )
  );
}
export default WorkoutLogger;
