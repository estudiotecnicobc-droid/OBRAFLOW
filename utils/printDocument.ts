/**
 * Shared print-window utility for Construsoft.
 *
 * Opens a blank window, writes the HTML + CSS into it and calls window.print().
 * This avoids all problems with printing from inside fixed/overflow/scaled modals.
 */

// ---------------------------------------------------------------------------
// BASE STYLES — generic Tailwind-class equivalents shared across all documents
// ---------------------------------------------------------------------------
export const BASE_PRINT_STYLES = `
  /* Reset */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* Body */
  body {
    font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    color: #0f172a;
    background: white;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Layout */
  .flex           { display: flex; }
  .flex-col       { flex-direction: column; }
  .flex-1         { flex: 1 1 0%; }
  .h-full         { height: 100%; }
  .w-full         { width: 100%; }
  .grid           { display: grid; }
  .grid-cols-2    { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid-cols-3    { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .justify-between { justify-content: space-between; }
  .justify-end    { justify-content: flex-end; }
  .items-start    { align-items: flex-start; }
  .items-end      { align-items: flex-end; }
  .text-center    { text-align: center; }
  .text-right     { text-align: right; }
  .text-left      { text-align: left; }
  .object-contain { object-fit: contain; }

  /* Spacing */
  .gap-8    { gap: 2rem; }
  .gap-10   { gap: 2.5rem; }
  .gap-x-12 { column-gap: 3rem; }
  .gap-y-4  { row-gap: 1rem; }
  .p-2   { padding: 0.5rem; }
  .p-3   { padding: 0.75rem; }
  .p-6   { padding: 1.5rem; }
  .p-8   { padding: 2rem; }
  .px-2  { padding-left: 0.5rem; padding-right: 0.5rem; }
  .pr-2  { padding-right: 0.5rem; }
  .pb-1  { padding-bottom: 0.25rem; }
  .pb-4  { padding-bottom: 1rem; }
  .pb-6  { padding-bottom: 1.5rem; }
  .pt-2  { padding-top: 0.5rem; }
  .pt-4  { padding-top: 1rem; }
  .py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
  .py-2  { padding-top: 0.5rem; padding-bottom: 0.5rem; }
  .mt-2  { margin-top: 0.5rem; }
  .mt-4  { margin-top: 1rem; }
  .mt-6  { margin-top: 1.5rem; }
  .mt-8  { margin-top: 2rem; }
  .mt-20 { margin-top: 5rem; }
  .mb-1  { margin-bottom: 0.25rem; }
  .mb-4  { margin-bottom: 1rem; }
  .mb-6  { margin-bottom: 1.5rem; }
  .mb-8  { margin-bottom: 2rem; }
  .mx-2  { margin-left: 0.5rem; margin-right: 0.5rem; }
  .max-w-\\[200px\\] { max-width: 200px; }
  .h-16 { height: 4rem; }
  .w-12 { width: 3rem; }
  .w-16 { width: 4rem; }
  .w-24 { width: 6rem; }
  .w-28 { width: 7rem; }
  .space-y-1 > * + * { margin-top: 0.25rem; }

  /* Typography */
  .font-sans  { font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif; }
  .font-mono  { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  .text-xs    { font-size: 0.75rem;  line-height: 1rem; }
  .text-sm    { font-size: 0.875rem; line-height: 1.25rem; }
  .text-lg    { font-size: 1.125rem; line-height: 1.75rem; }
  .text-xl    { font-size: 1.25rem;  line-height: 1.75rem; }
  .text-3xl   { font-size: 1.875rem; line-height: 2.25rem; }
  .text-\\[10px\\] { font-size: 10px; }
  .text-\\[9px\\]  { font-size: 9px; }
  .font-medium { font-weight: 500; }
  .font-bold   { font-weight: 700; }
  .font-black  { font-weight: 900; }
  .uppercase   { text-transform: uppercase; }
  .tracking-tight   { letter-spacing: -0.025em; }
  .tracking-wide    { letter-spacing: 0.025em; }
  .tracking-wider   { letter-spacing: 0.05em; }
  .tracking-widest  { letter-spacing: 0.1em; }
  .leading-none     { line-height: 1; }
  .italic           { font-style: italic; }
  .whitespace-pre-wrap { white-space: pre-wrap; }

  /* Text colors */
  .text-slate-400 { color: #94a3b8; }
  .text-slate-500 { color: #64748b; }
  .text-slate-600 { color: #475569; }
  .text-slate-700 { color: #334155; }
  .text-slate-800 { color: #1e293b; }
  .text-slate-900 { color: #0f172a; }
  .text-white     { color: #ffffff; }
  .text-emerald-800 { color: #065f46; }

  /* Backgrounds */
  .bg-white      { background-color: #ffffff; }
  .bg-slate-50   { background-color: #f8fafc; }
  .bg-slate-100  { background-color: #f1f5f9; }
  .bg-slate-200  { background-color: #e2e8f0; }
  .bg-slate-900  { background-color: #0f172a; }
  .bg-emerald-50 { background-color: #ecfdf5; }

  /* Borders */
  .border     { border: 1px solid; }
  .border-b   { border-bottom: 1px solid; }
  .border-b-2 { border-bottom: 2px solid; }
  .border-t   { border-top: 1px solid; }
  .border-t-2 { border-top: 2px solid; }
  .border-slate-100 { border-color: #f1f5f9; }
  .border-slate-200 { border-color: #e2e8f0; }
  .border-slate-300 { border-color: #cbd5e1; }
  .border-slate-400 { border-color: #94a3b8; }
  .border-slate-800 { border-color: #1e293b; }
  .border-slate-900 { border-color: #0f172a; }
  .rounded    { border-radius: 0.25rem; }
  .rounded-lg { border-radius: 0.5rem; }

  /* Table */
  table { width: 100%; border-collapse: collapse; }
  .border-collapse { border-collapse: collapse; }
  tbody tr:nth-child(even) { background-color: #f8fafc; }

  /* Print helpers */
  .break-inside-avoid { break-inside: avoid; }
`;

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
export interface PrintDocumentOptions {
  /** Window title / document title. */
  title: string;
  /** Raw innerHTML of the content element. */
  html: string;
  /** Additional CSS injected after BASE_PRINT_STYLES (component-specific rules). */
  styles?: string;
  /** CSS page-size keyword: 'a4', 'letter', 'legal'. Default: 'a4'. */
  pageSize?: string;
  /** Page orientation. Default: 'portrait'. */
  pageOrientation?: 'portrait' | 'landscape';
  /** @page margin. Default: '15mm'. */
  pageMargin?: string;
  /** Delay in ms before calling print() to allow rendering. Default: 300. */
  delay?: number;
}

export function printDocument({
  title,
  html,
  styles = '',
  pageSize = 'a4',
  pageOrientation = 'portrait',
  pageMargin = '15mm',
  delay = 300,
}: PrintDocumentOptions): void {
  const win = window.open('', '_blank', 'width=900,height=1200');
  if (!win) return;

  win.document.write(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    ${BASE_PRINT_STYLES}
    ${styles}
    @media print {
      @page { size: ${pageSize} ${pageOrientation}; margin: ${pageMargin}; }
      body  { margin: 0; }
    }
  </style>
</head>
<body>${html}</body>
</html>`);

  win.document.close();

  win.addEventListener('afterprint', () => win.close());

  setTimeout(() => {
    win.focus();
    win.print();
  }, delay);
}
