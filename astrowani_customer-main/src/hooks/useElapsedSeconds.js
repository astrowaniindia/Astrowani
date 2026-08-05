// src/hooks/useElapsedSeconds.js
// Ticks once a second but always computes elapsed time from a fixed reference
// timestamp instead of accumulating +1 each tick (setInterval(() => setX(x => x+1)))
// — that pattern drifts and appears "stuck" whenever the JS thread is throttled
// (app backgrounded, heavy re-render, Android Doze), since a delayed tick still
// only adds 1 regardless of how much real time actually passed. Recomputing from
// Date.now() - startMs is self-correcting: even a late tick lands on the right value.
import { useEffect, useState } from 'react';

export default function useElapsedSeconds(startMs, active = true) {
  const [elapsed, setElapsed] = useState(() =>
    startMs ? Math.max(0, Math.floor((Date.now() - startMs) / 1000)) : 0
  );

  useEffect(() => {
    if (!active || !startMs) return undefined;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startMs, active]);

  return elapsed;
}
