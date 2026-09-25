const h = React.createElement;
const { useState } = React;

function Field({ label, full, children }) {
  return h("div", { className: `hg-field${full ? " full" : ""}` },
    h("label", null, label),
    children
  );
}

function Button({ children, ...props }) {
  return h("button", { type: "button", className: "hg-button", ...props }, children);
}

export function ReadinessInline({ personId, data, updateData, showToast }) {
  const I = window.HG_INTERNALS || {};
  const today = I.W ? I.W() : new Date().toISOString().slice(0, 10);
  const records = Array.isArray(data?.readinessLogs) ? data.readinessLogs : [];
  const current = records.find(item => item.date === today);
  const [open, setOpen] = useState(!current);

  const [sleepHours, setSleepHours] = useState(current?.sleepHours != null ? String(current.sleepHours) : "7");
  const [sleepMins, setSleepMins] = useState(current?.sleepMins != null ? String(current.sleepMins) : "30");
  const [soreness, setSoreness] = useState(current ? Number(current.soreness) : 2);
  const [motivation, setMotivation] = useState(current ? Number(current.motivation) : 4);

  const SORENESS_MAP = ["None", "Mild", "Moderate", "Significant", "Severe"];
  const MOTIVATION_MAP = ["None", "Low", "Neutral", "Motivated", "Highly Motivated"];

  function save() {
    const hrs = Number(sleepHours) || 0;
    const mins = Number(sleepMins) || 0;
    const entry = {
      id: current?.id || `read_${Date.now()}`,
      date: today,
      sleep: Math.round((hrs + mins / 60) * 100) / 100,
      sleepHours: hrs,
      sleepMins: mins,
      soreness: Number(soreness),
      motivation: Number(motivation),
      notes: "",
      timestamp: Date.now()
    };
    if (window.GymCloudEngine?.saveReadinessLog) {
      window.GymCloudEngine.saveReadinessLog(personId, entry);
    }
    const nextRecords = [...records.filter(item => item.date !== today), entry].sort((a, b) => a.date.localeCompare(b.date));
    if (updateData) {
      updateData(personId, cur => ({ ...cur, readinessLogs: nextRecords }));
    }
    setOpen(false);
    showToast("Readiness saved");
  }

  return h("div", { className: "hg-callout" },
    h("div", { style: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" } },
      h("div", null,
        h("strong", null, "Today's readiness"),
        current && !open && h("div", { className: "hg-history-meta" },
          `${current.sleepHours || 0}h ${current.sleepMins || 0}m sleep · soreness ${current.soreness} (${SORENESS_MAP[current.soreness] || ""}) · drive ${current.motivation} (${MOTIVATION_MAP[current.motivation] || ""})`
        )
      ),
      h("button", { type: "button", className: "hg-link-button", onClick: () => setOpen(!open) },
        open ? "Close" : current ? "Edit" : "Check in"
      )
    ),
    open && h(React.Fragment, null,
      h("div", { className: "hg-fields" },
        h(Field, { label: "Sleep duration", full: true },
          h("div", { style: { display: "flex", gap: 10, alignItems: "center" } },
            h("div", { style: { display: "flex", alignItems: "center", gap: 6, flex: 1 } },
              h("input", { className: "hg-input", type: "number", min: "0", max: "24", placeholder: "7", value: sleepHours, onChange: e => setSleepHours(e.target.value) }),
              h("span", null, "hrs")
            ),
            h("div", { style: { display: "flex", alignItems: "center", gap: 6, flex: 1 } },
              h("input", { className: "hg-input", type: "number", min: "0", max: "59", value: sleepMins, onChange: e => setSleepMins(e.target.value) }),
              h("span", null, "mins")
            )
          )
        ),
        h(Field, { label: `Soreness: ${soreness} · ${SORENESS_MAP[soreness] || ""}`, full: true },
          h("div", { style: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginTop: "4px" } },
            [0, 1, 2, 3, 4].map(val =>
              h("button", {
                key: val,
                type: "button",
                className: `hg-scale-card-btn ${Number(soreness) === val ? "active" : ""}`,
                onClick: () => setSoreness(val)
              }, h("span", { className: "hg-scale-num" }, val))
            )
          )
        ),
        h(Field, { label: `Motivation: ${motivation} · ${MOTIVATION_MAP[motivation] || ""}`, full: true },
          h("div", { style: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginTop: "4px" } },
            [0, 1, 2, 3, 4].map(val =>
              h("button", {
                key: val,
                type: "button",
                className: `hg-scale-card-btn ${Number(motivation) === val ? "active" : ""}`,
                onClick: () => setMotivation(val)
              }, h("span", { className: "hg-scale-num" }, val))
            )
          )
        )
      ),
      h("div", { className: "hg-actions", style: { marginTop: "12px" } }, h(Button, { onClick: save }, "Save readiness"))
    )
  );
}
export default ReadinessInline;
