import { useCallback, useEffect, useState } from 'react';
import type { Track, FxInfo, FxParam } from '../../hooks/useReaper';
import type { WsResponse } from '../../lib/wsClient';
import { findModule, cleanFxName, type ModuleDef, type ModulePanel } from './modules';
import { Knob, Fader, Segmented } from './widgets';

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

      {/* The strip. Horizontal pan only; controls capture vertical drags. */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden touch-pan-x">
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
    getFxParams(trackIdx, fx.index, 0, 64)
      .then((r) => { if (!cancelled) setParams(r.params); })
      .catch(() => { if (!cancelled) setParams([]); });
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
        <span className="text-[11px] font-semibold uppercase tracking-wider">
          {module.title || cleanFxName(fx.name)}
        </span>
      </header>
      <div className="flex items-start gap-3 p-3">
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
    <div className="flex flex-col gap-2 px-3 py-1 bg-[var(--bg-tertiary)]/25 ring-1 ring-[var(--border)]/50">
      <div className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">
        {panel.label}
      </div>
      <div className="flex items-start gap-3">
        {panel.controls.map((control) => {
          const param = params.find((p) => p.index === control.param);
          if (!param) {
            return (
              <div key={`${control.kind}-${control.param}`}
                className="w-16 h-16 flex items-center justify-center">
                <div className="w-10 h-10 bg-[var(--bg-tertiary)] animate-pulse" />
              </div>
            );
          }
          const handle = (v: number) => onChange(control.param, v);
          if (control.kind === 'knob') {
            return <Knob key={control.param} param={param} control={control} onChange={handle} />;
          }
          if (control.kind === 'fader') {
            return <Fader key={control.param} param={param} control={control} onChange={handle} />;
          }
          return (
            <Segmented key={control.param} param={param} control={control}
              columns={panel.columns} onChange={handle}
              hideLabel={panel.label === control.label} />
          );
        })}
      </div>
    </div>
  );
}
