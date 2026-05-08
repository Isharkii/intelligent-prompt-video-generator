"use client";

import { useState, useEffect, useCallback } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

const TABS = [
  { id: "hooks",      label: "HOOK PATTERNS" },
  { id: "vocabulary", label: "SHOT VOCAB" },
  { id: "arcs",       label: "NARRATIVE ARCS" },
  { id: "banned",     label: "BANNED PHRASES" },
  { id: "csv",        label: "CSV PROMPTS" },
  { id: "raw",        label: "RAW JSON" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface HookPattern { id: string; pattern: string; energy?: string; example?: string }
interface ArcRecord   { id?: string; name: string; beat_1?: string; beat_2?: string; beat_3?: string }
interface CsvRow      { id: string; prompt: string; metadata?: string }

// ─── Toast (inline — no external dep) ────────────────────────────────────────

function useToast() {
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: "ok" | "err" }[]>([]);
  const push = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const ok  = useCallback((m: string) => push(m, "ok"),  [push]);
  const err = useCallback((m: string) => push(m, "err"), [push]);
  return { toasts, ok, err };
}

function ToastList({ toasts }: { toasts: { id: number; msg: string; type: "ok" | "err" }[] }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2.5 rounded-sm font-mono text-[12px] shadow-xl border ${
            t.type === "err"
              ? "bg-red-950 border-red-700 text-red-300"
              : "bg-[#0f1a0f] border-green-800 text-green-300"
          }`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Hook Patterns Tab ────────────────────────────────────────────────────────

function HooksTab() {
  const [hooks, setHooks]   = useState<HookPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const { toasts, ok, err }   = useToast();

  useEffect(() => {
    fetch("/api/training/hooks")
      .then((r) => r.json())
      .then((d) => setHooks(d.hooks ?? []))
      .catch((e) => err(`Failed to load hook patterns: ${e.message}`))
      .finally(() => setLoading(false));
  }, [err]);

  async function deleteHook(id: string) {
    const backup = [...hooks];
    setHooks((prev) => prev.filter((h) => h.id !== id));
    try {
      const r = await fetch(`/api/training/hooks/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      ok("Hook pattern deleted");
    } catch (e) {
      setHooks(backup);
      err(`Delete failed: ${(e as Error).message}`);
    }
  }

  if (loading) return <><TabLoading /><ToastList toasts={toasts} /></>;

  return (
    <>
      <div className="space-y-3">
        <p className="font-mono text-[10px] text-[var(--text-dim)]">{hooks.length} hook patterns loaded</p>
        {hooks.length === 0 && <EmptyState text="No hook patterns yet." />}
        {hooks.map((hook) => (
          <div key={hook.id} className="card flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="muted">{hook.energy ?? "any"}</Badge>
              </div>
              <p className="font-mono text-[12px] text-[var(--text)] leading-relaxed">{hook.pattern}</p>
              {hook.example && (
                <p className="font-serif italic text-sm text-[var(--text-muted)] mt-1">{hook.example}</p>
              )}
            </div>
            <button
              onClick={() => deleteHook(hook.id)}
              className="font-mono text-[10px] text-red-400 hover:text-red-300 transition-colors shrink-0"
            >
              DEL
            </button>
          </div>
        ))}
      </div>
      <ToastList toasts={toasts} />
    </>
  );
}

// ─── Shot Vocabulary Tab ──────────────────────────────────────────────────────

