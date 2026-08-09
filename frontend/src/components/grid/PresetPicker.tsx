import { useCallback, useEffect, useState } from 'react';
import type { FxPresetInfo, FxPresetNames } from '../../hooks/useReaper';

interface PresetPickerProps {
  trackIdx: number;
  fxIdx: number;
  getFxPreset?: (trackIdx: number, fxIdx: number) => Promise<FxPresetInfo | null>;
  setFxPreset?: (
    trackIdx: number, fxIdx: number, presetIdx: number,
  ) => Promise<FxPresetInfo | null>;
  getAllFxPresetNames?: (trackIdx: number, fxIdx: number) => Promise<FxPresetNames | null>;
  /** Called after a preset lands, so the panels can re-read their values. */
  onChanged: () => void;
}

/**
 * Preset stepper for a Grid device.
 *
 * Arrows for nudging through neighbours, and the name opens the full list —
 * Yutani ships ninety, which is a lot of arrow taps. The list is fetched only
 * when opened, since it's a per-plugin round trip that most sessions never
 * need.
 */
export function PresetPicker({
  trackIdx, fxIdx, getFxPreset, setFxPreset, getAllFxPresetNames, onChanged,
}: PresetPickerProps) {
  const [info, setInfo] = useState<FxPresetInfo | null>(null);
  const [names, setNames] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!getFxPreset) return;
    let cancelled = false;
    getFxPreset(trackIdx, fxIdx)
      .then((got) => { if (!cancelled && got) setInfo(got); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [trackIdx, fxIdx, getFxPreset]);

  const apply = useCallback((idx: number) => {
    if (!setFxPreset) return;
    setFxPreset(trackIdx, fxIdx, idx)
      .then((got) => { if (got) setInfo(got); onChanged(); })
      .catch(() => {});
  }, [setFxPreset, trackIdx, fxIdx, onChanged]);

  const step = useCallback((by: number) => {
    if (!info || info.numPresets <= 0) return;
    // Wraps, so you can reach the end of the list from either direction.
    apply(((info.presetIndex + by) % info.numPresets + info.numPresets) % info.numPresets);
  }, [info, apply]);

  const openList = useCallback(() => {
    setOpen(true);
    if (names || !getAllFxPresetNames) return;
    getAllFxPresetNames(trackIdx, fxIdx)
      .then((got) => { if (got) setNames(got.presetNames); })
      .catch(() => {});
  }, [names, getAllFxPresetNames, trackIdx, fxIdx]);

  if (!info || info.numPresets <= 0) return null;

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Preset">
      <Arrow label="Previous preset" onClick={() => step(-1)}>‹</Arrow>
      <button
        onClick={openList}
        className="px-2 py-0.5 max-w-40 truncate text-[10px] bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
        aria-label={`Preset: ${info.presetName || 'none'}`}
      >
        {info.presetName || '—'}
      </button>
      <Arrow label="Next preset" onClick={() => step(1)}>›</Arrow>

      {open && (
        <>
          {/* Tapping away closes it — there's nowhere else for a modal to go
              on a screen this dense. */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            data-testid="preset-scrim"
          />
          <div
            className="absolute z-50 mt-1 top-full left-0 w-64 max-h-80 overflow-y-auto bg-[var(--bg-secondary)] ring-1 ring-[var(--border)] shadow-xl"
            role="listbox"
            aria-label="Presets"
          >
            {names === null ? (
              <div className="px-3 py-2 text-[11px] text-[var(--text-secondary)]">Loading…</div>
            ) : names.map((name, i) => (
              <button
                key={`${i}-${name}`}
                role="option"
                aria-selected={i === info.presetIndex}
                onClick={() => { apply(i); setOpen(false); }}
                className={`block w-full text-left px-3 py-2 text-[11px] truncate ${
                  i === info.presetIndex
                    ? 'bg-[var(--accent-orange)]/20 text-[var(--accent-orange)]'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Arrow({
  label, onClick, children,
}: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="w-6 h-6 text-[13px] leading-none bg-[var(--bg-tertiary)] text-[var(--text-secondary)] active:brightness-125"
    >
      {children}
    </button>
  );
}
