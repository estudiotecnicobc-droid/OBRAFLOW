import React from 'react';
import { ArrowLeft } from 'lucide-react';
import terminos from '../../content/legal/terminos.md?raw';
import privacidad from '../../content/legal/privacidad.md?raw';

export type LegalDoc = 'terminos' | 'privacidad';

const DOCS: Record<LegalDoc, string> = { terminos, privacidad };

export const legalDocFromPath = (pathname: string): LegalDoc | null => {
  const p = pathname.replace(/\/+$/, '');
  if (p === '/terminos') return 'terminos';
  if (p === '/privacidad') return 'privacidad';
  return null;
};

// Texto en línea: **negrita**, *cursiva* y campos [EN MAYÚSCULAS] pendientes de completar.
const renderInline = (text: string, key: string): React.ReactNode[] => {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[A-ZÁÉÍÓÚÑ][^\]]*\])/g).filter(Boolean);
  return parts.map((part, i) => {
    const k = `${key}-${i}`;
    if (part.startsWith('**')) return <strong key={k} className="font-semibold text-slate-900">{renderInline(part.slice(2, -2), k)}</strong>;
    if (part.startsWith('*')) return <em key={k}>{part.slice(1, -1)}</em>;
    if (/^\[[A-ZÁÉÍÓÚÑ]/.test(part)) return <mark key={k} className="bg-amber-100 text-amber-900 px-1 rounded">{part}</mark>;
    return <React.Fragment key={k}>{part}</React.Fragment>;
  });
};

const withBreaks = (lines: string[], key: string) =>
  lines.map((line, i) => (
    <React.Fragment key={`${key}-l${i}`}>
      {i > 0 && <br />}
      {renderInline(line, `${key}-l${i}`)}
    </React.Fragment>
  ));

const renderMarkdown = (md: string): React.ReactNode[] => {
  const blocks = md.replace(/\r\n/g, '\n').split(/\n\s*\n/);
  const out: React.ReactNode[] = [];
  blocks.forEach((raw, b) => {
    const block = raw.trim();
    if (!block) return;
    const key = `b${b}`;
    const lines = block.split('\n');
    if (block === '---') {
      out.push(<hr key={key} className="my-8 border-slate-200" />);
    } else if (block.startsWith('# ')) {
      out.push(<h1 key={key} className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 mb-6">{block.slice(2)}</h1>);
    } else if (block.startsWith('## ')) {
      out.push(<h2 key={key} className="text-xl font-bold text-slate-900 mt-10 mb-3">{block.slice(3)}</h2>);
    } else if (block.startsWith('### ')) {
      out.push(<h3 key={key} className="text-base font-bold text-slate-900 mt-6 mb-2">{block.slice(4)}</h3>);
    } else if (lines.every(l => l.trim().startsWith('- '))) {
      out.push(
        <ul key={key} className="list-disc pl-6 space-y-1.5 my-4">
          {lines.map((l, i) => <li key={i}>{renderInline(l.trim().slice(2), `${key}-${i}`)}</li>)}
        </ul>,
      );
    } else if (lines.every(l => /^\d+\.\s/.test(l.trim()))) {
      out.push(
        <ol key={key} className="list-decimal pl-6 space-y-1.5 my-4">
          {lines.map((l, i) => <li key={i}>{renderInline(l.trim().replace(/^\d+\.\s/, ''), `${key}-${i}`)}</li>)}
        </ol>,
      );
    } else if (lines.every(l => l.trim().startsWith('|'))) {
      const rows = lines
        .filter(l => !/^\|\s*-/.test(l.trim()))
        .map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      const [head, ...body] = rows;
      out.push(
        <div key={key} className="overflow-x-auto my-5">
          <table className="w-full text-sm border border-slate-200">
            <thead className="bg-slate-50">
              <tr>{head.map((c, i) => <th key={i} className="text-left font-semibold p-2.5 border-b border-slate-200">{renderInline(c, `${key}-h${i}`)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="border-b border-slate-100 last:border-0">
                  {r.map((c, ci) => <td key={ci} className="p-2.5 align-top">{renderInline(c, `${key}-${ri}-${ci}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (lines.every(l => l.startsWith('>'))) {
      out.push(
        <blockquote key={key} className="border-l-4 border-slate-200 pl-4 my-4 text-slate-600">
          {withBreaks(lines.map(l => l.replace(/^>\s?/, '')), key)}
        </blockquote>,
      );
    } else {
      out.push(<p key={key} className="my-3">{withBreaks(lines, key)}</p>);
    }
  });
  return out;
};

export const LegalPage: React.FC<{ doc: LegalDoc }> = ({ doc }) => (
  <div className="min-h-screen bg-white text-slate-700">
    <header className="border-b border-slate-100">
      <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="/" className="font-black text-slate-900">
          obraf<span className="text-blue-600">low</span>
        </a>
        <a href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft size={15} /> Volver al inicio
        </a>
      </div>
    </header>
    <main className="max-w-3xl mx-auto px-6 py-12 leading-relaxed text-[15px] text-justify">
      {renderMarkdown(DOCS[doc])}
    </main>
    <footer className="border-t border-slate-100">
      <div className="max-w-3xl mx-auto px-6 py-6 flex gap-5 text-xs text-slate-400">
        <a href="/terminos" className="hover:text-slate-700">Términos y condiciones</a>
        <a href="/privacidad" className="hover:text-slate-700">Política de privacidad</a>
      </div>
    </footer>
  </div>
);
