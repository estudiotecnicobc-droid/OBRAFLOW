import React, { useEffect, useRef, useState } from 'react';

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

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | string | null | undefined;
  /** Se llama con el número (0 si el campo queda vacío) cada vez que el texto es válido. */
  onValue: (n: number, raw: string) => void;
};

/**
 * Campo numérico que acepta decimales con coma o punto.
 * Reemplaza a <input type="number">, que en Chrome descarta la coma («2,5» → 25).
 */
export const DecimalInput: React.FC<Props> = ({ value, onValue, onBlur, onFocus, ...rest }) => {
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

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
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
  );
};
