import { useEffect, useRef, useState } from 'react';

// Compact "⋮" action menu — replaces a row of buttons with a single dropdown.
// items: [{ label, onClick, danger?, disabled? }, ...] (a falsy item is skipped,
// so callers can conditionally include entries with `cond && {...}`)
export default function ActionMenu({ items }) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const ref = useRef(null);

  const toggle = (e) => {
    e.stopPropagation();
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      // If within 220px of bottom of screen or card boundary, open upwards
      setOpenUp(spaceBelow < 220 && rect.top > spaceBelow);
    }
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const parentContainer = ref.current?.closest('.astro-card, tr');
    if (parentContainer) {
      parentContainer.classList.add('menu-active');
    }
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      if (parentContainer) {
        parentContainer.classList.remove('menu-active');
      }
    };
  }, [open]);

  const visibleItems = items.filter(Boolean);

  return (
    <div className={`action-menu${open ? ' is-open' : ''}`} ref={ref}>
      <button
        type="button"
        className={`action-menu-trigger${open ? ' active' : ''}`}
        onClick={toggle}
        aria-label="Actions"
        aria-expanded={open}
      >
        ⋮
      </button>
      {open && (
        <div className={`action-menu-dropdown${openUp ? ' open-up' : ''}`}>
          {visibleItems.map((item, i) => (
            <button
              key={i}
              type="button"
              className={`action-menu-item${item.danger ? ' danger' : ''}`}
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
