/**
 * Whether an FX name belongs to a patched copy.
 *
 * `tools/jsfx_expose.py` writes its output under a new filename and appends
 * " [Spidercrab]" to the desc line, so REAPER lists the two side by side and
 * existing projects keep loading the original untouched.
 *
 * A module built on promoted parameters must match only the copy. Yutani's
 * module reaches slider 208 and the original declares 81; MIDI ARP's reaches
 * 232 against 40. Matched loosely, the Grid would draw a full layout over an
 * original whose parameters mostly don't exist — controls resolving to
 * nothing, and the few that do resolve driving whatever happens to sit at that
 * index.
 *
 * Its own file rather than modules.ts, which imports every module and would
 * make this a cycle.
 */
export function isPatched(cleanName: string): boolean {
  return cleanName.toLowerCase().includes('[spidercrab]');
}
