import { MODIFIER_KINDS, MODIFIER_LABELS, type ModuleDef } from './modules';

/**
 * What this device offers and how to work it.
 *
 * The Grid borrows several conventions from the plugins it mirrors — latched
 * modulation modes, section switches, tabs named after the original's layout
 * rows — and none of them announce themselves. A knob that silently refuses to
 * move because a mode is latched reads as a bug rather than a mode.
 *
 * Counts are computed from the module rather than written down, so this can't
 * drift when a module is regenerated.
 */
export function DeviceInfo({ module }: { module: ModuleDef }) {
  const controls = module.panels.flatMap((p) => p.controls);
  const modulatable = controls.filter((c) => c.modifiers?.length);
  const depths = controls.reduce((n, c) => n + (c.modifiers?.length ?? 0), 0);
  const switches = module.panels.filter((p) => p.enable).length;
  const kinds = new Set(modulatable.flatMap((c) => c.modifiers!.map((m) => m.kind)));

  return (
    <div className="p-4 max-w-3xl space-y-4 text-[var(--text-secondary)]">
      <Section title="This device">
        <p>
          <b className="text-[var(--text-primary)]">{module.title}</b> — {controls.length} control
          {controls.length === 1 ? '' : 's'} across {module.panels.length} panel
          {module.panels.length === 1 ? '' : 's'}
          {module.groups && module.groups.length > 1
            && `, in ${module.groups.length} sections: ${module.groups.join(', ')}`}.
          {module.groups && module.groups.length > 1
            && ' Those sections are the plugin’s own layout rows, not categories invented here.'}
        </p>
      </Section>

      <Section title="Moving things">
        <Row label="Knobs and faders">
          Drag up and down, not around. A full sweep is about a finger’s length,
          wherever you started.
        </Row>
        <Row label="Buttons">One tap. No drag, no hold.</Row>
        <Row label="Getting between devices">
          The strip along the bottom. The panels themselves don’t pan, so a
          stray sideways movement can’t steal a knob mid-drag.
        </Row>
      </Section>

      {modulatable.length > 0 && (
        <Section title="Modulation">
          <p>
            {modulatable.length} of these knobs can be modulated, {depths} depths in
            all. A depth isn’t a control of its own — it belongs to a knob, and you
            reach it by latching a mode in the header and dragging that knob.
          </p>
          <ul className="space-y-1">
            {MODIFIER_KINDS.filter((k) => kinds.has(k)).map((kind) => (
              <li key={kind}>
                <b className="text-[var(--text-primary)]">{MODIFIER_LABELS[kind]}</b>
                {' — '}
                {kind === 'vel' && 'how much playing harder moves the knob.'}
                {kind === 'mod' && 'how much the mod wheel moves it.'}
                {kind === 'lfo' && 'how much the free LFO moves it.'}
              </li>
            ))}
          </ul>
          <p>
            Tap a mode to enter, tap it again to leave. While one is latched,
            knobs that have that depth light up and the rest go inert — so you
            can’t change a value by accident when you meant to change its depth.
          </p>
          <p>
            The thin coloured rings inside a knob’s arc are its depths, drawn
            whether or not a mode is latched. That’s how you see what’s modulated
            without going looking.
          </p>
        </Section>
      )}

      {switches > 0 && (
        <Section title="Sections">
          <p>
            {switches} panel{switches === 1 ? ' has' : 's have'} a small square
            beside the title: that section’s on/off. Off dims the panel, exactly
            as the plugin does with the same parameter.
          </p>
        </Section>
      )}

      <Section title="Presets">
        <p>
          The arrows in the header step through the plugin’s presets; tap the
          name for the full list. Changing a preset re-reads every parameter, so
          the panels follow.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-primary)]">
        {title}
      </h3>
      <div className="text-xs leading-relaxed space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p>
      <b className="text-[var(--text-primary)]">{label}</b> — {children}
    </p>
  );
}
