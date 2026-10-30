import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft } from 'lucide-react';
import terminosContent from '../docs/legal/terminos-y-condiciones.md?raw';
import privacidadContent from '../docs/legal/politica-de-privacidad.md?raw';

interface Props {
  doc: 'terminos' | 'privacidad';
}

const SOURCES: Record<Props['doc'], string> = {
  terminos: terminosContent,
  privacidad: privacidadContent,
};

export const LegalPage: React.FC<Props> = ({ doc }) => {
  const content = SOURCES[doc];

  return (
    <div className="min-h-screen bg-white">
      <nav className="sticky top-0 z-10 h-14 flex items-center px-6 bg-white/90 backdrop-blur border-b border-slate-100">
        <a href="/" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft size={15} /> Volver a Obraflow
        </a>
      </nav>
      <article className="max-w-3xl mx-auto px-6 py-12">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="text-3xl font-black text-slate-900 mb-2">{children}</h1>,
            h2: ({ children }) => <h2 className="text-xl font-bold text-slate-900 mt-10 mb-3 border-t border-slate-100 pt-8">{children}</h2>,
            h3: ({ children }) => <h3 className="text-base font-bold text-slate-800 mt-5 mb-2">{children}</h3>,
            p: ({ children }) => <p className="text-sm text-slate-600 leading-relaxed mb-3">{children}</p>,
            strong: ({ children }) => <strong className="font-semibold text-slate-800">{children}</strong>,
            ul: ({ children }) => <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1 mb-3">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-5 text-sm text-slate-600 space-y-1 mb-3">{children}</ol>,
            li: ({ children }) => <li>{children}</li>,
            a: ({ children, href }) => <a href={href} className="text-blue-600 underline hover:text-blue-700" target="_blank" rel="noreferrer">{children}</a>,
            blockquote: ({ children }) => <blockquote className="border-l-2 border-blue-200 pl-4 italic text-sm text-slate-500 my-4">{children}</blockquote>,
            hr: () => <hr className="border-slate-100 my-8" />,
            table: ({ children }) => <div className="overflow-x-auto mb-4"><table className="w-full text-xs border border-slate-200">{children}</table></div>,
            thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
            th: ({ children }) => <th className="text-left font-semibold text-slate-700 px-3 py-2 border border-slate-200">{children}</th>,
            td: ({ children }) => <td className="px-3 py-2 border border-slate-200 text-slate-600">{children}</td>,
            em: ({ children }) => <em className="text-slate-500">{children}</em>,
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
};
