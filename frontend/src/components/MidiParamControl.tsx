import { useState, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────

interface MidiCcParam {
  cc: number;
  name: string;
  value: number;
  min?: number;
  max?: number;
}

interface MidiParamControlProps {
  ccParams: MidiCcParam[];
  onCcChange: (cc: number, value: number) => void;
  channel?: number;
}

// ── Component ─────────────────────────────────────────────────

export function MidiParamControl({ ccParams, onCcChange, channel = 0 }: MidiParamControlProps) {
  const [localValues, setLocalValues] = useState<Record<number, number>>(
    () => Object.fromEntries(ccParams.map((p) => [p.cc, p.value])),
  );

  const handleCcChange = useCallback(
    (cc: number, value: number) => {
      setLocalValues((prev) => ({ ...prev, [cc]: value }));
      onCcChange(cc, value);
    },
    [onCcChange],
  );

  // Update local values when props change
  const propsValues = Object.fromEntries(ccParams.map((p) => [p.cc, p.value]));
  if (JSON.stringify(localValues) !== JSON.stringify(propsValues)) {
    setLocalValues(propsValues);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          MIDI CC Control
        </h3>
        <span className="text-xs text-[var(--text-secondary)]">
          Ch: {channel}
        </span>
      </div>

      <div className="space-y-2">
        {ccParams.map((param) => {
          const value = localValues[param.cc] ?? param.value;
          const min = param.min ?? 0;
          const max = param.max ?? 127;
          const normalized = (value - min) / (max - min);

          return (
            <div key={param.cc} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                  {param.name}
                </span>
                <span className="text-[11px] text-[var(--text-secondary)] tabular-nums">
                  {value}
                </span>
              </div>

              <div
                className="relative h-6 overflow-hidden cursor-pointer select-none
                  transition-shadow ring-1 ring-[var(--border)] bg-[var(--bg-tertiary)]"
                onPointerDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const val = min + (x / rect.width) * (max - min);
                  handleCcChange(param.cc, Math.round(val));
                }}
              >
                {/* Fill */}
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-[var(--accent-blue)]/40 to-[var(--accent-blue)]/60 transition-[width] duration-50"
                  style={{ width: `${normalized * 100}%` }}
                />

                {/* Knob */}
                <div
                  className="absolute top-1 bottom-1 w-1 bg-[var(--accent-blue)]/80 transition-[left] duration-50"
                  style={{ left: `calc(${normalized * 100}% - 2px)` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}