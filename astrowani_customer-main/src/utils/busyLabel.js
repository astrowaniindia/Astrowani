// src/utils/busyLabel.js
// Shared "Busy · Xm" copy for every card/profile that shows an astrologer's busy state.
export function formatBusyLabel(elapsedSeconds) {
  if (!elapsedSeconds || elapsedSeconds < 60) return 'Busy';
  const mins = Math.floor(elapsedSeconds / 60);
  return `Busy · ${mins}m`;
}
