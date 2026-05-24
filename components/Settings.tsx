"use client";
import { useState, useEffect } from "react";
import { DEFAULT_MODELS } from "@/lib/providers/types";

export interface UserSettings {
  provider: "claude" | "gemini" | "openai";
  apiKey: string;
  model: string;
  scanTime: string; // "09:00" PKT
}

const PROVIDER_LABELS = {
  claude: { name: "Claude (Anthropic)", placeholder: "sk-ant-api03-...", keyUrl: "https://console.anthropic.com/settings/keys" },
  gemini: { name: "Gemini (Google)", placeholder: "AIza...", keyUrl: "https://aistudio.google.com/apikey" },
  openai: { name: "ChatGPT (OpenAI)", placeholder: "sk-proj-...", keyUrl: "https://platform.openai.com/api-keys" },
};

const MODEL_OPTIONS: Record<string, { value: string; label: string }[]> = {
  claude: [
    { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 (recommended)" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (faster, cheaper)" },
    { value: "claude-opus-4-5", label: "Claude Opus 4.5 (most powerful)" },
  ],
  gemini: [
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash (recommended)" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  ],
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o Mini (recommended)" },
    { value: "gpt-4o", label: "GPT-4o" },
  ],
};

const LS_KEY = "psx_settings";

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") return defaultSettings();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch {}
  return defaultSettings();
}

function defaultSettings(): UserSettings {
  return { provider: "claude", apiKey: "", model: DEFAULT_MODELS.claude, scanTime: "09:00" };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (s: UserSettings) => void;
}

const C = {
  bg: "#0f0f0f", card: "#181818", border: "#222", border2: "#2a2a2a",
  text: "#e8e8e8", muted: "#888", dim: "#555",
  green: "#4a9966", greenDim: "#1a3020", greenText: "#5dbf7f",
  blue: "#4a80c0", blueDim: "#12202a", blueText: "#6aa0e0",
};

export default function Settings({ open, onClose, onSave }: Props) {
  const [s, setS] = useState<UserSettings>(defaultSettings);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) setS(loadSettings());
  }, [open]);

  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
    onSave(s);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  if (!open) return null;

  const pInfo = PROVIDER_LABELS[s.provider];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
    }}>
      <div style={{
        background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12,
        padding: 24, width: 420, maxWidth: "95vw"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Settings</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18 }}>×</button>
        </div>

        {/* Provider */}
        <label style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>AI Provider</label>
        <select
          value={s.provider}
          onChange={e => {
            const p = e.target.value as UserSettings["provider"];
            setS(prev => ({ ...prev, provider: p, model: DEFAULT_MODELS[p] }));
          }}
          style={{ width: "100%", marginTop: 6, marginBottom: 14, padding: "6px 8px", background: "#111", color: C.text, border: `0.5px solid ${C.border2}`, borderRadius: 6, fontSize: 12 }}
        >
          {Object.entries(PROVIDER_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.name}</option>
          ))}
        </select>

        {/* API Key */}
        <label style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
          API Key{" "}
          <a href={pInfo.keyUrl} target="_blank" rel="noreferrer" style={{ color: C.blueText, textDecoration: "none" }}>
            (get one ↗)
          </a>
        </label>
        <div style={{ display: "flex", gap: 6, marginTop: 6, marginBottom: 6 }}>
          <input
            type={showKey ? "text" : "password"}
            placeholder={pInfo.placeholder}
            value={s.apiKey}
            onChange={e => setS(p => ({ ...p, apiKey: e.target.value }))}
            style={{ flex: 1, padding: "6px 8px", background: "#111", color: C.text, border: `0.5px solid ${C.border2}`, borderRadius: 6, fontSize: 11, fontFamily: "monospace" }}
          />
          <button
            onClick={() => setShowKey(v => !v)}
            style={{ padding: "6px 10px", background: "transparent", border: `0.5px solid ${C.border2}`, borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 11 }}
          >
            {showKey ? "Hide" : "Show"}
          </button>
        </div>
        <p style={{ fontSize: 9, color: C.dim, marginBottom: 14 }}>
          Stored in your browser only — never sent to any server except the AI provider directly.
        </p>

        {/* Model */}
        <label style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Model</label>
        <select
          value={s.model}
          onChange={e => setS(p => ({ ...p, model: e.target.value }))}
          style={{ width: "100%", marginTop: 6, marginBottom: 14, padding: "6px 8px", background: "#111", color: C.text, border: `0.5px solid ${C.border2}`, borderRadius: 6, fontSize: 12 }}
        >
          {(MODEL_OPTIONS[s.provider] || []).map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>

        {/* Scan time */}
        <label style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Daily Auto-Scan Time (PKT)</label>
        <input
          type="time"
          value={s.scanTime}
          onChange={e => setS(p => ({ ...p, scanTime: e.target.value }))}
          style={{ width: "100%", marginTop: 6, marginBottom: 20, padding: "6px 8px", background: "#111", color: C.text, border: `0.5px solid ${C.border2}`, borderRadius: 6, fontSize: 12 }}
        />

        <button
          onClick={save}
          style={{
            width: "100%", padding: "8px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600,
            background: saved ? C.greenDim : C.green, color: saved ? C.greenText : "#fff",
            border: `0.5px solid ${C.green}`, transition: "all 0.2s"
          }}
        >
          {saved ? "✓ Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
