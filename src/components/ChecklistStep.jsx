import { ReadinessInline } from "./ReadinessInline.jsx";

const h = React.createElement;

function Button({ children, primary, ...props }) {
  const classes = ["hg-button"];
  if (primary) classes.push("primary");
  return h("button", { type: "button", className: classes.join(" "), ...props }, children);
}

export function ChecklistStep({ title, copy, items, checked, onToggle, onNext, onBack, showReadiness, personId, data, updateData, showToast }) {
  return h("div", { className: "hg-card" },
    h("div", { className: "hg-card-title" }, title),
    copy && h("div", { className: "hg-card-copy" }, copy),
    showReadiness && h(ReadinessInline, { personId, data, updateData, showToast }),
    items.length > 0 ? h("div", { className: "hg-checklist" },
      items.map((item, index) => {
        const key = `${title}:${index}`;
        return h("label", { className: "hg-check", key },
          h("input", { type: "checkbox", checked: checked.includes(key), onChange: () => onToggle(key) }),
          h("div", null, h("strong", null, item.name), item.detail && h("span", null, item.detail))
        );
      })
    ) : h("div", { className: "hg-callout" }, "No movements listed for this step."),
    h("div", { className: "hg-actions" },
      onBack && h(Button, { onClick: onBack }, "Back"),
      h(Button, { primary: true, onClick: onNext }, items.length ? "Done — continue" : "Continue")
    )
  );
}
export default ChecklistStep;
