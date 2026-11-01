import React, { useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

/**
 * Convierte lo que escribe el usuario a número. Acepta coma o punto decimal:
 * «2,5» → 2.5 · «2.5» → 2.5 · «1.250,5» → 1250.5 · «2,» → 2 (en curso) · «» → null.
 */
export function parseDecimal(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  if (s === '.' || s === '-' || s === '-.') return 0;
  const n = Number(s.endsWith('.') ? s.slice(0, -1) : s);
  return Number.isFinite(n) ? n : null;
}

const fmt = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 4, useGrouping: false });

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'step' | 'min' | 'max'> & {
  value: number | string | null | undefined;
  /** Se llama con el número (0 si el campo queda vacío) cada vez que el texto es válido. */
  onValue: (n: number, raw: string) => void;
  /** Incremento de las flechas y de ↑/↓ del teclado (default 1). */
  step?: number;
  min?: number;
  max?: number;
};

/**
 * Campo numérico que acepta decimales con coma o punto.
 * Reemplaza a <input type="number">, que en Chrome descarta la coma («2,5» → 25).
 */
export const DecimalInput: React.FC<Props> = ({ value, onValue, onBlur, onFocus, onKeyDown, step = 1, min = 0, max, className, ...rest }) => {
  const toText = (v: Props['value']) => {
    if (v === null || v === undefined || v === '') return '';
    const n = typeof v === 'number' ? v : parseDecimal(v);
    return n === null ? String(v) : fmt(n);
  };
  const [text, setText] = useState(() => toText(value));
  const focused = useRef(false);

  // Si el valor cambia desde afuera (y no lo estamos editando), se refleja.
  useEffect(() => {
    if (!focused.current) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const bump = (dir: 1 | -1) => {
    const cur = parseDecimal(text) ?? 0;
    const decimals = (String(step).split('.')[1] ?? '').length;
    let n = Number((Math.round((cur + dir * step) / step) * step).toFixed(decimals));
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    setText(fmt(n));
    onValue(n, String(n));
  };

  const arrowBtn = 'flex-1 flex items-center justify-center px-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-sm';

  return (
    <span className="relative flex-1 min-w-0 w-full block group/dec">
    <input
      {...rest}
      className={`${className ?? ''} w-full !pr-4`}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onKeyDown={e => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); bump(e.key === 'ArrowUp' ? 1 : -1); }
        onKeyDown?.(e);
      }}
      onFocus={e => { focused.current = true; onFocus?.(e); }}
      onBlur={e => { focused.current = false; setText(toText(parseDecimal(text) ?? (text === '' ? '' : value))); onBlur?.(e); }}
      onChange={e => {
        const raw = e.target.value;
        if (!/^[\d.,\s-]*$/.test(raw)) return; // solo números y separadores
        setText(raw);
        const n = parseDecimal(raw);
        if (n !== null) onValue(n, raw);
        else if (raw === '') onValue(0, '');
      }}
    />
    <span className="absolute right-0 inset-y-0.5 w-3.5 flex flex-col opacity-60 group-hover/dec:opacity-100 group-focus-within/dec:opacity-100 print:hidden">
      <button type="button" tabIndex={-1} aria-label="Aumentar" title={`+${String(step).replace('.', ',')}`}
        onMouseDown={e => { e.preventDefault(); bump(1); }} className={arrowBtn}><ChevronUp size={10} /></button>
      <button type="button" tabIndex={-1} aria-label="Disminuir" title={`−${String(step).replace('.', ',')}`}
        onMouseDown={e => { e.preventDefault(); bump(-1); }} className={arrowBtn}><ChevronDown size={10} /></button>
    </span>
    </span>
  );
};
