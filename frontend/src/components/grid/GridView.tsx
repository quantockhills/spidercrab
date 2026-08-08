import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  Track, FxInfo, FxParam, FxPresetInfo, FxPresetNames,
} from '../../hooks/useReaper';
import type { WsResponse } from '../../lib/wsClient';
import {
  findModule, cleanFxName, resolveParam, MODIFIER_KINDS, MODIFIER_LABELS,
  type ModuleDef, type ModulePanel, type ModifierKind,
} from './modules';
import { Knob, Fader, Segmented, Toggle, StepGrid, readStepGrid, editStep } from './widgets';
import { GridStrip } from './GridStrip';
import { DeviceInfo } from './DeviceInfo';
import { PresetPicker } from './PresetPicker';

interface GridViewProps {
  tracks: Track[];
  selectedTrack: number | null;
  getTrackFx: (trackIdx: number) => Promise<FxInfo[]>;
  getFxParams: (
    trackIdx: number, fxIdx: number, offset?: number, limit?: number,
  ) => Promise<{ params: FxParam[]; total: number; offset: number; limit: number }>;
  setFxParam: (
    trackIdx: number, fxIdx: number, paramIdx: number, value: number,
  ) => Promise<WsResponse>;
  getFxPreset?: (trackIdx: number, fxIdx: number) => Promise<FxPresetInfo | null>;
  setFxPreset?: (
    trackIdx: number, fxIdx: number, presetIdx: number,
  ) => Promise<FxPresetInfo | null>;
  getAllFxPresetNames?: (trackIdx: number, fxIdx: number) => Promise<FxPresetNames | null>;
}

/**
 * Grid — the selected track's plugins as a horizontally pannable strip.
 *
 * Panels run left to right and share a height, so a plugin wider than the
 * screen is panned rather than shrunk. That's what keeps controls at a
 * touchable size on a layout designed for a 1460px desktop window.
 *
 * Only plugins with a hand-authored module appear. The FX tab remains the way
 * to reach everything else, unchanged.
 */
export function GridView({
  tracks, selectedTrack, getTrackFx, getFxParams, setFxParam,
  getFxPreset, setFxPreset, getAllFxPresetNames,
}: GridViewProps) {
  // Holds the track it was loaded for, so switching tracks reads as loading
  // without needing to reset state synchronously inside the effect.
  const [loaded, setLoaded] = useState<{ trackIdx: number; fx: FxInfo[] } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedTrack === null) return;
    let cancelled = false;
    const forTrack = selectedTrack;
    getTrackFx(forTrack)
      .then((list) => { if (!cancelled) setLoaded({ trackIdx: forTrack, fx: list }); })
      .catch(() => { if (!cancelled) setLoaded({ trackIdx: forTrack, fx: [] }); });
    return () => { cancelled = true; };
  }, [selectedTrack, getTrackFx]);

  const fx = loaded?.trackIdx === selectedTrack ? loaded.fx : null;
  const loading = selectedTrack !== null && fx === null;

  const track = tracks.find((t) => t.index === selectedTrack);
  const withModules = (fx ?? [])
    .map((f) => ({ fx: f, module: findModule(f.name) }))
    .filter((e): e is { fx: FxInfo; module: ModuleDef } => e.module !== null);

  const { scale, w: contentW, h: contentH, avail } = useFitScale(
    scrollRef, contentRef, withModules.length,
  );
  const maxRows = maxRowsFor(avail);

  if (selectedTrack === null) {
    return <Empty icon="🎛️" title="No track selected"
      hint="Pick a track on the Tracks tab to see its devices here." />;
  }
  if (loading || fx === null) {
    return <Empty icon="🎛️" title="Loading devices…" hint="" />;
  }
  if (fx.length === 0) {
    return <Empty icon="🎛️" title={`${track?.name || 'Track'} has no FX`}
      hint="Add an effect from the FX tab." />;
  }
  if (withModules.length === 0) {
    return <Empty icon="🎛️" title="No devices with a Grid layout"
      hint={`${fx.length} effect${fx.length === 1 ? '' : 's'} on this track, none with a module yet. Use the FX tab for those.`} />;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-[var(--border)] flex-shrink-0">
        <h2 className="text-sm font-semibold">{track?.name || `Track ${selectedTrack + 1}`}</h2>
        <p className="text-[10px] text-[var(--text-secondary)]">
          {withModules.length} device{withModules.length === 1 ? '' : 's'} · swipe sideways for more
          {scale !== 1 && ` · ${Math.round(scale * 100)}%`}
        </p>
      </div>

      {/*
        The devices. Deliberately not pannable by touch — navigation lives in
        the strip below, which leaves the controls free to own their gestures
        without a sideways swipe to disambiguate against. Still scrollable
        programmatically, and by wheel or trackpad on desktop.
      */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden touch-none"
        data-testid="grid-scroller"
      >
        {/*
          The scaled content keeps its natural layout box, which would leave
          the scroller measuring the unscaled width. This wrapper carries the
          scaled size instead, so the scrollbar — and the strip that drives
          it — track what's actually drawn.
        */}
        <div
          style={{
            width: contentW ? contentW * scale : undefined,
            height: contentH ? contentH * scale : undefined,
          }}
        >
          <div
            ref={contentRef}
            className="flex items-start gap-3 px-3 py-3 w-max origin-top-left"
            style={{ transform: scale !== 1 ? `scale(${scale})` : undefined }}
          >
            {withModules.map(({ fx: f, module }) => (
              <Device
                key={f.index}
                trackIdx={selectedTrack}
                fx={f}
                module={module}
                maxRows={maxRows}
                getFxParams={getFxParams}
                setFxParam={setFxParam}
                getFxPreset={getFxPreset}
                setFxPreset={setFxPreset}
                getAllFxPresetNames={getAllFxPresetNames}
              />
            ))}
          </div>
        </div>
      </div>

      <GridStrip
        scrollRef={scrollRef}
        devices={withModules.map(({ fx: f, module }) => ({
          key: f.index,
          label: module.title || cleanFxName(f.name),
        }))}
      />
    </div>
  );
}

