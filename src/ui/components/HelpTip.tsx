import { useState } from 'react';
import { InfoIcon } from './Icons';

export function HelpTip({ text, direction = 'down' }: { text: string; direction?: 'up' | 'down' }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label="help"
        className={`flex items-center justify-center rounded-full leading-none active:opacity-60 ${
          open ? 'text-accent' : 'text-fg-muted'
        }`}
        onClick={() => setOpen((v) => !v)}
      >
        <InfoIcon className="h-4 w-4" />
      </button>
      {open && (
        <span
          className={`absolute left-1/2 z-30 block w-64 -translate-x-1/2 rounded-xl bg-bg-elev px-3.5 py-2.5 text-xs font-normal leading-relaxed tracking-normal text-fg-muted shadow-lg ${
            direction === 'up' ? 'bottom-6' : 'top-6'
          }`}
          onClick={() => setOpen(false)}
        >
          {text}
        </span>
      )}
    </span>
  );
}
