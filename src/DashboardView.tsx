import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { copy, getHostCtx, type Copy } from "./host";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  CopyIcon,
  FileCodeIcon,
  LoaderIcon,
  PlayIcon,
  StethoscopeIcon,
  TerminalIcon,
  WrenchIcon,
} from "./icons";
import {
  buildFixPrompt,
  buildSingleFixPrompt,
  groupByFile,
  scoreTone,
  type Diagnostic,
  type FileGroup,
  type Report,
} from "./report";
import { runScan, runStore, type RunState } from "./store";

/** 单文件展开时最多渲染的诊断条数（超出给汇总行，避免长列表卡顿）。 */
const RENDER_ITEMS_CAP = 100;

/** 评分环：SVG circle strokeDashoffset 随分数走，颜色按档位。 */
function ScoreRing({ score, label, tone }: { score: number | null; label: string | null; tone: string }) {
  const R = 40;
  const C = 2 * Math.PI * R;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className={`rd-ring rd-tone-${tone}`}>
      <svg viewBox="0 0 96 96" className="rd-ring-svg">
        <circle cx="48" cy="48" r={R} className="rd-ring-track" />
        <circle
          cx="48"
          cy="48"
          r={R}
          className="rd-ring-value"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
        />
      </svg>
      <div className="rd-ring-text">
        <span className="rd-ring-score">{score === null ? "—" : score}</span>
        <span className="rd-ring-label">{label ?? ""}</span>
      </div>
    </div>
  );
}

function StatusBadge({ state, t }: { state: RunState; t: Copy }) {
  if (state.phase === "running") {
    return (
      <span className="rd-badge rd-badge-run">
        <LoaderIcon className="rd-spin" />
        {t.statusRunning}
      </span>
    );
  }
  if (state.phase === "error") {
    return (
      <span className="rd-badge rd-badge-bad">
        <AlertCircleIcon />
        {t.statusError}
      </span>
    );
  }
  if (state.phase === "done") {
    return (
      <span className="rd-badge rd-badge-ok">
        <CheckCircleIcon />
        {t.statusDone}
      </span>
    );
  }
  return <span className="rd-badge">{t.statusIdle}</span>;
}

/** 运行按钮：hero = 空态大按钮（带提示）；inline = 评分卡右上角小按钮。
 *  idle/error/done 可点击；running 时禁用并显示秒表。 */
function RunButton({ state, t, variant }: { state: RunState; t: Copy; variant: "hero" | "inline" }) {
  const running = state.phase === "running";
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running || state.startedAt === null) return;
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - state.startedAt!) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [running, state.startedAt]);
  const hero = variant === "hero";
  return (
    <div className={hero ? "rd-run" : undefined}>
      <button
        className={hero ? "rd-btn rd-btn-primary rd-btn-lg" : "rd-btn rd-btn-primary rd-btn-sm"}
        disabled={running}
        onClick={() => void runScan()}
      >
        {running ? <LoaderIcon className="rd-spin" /> : <PlayIcon />}
        {running ? t.runningBtn(elapsed) : t.runBtn}
      </button>
      {hero && running && <p className="rd-run-hint">{t.runningHint}</p>}
    </div>
  );
}

/** 单条修复：把该问题的定位 + 说明写进聊天输入框草稿（不发送）。
 *  宿主 SDK < 0.3.2 没有 ctx.composer，按钮整体隐藏。 */
function FixOneButton({ file, d, t }: { file: string; d: Diagnostic; t: Copy }) {
  const [applied, setApplied] = useState(false);
  const composer = getHostCtx().composer;
  if (typeof composer?.setDraft !== "function") return null;
  return (
    <button
      className="rd-btn rd-btn-outline rd-btn-xs"
      onClick={() => {
        composer.setDraft(buildSingleFixPrompt(file, d, t.fixOneHeader, t.fixPromptSuffix));
        setApplied(true);
        setTimeout(() => setApplied(false), 1500);
      }}
    >
      {applied ? <CheckIcon /> : <WrenchIcon />}
      {applied ? t.fixApplied : t.fixOneBtn}
    </button>
  );
}

