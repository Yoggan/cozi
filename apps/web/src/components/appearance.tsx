import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { accentOptions } from "@/lib/cozi";

const ACCENT_KEY = "cozi-accent";

function readAccent() {
  const saved = typeof window === "undefined" ? null : localStorage.getItem(ACCENT_KEY);

  return saved && Object.hasOwn(accentOptions, saved) ? saved : "emerald";
}

export function RestoreAccent() {
  useEffect(() => {
    document.documentElement.dataset.accent = readAccent();
  }, []);

  return null;
}

export default function Appearance() {
  const { theme, setTheme } = useTheme();
  const [accent, setAccent] = useState(readAccent);

  return (
    <section className="panel stack">
      <h2 className="section-title">Apariencia</h2>
      <label className="field">
        Modo
        <select
          className="field-control"
          value={theme ?? "dark"}
          onChange={(event) => setTheme(event.target.value)}
        >
          <option value="dark">Oscuro</option>
          <option value="light">Claro</option>
        </select>
      </label>
      <label className="field">
        Color de acento
        <select
          className="field-control"
          value={accent}
          onChange={(event) => {
            const value = event.target.value;
            localStorage.setItem(ACCENT_KEY, value);
            document.documentElement.dataset.accent = value;
            setAccent(value);
          }}
        >
          {Object.entries(accentOptions).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
