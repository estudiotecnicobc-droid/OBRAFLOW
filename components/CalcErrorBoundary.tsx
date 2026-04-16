import React from 'react';
import { AlertCircle } from 'lucide-react';

interface State { err: string | null }

// Error boundary de clase — necesario para React (no hay equivalente funcional).
// El proyecto no tiene @types/react instalado, así que se usan castings mínimos
// para los miembros heredados de React.Component (setState, props).
export class CalcErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  // Declarar state como campo explícito para que TS lo reconozca
  state: State = { err: null };

  static getDerivedStateFromError(e: unknown): State {
    return { err: e instanceof Error ? e.message : String(e) };
  }

  componentDidCatch(e: unknown) {
    console.error('[CalcErrorBoundary] render error:', e);
  }

  render() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const self = this as any;
    if (this.state.err) {
      return (
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Error en la Calculadora</p>
              <p className="text-red-600 mt-1 font-mono text-xs break-all">{this.state.err}</p>
              <p className="text-red-500 mt-2 text-xs">
                Revisá la consola del navegador (F12) para más detalles.
              </p>
            </div>
          </div>
          <button
            className="self-start px-3 py-1 border border-red-300 rounded text-red-700 text-xs hover:bg-red-100 transition-colors"
            onClick={() => self.setState({ err: null })}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return self.props.children;
  }
}
