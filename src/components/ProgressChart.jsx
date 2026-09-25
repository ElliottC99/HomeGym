import { resolveLogMetric } from "../utils/metrics.js";

const h = React.createElement;

/**
 * Fallback high-fidelity SVG Trend Chart when interactive Recharts is offline or not loaded.
 */
function SVGProgressFallback({ records, accent, unit, metricLabel }) {
  if (!records || records.length === 0) return null;
  
  const vals = records.map(r => Number(r.value) || 0);
  const minV = Math.max(0, Math.floor(Math.min(...vals) - (Math.min(...vals) > 5 ? 2 : 0)));
  const maxV = Math.ceil(Math.max(...vals) + 2) || 10;
  const rangeV = maxV - minV || 1;

  const width = 360;
  const height = 180;
  const padLeft = 46;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 32;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const getX = index => records.length === 1 
    ? padLeft + plotW / 2 
    : padLeft + (index / (records.length - 1)) * plotW;
  const getY = val => padTop + plotH - ((val - minV) / rangeV) * plotH;

  const points = records.map((r, i) => `${getX(i).toFixed(1)},${getY(Number(r.value) || 0).toFixed(1)}`).join(" ");

  const yTicks = [minV, Math.round((minV + rangeV / 2) * 10) / 10, maxV];
  const xIndices = records.length <= 2 
    ? records.map((_, i) => i) 
    : [0, Math.floor(records.length / 2), records.length - 1];

  const chartAccent = accent || "var(--hg-accent, #3B82F6)";
  const displayUnit = unit ? ` ${unit}` : "";

  return h("div", { className: "hg-chart-wrap" },
    h("svg", { viewBox: `0 0 ${width} ${height}`, className: "hg-svg-chart" },
      // Y Grid lines & Labels
      yTicks.map((tick, idx) => {
        const y = getY(tick);
        return h("g", { key: idx },
          h("line", { x1: padLeft, y1: y, x2: width - padRight, y2: y, stroke: "var(--hg-border)", strokeDasharray: "3,3", strokeWidth: 1 }),
          h("text", { x: padLeft - 8, y: y + 4, textAnchor: "end", fontSize: 11, fill: "var(--hg-text-3)", fontFamily: "system-ui, sans-serif" }, `${tick}${displayUnit}`)
        );
      }),
      // X-Axis Date Labels
      xIndices.map(i => {
        const rec = records[i];
        if (!rec) return null;
        const x = getX(i);
        const anchor = i === 0 ? "start" : i === records.length - 1 ? "end" : "middle";
        return h("text", {
          key: i,
          x,
          y: height - 8,
          textAnchor: anchor,
          fontSize: 11,
          fill: "var(--hg-text-3)",
          fontFamily: "system-ui, sans-serif"
        }, rec.formattedDate);
      }),
      // Polyline (Curve)
      records.length > 1 && h("polyline", {
        fill: "none",
        stroke: chartAccent,
        strokeWidth: 2.5,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        points
      }),
      // Data Dot Markers
      records.map((r, i) =>
        h("circle", {
          key: i,
          cx: getX(i),
          cy: getY(Number(r.value) || 0),
          r: 4,
          fill: chartAccent,
          stroke: "var(--hg-surface)",
          strokeWidth: 2
        })
      )
    )
  );
}

/**
 * Main Progress Chart component leveraging global Recharts with custom SVG fallback.
 */
export function ProgressChart({ data, metricLabel, unit, accent }) {
  if (!data || data.length === 0) return null;

  const Recharts = window.Recharts;
  const chartAccent = accent || "var(--hg-accent, #3B82F6)";
  const displayUnit = unit ? ` ${unit}` : "";

  // Interactive Recharts view if loaded in browser
  if (Recharts && Recharts.LineChart && Recharts.ResponsiveContainer) {
    return h("div", { style: { width: "100%", height: 230, marginTop: 12 } },
      h(Recharts.ResponsiveContainer, { width: "100%", height: "100%" },
        h(Recharts.LineChart, { data, margin: { top: 12, right: 16, left: -14, bottom: 6 } },
          h(Recharts.CartesianGrid, { strokeDasharray: "3 3", stroke: "var(--hg-border)", opacity: 0.6 }),
          h(Recharts.XAxis, {
            dataKey: "formattedDate",
            tick: { fontSize: 11, fill: "var(--hg-text-3)" },
            tickLine: false,
            axisLine: { stroke: "var(--hg-border)" }
          }),
          h(Recharts.YAxis, {
            domain: [
              dataMin => Math.max(0, Math.floor(dataMin * 0.9)),
              dataMax => Math.ceil(dataMax * 1.1) || 10
            ],
            tick: { fontSize: 11, fill: "var(--hg-text-3)" },
            tickLine: false,
            axisLine: { stroke: "var(--hg-border)" },
            unit: displayUnit
          }),
          h(Recharts.Tooltip, {
            contentStyle: {
              backgroundColor: "var(--hg-surface)",
              borderColor: "var(--hg-border)",
              borderRadius: "10px",
              fontSize: "12px",
              color: "var(--hg-text)",
              boxShadow: "0 4px 14px rgba(0,0,0,0.15)"
            },
            formatter: (val) => [`${val}${displayUnit}`, metricLabel || "Value"],
            labelFormatter: (lbl, items) => {
              const item = items && items[0] && items[0].payload;
              return item ? item.fullDate : lbl;
            }
          }),
          h(Recharts.Line, {
            type: "monotone",
            dataKey: "value",
            stroke: chartAccent,
            strokeWidth: 2.5,
            dot: { r: 4, fill: chartAccent, strokeWidth: 2, stroke: "var(--hg-surface)" },
            activeDot: { r: 6 }
          })
        )
      )
    );
  }

  // Baseline standard SVG Fallback if Recharts library is unavailable
  return h(SVGProgressFallback, { records: data, accent: chartAccent, unit, metricLabel });
}

export default ProgressChart;