function DiagnosticRow({ file, d, t }: { file: string; d: Diagnostic; t: Copy }) {
  const isError = d.severity === "error";
  return (
    <li className="rd-issue">
      <span className={`rd-issue-icon ${isError ? "rd-issue-icon-bad" : "rd-issue-icon-warn"}`}>
        {isError ? <AlertCircleIcon /> : <AlertTriangleIcon />}
      </span>
      <div className="rd-issue-main">
        <div className="rd-issue-head">
          <code className="rd-issue-rule">
            {d.plugin}/{d.rule}
          </code>
          <span className="rd-issue-pos">{t.lineCol(d.line, d.column)}</span>
        </div>
        <p className="rd-issue-title">{d.title}</p>
        {d.message && d.message !== d.title && <p className="rd-issue-msg">{d.message}</p>}
        {d.help && <p className="rd-issue-help">{d.help}</p>}
      </div>
      <FixOneButton file={file} d={d} t={t} />
    </li>
  );
}

function FileGroupRow({ group, t, defaultOpen }: { group: FileGroup; t: Copy; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = group.items.slice(0, RENDER_ITEMS_CAP);
  return (
    <div className={`rd-file ${open ? "rd-file-open" : ""}`}>
      <button className="rd-file-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronDownIcon className="rd-file-chev" />
        <FileCodeIcon className="rd-file-icon" />
        <span className="rd-file-path" title={group.file}>
          {group.file}
        </span>
        {group.errorCount > 0 && <span className="rd-count rd-count-bad">{group.errorCount}</span>}
        {group.warningCount > 0 && <span className="rd-count rd-count-warn">{group.warningCount}</span>}
      </button>
      {open && (
        <ul className="rd-file-body">
          {shown.map((d, i) => (
            <DiagnosticRow key={`${d.line}:${d.column}:${d.rule}:${i}`} file={group.file} d={d} t={t} />
          ))}
          {group.items.length > shown.length && (
            <li className="rd-issue-more">{t.moreItems(group.items.length - shown.length)}</li>
          )}
        </ul>
      )}
    </div>
  );
}

function RawOutputDisclosure({ raw, t, embedded }: { raw: string; t: Copy; embedded?: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!raw.trim()) return null;
  return (
    <div className={embedded ? "rd-raw rd-raw-embedded" : "rd-card rd-raw"}>
      <button className="rd-raw-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronDownIcon className={`rd-file-chev ${open ? "rd-file-chev-open" : ""}`} />
        <TerminalIcon className="rd-file-icon" />
        <span>{t.rawTitle}</span>
        {open && (
          <span
            className="rd-btn rd-btn-ghost rd-btn-sm rd-raw-copy"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard.writeText(raw).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? t.copied : t.copyBtn}
          </span>
        )}
      </button>
      {open && <pre className="rd-raw-body">{raw}</pre>}
    </div>
  );
}

/** 一键修复：把问题清单 + 修复指令写进聊天输入框草稿（不发送，发送由用户确认）。
 *  宿主 SDK < 0.3.2 没有 ctx.composer，按钮整体隐藏。 */
function FixAllButton({ report, t }: { report: Report; t: Copy }) {
  const [applied, setApplied] = useState(false);
  const composer = getHostCtx().composer;
  if (typeof composer?.setDraft !== "function") return null;
  const summary = report.summary;
  return (
    <button
      className="rd-btn rd-btn-outline rd-btn-sm"
      onClick={() => {
        const truncated =
          report.diagnosticCount > report.diagnostics.length
            ? t.truncatedNote(report.diagnosticCount, report.diagnostics.length)
            : undefined;
        composer.setDraft(
          buildFixPrompt(
            report,
            t.fixPromptHeader(
              summary.score,
              summary.totalDiagnosticCount,
              summary.errorCount,
              summary.warningCount,
            ),
            t.fixPromptSuffix,
            truncated,
          ),
        );
        setApplied(true);
        setTimeout(() => setApplied(false), 1500);
      }}
    >
      {applied ? <CheckIcon /> : <WrenchIcon />}
      {applied ? t.fixApplied : t.fixBtn}
    </button>
  );
}

