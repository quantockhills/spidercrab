/** Convert linear 0-1 Reaper volume to approximate dB string */
export function volumeToDb(vol: number): string {
  if (vol <= 0) return '-∞';
  const dB = 20 * Math.log10(vol);
  return `${dB.toFixed(1)}dB`;
}
