import { resolveLogMetric } from "../utils/metrics.js";
import { normalizeExerciseName } from "../utils/normalizers.js";

const h = React.createElement;

const FEELINGS = {
  very_easy: "Very easy",
  good: "Good",
  challenging: "Challenging",
  very_hard: "Very hard",
  pain: "Pain / discomfort",
};

/**
 * Presentational component for a single historical workout log card.
 */
export function HistoryCard({ log, session, exercise, onEdit, onDelete }) {
  const isRun = log.type === "run";
  
  // 1. Resolve exercise display title
  const rawTitle = isRun 
    ? (session?.name || log.exerciseName || "Run") 
    : (exercise?.name || log.exerciseName || log.exerciseId || "Unknown Exercise");
  const displayTitle = isRun ? rawTitle : normalizeExerciseName(rawTitle);

  // 2. Resolve display subtitle / weight / sets and reps
  let displaySubtitle = "";
  if (isRun) {
    displaySubtitle = `${log.distance || 0}km · ${log.duration || 0} min`;
  } else {
    // Determine stats
    let setsCount = 1;
    let repsCount = 0;
    let weightValue = null;

    if (Array.isArray(log.sets) && log.sets.length > 0) {
      setsCount = log.sets.length;
      repsCount = Number(log.sets[0]?.reps) || 0;
      const firstW = log.sets[0]?.weight;
      if (firstW !== undefined && firstW !== null && firstW !== "") {
        const num = Number(firstW);
        if (!Number.isNaN(num) && num > 0) weightValue = num;
        else if (num === 0) weightValue = 0;
      }
    } else {
      setsCount = Math.max(1, Number(log.sets) || 1);
      repsCount = Number(log.reps) || 0;
    }

    // Top-level weight attribute takes precedence
    if (log.weight !== undefined && log.weight !== null && log.weight !== "") {
      const num = Number(log.weight);
      if (!Number.isNaN(num) && num > 0) weightValue = num;
      else if (num === 0) weightValue = 0;
    }

    const unit = exercise?.unit || log.unit || "kg";
    if (weightValue != null && weightValue > 0) {
      displaySubtitle = `${setsCount} sets × ${repsCount} reps @ ${weightValue} ${unit}`;
    } else {
      displaySubtitle = `${setsCount} sets × ${repsCount} reps (Bodyweight)`;
    }
  }

  // 3. Resolve metadata details
  const feelingLabel = log.feeling ? (FEELINGS[log.feeling] || log.feeling) : null;
  const metaText = [
    log.date,
    feelingLabel ? `Feeling: ${feelingLabel}` : null,
    log.rpe != null ? `RPE: ${log.rpe}` : null,
    isRun && log.effort ? `Effort: ${log.effort}` : null
  ].filter(Boolean).join(" · ");

  return h("div", { className: "hg-history-row" },
    h("div", null,
      h("div", { className: "hg-history-result" }, displayTitle),
      h("div", null, displaySubtitle),
      h("div", { className: "hg-history-meta" }, metaText),
      log.notes && h("div", { className: "hg-history-meta", style: { fontStyle: "italic", marginTop: "4px" } }, log.notes)
    ),
    h("div", null,
      h("button", { className: "hg-link-button", type: "button", onClick: () => onEdit && onEdit(log) }, "Edit"),
      h("button", { className: "hg-link-button", type: "button", style: { color: "var(--hg-danger)", marginLeft: "8px" }, onClick: () => onDelete && onDelete(log) }, "Delete")
    )
  );
}