function formatTime(ms: number, locale: string): string {
  try {
    return new Date(ms).toLocaleString(locale.startsWith("zh") ? "zh-CN" : "en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ms).toLocaleString();
  }
}

export default function DashboardView() {
  const state = useSyncExternalStore(runStore.subscribe, runStore.get);
  const t = copy(getHostCtx().host.locale);
  const groups = useMemo(
    () => (state.report ? groupByFile(state.report.diagnostics) : []),
    [state.report],
  );

  if (getHostCtx().host.isWeb) {
    return (
      <div className="rd-root">
        <div className="rd-card rd-empty">
          <StethoscopeIcon className="rd-empty-icon" />
          <h3>{t.webOnlyTitle}</h3>
          <p>{t.webOnlyBody}</p>
        </div>
      </div>
    );
  }

  const summary = state.report?.summary ?? null;
  const tone = scoreTone(summary?.score ?? null);
  const locale = getHostCtx().host.locale;

  return (
    <div className="rd-root">
      <header className="rd-head">
        <div className="rd-head-text">
          <h2>{t.title}</h2>
          <p className="rd-head-sub" title={state.workspacePath}>
            {state.workspacePath || t.subtitle}
          </p>
        </div>
        <StatusBadge state={state} t={t} />
      </header>

      {state.phase === "error" && (
        <div className="rd-alert" role="alert">
          {state.errorMessage}
        </div>
      )}

      {/* 无报告时：空态 / 运行中占位（running 会清空旧报告，统一走这里） */}
      {!state.report && (state.hydrated || state.phase === "running") && (
        <div className="rd-card rd-empty">
          <StethoscopeIcon className="rd-empty-icon" />
          <h3>{state.phase === "running" ? t.statusRunning : t.emptyTitle}</h3>
          <p>{state.phase === "running" ? t.runningHint : t.emptyBody}</p>
          <div className="rd-empty-run">
            <RunButton state={state} t={t} variant="hero" />
          </div>
        </div>
      )}

      {state.report && summary && (
        <>
          {/* 概览卡：评分环 + 统计 + 运行入口 */}
          <div className="rd-card rd-score">
            <ScoreRing score={summary.score} label={summary.scoreLabel} tone={tone} />
            <div className="rd-score-side">
              <div className="rd-score-top">
                <div className="rd-score-title">{t.scoreTitle}</div>
                <RunButton state={state} t={t} variant="inline" />
              </div>
              <div className="rd-stats">
                <span className="rd-stat">
                  <span className="rd-dot rd-dot-bad" />
                  <b>{summary.errorCount}</b>
                  {t.statErrors}
                </span>
                <span className="rd-stat">
                  <span className="rd-dot rd-dot-warn" />
                  <b>{summary.warningCount}</b>
                  {t.statWarnings}
                </span>
                <span className="rd-stat">
                  <span className="rd-dot rd-dot-dim" />
                  <b>{summary.affectedFileCount}</b>
                  {t.statFiles}
                </span>
              </div>
              <div className="rd-score-meta">
                <ClockIcon />
                {t.statElapsed((state.report.elapsedMilliseconds / 1000).toFixed(1))}
                {state.report.version && <span className="rd-dim">· {t.versionLabel(state.report.version)}</span>}
                {state.ranAt !== null && (
                  <span className="rd-dim">· {t.lastRun(formatTime(state.ranAt, locale))}</span>
                )}
              </div>
            </div>
          </div>

          {summary.totalDiagnosticCount === 0 ? (
            <>
              <div className="rd-card rd-clean">
                <CheckCircleIcon className="rd-clean-icon" />
                <p>{t.noIssues}</p>
              </div>
              <RawOutputDisclosure raw={state.rawOutput} t={t} />
            </>
          ) : (
            /* 问题卡：标题栏 + 文件手风琴 + 原始输出，同一张卡 */
            <section className="rd-card rd-findings-card">
              <div className="rd-findings-head">
                <h3 className="rd-findings-title">
                  {t.findingsTitle}
                  <span className="rd-badge-count">{summary.totalDiagnosticCount}</span>
                </h3>
                {(summary.score === null || summary.score < 100) && (
                  <FixAllButton report={state.report} t={t} />
                )}
              </div>
              {state.report.diagnosticCount > state.report.diagnostics.length && (
                <p className="rd-trunc-note">
                  {t.truncatedNote(state.report.diagnosticCount, state.report.diagnostics.length)}
                </p>
              )}
              <div className="rd-files">
                {groups.map((g, i) => (
                  <FileGroupRow key={g.file} group={g} t={t} defaultOpen={i === 0} />
                ))}
              </div>
              <RawOutputDisclosure raw={state.rawOutput} t={t} embedded />
            </section>
          )}
        </>
      )}

      {/* 错误场景：原始输出单独成卡（无报告时不嵌在问题卡里） */}
      {!state.report && <RawOutputDisclosure raw={state.rawOutput} t={t} />}

      {!state.report && state.ranAt !== null && state.phase !== "running" && (
        <footer className="rd-foot">{t.lastRun(formatTime(state.ranAt, locale))}</footer>
      )}
    </div>
  );
}
