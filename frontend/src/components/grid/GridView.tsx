import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track, FxInfo, FxParam } from '../../hooks/useReaper';
import type { WsResponse } from '../../lib/wsClient';
import { findModule, cleanFxName, resolveParam, type ModuleDef, type ModulePanel } from './modules';
import { Knob, Fader, Segmented, Toggle } from './widgets';
import { GridStrip } from './GridStrip';

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
}

/**
 * Grid — the selected track's plugins as a horizontally pannable strip.
 *
 * Panels are a fixed height and run left to right, so a plugin wider than the
 * screen is panned rather than scaled down. That's what keeps controls at a
 * touchable size on a layout designed for a 1460px desktop window.
 *
 * Only plugins with a hand-authored module appear. The FX tab remains the way
 * to reach everything else, unchanged.
 */
export function GridView({
  tracks, selectedTrack, getTrackFx, getFxParams, setFxParam,
}: GridViewProps) {
  // Holds the track it was loaded for, so switching tracks reads as loading
  // without needing to reset state synchronously inside the effect.
  const [loaded, setLoaded] = useState<{ trackIdx: number; fx: FxInfo[] } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
        <div className="flex items-stretch h-full gap-3 px-3 py-3 w-max">
          {withModules.map(({ fx: f, module }) => (
            <Device
              key={f.index}
              trackIdx={selectedTrack}
              fx={f}
              module={module}
              getFxParams={getFxParams}
              setFxParam={setFxParam}
            />
          ))}
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
  trackIdx, fx, module, getFxParams, setFxParam,
}: {
  trackIdx: number;
  fx: FxInfo;
  module: ModuleDef;
  getFxParams: GridViewProps['getFxParams'];
  setFxParam: GridViewProps['setFxParam'];
}) {
  const [params, setParams] = useState<FxParam[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Fetch every parameter, not a first page. Yutani's patched copy has 189,
    // and anything not fetched can't be resolved, so it renders as an empty
    // placeholder — which is exactly what a fixed limit of 64 produced.
    (async () => {
      const all: FxParam[] = [];
      let offset = 0;
      for (;;) {
        const page = await getFxParams(trackIdx, fx.index, offset, 128);
        all.push(...page.params);
        offset += page.params.length;
        if (!page.params.length || all.length >= page.total) break;
      }
      if (!cancelled) setParams(all);
    })().catch(() => { if (!cancelled) setParams([]); });
    return () => { cancelled = true; };
  }, [trackIdx, fx.index, getFxParams]);

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

  return (
    <section className="flex flex-col bg-[var(--bg-secondary)] ring-1 ring-[var(--border)] flex-shrink-0">
      <header className="px-3 py-1.5 border-b border-[var(--border)]">
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          data-testid="grid-device-title"
        >
          {module.title || cleanFxName(fx.name)}
        </span>
      </header>
      <div className="flex items-stretch gap-2 p-2 flex-1 min-h-0">
        {module.panels.map((panel) => (
          <Panel
            key={panel.label}
            panel={panel}
            params={params}
            onChange={commit}
          />
        ))}
      </div>
    </section>
  );
}

function Panel({
  panel, params, onChange,
}: {
  panel: ModulePanel;
  params: FxParam[];
  onChange: (paramIdx: number, value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5 bg-[var(--bg-tertiary)]/25 ring-1 ring-[var(--border)]/50 min-h-0">
      <div className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)] flex-shrink-0">
        {panel.label}
      </div>
      {/*
        Controls flow downward and wrap into a new column when they run out of
        height, rather than sitting in one row with the rest of the panel empty.
        A panel of eight knobs becomes two short columns instead of a long
        stripe, which is both denser and closer to how the plugin groups them.
      */}
      <div className="flex flex-col flex-wrap content-start items-start gap-x-4 gap-y-2 flex-1 min-h-0">
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
            return <Knob key={control.slider} param={param} control={control} onChange={handle} />;
          }
          if (control.kind === 'fader') {
            return <Fader key={control.slider} param={param} control={control} onChange={handle} />;
          }
          if (control.kind === 'toggle') {
            return <Toggle key={control.slider} param={param} control={control} onChange={handle} />;
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
