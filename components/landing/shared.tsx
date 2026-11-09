import React from 'react';

export const SANS = "font-['Archivo',ui-sans-serif,system-ui,sans-serif]";
export const MONO = "font-['IBM_Plex_Mono',ui-monospace,monospace]";

export const Window: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`bg-white border border-slate-200 rounded-xl shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] overflow-hidden ${className}`}>
    <div className="flex items-center gap-2 px-4 h-9 border-b border-slate-100 bg-slate-50/80">
      <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
      <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
      <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
      <span className={`ml-2 text-[11px] text-slate-500 truncate ${MONO}`}>{title}</span>
    </div>
    {children}
  </div>
);
