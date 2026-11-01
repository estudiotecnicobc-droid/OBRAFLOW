import React, { useEffect, useMemo, useState } from 'react';
import { useERP } from '../context/ERPContext';
import { useAuth } from '../context/AuthContext';
import {
  FolderPlus, HardHat, MapPin, User, LogOut, Search, LayoutGrid, Images, List, Columns3, Camera, Calendar, X, Home,
} from 'lucide-react';
import { Project, ProjectStatus } from '../types';
import { ProjectWizard } from './ProjectWizard';
import { DEMO_NAME, demoProjectData } from '../src/features/demo/demoHouse';
import { countProjects, demoAlreadyOffered, markDemo, setDemoPending } from '../src/features/demo/demoState';
import { usePersistentState } from '../hooks/usePersistentState';
import { ProjectCover, CoverPicker } from '../src/features/projects/ProjectCover';
import { toLocalDate } from '../services/calculationService';

type View = 'cards' | 'gallery' | 'list' | 'board';
type Sort = 'recent' | 'name' | 'start' | 'status';

const STATUS: Record<ProjectStatus, { label: string; cls: string; dot: string }> = {
  planning: { label: 'Planificación', cls: 'bg-blue-50 text-blue-700 border-blue-100', dot: 'bg-blue-500' },
  active: { label: 'En ejecución', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100', dot: 'bg-emerald-500' },
  suspended: { label: 'Suspendido', cls: 'bg-red-50 text-red-700 border-red-100', dot: 'bg-red-500' },
  completed: { label: 'Finalizado', cls: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
};
const STATUS_ORDER: ProjectStatus[] = ['planning', 'active', 'suspended', 'completed'];

const VIEWS: { key: View; label: string; icon: React.ReactNode }[] = [
  { key: 'cards', label: 'Tarjetas', icon: <LayoutGrid size={16} /> },
  { key: 'gallery', label: 'Galería', icon: <Images size={16} /> },
  { key: 'list', label: 'Lista', icon: <List size={16} /> },
  { key: 'board', label: 'Por estado', icon: <Columns3 size={16} /> },
];

const norm = (s?: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const fmtDate = (s?: string) => (s ? toLocalDate(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

const progressOf = (p: Project) => {
  if (!p.items || p.items.length === 0) return null;
  return Math.round(p.items.reduce((a, i) => a + (i.progress || 0), 0) / p.items.length);
};

const StatusBadge: React.FC<{ status: ProjectStatus; overlay?: boolean }> = ({ status, overlay }) => {
  const s = STATUS[status] ?? STATUS.planning;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${overlay ? 'bg-white/90 text-slate-700 border-white shadow-sm' : s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} /> {s.label}
    </span>
  );
};

const Progress: React.FC<{ value: number | null }> = ({ value }) =>
  value === null ? null : (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${value}%` }} />
      </div>
      <span className="text-[11px] font-bold text-emerald-700 w-9 text-right">{value}%</span>
    </div>
  );

export const ProjectHub: React.FC = () => {
  const { projects, setActiveProject, createNewProject } = useERP();
  const { user, logout, hasPermission, activeOrganizationId: orgId } = useAuth();

  const [showWizard, setShowWizard] = useState(false);
  const [view, setView] = usePersistentState<View>('obraflow_hub_view', 'cards');
  const [sort, setSort] = usePersistentState<Sort>('obraflow_hub_sort', 'recent');
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [coverFor, setCoverFor] = useState<Project | null>(null);

  const canCreate = hasPermission(['admin', 'project_manager']);

  // ── Obra de ejemplo ───────────────────────────────────────────────────────
  const hasDemo = projects.some(p => p.name === DEMO_NAME);
  const startDemo = () => {
    if (!orgId) return;
    setDemoPending(orgId);
    createNewProject(demoProjectData());
  };
  // Primera vez en una empresa sin obras: se crea sola. Si ya se creó (o se borró) no se repite.
  useEffect(() => {
    if (!canCreate || !orgId) return;
    let cancelled = false;
    (async () => {
      if (await demoAlreadyOffered(orgId)) return;
      const n = await countProjects(orgId);
      if (cancelled || n === null) return;
      if (n > 0) { markDemo(orgId, 'omitida'); return; }
      await markDemo(orgId, 'creada');
      if (!cancelled) startDemo();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreate, orgId]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: projects.length };
    projects.forEach(p => { c[p.status] = (c[p.status] ?? 0) + 1; });
    return c;
  }, [projects]);

  const visible = useMemo(() => {
    const q = norm(query.trim());
    const list = projects.filter(p =>
      (status === 'all' || p.status === status) &&
      (!q || norm(p.name).includes(q) || norm(p.client).includes(q) || norm(p.address).includes(q)));
    const by: Record<Sort, (a: Project, b: Project) => number> = {
      recent: (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
      name: (a, b) => a.name.localeCompare(b.name, 'es'),
      start: (a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''),
      status: (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.name.localeCompare(b.name, 'es'),
    };
    return [...list].sort(by[sort] ?? by.recent);
  }, [projects, status, query, sort]);

  const CoverButton: React.FC<{ p: Project; className?: string }> = ({ p, className = '' }) =>
    canCreate ? (
      <button
        onClick={e => { e.stopPropagation(); setCoverFor(p); }}
        title="Cambiar portada" aria-label={`Cambiar portada de ${p.name}`}
        className={`p-1.5 rounded-lg bg-white/90 hover:bg-white text-slate-600 hover:text-blue-600 shadow-sm opacity-80 hover:opacity-100 transition ${className}`}
      >
        <Camera size={14} />
      </button>
    ) : null;

  const open = (p: Project) => setActiveProject(p.id);
  const keyOpen = (p: Project) => (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(p); } };

  const Card = (p: Project) => (
    <div key={p.id} role="button" tabIndex={0} onClick={() => open(p)} onKeyDown={keyOpen(p)}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all cursor-pointer group overflow-hidden flex flex-col focus:outline-none focus:ring-2 focus:ring-blue-400">
      <div className="relative h-36">
        <ProjectCover project={p} className="w-full h-full block" />
        <div className="absolute top-3 left-3"><StatusBadge status={p.status} overlay /></div>
        <CoverButton p={p} className="absolute top-3 right-3" />
      </div>
      <div className="p-5 flex-1 flex flex-col gap-1.5">
        <h3 className="text-lg font-bold text-slate-800 truncate" title={p.name}>{p.name}</h3>
        {p.client && <p className="text-sm text-slate-500 truncate flex items-center gap-1"><User size={13} /> {p.client}</p>}
        <p className="text-xs text-slate-400 truncate flex items-center gap-1"><MapPin size={13} /> {p.address || 'Ubicación no definida'}</p>
        {p.startDate && <p className="text-xs text-slate-400 flex items-center gap-1"><Calendar size={13} /> Inicio {fmtDate(p.startDate)}{p.endDate ? ` · fin ${fmtDate(p.endDate)}` : ''}</p>}
        <div className="mt-auto pt-2"><Progress value={progressOf(p)} /></div>
      </div>
    </div>
  );

  const Tile = (p: Project) => (
    <div key={p.id} role="button" tabIndex={0} onClick={() => open(p)} onKeyDown={keyOpen(p)}
      className="relative aspect-[4/3] rounded-2xl overflow-hidden cursor-pointer group shadow-sm hover:shadow-xl transition-all focus:outline-none focus:ring-2 focus:ring-blue-400">
      <ProjectCover project={p} className="absolute inset-0 w-full h-full block group-hover:scale-105 transition-transform duration-500" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/85 via-slate-900/20 to-transparent" />
      <CoverButton p={p} className="absolute top-3 right-3" />
      <div className="absolute bottom-0 inset-x-0 p-4 text-white">
        <StatusBadge status={p.status} overlay />
        <h3 className="mt-2 font-bold text-base leading-tight truncate" title={p.name}>{p.name}</h3>
        <p className="text-xs text-slate-200 truncate">{[p.client, p.address].filter(Boolean).join(' · ') || 'Sin datos'}</p>
      </div>
    </div>
  );

  const Row = (p: Project) => (
    <tr key={p.id} onClick={() => open(p)} onKeyDown={keyOpen(p)} tabIndex={0}
      className="border-t border-slate-100 hover:bg-blue-50/40 cursor-pointer focus:outline-none focus:bg-blue-50">
      <td className="p-3 w-20"><div className="w-16 h-11 rounded-lg overflow-hidden"><ProjectCover project={p} size="sm" className="w-full h-full block" /></div></td>
      <td className="p-3 min-w-[180px]">
        <div className="font-bold text-slate-800 truncate max-w-xs" title={p.name}>{p.name}</div>
        <div className="text-xs text-slate-500 truncate max-w-xs">{p.client}</div>
      </td>
      <td className="p-3 text-xs text-slate-500 hidden md:table-cell max-w-[220px] truncate">{p.address || '—'}</td>
      <td className="p-3"><StatusBadge status={p.status} /></td>
      <td className="p-3 text-xs text-slate-500 hidden lg:table-cell whitespace-nowrap">{fmtDate(p.startDate) || '—'}</td>
      <td className="p-3 text-xs text-slate-500 hidden lg:table-cell whitespace-nowrap">{fmtDate(p.endDate) || '—'}</td>
      <td className="p-3 w-36 hidden sm:table-cell"><Progress value={progressOf(p)} /></td>
      <td className="p-3 w-12 text-right">{canCreate && (
        <button onClick={e => { e.stopPropagation(); setCoverFor(p); }} title="Cambiar portada" aria-label={`Cambiar portada de ${p.name}`}
          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"><Camera size={15} /></button>
      )}</td>
    </tr>
  );

  const Mini = (p: Project) => (
    <div key={p.id} role="button" tabIndex={0} onClick={() => open(p)} onKeyDown={keyOpen(p)}
      className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md cursor-pointer overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-400">
      <div className="relative h-20"><ProjectCover project={p} className="w-full h-full block" /><CoverButton p={p} className="absolute top-2 right-2" /></div>
      <div className="p-3 space-y-1">
        <div className="font-bold text-sm text-slate-800 truncate" title={p.name}>{p.name}</div>
        {p.client && <div className="text-[11px] text-slate-500 truncate">{p.client}</div>}
        <Progress value={progressOf(p)} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Navbar */}
      <div className="bg-slate-900 text-white px-6 py-4 shadow-md flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg"><HardHat size={24} className="text-white" /></div>
          <div>
            <h1 className="font-bold text-xl leading-none">Obraflow</h1>
            <span className="text-xs text-slate-400">Panel de Proyectos</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right hidden md:block">
            <div className="text-sm font-bold">{user?.name}</div>
            <div className="text-xs text-slate-400 capitalize">{user?.role}</div>
          </div>
          <button onClick={logout}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors border border-slate-700">
            <LogOut size={16} /> <span className="hidden sm:inline">Cerrar Sesión</span>
          </button>
        </div>
      </div>

      {/* Encabezado */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 pt-8 pb-4">
        <div className="max-w-7xl mx-auto space-y-5">
          <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
            <div>
              <h2 className="text-3xl font-black text-slate-800 mb-1">Mis Proyectos</h2>
              <p className="text-slate-500">
                {projects.length === 0 ? 'Todavía no hay obras cargadas.'
                  : `${projects.length} ${projects.length === 1 ? 'obra' : 'obras'} · ${counts.active ?? 0} en ejecución · ${counts.planning ?? 0} en planificación`}
              </p>
            </div>
            {canCreate && (
              <div className="flex flex-wrap gap-2 self-start md:self-auto">
              {/* Con la lista vacía, el recuadro ya ofrece la obra de ejemplo. */}
              {!hasDemo && projects.length > 0 && (
                <button onClick={startDemo}
                  className="bg-white hover:bg-slate-50 text-blue-700 border border-blue-200 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2">
                  <Home size={18} /> Obra de ejemplo
                </button>
              )}
              <button onClick={() => setShowWizard(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-200 flex items-center gap-2 transition-transform active:scale-95 self-start md:self-auto">
                <FolderPlus size={20} /> Nuevo Proyecto
              </button>
              </div>
            )}
          </div>

          {projects.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por obra, cliente o dirección"
                  aria-label="Buscar proyectos"
                  className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
                {query && <button onClick={() => setQuery('')} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={14} /></button>}
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
                {(['all', ...STATUS_ORDER] as const).map(k => (
                  <button key={k} onClick={() => setStatus(k)} aria-pressed={status === k}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${status === k ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                    {k === 'all' ? 'Todas' : STATUS[k].label} <span className="opacity-60">{counts[k] ?? 0}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <label className="text-xs text-slate-500" htmlFor="hub-sort">Ordenar</label>
                <select id="hub-sort" value={sort} onChange={e => setSort(e.target.value as Sort)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                  <option value="recent">Más recientes</option>
                  <option value="name">Nombre</option>
                  <option value="start">Fecha de inicio</option>
                  <option value="status">Estado</option>
                </select>
                <div className="flex bg-slate-100 rounded-lg p-1" role="group" aria-label="Forma de ver los proyectos">
                  {VIEWS.map(v => (
                    <button key={v.key} onClick={() => setView(v.key)} aria-pressed={view === v.key} title={v.label} aria-label={v.label}
                      className={`p-1.5 rounded-md transition-colors ${view === v.key ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      {v.icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 w-full px-4 sm:px-8 py-6 sm:py-8">
       <div className="max-w-7xl mx-auto">
        {projects.length === 0 ? (
          <div className="py-20 text-center border-2 border-dashed border-slate-300 rounded-2xl bg-white/50">
            <FolderPlus size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-bold text-slate-600">Todavía no hay obras</h3>
            <p className="text-slate-500 text-sm mb-6 max-w-md mx-auto">Para conocer ObraFlow, abrí la obra de ejemplo: una vivienda de 70 m² con cómputo, presupuesto y análisis de costos completos. O empezá tu propia obra.</p>
            {canCreate && (
              <div className="flex flex-wrap justify-center gap-3">
                <button onClick={startDemo} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2"><Home size={16} /> Explorá la obra de ejemplo</button>
                <button onClick={() => setShowWizard(true)} className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2"><FolderPlus size={16} /> Crear mi obra</button>
              </div>
            )}
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            No hay obras que coincidan con la búsqueda.
            <button onClick={() => { setQuery(''); setStatus('all'); }} className="ml-2 text-blue-600 font-bold hover:underline">Ver todas</button>
          </div>
        ) : view === 'gallery' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">{visible.map(Tile)}</div>
        ) : view === 'list' ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="p-3 text-left" aria-label="Portada" />
                  <th className="p-3 text-left">Obra</th>
                  <th className="p-3 text-left hidden md:table-cell">Dirección</th>
                  <th className="p-3 text-left">Estado</th>
                  <th className="p-3 text-left hidden lg:table-cell">Inicio</th>
                  <th className="p-3 text-left hidden lg:table-cell">Fin</th>
                  <th className="p-3 text-left hidden sm:table-cell">Avance</th>
                  <th className="p-3" aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>{visible.map(Row)}</tbody>
            </table>
          </div>
        ) : view === 'board' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
            {STATUS_ORDER.filter(s => status === 'all' || s === status).map(s => {
              const col = visible.filter(p => p.status === s);
              return (
                <section key={s} className="bg-slate-100/70 rounded-2xl p-3 space-y-3" aria-label={STATUS[s].label}>
                  <h3 className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase px-1">
                    <span className={`w-2 h-2 rounded-full ${STATUS[s].dot}`} /> {STATUS[s].label}
                    <span className="ml-auto text-slate-400">{col.length}</span>
                  </h3>
                  {col.length === 0 ? <p className="text-xs text-slate-400 px-1 pb-2">Sin obras.</p> : col.map(Mini)}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{visible.map(Card)}</div>
        )}
       </div>
      </div>

      {showWizard && <ProjectWizard initialMode="create" onComplete={() => setShowWizard(false)} />}
      {coverFor && <CoverPicker project={coverFor} onClose={() => setCoverFor(null)} />}
    </div>
  );
};