/**
 * Scale the device strip so its whole height matches the space available.
 *
 * There's no vertical scroll by design — the strip along the bottom is the
 * only navigation — so anything past the fold is unreachable, and anything
 * short of it is wasted. This corrects in both directions: down when a device
 * overflows, up when it leaves a void underneath and touch targets smaller
 * than they need to be.
 *
 * A CSS transform rather than smaller units: it preserves every panel's
 * proportions and needs no per-widget sizing. The row budget does the coarse
 * fitting (see maxRowsFor); this takes up whatever remains.
 */
function useFitScale(
  outerRef: React.RefObject<HTMLElement | null>,
  contentRef: React.RefObject<HTMLElement | null>,
  // Changes when the scroller mounts or the device list does, so the observers
  // get attached once the elements actually exist.
  key: unknown,
) {
  const [fit, setFit] = useState({ scale: 1, w: 0, h: 0, avail: 0 });

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const content = contentRef.current;
    if (!outer || !content) return;

    const measure = () => {
      // offsetHeight, not clientHeight. clientHeight excludes the horizontal
      // scrollbar, and the scrollbar's presence depends on the scaled width,
      // which depends on this measurement — so a device whose width lands near
      // the scroller's own is bistable and flips between two layouts forever.
      // offsetHeight is the height the flex parent gave us, independent of
      // anything we then draw inside it.
      const avail = outer.offsetHeight - SCROLLBAR_PX;
      // A transform doesn't affect the layout box, so these read the natural
      // size however far we've already scaled — no feedback loop.
      const h = content.offsetHeight;
      const w = content.offsetWidth;
      if (!avail || !h) return;
      // Grows as well as shrinks. A device that only half-fills the screen
      // left a void underneath it and touch targets smaller than they needed
      // to be; the cap stops a two-knob Chorus becoming a billboard.
      const scale = fitScaleFor(avail, h);
      setFit((prev) => (Math.abs(prev.scale - scale) < 0.002 && prev.w === w
        && prev.h === h && prev.avail === avail
        ? prev : { scale, w, h, avail }));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(content);
    return () => ro.disconnect();
  }, [outerRef, contentRef, key]);

  return fit;
}

