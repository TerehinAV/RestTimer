import { useState } from 'react';

export function HelpTip({ text, align = 'right' }: { text: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label="help"
        className={`flex h-4.5 w-4.5 items-center justify-center rounded-full border border-fg-faint text-[10px] leading-none text-fg-muted active:opacity-60 ${
          open ? 'bg-accent-soft border-accent text-accent' : ''
        }`}
        style={{ width: '1.125rem', height: '1.125rem' }}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <span
          className={`absolute top-6 z-30 block w-64 rounded-xl bg-bg-elev px-3.5 py-2.5 text-xs font-normal normal-case tracking-normal text-fg-muted shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          onClick={() => setOpen(false)}
        >
          {text}
        </span>
      )}
    </span>
  );
}