function VocabularyTab() {
  const [vocab, setVocab]     = useState<Record<string, string[]>>({});
  const [saveStatus, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loading, setLoading] = useState(true);
  const [timer, setTimer]     = useState<ReturnType<typeof setTimeout> | null>(null);
  const { toasts, ok, err }   = useToast();

  useEffect(() => {
    fetch("/api/training/vocabulary")
      .then((r) => r.json())
      .then((d) => setVocab(d.vocabulary ?? {}))
      .catch((e) => err(`Failed to load vocabulary: ${e.message}`))
      .finally(() => setLoading(false));
  }, []);

  function handleChange(category: string, value: string) {
    const items = value.split("\n").map((s) => s.trim()).filter(Boolean);
    const next  = { ...vocab, [category]: items };
    setVocab(next);
    if (timer) clearTimeout(timer);
    setSave("saving");
    setTimer(setTimeout(async () => {
      try {
        const r = await fetch("/api/training/vocabulary", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, items }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        setSave("saved");
        ok("Vocabulary saved");
        setTimeout(() => setSave("idle"), 2000);
      } catch (e) {
        setSave("error");
        err(`Vocabulary save failed: ${(e as Error).message}`);
      }
    }, 800));
  }

  if (loading) return <><TabLoading /><ToastList toasts={toasts} /></>;

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end">
          <span className={`font-mono text-[10px] tracking-widest ${
            saveStatus === "saved"  ? "text-green-400"
            : saveStatus === "saving" ? "text-amber"
            : saveStatus === "error"  ? "text-red-400"
            : "text-[var(--text-dim)]"
          }`}>
            {saveStatus === "saving" ? "SAVING..." : saveStatus === "saved" ? "SAVED ✓" : saveStatus === "error" ? "SAVE FAILED" : ""}
          </span>
        </div>
        {Object.entries(vocab).map(([category, items]) => (
          <div key={category} className="card space-y-2">
            <p className="font-mono text-[10px] tracking-widest text-amber uppercase">{category}</p>
            <textarea
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-sm p-3 font-mono text-[12px] text-[var(--text)] resize-y min-h-[100px] focus:outline-none focus:border-amber"
              value={items.join("\n")}
              onChange={(e) => handleChange(category, e.target.value)}
            />
            <p className="font-mono text-[10px] text-[var(--text-dim)]">{items.length} items · one per line</p>
          </div>
        ))}
        {Object.keys(vocab).length === 0 && <EmptyState text="No vocabulary loaded." />}
      </div>
      <ToastList toasts={toasts} />
    </>
  );
}

// ─── Narrative Arcs Tab ───────────────────────────────────────────────────────

