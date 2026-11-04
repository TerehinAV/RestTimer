import { useState } from 'react';
import { InfoIcon } from './Icons';

export function HelpTip({ text, direction = 'down', modal = false }: { text: string; direction?: 'up' | 'down'; modal?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="help"
        className={`flex shrink-0 items-center justify-center rounded-full leading-none active:opacity-60 ${
          open ? 'text-fg-muted' : 'text-accent'
        }`}
        onClick={() => setOpen((v) => !v)}
      >
        <InfoIcon className="h-4 w-4" />
      </button>
      {open && modal && <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setOpen(false)} />}
      {open && (
        <span
          className={
            modal
              ? 'fixed left-1/2 top-1/2 z-50 block w-[min(20rem,80vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-bg-elev px-4 py-3 text-xs font-normal leading-relaxed tracking-normal text-fg-muted shadow-lg'
              : `absolute left-1/2 z-30 block w-64 -translate-x-1/2 rounded-xl bg-bg-elev px-3.5 py-2.5 text-xs font-normal leading-relaxed tracking-normal text-fg-muted shadow-lg ${direction === 'up' ? 'bottom-6' : 'top-6'}`
          }
          onClick={() => setOpen(false)}
        >
          {text}
        </span>
      )}
    </>
  );
}
