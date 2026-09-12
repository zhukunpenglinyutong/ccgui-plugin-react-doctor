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
import { buildFixPrompt, groupByFile, scoreTone, type Diagnostic, type FileGroup, type Report } from "./report";
import { runScan, runStore, type RunState } from "./store";

/** 单文件展开时最多渲染的诊断条数（超出给汇总行，避免长列表卡顿）。 */
const RENDER_ITEMS_CAP = 100;

/** 评分环：SVG circle strokeDashoffset 随分数走，颜色按档位。 */
function ScoreRing({ score, label, tone }: { score: number | null; label: string | null; tone: string }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className={`rd-ring rd-tone-${tone}`}>
      <svg viewBox="0 0 84 84" className="rd-ring-svg">
        <circle cx="42" cy="42" r={R} className="rd-ring-track" />
        <circle
          cx="42"
          cy="42"
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

/** 运行按钮：idle/error/done 可点击；running 时禁用并显示秒表。 */
function RunButton({ state, t }: { state: RunState; t: Copy }) {
  const running = state.phase === "running";
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running || state.startedAt === null) return;
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - state.startedAt!) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [running, state.startedAt]);
  return (
    <div className="rd-run">
      <button className="rd-btn rd-btn-primary rd-btn-lg" disabled={running} onClick={() => void runScan()}>
        {running ? <LoaderIcon className="rd-spin" /> : <PlayIcon />}
        {running ? t.runningBtn(elapsed) : t.runBtn}
      </button>
      {running && <p className="rd-run-hint">{t.runningHint}</p>}
    </div>
  );
}

function DiagnosticRow({ d, t }: { d: Diagnostic; t: Copy }) {
  const isError = d.severity === "error";
  return (
    <li className="rd-issue">
      <div className="rd-issue-head">
        <span className={`rd-sev ${isError ? "rd-sev-bad" : "rd-sev-warn"}`}>
          {isError ? <AlertCircleIcon /> : <AlertTriangleIcon />}
          {isError ? "error" : "warn"}
        </span>
        <span className="rd-issue-pos">{t.lineCol(d.line, d.column)}</span>
        <code className="rd-issue-rule">
          {d.plugin}/{d.rule}
        </code>
      </div>
      <p className="rd-issue-title">{d.title}</p>
      <p className="rd-issue-msg">{d.message}</p>
      {d.help && <p className="rd-issue-help">{d.help}</p>}
    </li>
  );
}

function FileGroupRow({ group, t }: { group: FileGroup; t: Copy }) {
  const [open, setOpen] = useState(false);
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
            <DiagnosticRow key={`${d.line}:${d.column}:${d.rule}:${i}`} d={d} t={t} />
          ))}
          {group.items.length > shown.length && (
            <li className="rd-issue-more">{t.moreItems(group.items.length - shown.length)}</li>
          )}
        </ul>
      )}
    </div>
  );
}

function RawOutputDisclosure({ raw, t }: { raw: string; t: Copy }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!raw.trim()) return null;
  return (
    <div className="rd-card rd-raw">
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
      className="rd-btn rd-btn-primary rd-btn-sm"
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
        <div className="rd-empty">
          <StethoscopeIcon className="rd-empty-icon" />
          <h3>{t.webOnlyTitle}</h3>
          <p>{t.webOnlyBody}</p>
        </div>
      </div>
    );
  }

  const summary = state.report?.summary ?? null;
  const tone = scoreTone(summary?.score ?? null);

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

      <RunButton state={state} t={t} />

      {state.phase === "error" && (
        <div className="rd-alert" role="alert">
          {state.errorMessage}
        </div>
      )}

      {state.phase === "idle" && !state.report && state.hydrated && (
        <div className="rd-empty">
          <StethoscopeIcon className="rd-empty-icon" />
          <h3>{t.emptyTitle}</h3>
          <p>{t.emptyBody}</p>
        </div>
      )}

      {state.report && summary && (
        <>
          <div className="rd-card rd-score">
            <ScoreRing score={summary.score} label={summary.scoreLabel} tone={tone} />
            <div className="rd-score-side">
              <div className="rd-score-title">{t.scoreTitle}</div>
              <div className="rd-stats">
                <span className={`rd-stat ${summary.errorCount > 0 ? "rd-stat-bad" : ""}`}>
                  <b>{summary.errorCount}</b>
                  {t.statErrors}
                </span>
                <span className={`rd-stat ${summary.warningCount > 0 ? "rd-stat-warn" : ""}`}>
                  <b>{summary.warningCount}</b>
                  {t.statWarnings}
                </span>
                <span className="rd-stat">
                  <b>{summary.affectedFileCount}</b>
                  {t.statFiles}
                </span>
              </div>
              <div className="rd-score-meta">
                <ClockIcon />
                {t.statElapsed((state.report.elapsedMilliseconds / 1000).toFixed(1))}
                {state.report.version && <span className="rd-dim">· {t.versionLabel(state.report.version)}</span>}
              </div>
            </div>
          </div>

          {summary.totalDiagnosticCount === 0 ? (
            <div className="rd-card rd-clean">
              <CheckCircleIcon className="rd-clean-icon" />
              <p>{t.noIssues}</p>
            </div>
          ) : (
            <section className="rd-findings">
              <div className="rd-findings-head">
                <h3 className="rd-findings-title">{t.findingsTitle(summary.totalDiagnosticCount)}</h3>
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
                {groups.map((g) => (
                  <FileGroupRow key={g.file} group={g} t={t} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <RawOutputDisclosure raw={state.rawOutput} t={t} />

      {state.ranAt !== null && state.phase !== "running" && (
        <footer className="rd-foot">{t.lastRun(formatTime(state.ranAt, getHostCtx().host.locale))}</footer>
      )}
    </div>
  );
}
