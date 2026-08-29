import { useEffect, useRef } from 'react';
import { haptic } from '../../tg/tg';

export type WheelItem = { value: number; label: string };

type WheelProps = {
  items: WheelItem[];
  value: number;
  onChange: (value: number) => void;
  itemHeight?: number;
  visible?: number;
  className?: string;
};

export function Wheel({ items, value, onChange, itemHeight = 44, visible = 5, className = '' }: WheelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastIdx = useRef(-1);
  const settling = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, items.findIndex((i) => i.value === value));
    el.scrollTop = idx * itemHeight;
    lastIdx.current = idx;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = items.findIndex((i) => i.value === value);
    if (idx >= 0 && idx !== lastIdx.current) {
      el.scrollTo({ top: idx * itemHeight, behavior: 'smooth' });
      lastIdx.current = idx;
    }
  }, [value, items, itemHeight]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    if (settling.current) clearTimeout(settling.current);
    settling.current = setTimeout(() => {
      const idx = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / itemHeight)));
      if (idx !== lastIdx.current) {
        lastIdx.current = idx;
        haptic('select');
        onChange(items[idx].value);
      }
    }, 140);
  };

  const pad = Math.floor(visible / 2);
  const height = itemHeight * visible;

  return (
    <div className={`relative select-none ${className}`} style={{ height }}>
      <div
        ref={ref}
        onScroll={onScroll}
        className="h-full snap-y snap-mandatory overflow-y-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        <div style={{ height: pad * itemHeight }} />
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              type="button"
              key={item.value}
              onClick={() => onChange(item.value)}
              className={`flex w-full items-center justify-center snap-center font-mono-timer tabular-nums transition-opacity ${
                active ? 'text-fg opacity-100' : 'text-fg-muted opacity-45'
              }`}
              style={{ height: itemHeight }}
            >
              <span className={active ? 'text-4xl' : 'text-2xl'}>{item.label}</span>
            </button>
          );
        })}
        <div style={{ height: pad * itemHeight }} />
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-gradient-to-b from-bg to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10 bg-gradient-to-t from-bg to-transparent"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2" style={{ height: itemHeight }}>
        <div className="h-full w-full rounded-2xl border-y border-card-border bg-accent-soft" />
      </div>
    </div>
  );
}