function ArcsTab() {
  const [arcs, setArcs]   = useState<ArcRecord[]>([]);
  const [loading, setLoad] = useState(true);
  const { toasts, ok, err } = useToast();

  useEffect(() => {
    fetch("/api/training/arcs")
      .then((r) => r.json())
      .then((d) => setArcs(d.arcs ?? []))
      .catch((e) => err(`Failed to load narrative arcs: ${e.message}`))
      .finally(() => setLoad(false));
  }, []);

  async function deleteArc(id: string) {
    const backup = [...arcs];
    setArcs((prev) => prev.filter((a) => (a.id ?? a.name) !== id));
    try {
      const r = await fetch(`/api/training/arcs/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      ok("Arc deleted");
    } catch (e) {
      setArcs(backup);
      err(`Delete failed: ${(e as Error).message}`);
    }
  }

  if (loading) return <><TabLoading /><ToastList toasts={toasts} /></>;

  return (
    <>
      <div className="space-y-3">
        {arcs.length === 0 && <EmptyState text="No narrative arcs loaded." />}
        {arcs.map((arc) => (
          <div key={arc.id ?? arc.name} className="card space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] text-amber tracking-wider">{arc.name}</p>
              <button
                onClick={() => deleteArc(arc.id ?? arc.name)}
                className="font-mono text-[10px] text-red-400 hover:text-red-300"
              >
                DEL
              </button>
            </div>
            {(["beat_1", "beat_2", "beat_3"] as const).map((b) => arc[b] && (
              <p key={b} className="font-mono text-[11px] text-[var(--text-muted)]">
                <span className="text-[var(--text-dim)]">{b}: </span>{arc[b]}
              </p>
            ))}
          </div>
        ))}
      </div>
      <ToastList toasts={toasts} />
    </>
  );
}

// ─── Banned Phrases Tab ───────────────────────────────────────────────────────

function BannedTab() {
  const [phrases, setPhrases] = useState<string[]>([]);
  const [loading, setLoad]    = useState(true);
  const [draft, setDraft]     = useState("");
  const { toasts, ok, err }   = useToast();

  useEffect(() => {
    fetch("/api/training/banned")
      .then((r) => r.json())
      .then((d) => setPhrases(d.phrases ?? []))
      .catch((e) => err(`Failed to load banned phrases: ${e.message}`))
      .finally(() => setLoad(false));
  }, []);

  async function addPhrase() {
    if (!draft.trim()) return;
    const phrase = draft.trim();
    try {
      const r = await fetch("/api/training/banned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      setPhrases((prev) => [...prev, phrase]);
      setDraft("");
      ok("Phrase added");
    } catch (e) {
      err(`Add failed: ${(e as Error).message}`);
    }
  }

  // Delete by phrase string — immune to index drift
  async function deletePhrase(phrase: string) {
    const backup = [...phrases];
    setPhrases((prev) => prev.filter((p) => p !== phrase));
    try {
      const r = await fetch("/api/training/banned", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      ok("Phrase removed");
    } catch (e) {
      setPhrases(backup);
      err(`Delete failed: ${(e as Error).message}`);
    }
  }

  if (loading) return <><TabLoading /><ToastList toasts={toasts} /></>;

  return (
    <>
      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            className="flex-1 h-9 px-3 font-mono text-sm text-[var(--text)] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-sm focus:outline-none focus:border-amber"
            placeholder="Add banned phrase..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPhrase()}
          />
          <Button variant="secondary" size="sm" onClick={addPhrase}>ADD</Button>
        </div>
        <div className="card space-y-2">
          {phrases.length === 0 && <EmptyState text="No banned phrases." />}
          {phrases.map((phrase) => (
            <div key={phrase} className="flex items-center justify-between py-1 border-b border-[var(--border-muted)]">
              <span className="font-mono text-[12px] text-[var(--text-muted)]">{phrase}</span>
              <button
                onClick={() => deletePhrase(phrase)}
                className="font-mono text-[10px] text-red-400 hover:text-red-300"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
      <ToastList toasts={toasts} />
    </>
  );
}

// ─── CSV Prompts Tab ──────────────────────────────────────────────────────────

function CsvTab() {
  const [rows, setRows]     = useState<CsvRow[]>([]);
  const [loading, setLoad]  = useState(true);
  const [filter, setFilter] = useState("");
  const { toasts, ok, err } = useToast();

  const fetchRows = useCallback(() => {
    setLoad(true);
    fetch("/api/training/csv")
      .then((r) => r.json())
      .then((d) => setRows(d.rows ?? []))
      .catch((e) => err(`Failed to load CSV prompts: ${e.message}`))
      .finally(() => setLoad(false));
  }, [err]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const filtered = rows.filter(
    (r) =>
      !filter ||
      r.prompt?.toLowerCase().includes(filter.toLowerCase()) ||
      r.metadata?.toLowerCase().includes(filter.toLowerCase())
  );

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const r = await fetch("/api/training/upload-csv", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: text,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      ok(data.message ?? "CSV uploaded");
      fetchRows();
    } catch (e) {
      err(`Upload failed: ${(e as Error).message}`);
    }
  }

  if (loading) return <><TabLoading /><ToastList toasts={toasts} /></>;

  return (
    <>
      <div className="space-y-4">
        <div className="flex gap-3 flex-wrap">
          <input
            className="flex-1 min-w-48 h-9 px-3 font-mono text-sm text-[var(--text)] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-sm focus:outline-none focus:border-amber"
            placeholder="Filter prompts..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <label className="inline-flex items-center gap-2 px-3 h-9 font-mono text-[11px] tracking-wider border border-[var(--border)] rounded-sm bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:border-amber hover:text-amber cursor-pointer transition-colors">
            UPLOAD CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleUpload} />
          </label>
        </div>
        <p className="font-mono text-[10px] text-[var(--text-dim)]">{filtered.length}/{rows.length} prompts</p>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {filtered.slice(0, 50).map((row) => (
            <div key={row.id} className="card py-2 px-3 space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="muted">{row.id}</Badge>
                {row.metadata && <span className="font-mono text-[10px] text-[var(--text-dim)]">{row.metadata}</span>}
              </div>
              <p className="font-mono text-[11px] text-[var(--text-muted)] line-clamp-3">{row.prompt}</p>
            </div>
          ))}
          {filtered.length === 0 && <EmptyState text="No matching prompts." />}
        </div>
      </div>
      <ToastList toasts={toasts} />
    </>
  );
}

// ─── Raw JSON Tab ─────────────────────────────────────────────────────────────

function RawJsonTab() {
  const [content, setContent] = useState("");
  const [loading, setLoad]    = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const { toasts, ok, err }   = useToast();

  useEffect(() => {
    fetch("/api/training/raw")
      .then((r) => r.json())
      .then((d) => setContent(JSON.stringify(d, null, 2)))
      .catch((e) => { setContent("{}"); err(`Failed to load JSON: ${e.message}`); })
      .finally(() => setLoad(false));
  }, []);

  async function save() {
    setError("");
    setSaving(true);
    try {
      JSON.parse(content);
      const r = await fetch("/api/training/raw", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: content,
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }
      ok("Training JSON saved and reloaded");
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      err(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <><TabLoading /><ToastList toasts={toasts} /></>;

  return (
    <>
      <div className="space-y-3">
        {error && (
          <p className="font-mono text-[12px] text-red-400 bg-red-950/50 border border-red-800 rounded-sm px-3 py-2">
            {error}
          </p>
        )}
        <textarea
          className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-sm p-3 font-mono text-[11px] text-[var(--text)] resize-y h-[50vh] focus:outline-none focus:border-amber"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
        />
        <Button variant="primary" size="sm" loading={saving} onClick={save}>
          SAVE JSON
        </Button>
      </div>
      <ToastList toasts={toasts} />
    </>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function TabLoading() {
  return (
    <div className="flex items-center gap-2 py-8 font-mono text-[12px] text-[var(--text-dim)]">
      <span className="inline-block w-3 h-3 border-2 border-amber border-t-transparent rounded-full animate-spin" />
      Loading...
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="font-mono text-[12px] text-[var(--text-dim)] py-4 text-center">{text}</p>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export default function TrainingEditorScreen() {
  const [reloading, setReloading] = useState(false);
  const [reloadMsg, setReloadMsg] = useState("");

  async function handleReload() {
    setReloading(true);
    setReloadMsg("");
    try {
      const r = await fetch("/api/training/reload", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setReloadMsg(`✓ Reloaded — ${d.stats.hookCount} hooks · ${d.stats.arcCount} arcs · ${d.stats.csvPromptCount} CSV prompts`);
      setTimeout(() => setReloadMsg(""), 5000);
    } catch (e) {
      setReloadMsg(`✗ ${(e as Error).message}`);
    } finally {
      setReloading(false);
    }
  }

  return (
    <div className="min-h-[calc(100dvh-var(--header-height))] px-4 sm:px-8 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-display text-4xl sm:text-5xl tracking-widest mb-2">
              TRAINING EDITOR
            </h2>
            <p className="font-mono text-[12px] text-[var(--text-muted)]">
              Manage the creative training data used by every generation.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReload}
              loading={reloading}
            >
              {reloading ? "RELOADING..." : "↺ RELOAD"}
            </Button>
            {reloadMsg && (
              <p className={`font-mono text-[10px] ${reloadMsg.startsWith("✓") ? "text-green-400" : "text-red-400"}`}>
                {reloadMsg}
              </p>
            )}
          </div>
        </div>

        <Tabs.Root defaultValue="hooks" className="space-y-6">
          <Tabs.List className="flex flex-wrap gap-1 border-b border-[var(--border)] pb-3">
            {TABS.map((tab) => (
              <Tabs.Trigger
                key={tab.id}
                value={tab.id}
                className="font-mono text-[10px] tracking-widest px-3 py-1.5 rounded-sm border border-transparent text-[var(--text-muted)] hover:text-[var(--text)] transition-colors data-[state=active]:border-amber data-[state=active]:text-amber data-[state=active]:bg-[var(--amber-glow)]"
              >
                {tab.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <Tabs.Content value="hooks"><HooksTab /></Tabs.Content>
          <Tabs.Content value="vocabulary"><VocabularyTab /></Tabs.Content>
          <Tabs.Content value="arcs"><ArcsTab /></Tabs.Content>
          <Tabs.Content value="banned"><BannedTab /></Tabs.Content>
          <Tabs.Content value="csv"><CsvTab /></Tabs.Content>
          <Tabs.Content value="raw"><RawJsonTab /></Tabs.Content>
        </Tabs.Root>
      </div>
    </div>
  );
}
