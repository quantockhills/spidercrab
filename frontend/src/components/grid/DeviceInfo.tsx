import { MODIFIER_KINDS, MODIFIER_LABELS, type ModuleDef } from './modules';

/** What each modulation source is, in the order the header shows them. */
const SOURCE_EXPLANATIONS: Record<string, string> = {
  vel: 'sets how far the velocity of a note moves the knob, which is to say how '
    + 'much difference it makes to play harder or more softly.',
  mod: 'sets how far the modulation wheel moves the knob as you turn it.',
  lfo: 'sets how far the free LFO moves the knob as it cycles.',
};

/**
 * How to work this device.
 *
 * The Grid borrows several conventions from the plugins it mirrors — latched
 * modulation sources, section switches, tabs named after the original's layout
 * rows — and none of them announce themselves. A knob that quietly refuses to
 * move because a source is selected reads as a bug rather than a mode, so it is
 * worth explaining properly rather than listing features.
 *
 * Sections appear only when this device has the thing they describe, so a
 * plugin with no modulation says nothing about modulation.
 */
export function DeviceInfo({ module }: { module: ModuleDef }) {
  const controls = module.panels.flatMap((p) => p.controls);
  const modulatable = controls.filter((c) => c.modifiers?.length);
  const hasSwitches = module.panels.some((p) => p.enable);
  const sources = MODIFIER_KINDS.filter(
    (k) => modulatable.some((c) => c.modifiers!.some((m) => m.kind === k)),
  );
  const tabs = module.groups && module.groups.length > 1 ? module.groups : null;

  return (
    <div className="p-5 max-w-2xl space-y-5 text-[var(--text-secondary)]">
      <Section title={module.title}>
        <p>
          This layout follows the one the plugin draws for itself, so the panels
          are grouped the way its own designer grouped them.
          {tabs && ` Because it is wider than the screen, its sections are split
            across the tabs above. Those tabs are the rows the plugin lays its
            panels out in, so ${tabs.slice(0, -1).join(', ')} and
            ${tabs[tabs.length - 1]} are its own divisions rather than ones
            invented here.`}
        </p>
      </Section>

      <Section title="Using the controls">
        <p>
          To change a knob or a fader, press it and drag upwards or downwards.
          Dragging sideways or in a circle will not move it. Taking a control
          from one end of its range to the other needs about a hand's width of
          travel, and that distance is the same wherever on the screen you
          started, so you can begin a drag on a small knob and finish it well
          away from where the knob is drawn.
        </p>
        <p>
          Buttons and switches respond to a single tap. There is nothing that
          needs to be pressed and held.
        </p>
        <p>
          To move between the devices on a track, use the strip along the bottom
          of the screen. The panels themselves deliberately ignore sideways
          drags, so that a gesture which wanders off vertical cannot interrupt a
          control you are already adjusting.
        </p>
      </Section>

      {sources.length > 0 && (
        <Section title="Modulation">
          <p>
            Many of the knobs on this device can be modulated, which means that
            something other than your finger moves them while you play. Each of
            those knobs holds a separate amount for each source, and that amount
            is called its depth.
          </p>
          <p>
            A depth is not a control in its own right. It belongs to the knob it
            affects, and you reach it by choosing a source in the header and then
            dragging that same knob. The sources are:
          </p>
          <ul className="space-y-1 pl-4 list-disc marker:text-[var(--text-secondary)]/50">
            {sources.map((kind) => (
              <li key={kind}>
                <b className="text-[var(--text-primary)]">{MODIFIER_LABELS[kind]}</b>
                {' '}
                {SOURCE_EXPLANATIONS[kind]}
              </li>
            ))}
          </ul>
          <p>
            Tap one of these to switch into it, and tap the same one again to
            leave. While a source is selected, the knobs that can respond to it
            are highlighted and every other knob stops responding. That is
            deliberate: it means you cannot change a value at the moment you
            meant to change a depth.
          </p>
          <p>
            The thin coloured rings drawn inside a knob's arc show the depths it
            already has. They remain visible whether or not a source is selected,
            so you can see what is being modulated without having to go looking
            for it.
          </p>
        </Section>
      )}

      {hasSwitches && (
        <Section title="Turning sections on and off">
          <p>
            Some panels have a small square beside their title. This switches the
            whole section on or off, and the panel dims when it is off. The
            plugin has the same switch in the corner of the panel, drawn only a
            few pixels across; it appears here at a size you can reach with a
            finger.
          </p>
        </Section>
      )}

      <Section title="Presets">
        <p>
          The arrows at the right of the header move through the plugin's presets
          one at a time, and tapping the name between them opens the full list.
          Loading a preset changes every parameter at once, so the panels are
          read back from the plugin afterwards and will update to match.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] uppercase tracking-widest text-[var(--text-primary)]">
        {title}
      </h3>
      <div className="text-xs leading-relaxed space-y-2">{children}</div>
    </section>
  );
}
