import { useEffect, useRef, useState } from 'react';

// Compact "⋮" action menu — replaces a row of buttons with a single dropdown.
// items: [{ label, onClick, danger?, disabled? }, ...] (a falsy item is skipped,
// so callers can conditionally include entries with `cond && {...}`)
export default function ActionMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const visibleItems = items.filter(Boolean);

  return (
    <div className="action-menu" ref={ref}>
      <button type="button" className="action-menu-trigger" onClick={() => setOpen((v) => !v)} aria-label="Actions">
        ⋮
      </button>
      {open && (
        <div className="action-menu-dropdown">
          {visibleItems.map((item, i) => (
            <button
              key={i}
              type="button"
              className={`action-menu-item${item.danger ? ' danger' : ''}`}
              disabled={item.disabled}
              onClick={() => { setOpen(false); item.onClick(); }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
