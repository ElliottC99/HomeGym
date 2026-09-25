import { ProgressChart } from "./ProgressChart.jsx";
import { normalizeExerciseName, deduplicateExercises } from "../utils/normalizers.js";
import { resolveLogMetric } from "../utils/metrics.js";

const h = React.createElement;
const { useState, useMemo } = React;

const FEELING_LABELS = {
  very_easy: "Very easy",
  good: "Good",
  challenging: "Challenging",
  very_hard: "Very hard",
  pain: "Pain / discomfort"
};

// Brzycki 1RM formula calculation
function calculateBrzycki1RM(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  if (r === 1) return w;
  if (r >= 37) return w; // Guard against negative/zero denominator
  return Math.round(w * (36 / (37 - r)) * 10) / 10;
}

// Chart X-Axis date formatter
function formatChartDate(dateStr) {
  if (!dateStr) return "";
  try {
    let d;
    if (typeof dateStr === "number") {
      d = new Date(dateStr);
    } else if (typeof dateStr === "string") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const parts = dateStr.split("-");
        d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      } else {
        d = new Date(dateStr);
      }
    } else {
      d = new Date(dateStr);
    }
    if (Number.isNaN(d.getTime())) {
      const match = String(dateStr).match(/\d{4}-\d{2}-\d{2}/);
      if (match) {
        const parts = match[0].split("-");
        d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      } else {
        return String(dateStr).slice(0, 10);
      }
    }
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return String(dateStr).slice(0, 10);
  }
}

// Session log date list formatter
function formatSessionDate(dateStr) {
  if (!dateStr) return "Unknown Date";
  try {
    const parts = String(dateStr).slice(0, 10).split("-");
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    }
  } catch (_) {}
  return String(dateStr);
}

// Subcomponent: Sets Breakdown list
function SetsBreakdown({ sets, isBodyweight }) {
  if (!sets || sets.length === 0) {
    return h("div", { style: { color: "var(--hg-text-3)", fontSize: "13px" } }, "No set data");
  }

  const first = sets[0];
  const allIdentical = sets.length > 1 && sets.every(s => s.weight === first.weight && s.reps === first.reps);

  if (allIdentical) {
    const isWeighted = !isBodyweight && first.weight != null && Number(first.weight) > 0;
    const e1rm = isWeighted ? calculateBrzycki1RM(first.weight, first.reps) : 0;
    return h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", fontWeight: 600, padding: "2px 0" } },
      h("span", null,
        isWeighted
          ? `${sets.length} sets × ${first.reps} reps @ ${first.weight} kg`
          : `${sets.length} sets × ${first.reps} reps (Bodyweight)`
      ),
      e1rm > 0 && h("span", { style: { fontSize: "11px", color: "var(--hg-text-3)", fontWeight: 500 } }, `e1RM: ${e1rm} kg`)
    );
  }

  return sets.map((s, idx) => {
    const isWeighted = !isBodyweight && s.weight != null && Number(s.weight) > 0;
    const e1rm = isWeighted ? calculateBrzycki1RM(s.weight, s.reps) : 0;
    return h("div", { key: idx, style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", padding: "3px 0" } },
      h("span", null,
        h("strong", { style: { color: "var(--hg-text-2)", marginRight: "8px", fontSize: "12px" } }, `Set ${idx + 1}`),
        isWeighted ? `${s.reps} reps @ ${s.weight} kg` : `${s.reps} reps (Bodyweight)`,
        s.rpe != null ? ` @ RPE ${s.rpe}` : ""
      ),
      e1rm > 0 && h("span", { style: { fontSize: "11px", color: "var(--hg-text-3)" } }, `e1RM: ${e1rm} kg`)
    );
  });
}

/**
 * Main Progress Tab Component
 */
