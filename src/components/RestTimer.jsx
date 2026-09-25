const h = React.createElement;
const { useState, useEffect, useRef } = React;

function Button({ children, ...props }) {
  return h("button", { type: "button", className: "hg-button", ...props }, children);
}

export function RestTimer({ defaultSeconds, timerEndAt, onTimerChange }) {
  const [duration, setDuration] = useState(defaultSeconds || 90);
  const [now, setNow] = useState(Date.now());
  const remaining = timerEndAt ? Math.max(0, Math.ceil((timerEndAt - now) / 1000)) : duration;
  const wasRunning = useRef(Boolean(timerEndAt));

  useEffect(() => {
    if (!timerEndAt) {
      wasRunning.current = false;
      return undefined;
    }
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [timerEndAt]);

  useEffect(() => {
    if (timerEndAt && remaining === 0 && wasRunning.current) {
      wasRunning.current = false;
      onTimerChange(null);
      if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
      try {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (Context) {
          const context = new Context();
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = 880;
          gain.gain.setValueAtTime(0.12, context.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start();
          oscillator.stop(context.currentTime + 0.35);
        }
      } catch {}
    }
  }, [remaining, timerEndAt, onTimerChange]);

  return h("div", { className: "hg-timer" },
    h("div", null,
      h("div", { className: "hg-timer-value" },
        `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
      ),
      h("div", { className: "hg-history-meta" }, timerEndAt ? "Resting" : "Rest timer")
    ),
    h("div", { style: { display: "flex", gap: 7, alignItems: "center" } },
      !timerEndAt && h("select", {
        className: "hg-input",
        value: duration,
        "aria-label": "Rest duration",
        style: { width: 88, minHeight: 42, padding: "6px 8px" },
        onChange: event => setDuration(Number(event.target.value)),
      }, [30, 45, 60, 75, 90, 120, 180].map(value =>
        h("option", { key: value, value }, `${value}s`)
      )),
      h(Button, {
        onClick: timerEndAt ? () => onTimerChange(null) : () => onTimerChange(Date.now() + duration * 1000),
      }, timerEndAt ? "Stop" : "Start")
    )
  );
}
export default RestTimer;
