import { HistoryCard } from "./HistoryCard.jsx";
import { getProfileData, subscribeToStorageChanges } from "../services/storageAdapter.js";
import { normalizeExerciseName } from "../utils/normalizers.js";

const h = React.createElement;
const { useState, useEffect, useMemo } = React;

/**
 * Main History Tab container with search, session filtering, and reactive local storage hydration.
 */
export function HistoryTab({ personId, data: initialData, updateData, showToast }) {
  // 1. Storage Hydration & Reactivity
  const [data, setData] = useState(() => {
    if (initialData) return initialData;
    return getProfileData(`data:${personId}`) || { logs: [], sessions: [] };
  });

  useEffect(() => {
    if (initialData) {
      setData(initialData);
    }
  }, [initialData]);

  useEffect(() => {
    // Reactive sync if tab/storage changes
    const unsubscribe = subscribeToStorageChanges(({ key, newValue }) => {
      if (key === `data:${personId}`) {
        try {
          if (newValue) {
            setData(JSON.parse(newValue));
          }
        } catch (e) {
          console.error("[HistoryTab] Error parsing reactive data:", e);
        }
      }
    });
    return unsubscribe;
  }, [personId]);

  // 2. Search and Filtering State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("all");
  const [editor, setEditor] = useState(null);

  const logsList = useMemo(() => Array.isArray(data?.logs) ? data.logs : [], [data]);
  const sessions = useMemo(() => Array.isArray(data?.sessions) ? data.sessions : [], [data]);

  // Helper: Find exercise matching log
  function findExerciseLocal(sessionId, exerciseId) {
    const session = sessions.find(item => item.id === sessionId);
    if (!session || session.type !== "strength") return null;
    for (const group of session.groups || []) {
      const exercise = (group.exercises || []).find(item => item.id === exerciseId);
      if (exercise) return { session, group, exercise };
    }
    return null;
  }

  // 3. Filter and Sort Workout Logs
  const filteredSortedLogs = useMemo(() => {
    const sorted = [...logsList].sort((a, b) => 
      b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id))
    );

    return sorted.filter(log => {
      // Find matching session and exercise
      const found = log.type === "exercise" ? findExerciseLocal(log.sessionId, log.exerciseId) : null;
      const session = sessions.find(item => item.id === log.sessionId);
      const rawTitle = log.type === "run" 
        ? (session?.name || log.exerciseName || "Run") 
        : (found?.exercise?.name || log.exerciseName || log.exerciseId || "");
      const title = log.type === "run" ? rawTitle : normalizeExerciseName(rawTitle);

      // Search match
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch = !query || 
        title.toLowerCase().includes(query) ||
        (log.notes && log.notes.toLowerCase().includes(query)) ||
        (log.date && log.date.includes(query));

      // Session match
      const matchesSession = selectedSessionId === "all" || log.sessionId === selectedSessionId;

      return matchesSearch && matchesSession;
    });
  }, [logsList, searchQuery, selectedSessionId, sessions]);

  // Limit to 50 items for viewport efficiency
  const displayedLogs = useMemo(() => filteredSortedLogs.slice(0, 50), [filteredSortedLogs]);

  // 4. Action: Delete Log
  async function remove(log) {
    if (!window.confirm("Delete this history entry? This cannot be undone.")) return;
    if (updateData) {
      updateData(personId, current => ({
        ...current,
        logs: (current?.logs || []).filter(item => item.id !== log.id)
      }));
    }
    try {
      const GymCloudEngine = window.GymCloudEngine;
      if (GymCloudEngine) {
        await GymCloudEngine.deleteExerciseLog(personId, log.id);
        const fs = GymCloudEngine.getFirestore();
        if (fs) {
          fs.collection("workouts").doc(String(log.id)).delete().catch(() => {});
          fs.collection("users").doc(personId).collection("workouts").doc(String(log.id)).delete().catch(() => {});
        }
      }
      showToast("Entry deleted");
    } catch (err) {
      showToast("Deleted locally");
    }
  }

  // 5. Retrieve dynamic HistoryEditor modal from global registry to prevent dependency duplication
  const HistoryEditor = window.HistoryEditor;

  return h(React.Fragment, null,
    h("div", { className: "hg-view-header" },
      h("h1", null, "History"),
      h("p", null, "Review workouts or add a manual and backdated entry.")
    ),
    h("div", { className: "hg-actions", style: { margin: "0 0 16px" } },
      h("button", { 
        className: "hg-btn primary", 
        type: "button", 
        onClick: () => setEditor({ mode: "new" }) 
      }, "Add past entry")
    ),

    // Search and Filter Panel
    h("div", { className: "hg-card", style: { marginBottom: "16px", padding: "14px", display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" } },
      h("div", null,
        h("label", { style: { fontSize: "11px", color: "var(--hg-text-3)", fontWeight: "bold", display: "block", marginBottom: "4px" } }, "Search Name / Notes"),
        h("input", {
          type: "text",
          className: "hg-input",
          placeholder: "Search...",
          value: searchQuery,
          onChange: e => setSearchQuery(e.target.value),
          style: { padding: "8px 12px", fontSize: "14px" }
        })
      ),
      h("div", null,
        h("label", { style: { fontSize: "11px", color: "var(--hg-text-3)", fontWeight: "bold", display: "block", marginBottom: "4px" } }, "Filter by Routine"),
        h("select", {
          className: "hg-input",
          value: selectedSessionId,
          onChange: e => setSelectedSessionId(e.target.value),
          style: { padding: "8px 12px", fontSize: "14px" }
        },
          h("option", { value: "all" }, "All Sessions"),
          sessions.map(s => h("option", { key: s.id, value: s.id }, s.name))
        )
      )
    ),

    displayedLogs.length === 0 ? h("div", { className: "hg-card hg-empty" },
      h("h2", null, "No matching workouts found"),
      h("p", null, "Adjust your filters or log a new exercise.")
    ) : h("div", { className: "hg-card" },
      displayedLogs.map(log => {
        const found = log.type === "exercise" ? findExerciseLocal(log.sessionId, log.exerciseId) : null;
        const session = sessions.find(item => item.id === log.sessionId);
        return h(HistoryCard, {
          key: log.id,
          log,
          session,
          exercise: found?.exercise,
          onEdit: (l) => setEditor({ mode: "edit", log: l }),
          onDelete: remove
        });
      })
    ),

    editor && HistoryEditor && h(HistoryEditor, {
      personId,
      data,
      initialLog: editor.log || null,
      updateData,
      showToast,
      onClose: () => setEditor(null),
    })
  );
}
export default HistoryTab;
