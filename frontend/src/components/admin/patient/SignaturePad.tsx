'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

type Props = {
  onChange: (dataUrl: string | null) => void;
  label?: string;
  clearLabel?: string;
};

/** Pointer-based signature capture (mouse, pen, touch). Emits a compact PNG data URL. */
export function SignaturePad({ onChange, label, clearLabel = 'Tozalash' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
  }, []);

  useEffect(() => {
    setup();
  }, [setup]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const emit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange(null);
  };

  return (
    <div className="space-y-1.5">
      {label && <p className="text-[13px] font-medium text-ink">{label}</p>}
      <div className="relative rounded-xl border border-dashed border-line-strong bg-canvas">
        <canvas
          ref={canvasRef}
          className="block h-40 w-full touch-none cursor-crosshair rounded-xl"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            last.current = point(e);
          }}
          onPointerMove={(e) => {
            if (!drawing.current || !last.current) return;
            const ctx = e.currentTarget.getContext('2d')!;
            const p = point(e);
            ctx.beginPath();
            ctx.moveTo(last.current.x, last.current.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            last.current = p;
            if (!hasInk) setHasInk(true);
          }}
          onPointerUp={() => {
            drawing.current = false;
            last.current = null;
            if (hasInk) emit();
          }}
          onPointerLeave={() => {
            if (drawing.current && hasInk) emit();
            drawing.current = false;
          }}
        />
        <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-line-strong" />
        <button
          type="button"
          onClick={clear}
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-ink-muted shadow-soft hover:text-ink"
        >
          <Eraser className="h-3.5 w-3.5" />
          {clearLabel}
        </button>
      </div>
    </div>
  );
}