function TabButton({
  label, selected, onClick,
}: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
        selected
          ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] ring-1 ring-[var(--border)]'
          : 'text-[var(--text-secondary)]'
      }`}
    >
      {label}
    </button>
  );
}

function Empty({ icon, title, hint }: { icon: string; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-2">
      <div className="text-5xl mb-1">{icon}</div>
      <p className="text-sm text-[var(--text-primary)]">{title}</p>
      {hint && <p className="text-xs text-[var(--text-secondary)] max-w-xs">{hint}</p>}
    </div>
  );
}

// ── One device ───────────────────────────────────────────────

function Device({
  trackIdx, fx, module, maxRows, getFxParams, setFxParam,
  getFxPreset, setFxPreset, getAllFxPresetNames,
}: {
  trackIdx: number;
  fx: FxInfo;
  module: ModuleDef;
  maxRows: number;
  getFxParams: GridViewProps['getFxParams'];
  setFxParam: GridViewProps['setFxParam'];
  getFxPreset: GridViewProps['getFxPreset'];
  setFxPreset: GridViewProps['setFxPreset'];
  getAllFxPresetNames: GridViewProps['getAllFxPresetNames'];
}) {
  const [params, setParams] = useState<FxParam[]>([]);

  // Fetch every parameter, not a first page. Yutani's patched copy has 189,
  // and anything not fetched can't be resolved, so it renders as an empty
  // placeholder — which is exactly what a fixed limit of 64 produced.
  const fetchAll = useCallback(async () => {
    const all: FxParam[] = [];
    let offset = 0;
    for (;;) {
      const page = await getFxParams(trackIdx, fx.index, offset, 128);
      all.push(...page.params);
      offset += page.params.length;
      if (!page.params.length || all.length >= page.total) break;
    }
    return all;
  }, [trackIdx, fx.index, getFxParams]);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then((all) => { if (!cancelled) setParams(all); })
      .catch(() => { if (!cancelled) setParams([]); });
    return () => { cancelled = true; };
  }, [fetchAll]);

  // A preset rewrites every parameter at once, so re-read rather than trying
  // to reconcile — there's no per-parameter notification to lean on.
  const reload = useCallback(() => {
    fetchAll().then(setParams).catch(() => {});
  }, [fetchAll]);

  const commit = useCallback(
    async (paramIdx: number, value: number) => {
      // Optimistic, so the control tracks the finger regardless of latency.
      setParams((prev) => prev.map((p) => (p.index === paramIdx ? { ...p, value } : p)));
      const resp = await setFxParam(trackIdx, fx.index, paramIdx, value);
      const committed = resp?.payload?.value;
      if (committed !== undefined) {
        setParams((prev) => prev.map((p) => (p.index === paramIdx
          ? { ...p, value: committed as number,
              formatted: (resp.payload.formatted as string | undefined) ?? p.formatted }
          : p)));
      }
    },
    [trackIdx, fx.index, setFxParam],
  );

  // Which modulation mode is latched. Tap to enter, tap again to leave — the
  // plugin's own behaviour, and one switch rather than a disclosure control on
  // each of seventy depths.
  const [mode, setMode] = useState<ModifierKind | null>(null);
  const hasModifiers = module.panels.some(
    (p) => p.controls.some((c) => c.modifiers?.length),
  );


  // Tabs, for modules too wide to pan comfortably. The groups come from the
  // plugin's own layout rows, so a tab is a section of the original rather
  // than a category invented here.
  const groups = module.groups ?? [];
  const tabbed = groups.length > 1;
  // -1 is the info panel, which every module has whether or not it has tabs.
  const [tab, setTab] = useState(0);
  const showingInfo = tab === INFO_TAB;
  const panels = tabbed
    ? module.panels.filter((p) => (p.group ?? 0) === tab)
    : module.panels;

  return (
    <section className="flex flex-col bg-[var(--bg-secondary)] ring-1 ring-[var(--border)] flex-shrink-0">
      <header className="px-3 py-1.5 border-b border-[var(--border)] flex items-center gap-3">
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          data-testid="grid-device-title"
        >
          {module.title || cleanFxName(fx.name)}
        </span>
        <div className="flex gap-1" role="tablist" aria-label="Sections">
          {tabbed && groups.map((label, i) => (
            <TabButton key={label} label={label} selected={i === tab}
              onClick={() => setTab(i)} />
          ))}
          <TabButton
            label="Info"
            selected={showingInfo}
            onClick={() => setTab(showingInfo ? 0 : INFO_TAB)}
          />
        </div>
        {hasModifiers && !showingInfo && (
          <div className="flex gap-1" role="group" aria-label="Modulation mode">
            {MODIFIER_KINDS.map((kind) => (
              <button
                key={kind}
                onClick={() => setMode((m) => (m === kind ? null : kind))}
                aria-pressed={mode === kind}
                className={`px-2 py-0.5 text-[10px] font-semibold tracking-wider transition-colors ${
                  mode === kind
                    ? 'bg-[var(--accent-orange)]/25 text-[var(--accent-orange)] ring-1 ring-[var(--accent-orange)]/60'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                }`}
              >
                {MODIFIER_LABELS[kind]}
              </button>
            ))}
          </div>
        )}
        {mode && !showingInfo && (
          <span className="text-[10px] text-[var(--text-secondary)]">
            editing {MODIFIER_LABELS[mode]} depth
          </span>
        )}
        <div className="relative ml-auto">
          <PresetPicker
            trackIdx={trackIdx}
            fxIdx={fx.index}
            getFxPreset={getFxPreset}
            setFxPreset={setFxPreset}
            getAllFxPresetNames={getAllFxPresetNames}
            onChanged={reload}
          />
        </div>
      </header>
      {showingInfo && <DeviceInfo module={module} />}
      <div className={`flex items-stretch gap-2 p-2 ${showingInfo ? 'hidden' : ''}`}>
        {panels.map((panel) => (
          <Panel
            key={panel.label}
            panel={panel}
            params={params}
            mode={mode}
            maxRows={maxRows}
            onChange={commit}
          />
        ))}
      </div>
    </section>
  );
}

/** A knob with its label and readout, plus the gap under it. */
const CELL_PX = 104;
/** Chrome above and below a panel's controls: device header, panel label, padding. */
const PANEL_CHROME_PX = 96;

const MIN_SCALE = 0.5;
const MAX_SCALE = 1.35;
/**
 * Room left below the devices for a horizontal scrollbar.
 *
 * Fixed rather than measured on purpose: measuring it is what caused the
 * oscillation in the first place. iOS overlays its scrollbars, so this is a
 * few wasted pixels there and a row that isn't half-hidden on desktop.
 */
const SCROLLBAR_PX = 14;

/** Sentinel for the info panel, which sits alongside the section tabs. */
const INFO_TAB = -1;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * How many rows a panel's controls may stack into.
 *
 * Derived from the height actually available rather than fixed, because the
 * two shapes differ: Yutani's own window is 1444x576 and lays its panels out
 * one row deep, while a landscape iPad is far taller in proportion. Capping at
 * three rows left most of the screen empty and made every device wider than it
 * needed to be.
 */
export function maxRowsFor(avail: number): number {
  if (!avail) return 3;
  return clamp(Math.floor((avail - PANEL_CHROME_PX) / CELL_PX), 1, 6);
}

/**
 * Split a panel's controls into a balanced grid within that row budget.
 *
 * Balanced rather than filling each column in turn: seven controls in a
 * six-row budget is 4+3, not 6+1, which leaves no stranded column.
 */
export function fitScaleFor(avail: number, naturalHeight: number): number {
  if (!avail || !naturalHeight) return 1;
  return clamp(avail / naturalHeight, MIN_SCALE, MAX_SCALE);
}

export function shapeFor(count: number, maxRows: number): { rows: number; cols: number } {
  const cols = Math.max(1, Math.ceil(count / maxRows));
  return { cols, rows: Math.ceil(count / cols) };
}

function Panel({
  panel, params, mode, maxRows, onChange,
}: {
  panel: ModulePanel;
  params: FxParam[];
  mode: ModifierKind | null;
  maxRows: number;
  onChange: (paramIdx: number, value: number) => void;
}) {
  // The section's own on/off, which the plugin keeps as a few-pixel square in
  // the panel corner and uses to grey the whole panel out. Too small to hit
  // with a finger, so it becomes a switch in the header instead.
  const enableParam = panel.enable ? resolveParam(params, panel.enable) : undefined;
  const off = enableParam ? enableParam.value < 0.5 : false;
  const { rows } = shapeFor(panel.controls.length, maxRows);

  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5 bg-[var(--bg-tertiary)]/25 ring-1 ring-[var(--border)]/50">
      <div className="flex items-center gap-1.5">
        {enableParam && (
          <button
            onClick={() => onChange(
              enableParam.index, off ? enableParam.max : enableParam.min,
            )}
            role="switch"
            aria-checked={!off}
            aria-label={`${panel.label} on`}
            className={`w-2.5 h-2.5 flex-shrink-0 transition-colors ${
              off ? 'bg-[var(--text-secondary)]/30' : 'bg-[var(--accent-orange)]'
            }`}
          />
        )}
        <div className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">
          {panel.label}
        </div>
      </div>
      {/*
        Fill downward first, then start a new column — so a panel of eight
        knobs is two short columns rather than one long stripe.

        Grid with an explicit row count rather than flex column-wrap: wrapping
        a column-direction flex container needs a definite height *and* a
        parent willing to grow wider for the extra columns, and without both
        the columns pile up on top of each other. `grid-auto-flow: column` with
        fixed rows just works, and the width follows.
      */}
      {/* Centred in whatever height the tallest panel sets, so a short panel
          sits in the middle of its box rather than clinging to the top. */}
      <div
        className={`grid grid-flow-col gap-x-4 gap-y-2 justify-start content-center flex-1 transition-opacity ${
          off ? 'opacity-40' : ''
        }`}
        style={{ gridTemplateRows: `repeat(${rows}, min-content)` }}
      >
        {panel.controls.map((control) => {
          // Resolved by name where possible — a JSFX slider number isn't
          // necessarily REAPER's parameter index.
          const param = resolveParam(params, control);
          if (!param) {
            return (
              <div key={`${control.kind}-${control.slider}`}
                className="w-16 h-16 flex items-center justify-center">
                <div className="w-10 h-10 bg-[var(--bg-tertiary)] animate-pulse" />
              </div>
            );
          }
          const handle = (v: number) => onChange(param.index, v);
          if (control.kind === 'knob') {
            // Resolve each depth alongside the knob, so a mode can retarget
            // the same gesture without a second lookup mid-drag.
            const depths: Partial<Record<ModifierKind, FxParam>> = {};
            for (const ref of control.modifiers ?? []) {
              const p = resolveParam(params, ref);
              if (p) depths[ref.kind] = p;
            }
            return (
              <Knob
                key={control.slider}
                param={param}
                control={control}
                mode={mode}
                depths={depths}
                onDepthChange={(kind, v) => {
                  const p = depths[kind];
                  if (p) onChange(p.index, v);
                }}
                onChange={handle}
              />
            );
          }
          if (control.kind === 'fader') {
            return <Fader key={control.slider} param={param} control={control} onChange={handle} />;
          }
          if (control.kind === 'toggle') {
            return <Toggle key={control.slider} param={param} control={control} onChange={handle} />;
          }
          if (control.kind === 'stepgrid') {
            const stepValues = readStepGrid(params, control.stepSliders, control.maxValue, control.steps);
            const handleStep = (stepIdx: number, val: number) => {
              const result = editStep(params, control.stepSliders, control.maxValue, stepIdx, val);
              if (result) onChange(result.slider, result.value);
            };
            return (
              <StepGrid
                key={control.slider}
                stepValues={stepValues}
                maxValue={control.maxValue}
                onChange={handleStep}
                label={control.label}
                enabled={true}
              />
            );
          }
          return (
            <Segmented key={control.slider} param={param} control={control}
              columns={panel.columns} onChange={handle}
              hideLabel={panel.label === control.label} />
          );
        })}
      </div>
    </div>
  );
}