export function ProgressTab({ personId, data, meta, weekInfo, updateData, showToast }) {
  const I = window.HG_INTERNALS || {};
  const streak = I.HGcurrentStreak ? I.HGcurrentStreak(data) : 0;
  const logsList = Array.isArray(data?.logs) ? data.logs : [];
  
  const currentMonthStr = useMemo(() => {
    return (I.W ? I.W() : new Date().toISOString()).slice(0, 7);
  }, [I]);

  const completedMonth = useMemo(() => {
    return logsList.filter(log => (log.date || "").slice(0, 7) === currentMonthStr).length;
  }, [logsList, currentMonthStr]);

  // 1. Ingest logs and parse to single schema format
  const flatLogs = useMemo(() => {
    const list = [];
    logsList.forEach(log => {
      if (!log || log.type === "run" || log.sessionId === "run") return;

      function processEntry(entryRaw, parentDocId, inheritedMeta = {}) {
        const rawName = entryRaw.exerciseName || entryRaw.name || entryRaw.exerciseId || entryRaw.id;
        if (!rawName) return;

        const date = entryRaw.date || inheritedMeta.date || (entryRaw.timestamp ? new Date(entryRaw.timestamp).toISOString().slice(0, 10) : "");
        const timestamp = entryRaw.timestamp || inheritedMeta.timestamp || (date ? new Date(date).getTime() : Date.now());

        let setsArray = [];
        let totalSets = 0;
        let totalReps = 0;
        let maxWeight = 0;

        if (Array.isArray(entryRaw.sets)) {
          totalSets = entryRaw.sets.length;
          setsArray = entryRaw.sets.map(s => {
            const r = Number(s.reps) || 0;
            const wRaw = s.weight;
            const wNum = Number(wRaw);
            const w = (!Number.isNaN(wNum) && wNum > 0 && wRaw !== null && wRaw !== "") ? wNum : 0;
            return {
              reps: r,
              weight: w,
              rpe: s.rpe != null ? s.rpe : (entryRaw.rpe != null ? entryRaw.rpe : inheritedMeta.rpe)
            };
          });
          totalReps = setsArray.reduce((acc, s) => acc + s.reps, 0);
          maxWeight = setsArray.length ? Math.max(0, ...setsArray.map(s => s.weight)) : 0;
        } else {
          totalSets = Math.max(1, Number(entryRaw.sets) || 1);
          const reps = Number(entryRaw.reps) || 0;
          const wRaw = entryRaw.weight != null ? entryRaw.weight : inheritedMeta.weight;
          const wNum = Number(wRaw);
          const w = (!Number.isNaN(wNum) && wNum > 0 && wRaw !== null && wRaw !== "") ? wNum : 0;
          maxWeight = w;
          totalReps = totalSets * reps;
          for (let i = 0; i < totalSets; i++) {
            setsArray.push({
              reps,
              weight: maxWeight,
              rpe: entryRaw.rpe != null ? entryRaw.rpe : inheritedMeta.rpe
            });
          }
        }

        const isBodyweight = maxWeight === 0;
        const volume = isBodyweight ? totalReps : (totalReps * maxWeight);

        list.push({
          id: entryRaw.id || parentDocId,
          parentId: parentDocId,
          type: entryRaw.type || inheritedMeta.type || "exercise",
          sessionId: entryRaw.sessionId || inheritedMeta.sessionId,
          exerciseId: entryRaw.exerciseId,
          exerciseName: rawName,
          date,
          timestamp,
          sets: setsArray,
          totalSets,
          totalReps,
          maxWeight,
          isBodyweight,
          volume,
          notes: entryRaw.notes || entryRaw.note || inheritedMeta.notes || "",
          rpe: entryRaw.rpe != null ? entryRaw.rpe : inheritedMeta.rpe,
          feeling: entryRaw.feeling || inheritedMeta.feeling
        });
      }

      if (Array.isArray(log.exercises) && log.exercises.length > 0) {
        log.exercises.forEach(ex => {
          processEntry(ex, log.id, {
            date: log.date,
            timestamp: log.timestamp,
            sessionId: log.sessionId,
            notes: log.notes || log.note || "",
            rpe: log.rpe,
            feeling: log.feeling,
            weight: log.weight
          });
        });
      } else {
        processEntry(log, log.id);
      }
    });
    return list;
  }, [logsList]);

  // 2. Extract deduplicated and sorted exercise list
  const nameGroupMap = useMemo(() => {
    const map = new Map();
    flatLogs.forEach(entry => {
      const cleanName = normalizeExerciseName(entry.exerciseName);
      const key = cleanName.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { canonicalName: cleanName, entries: [] });
      }
      map.get(key).entries.push(entry);
    });
    return map;
  }, [flatLogs]);

  const exerciseNames = useMemo(() => {
    return Array.from(nameGroupMap.values())
      .map(g => g.canonicalName)
      .sort((a, b) => a.localeCompare(b.canonicalName));
  }, [nameGroupMap]);

  // Default selection to most recently logged exercise
  const defaultSelectedName = useMemo(() => {
    if (flatLogs.length > 0) {
      const sortedByRecency = [...flatLogs].sort((a, b) => 
        (b.date || "").localeCompare(a.date || "") || (b.timestamp || 0) - (a.timestamp || 0)
      );
      if (sortedByRecency[0]) {
        return normalizeExerciseName(sortedByRecency[0].exerciseName);
      }
    }
    return "";
  }, [flatLogs]);

  const [selectedExercise, setSelectedExercise] = useState("");

  const currentExercise = useMemo(() => {
    if (selectedExercise && exerciseNames.some(n => n.toLowerCase() === selectedExercise.toLowerCase())) {
      return exerciseNames.find(n => n.toLowerCase() === selectedExercise.toLowerCase());
    }
    if (defaultSelectedName && exerciseNames.some(n => n.toLowerCase() === defaultSelectedName.toLowerCase())) {
      return exerciseNames.find(n => n.toLowerCase() === defaultSelectedName.toLowerCase());
    }
    return exerciseNames[0] || "";
  }, [selectedExercise, defaultSelectedName, exerciseNames]);

  // 3. Aggregate session history for selected exercise
  const sessions = useMemo(() => {
    if (!currentExercise) return [];
    const matchingLogs = nameGroupMap.get(currentExercise.toLowerCase())?.entries || [];

    const map = new Map();
    matchingLogs.forEach(entry => {
      const dateKey = entry.date || "Unknown Date";
      if (!map.has(dateKey)) {
        map.set(dateKey, {
          date: dateKey,
          timestamp: entry.timestamp || (entry.date ? new Date(entry.date).getTime() : 0),
          docIds: new Set(),
          sets: [],
          notes: [],
          rpe: null,
          feeling: null
        });
      }
      const sess = map.get(dateKey);
      if (entry.parentId || entry.id) sess.docIds.add(String(entry.parentId || entry.id));
      if (entry.notes) sess.notes.push(entry.notes);
      if (entry.rpe != null) sess.rpe = entry.rpe;
      if (entry.feeling) sess.feeling = entry.feeling;
      sess.sets.push(...entry.sets);
    });

    return Array.from(map.values()).map(sess => {
      const totalSets = sess.sets.length;
      const totalReps = sess.sets.reduce((sum, s) => sum + s.reps, 0);
      const maxWeight = sess.sets.length ? Math.max(0, ...sess.sets.map(s => s.weight)) : 0;
      const isBodyweight = maxWeight === 0;
      const volume = isBodyweight ? totalReps : (totalReps * maxWeight);
      const max1RM = sess.sets.length ? Math.max(0, ...sess.sets.map(s => calculateBrzycki1RM(s.weight, s.reps))) : 0;
      return {
        ...sess,
        totalSets,
        totalReps,
        maxWeight,
        isBodyweight,
        volume,
        max1RM
      };
    });
  }, [currentExercise, nameGroupMap]);

  const isWeightedExercise = useMemo(() => {
    return sessions.some(s => !s.isBodyweight);
  }, [sessions]);

  const [chartMetric, setChartMetric] = useState(null);

  const activeMetric = useMemo(() => {
    if (isWeightedExercise) {
      return (chartMetric === "volume" || chartMetric === "maxWeight") ? chartMetric : "maxWeight";
    }
    return (chartMetric === "totalSets" || chartMetric === "totalReps") ? chartMetric : "totalReps";
  }, [isWeightedExercise, chartMetric]);

  const { metricLabel, metricUnit } = useMemo(() => {
    if (activeMetric === "maxWeight") return { metricLabel: "Max Weight", metricUnit: "kg" };
    if (activeMetric === "volume") return { metricLabel: "Total Volume", metricUnit: "kg" };
    if (activeMetric === "totalReps") return { metricLabel: "Total Reps Logged", metricUnit: "reps" };
    return { metricLabel: "Total Sets", metricUnit: "sets" };
  }, [activeMetric]);

  // Chart data Oldest -> Newest
  const chartData = useMemo(() => {
    return [...sessions]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(s => {
        let val = 0;
        if (activeMetric === "maxWeight") val = s.maxWeight;
        else if (activeMetric === "volume") val = s.volume;
        else if (activeMetric === "totalReps") val = s.totalReps;
        else if (activeMetric === "totalSets") val = s.totalSets;

        return {
          rawDate: s.date,
          formattedDate: formatChartDate(s.date),
          fullDate: s.date,
          value: val
        };
      });
  }, [sessions, activeMetric]);

  // KPIs
  const allSets = useMemo(() => sessions.flatMap(s => s.sets), [sessions]);
  const totalSessions = sessions.length;
  const topSetWeight = useMemo(() => allSets.length ? Math.max(0, ...allSets.map(s => s.weight)) : 0, [allSets]);
  const topEstimated1RM = useMemo(() => allSets.length ? Math.max(0, ...allSets.map(s => calculateBrzycki1RM(s.weight, s.reps))) : 0, [allSets]);
  const topSessionVolume = useMemo(() => sessions.length ? Math.max(0, ...sessions.map(s => s.volume)) : 0, [sessions]);
  const totalExerciseReps = useMemo(() => sessions.reduce((sum, s) => sum + s.totalReps, 0), [sessions]);
  const maxSingleSetReps = useMemo(() => allSets.length ? Math.max(0, ...allSets.map(s => s.reps)) : 0, [allSets]);
  const totalExerciseSets = useMemo(() => sessions.reduce((sum, s) => sum + s.totalSets, 0), [sessions]);

  // Action: Delete Exercise Session
  async function deleteSession(session) {
    if (!window.confirm(`Delete ${currentExercise} logs for ${session.date}? This cannot be undone.`)) return;
    const idsToDelete = Array.from(session.docIds);
    if (updateData) {
      updateData(personId, cur => ({
        ...cur,
        logs: (cur?.logs || []).filter(l => !idsToDelete.includes(String(l.id)))
      }));
    }
    try {
      const GymCloudEngine = window.GymCloudEngine;
      if (GymCloudEngine) {
        for (const docId of idsToDelete) {
          await GymCloudEngine.deleteExerciseLog(personId, docId);
          const fs = GymCloudEngine.getFirestore();
          if (fs) {
            fs.collection("workouts").doc(docId).delete().catch(() => {});
            fs.collection("users").doc(personId).collection("workouts").doc(docId).delete().catch(() => {});
            fs.collection("gym_users").doc(personId).collection("logs").doc(docId).delete().catch(() => {});
            fs.collection("gym_users").doc(personId).collection("exercise_logs").doc(docId).delete().catch(() => {});
          }
        }
      }
      if (showToast) showToast("Exercise session deleted");
    } catch (err) {
      console.warn("Delete error:", err);
      if (showToast) showToast("Deleted locally");
    }
  }

  // Reverse list: Newest -> Oldest
  const sortedSessionsDesc = useMemo(() => {
    return [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  }, [sessions]);

  return h(React.Fragment, null,
    h("div", { className: "hg-view-header" },
      h("h1", null, "Progress"),
      h("p", null, "Consistency, personal bests, and exercise trends.")
    ),
    h("div", { className: "hg-stats" },
      h("div", { className: "hg-stat" }, h("span", null, "Week streak"), h("strong", null, streak)),
      h("div", { className: "hg-stat" }, h("span", null, "Logs this month"), h("strong", null, completedMonth))
    ),

    exerciseNames.length === 0 ? h("div", { className: "hg-card hg-empty", style: { marginTop: "14px" } },
      h("h2", null, "No exercise history recorded yet."),
      h("p", null, "Completed strength exercises will appear here with automated volume tracking, trends, and chronological session histories.")
    ) : h(React.Fragment, null,
      // Dropdown Picker
      h("div", { className: "hg-card", style: { marginBottom: "14px" } },
        h("label", { htmlFor: "exercise-progress-select", className: "hg-card-title", style: { display: "block", marginBottom: "8px" } }, "Select Exercise"),
        h("select", {
          id: "exercise-progress-select",
          className: "hg-input",
          value: currentExercise,
          onChange: e => {
            setSelectedExercise(e.target.value);
            setChartMetric(null);
          },
          style: { cursor: "pointer", fontWeight: 600 }
        },
          exerciseNames.map(name => h("option", { key: name, value: name }, name))
        )
      ),

      // KPI Stats Panel
      isWeightedExercise ? h("div", { className: "hg-stats", style: { gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))", marginBottom: "14px" } },
        h("div", { className: "hg-stat" }, h("span", null, "Top Set Weight"), h("strong", null, `${topSetWeight} kg`)),
        h("div", { className: "hg-stat" }, h("span", null, "Estimated 1RM"), h("strong", null, topEstimated1RM > 0 ? `${topEstimated1RM} kg` : "—")),
        h("div", { className: "hg-stat" }, h("span", null, "Best Volume"), h("strong", null, `${topSessionVolume} kg`)),
        h("div", { className: "hg-stat" }, h("span", null, "Total Sessions"), h("strong", null, `${totalSessions}`))
      ) : h("div", { className: "hg-stats", style: { gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))", marginBottom: "14px" } },
        h("div", { className: "hg-stat" }, h("span", null, "Total Reps Logged"), h("strong", null, `${totalExerciseReps} reps`)),
        h("div", { className: "hg-stat" }, h("span", null, "Max Reps (Set)"), h("strong", null, `${maxSingleSetReps} reps`)),
        h("div", { className: "hg-stat" }, h("span", null, "Total Sets"), h("strong", null, `${totalExerciseSets}`)),
        h("div", { className: "hg-stat" }, h("span", null, "Total Sessions"), h("strong", null, `${totalSessions}`))
      ),

      // Graph Card
      h("div", { className: "hg-card", style: { marginBottom: "14px" } },
        h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10px" } },
          h("h2", { className: "hg-card-title", style: { margin: 0 } }, `${currentExercise} Progress`),
          h("span", { style: { fontSize: "12px", color: "var(--hg-text-3)", fontWeight: 500 } }, metricLabel)
        ),
        // Toggle Buttons
        h("div", { className: "hg-segment", style: { gridTemplateColumns: "repeat(2, 1fr)", marginBottom: "12px" } },
          (isWeightedExercise ? [
            { key: "maxWeight", label: "Max Weight (kg)" },
            { key: "volume", label: "Total Volume (kg)" }
          ] : [
            { key: "totalReps", label: "Total Reps Logged" },
            { key: "totalSets", label: "Total Sets" }
          ]).map(opt => h("button", {
            key: opt.key,
            type: "button",
            "aria-pressed": activeMetric === opt.key ? "true" : "false",
            onClick: () => setChartMetric(opt.key)
          }, opt.label))
        ),
        chartData.length > 0
          ? h(ProgressChart, { data: chartData, metricLabel, unit: metricUnit, accent: meta.accent })
          : h("div", { style: { padding: "24px 0", textAlign: "center", color: "var(--hg-text-3)", fontSize: "14px" } }, "Not enough data for chart")
      ),

      // Session History Lists
      h("div", { style: { marginTop: "18px" } },
        h("h2", { style: { fontSize: "17px", fontWeight: 750, marginBottom: "10px" } }, "Session History"),
        sortedSessionsDesc.length === 0 ? h("div", { className: "hg-card", style: { color: "var(--hg-text-2)", textAlign: "center", padding: "20px" } }, "No sessions logged for this exercise.") : sortedSessionsDesc.map(session => {
          const first = session.sets[0];
          const allIdentical = session.sets.length > 1 && session.sets.every(s => s.weight === first.weight && s.reps === first.reps);

          let sessionHeadline = "";
          if (allIdentical || session.sets.length === 1) {
            if (session.isBodyweight) {
              sessionHeadline = `${session.totalSets} ${session.totalSets === 1 ? "set" : "sets"} × ${first?.reps || 0} reps (Total: ${session.totalReps} reps)`;
            } else {
              sessionHeadline = `${session.totalSets} ${session.totalSets === 1 ? "set" : "sets"} × ${first?.reps || 0} reps @ ${first?.weight || 0} kg`;
            }
          } else {
            if (session.isBodyweight) {
              sessionHeadline = `${session.totalSets} sets (Total: ${session.totalReps} reps)`;
            } else {
              sessionHeadline = `${session.totalSets} sets · Top: ${session.maxWeight} kg (Total: ${session.totalReps} reps)`;
            }
          }

          return h("div", { className: "hg-card", key: session.date, style: { marginBottom: "10px" } },
            h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" } },
              h("div", null,
                h("div", { style: { fontWeight: 700, fontSize: "15px" } }, formatSessionDate(session.date)),
                h("div", { style: { fontSize: "12px", color: "var(--hg-text-2)", marginTop: "2px" } }, sessionHeadline)
              ),
              h("button", {
                type: "button",
                className: "hg-link-button",
                style: { color: "var(--hg-danger)", padding: "4px 8px", fontSize: "13px" },
                onClick: () => deleteSession(session)
              }, "Delete")
            ),
            h("div", { style: { display: "grid", gap: "4px", borderTop: "1px solid var(--hg-border)", paddingTop: "8px" } },
              h(SetsBreakdown, { sets: session.sets, isBodyweight: session.isBodyweight })
            ),
            (session.notes.length > 0 || session.rpe != null || session.feeling) && h("div", { style: { marginTop: "8px", fontSize: "12px", color: "var(--hg-text-2)", borderTop: "1px dashed var(--hg-border)", paddingTop: "6px" } },
              session.feeling ? `Feeling: ${FEELING_LABELS[session.feeling] || session.feeling} · ` : "",
              session.rpe != null ? `RPE: ${session.rpe} · ` : "",
              session.notes.filter(Boolean).join(" · ")
            )
          );
        })
      )
    )
  );
}

export default ProgressTab;
