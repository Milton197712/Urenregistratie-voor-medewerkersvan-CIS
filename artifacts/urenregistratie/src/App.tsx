import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  getGetDashboardQueryKey,
  getHealthCheckQueryKey,
  getListEmployeesQueryKey,
  getListOvertimeRequestsQueryKey,
  getListProjectsQueryKey,
  getListTimeEntriesQueryKey,
  useCreateOvertimeRequest,
  useCreateTimeEntry,
  useDecideOvertimeRequest,
  useGetDashboard,
  useHealthCheck,
  useListEmployees,
  useListOvertimeRequests,
  useListProjects,
  useListTimeEntries,
  useUpdateTimeEntry,
} from '@workspace/api-client-react';
import type { Employee, OvertimeRequest, Project, TimeEntry } from '@workspace/api-client-react';
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Clock3,
  Coffee,
  Download,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Pencil,
  RefreshCw,
  Settings,
  ShieldCheck,
  TimerReset,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient();
const today = new Date().toISOString().slice(0, 10);
const todayLabel = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

const employeeFallback: Employee[] = [
  { id: 1, name: 'Sophie van Dijk', role: 'Medewerker', initials: 'SV', department: 'Product' },
  { id: 2, name: 'Milan de Boer', role: 'Medewerker', initials: 'MB', department: 'Sales' },
  { id: 3, name: 'Noor Jansen', role: 'Teamlead', initials: 'NJ', department: 'Operations' },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`));
}

function formatLongDate(date: string) {
  return new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`));
}

function formatHours(value: number) {
  return `${value.toFixed(1).replace('.', ',')} uur`;
}

function StatusPill({ status }: { status: string }) {
  const labels: Record<string, string> = { complete: 'Afgerond', open: 'Open', pending: 'In behandeling', approved: 'Goedgekeurd', rejected: 'Afgewezen', absent: 'Afwezig', corrected: 'Gecorrigeerd' };
  const tone = status === 'complete' || status === 'approved' || status === 'corrected' ? 'good' : status === 'pending' || status === 'open' ? 'warn' : status === 'rejected' || status === 'absent' ? 'bad' : 'neutral';
  return <span data-testid={`status-pill-${status}`} className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide', tone === 'good' && 'bg-[hsl(168_31%_43%/0.12)] text-[hsl(168_31%_33%)]', tone === 'warn' && 'bg-[hsl(38_86%_65%/0.2)] text-[hsl(28_70%_32%)]', tone === 'bad' && 'bg-[hsl(2_61%_49%/0.12)] text-[hsl(2_61%_40%)]', tone === 'neutral' && 'bg-secondary text-muted-foreground')}><span className={cx('h-1.5 w-1.5 rounded-full', tone === 'good' && 'bg-[hsl(168_31%_43%)]', tone === 'warn' && 'bg-[hsl(38_86%_55%)]', tone === 'bad' && 'bg-[hsl(2_61%_49%)]', tone === 'neutral' && 'bg-muted-foreground')} />{labels[status] ?? status}</span>;
}

function Avatar({ employee, size = 'md' }: { employee?: Pick<Employee, 'initials' | 'name'>; size?: 'sm' | 'md' | 'lg' }) {
  return <div data-testid={`avatar-${employee?.initials ?? 'user'}`} title={employee?.name} className={cx('flex shrink-0 items-center justify-center rounded-full bg-[hsl(38_86%_65%)] font-bold text-[hsl(218_31%_18%)]', size === 'sm' && 'h-7 w-7 text-[10px]', size === 'md' && 'h-9 w-9 text-xs', size === 'lg' && 'h-12 w-12 text-sm')}>{employee?.initials ?? 'SV'}</div>;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-secondary/70', className)} />;
}

function QueryState({ loading, error, onRetry, children }: { loading?: boolean; error?: boolean; onRetry?: () => void; children: ReactNode }) {
  if (loading) return <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-40 w-full" /></div>;
  if (error) return <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center"><CircleAlert className="mb-3 h-7 w-7 text-[hsl(2_61%_49%)]" /><h3 className="font-semibold">De gegevens konden niet worden geladen</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">Probeer het opnieuw. Je uren blijven lokaal ongewijzigd.</p><button data-testid="button-retry" onClick={onRetry} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"><RefreshCw className="h-4 w-4" />Opnieuw proberen</button></div>;
  return <>{children}</>;
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    if (standalone) setInstalled(true);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (installed || !installPrompt) return null;

  return <button
    data-testid="button-install-app"
    aria-label="Installeer Tijdvast"
    onClick={() => {
      void installPrompt.prompt().then(() => installPrompt.userChoice).then(() => setInstallPrompt(null));
    }}
    className="inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
  >
    <Download className="h-3.5 w-3.5" />
    <span className="hidden sm:inline">Installeer app</span>
  </button>;
}

function Shell({ children, employee, roleMode, onRoleMode }: { children: ReactNode; employee: Employee; roleMode: 'employee' | 'admin'; onRoleMode: (role: 'employee' | 'admin') => void }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = roleMode === 'admin' ? [{ href: '/beheer', label: 'Beheer', icon: ShieldCheck }, { href: '/instellingen', label: 'Instellingen', icon: Settings }] : [{ href: '/', label: 'Mijn werkdag', icon: LayoutDashboard }, { href: '/instellingen', label: 'Instellingen', icon: Settings }];
  return <div className="min-h-[100dvh] bg-background">
    <aside className={cx('fixed inset-y-0 left-0 z-30 flex w-[252px] flex-col bg-sidebar px-5 py-6 text-sidebar-foreground transition-transform lg:translate-x-0', mobileOpen ? 'translate-x-0' : '-translate-x-full')}>
      <div className="flex items-center gap-3 px-2"><div className="grid h-10 w-10 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Clock3 className="h-5 w-5" /></div><div><div className="font-semibold tracking-tight">Tijdvast</div><div className="text-[11px] text-sidebar-foreground/55">Werkdagregistratie</div></div></div>
      <div className="mt-12 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/40">Werkruimte</div>
      <nav className="mt-3 space-y-1">
        {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`link-${label.toLowerCase()}`} onClick={() => setMobileOpen(false)} className={cx('group flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium', location === href ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground')}><span className="flex items-center gap-3"><Icon className="h-[18px] w-[18px]" />{label}</span>{location === href && <ChevronRight className="h-4 w-4 text-sidebar-primary" />}</Link>)}
      </nav>
      <div className="mt-auto rounded-2xl border border-sidebar-border bg-sidebar-accent/50 p-3"><div className="flex items-center gap-3"><Avatar employee={employee} size="sm" /><div className="min-w-0"><div className="truncate text-sm font-semibold">{employee.name}</div><div className="text-[11px] text-sidebar-foreground/50">{employee.department}</div></div></div><button data-testid="button-switch-role-sidebar" onClick={() => onRoleMode(roleMode === 'admin' ? 'employee' : 'admin')} className="mt-3 flex w-full items-center justify-between rounded-lg border border-sidebar-border px-2.5 py-2 text-[11px] text-sidebar-foreground/65 hover:bg-sidebar-accent"><span>{roleMode === 'admin' ? 'Bekijk medewerker' : 'Demo: beheerder'}</span><ArrowRight className="h-3.5 w-3.5" /></button></div>
    </aside>
    {mobileOpen && <button aria-label="Sluit menu" data-testid="button-close-menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-20 bg-[hsl(218_31%_18%/0.4)] lg:hidden" />}
    <main className="lg:pl-[252px]"><header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-border/80 bg-background/90 px-5 backdrop-blur-md sm:px-8"><div className="flex items-center gap-3"><button aria-label="Open menu" data-testid="button-open-menu" onClick={() => setMobileOpen(true)} className="rounded-lg p-2 hover:bg-secondary lg:hidden"><Menu className="h-5 w-5" /></button><div className="hidden text-xs text-muted-foreground sm:block">Donderdag · {todayLabel.split(' · ')[1] ?? todayLabel}</div><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground sm:hidden"><span className="h-2 w-2 rounded-full bg-[hsl(168_31%_43%)]" />Vandaag</div></div><div className="flex items-center gap-3"><InstallAppButton /><div className="hidden text-right sm:block"><div className="text-xs font-semibold">{roleMode === 'admin' ? 'Beheerder' : 'Medewerker'}</div><div className="text-[11px] text-muted-foreground">Demo-omgeving</div></div><Avatar employee={employee} size="sm" /></div></header>{children}</main>
  </div>;
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[hsl(168_31%_43%)]">{eyebrow}</div><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">{title}</h1>{description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}</div>{action}</div>;
}

function Metric({ label, value, detail, accent = false }: { label: string; value: string | number; detail?: string; accent?: boolean }) {
  return <div className={cx('rounded-2xl border border-card-border bg-card p-4 shadow-sm', accent && 'bg-[hsl(218_31%_18%)] text-[hsl(41_33%_91%)]')}><div className={cx('text-[11px] font-semibold uppercase tracking-[0.12em]', accent ? 'text-[hsl(41_33%_91%/0.55)]' : 'text-muted-foreground')}>{label}</div><div className="mt-2 flex items-baseline gap-2"><div className={cx('font-mono text-2xl font-bold tabular-nums', accent ? 'text-[hsl(38_86%_65%)]' : 'text-foreground')}>{value}</div>{detail && <div className={cx('text-xs', accent ? 'text-[hsl(41_33%_91%/0.6)]' : 'text-muted-foreground')}>{detail}</div>}</div></div>;
}

function ClockActions({ entry, employeeId, projects, onSuccess }: { entry?: TimeEntry; employeeId: number; projects: Project[]; onSuccess: () => void }) {
  const create = useCreateTimeEntry();
  const [projectId, setProjectId] = useState<number | ''>('');
  useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id);
  }, [projectId, projects]);
  const now = () => new Date().toTimeString().slice(0, 5);
  const action = !entry ? 'clock_in' : entry.status === 'open' && !entry.breakStart ? 'break_start' : entry.status === 'open' && !entry.breakEnd ? 'break_end' : 'clock_out';
  const labels = { clock_in: 'Start werkdag', break_start: 'Start pauze', break_end: 'Pauze beëindigen', clock_out: 'Werkdag afsluiten' };
  const icons = { clock_in: LogIn, break_start: Coffee, break_end: TimerReset, clock_out: LogOut };
  const Icon = icons[action];
  const disabled = create.isPending || !projects.length || (action === 'clock_in' && !projectId) || (action === 'clock_out' && !entry?.breakEnd && !!entry?.breakStart);
  return <div className="space-y-3">{!entry && <label className="block text-xs font-semibold">Project voor deze werkdag<select data-testid="select-clock-project" value={projectId} onChange={(event) => setProjectId(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm"><option value="" disabled>Kies een project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name} — {project.client}</option>)}</select></label>}{entry?.projectName && <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3.5 py-3 text-xs"><span className="text-muted-foreground">Project</span><span className="font-semibold">{entry.projectName}</span></div>}<button data-testid={`button-${action}`} disabled={disabled} onClick={() => create.mutate({ data: { employeeId, projectId: entry?.projectId ?? (projectId || undefined), date: today, action, time: now() } }, { onSuccess })} className={cx('group flex w-full items-center justify-between rounded-2xl px-5 py-4 text-left font-semibold shadow-sm', action === 'clock_out' ? 'border border-border bg-card text-foreground hover:border-primary/40' : 'bg-primary text-primary-foreground hover:shadow-md', disabled && 'cursor-not-allowed opacity-50')}><span className="flex items-center gap-3"><span className={cx('grid h-9 w-9 place-items-center rounded-xl', action === 'clock_out' ? 'bg-secondary' : 'bg-[hsl(38_86%_65%/0.18)]')}><Icon className="h-[18px] w-[18px]" /></span>{create.isPending ? 'Moment…' : labels[action]}</span><ArrowRight className="h-4 w-4 opacity-60 transition-transform group-hover:translate-x-1" /></button></div>;
}

function EmployeeWorkspace({ employee }: { employee: Employee }) {
  const qc = useQueryClient();
  const dashboard = useGetDashboard();
  const entries = useListTimeEntries({ employeeId: employee.id });
  const projects = useListProjects();
  const overtime = useListOvertimeRequests();
  const [showRequest, setShowRequest] = useState(false);
  const [request, setRequest] = useState({ cutoff: '16:30', requestedUntil: '18:00', reason: '' });
  const createOvertime = useCreateOvertimeRequest();
  const entry = useMemo(() => (entries.data ?? []).find((item) => item.employeeId === employee.id && item.date === today), [entries.data, employee.id]);
  const employeeStatus = dashboard.data?.employees?.find((item) => item.employeeId === employee.id);
  const recent = (entries.data ?? []).filter((item) => item.date !== today).slice(0, 5);
  const refresh = () => { void qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); void qc.invalidateQueries({ queryKey: getListTimeEntriesQueryKey({ employeeId: employee.id }) }); void qc.invalidateQueries({ queryKey: getListOvertimeRequestsQueryKey() }); };
  return <div className="mx-auto max-w-[1240px] px-5 py-8 sm:px-8 sm:py-10">
    <SectionHeading eyebrow="Mijn werkdag" title={`Goedemorgen, ${employee.name.split(' ')[0]}.`} description={`${todayLabel} · alles netjes bijgehouden.`} action={<div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-[hsl(168_31%_43%)] pulse-line" />Systeem actief</div>} />
    <QueryState loading={dashboard.isLoading || entries.isLoading || projects.isLoading} error={!!dashboard.error || !!entries.error || !!projects.error} onRetry={refresh}>
      <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <section className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm"><div className="flex items-start justify-between border-b border-border/70 p-5 sm:p-6"><div><div className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Vandaag</div><div className="mt-2 font-mono text-4xl font-bold tracking-tight tabular-nums">{entry?.startTime ?? '—:—'}</div><div className="mt-1 text-sm text-muted-foreground">{entry ? entry.endTime ? `Afgerond om ${entry.endTime}` : 'Werkdag loopt' : 'Nog niet gestart'}</div></div><StatusPill status={entry?.status ?? 'open'} /></div><div className="grid grid-cols-2 divide-x divide-border/70 sm:grid-cols-4"><div className="p-5"><div className="text-[11px] text-muted-foreground">Start</div><div className="mt-1 font-mono text-lg tabular-nums">{entry?.startTime ?? '—'}</div></div><div className="p-5"><div className="text-[11px] text-muted-foreground">Pauze</div><div className="mt-1 font-mono text-lg tabular-nums">{entry?.breakStart ?? '—'}</div></div><div className="p-5"><div className="text-[11px] text-muted-foreground">Hervat</div><div className="mt-1 font-mono text-lg tabular-nums">{entry?.breakEnd ?? '—'}</div></div><div className="p-5"><div className="text-[11px] text-muted-foreground">Totaal</div><div className="mt-1 font-mono text-lg tabular-nums">{entry ? formatHours(entry.totalHours) : '—'}</div></div></div><div className="border-t border-border/70 p-5 sm:p-6"><ClockActions entry={entry} employeeId={employee.id} projects={projects.data ?? []} onSuccess={refresh} /></div></section>
        <div className="space-y-5"><Metric label="Deze week" value={formatHours((entries.data ?? []).filter((e) => e.date >= today.slice(0, 8)).reduce((sum, e) => sum + e.totalHours, 0))} detail="geregistreerd" accent /><div className="rounded-2xl border border-card-border bg-card p-5 shadow-sm"><div className="flex items-center justify-between"><div><div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Dagritme</div><div className="mt-2 font-semibold">{employeeStatus?.status === 'complete' ? 'Netjes afgerond' : entry ? 'Goed bezig' : 'Klaar om te beginnen'}</div></div><div className="grid h-11 w-11 place-items-center rounded-full bg-secondary"><CalendarDays className="h-5 w-5 text-[hsl(168_31%_43%)]" /></div></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-[hsl(168_31%_43%)] transition-all" style={{ width: `${Math.min(100, ((entry?.totalHours ?? 0) / 8) * 100)}%` }} /></div><div className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>{formatHours(entry?.totalHours ?? 0)}</span><span>8 uur gepland</span></div></div></div>
      </div>
      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_370px]">
        <section className="rounded-2xl border border-card-border bg-card shadow-sm"><div className="flex items-center justify-between border-b border-border/70 px-5 py-4 sm:px-6"><div><h2 className="font-semibold">Recente dagen</h2><p className="mt-0.5 text-xs text-muted-foreground">Je laatste registraties op een rij</p></div><Link data-testid="link-beheer-overzicht" href="/beheer" className="hidden items-center gap-1 text-xs font-semibold text-[hsl(168_31%_43%)] hover:gap-2 sm:flex">Overzicht <ArrowRight className="h-3.5 w-3.5" /></Link></div>{recent.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">Je eerdere werkdagen verschijnen hier.</div> : <div className="divide-y divide-border/60">{recent.map((item) => <div data-testid={`row-recent-${item.id}`} key={item.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-5 py-4 sm:grid-cols-[1fr_110px_95px_100px] sm:px-6"><div><div className="text-sm font-semibold">{formatLongDate(item.date)}</div><div className="mt-0.5 text-xs text-muted-foreground">{item.note || 'Geen notitie'}</div></div><div className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:block">{item.startTime ?? '—'} – {item.endTime ?? '—'}</div><div className="font-mono text-sm tabular-nums">{formatHours(item.totalHours)}</div><StatusPill status={item.status} /></div>)}</div>}</section>
        <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm sm:p-6"><div className="flex items-start justify-between"><div><h2 className="font-semibold">Langer doorwerken?</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Vraag vooraf toestemming aan voor werk na je cutoff.</p></div><Clock3 className="h-5 w-5 text-[hsl(38_70%_46%)]" /></div><button data-testid="button-open-overtime" onClick={() => setShowRequest((value) => !value)} className="mt-5 flex w-full items-center justify-between rounded-xl border border-border px-3.5 py-3 text-sm font-semibold hover:border-[hsl(38_70%_46%)] hover:bg-secondary"><span>{showRequest ? 'Aanvraag sluiten' : 'Overuren aanvragen'}</span>{showRequest ? <X className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}</button>{showRequest && <form className="mt-4 space-y-3 border-t border-border pt-4" onSubmit={(event) => { event.preventDefault(); createOvertime.mutate({ data: { employeeId: employee.id, date: today, cutoff: request.cutoff as '12:00' | '16:30', requestedUntil: request.requestedUntil, reason: request.reason } }, { onSuccess: () => { setShowRequest(false); setRequest({ cutoff: '16:30', requestedUntil: '18:00', reason: '' }); refresh(); } }); }}><label className="block text-xs font-semibold">Cutoff<select data-testid="select-overtime-cutoff" value={request.cutoff} onChange={(e) => setRequest({ ...request, cutoff: e.target.value })} className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"><option value="16:30">16:30 · normale dag</option><option value="12:00">12:00 · korte dag</option></select></label><label className="block text-xs font-semibold">Tot hoe laat?<input data-testid="input-overtime-until" required type="time" value={request.requestedUntil} onChange={(e) => setRequest({ ...request, requestedUntil: e.target.value })} className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm" /></label><label className="block text-xs font-semibold">Reden<textarea data-testid="input-overtime-reason" required rows={2} value={request.reason} onChange={(e) => setRequest({ ...request, reason: e.target.value })} placeholder="Bijvoorbeeld: oplevering klantproject" className="mt-1.5 w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60" /></label><button data-testid="button-submit-overtime" disabled={createOvertime.isPending} className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{createOvertime.isPending ? 'Versturen…' : 'Aanvraag versturen'}</button>{createOvertime.isError && <p className="text-xs text-[hsl(2_61%_49%)]">Aanvraag niet verstuurd. Probeer opnieuw.</p>}</form>}<div className="mt-5 space-y-2">{(overtime.data ?? []).filter((item) => item.employeeId === employee.id).slice(0, 2).map((item) => <div data-testid={`overtime-status-${item.id}`} key={item.id} className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2.5 text-xs"><span>{formatDate(item.date)} · tot {item.requestedUntil}</span><StatusPill status={item.status} /></div>)}</div></section>
      </div>
    </QueryState>
  </div>;
}

function AdminWorkspace() {
  const qc = useQueryClient();
  const dashboard = useGetDashboard();
  const employees = useListEmployees();
  const projects = useListProjects();
  const entries = useListTimeEntries();
  const overtime = useListOvertimeRequests();
  const update = useUpdateTimeEntry();
  const decide = useDecideOvertimeRequest();
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [tab, setTab] = useState<'team' | 'entries' | 'overtime'>('team');
  const refresh = () => { void qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); void qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() }); void qc.invalidateQueries({ queryKey: getListProjectsQueryKey() }); void qc.invalidateQueries({ queryKey: getListTimeEntriesQueryKey() }); void qc.invalidateQueries({ queryKey: getListOvertimeRequestsQueryKey() }); };
  const pendingRequests = (overtime.data ?? []).filter((item) => item.status === 'pending');
  return <div className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8 sm:py-10">
    <SectionHeading eyebrow="Beheerdersruimte" title="Goed overzicht, snelle actie." description="Controleer uitzonderingen voordat ze een probleem worden." action={<div className="flex items-center gap-2 text-xs text-muted-foreground"><div className="h-2 w-2 rounded-full bg-[hsl(168_31%_43%)]" />Laatste sync zojuist</div>} />
    <QueryState loading={dashboard.isLoading || employees.isLoading || projects.isLoading || entries.isLoading || overtime.isLoading} error={!!dashboard.error || !!employees.error || !!projects.error || !!entries.error || !!overtime.error} onRetry={refresh}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Aanwezig vandaag" value={dashboard.data?.present ?? 0} detail={`van ${employees.data?.length ?? 0}`} accent /><Metric label="Afgerond" value={dashboard.data?.complete ?? 0} detail="werkdagen" /><Metric label="Open registraties" value={dashboard.data?.open ?? 0} detail="actie nodig" /><Metric label="Overuren" value={dashboard.data?.overtimePending ?? pendingRequests.length} detail="in behandeling" /></div>
      <section className="mt-8 overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm"><div className="flex flex-col gap-3 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="flex gap-1 rounded-lg bg-secondary p-1">{([['team', 'Team vandaag'], ['entries', 'Tijdregistraties'], ['overtime', `Overuren${pendingRequests.length ? ` · ${pendingRequests.length}` : ''}`]] as const).map(([value, label]) => <button key={value} data-testid={`tab-admin-${value}`} onClick={() => setTab(value)} className={cx('rounded-md px-3 py-2 text-xs font-semibold', tab === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{label}</button>)}</div><div className="text-xs text-muted-foreground">{formatLongDate(today)}</div></div>
        {tab === 'team' && <TeamTable dashboard={dashboard.data} employees={employees.data ?? []} />}
         {tab === 'entries' && <EntriesTable entries={entries.data ?? []} onEdit={setEditing} />}
        {tab === 'overtime' && <OvertimeTable requests={overtime.data ?? []} onDecide={(id, status) => decide.mutate({ id, data: { status } }, { onSuccess: refresh })} pending={decide.isPending} />}
      </section>
    </QueryState>
     {editing && <EditEntryDialog entry={editing} projects={projects.data ?? []} pending={update.isPending} onClose={() => setEditing(null)} onSave={(data) => update.mutate({ id: editing.id, data }, { onSuccess: () => { setEditing(null); refresh(); } })} />}
  </div>;
}

function TeamTable({ dashboard, employees }: { dashboard?: { employees?: Array<{ employeeId: number; employeeName: string; status: string; startTime: string | null; endTime: string | null; totalHours: number }> }; employees: Employee[] }) {
  const rows = dashboard?.employees ?? employees.map((employee) => ({ employeeId: employee.id, employeeName: employee.name, status: 'absent', startTime: null, endTime: null, totalHours: 0 }));
  if (!rows.length) return <div className="p-12 text-center text-sm text-muted-foreground">Nog geen teamleden beschikbaar.</div>;
  return <div className="divide-y divide-border/60">{rows.map((row) => { const employee = employees.find((item) => item.id === row.employeeId); return <div data-testid={`row-team-${row.employeeId}`} key={row.employeeId} className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 sm:grid-cols-[1.5fr_130px_130px_110px_115px] sm:px-6"><div className="flex min-w-0 items-center gap-3"><Avatar employee={employee ?? { initials: row.employeeName.slice(0, 2).toUpperCase(), name: row.employeeName }} size="sm" /><div className="min-w-0"><div className="truncate text-sm font-semibold">{row.employeeName}</div><div className="text-xs text-muted-foreground">{employee?.department ?? 'Team'}</div></div></div><StatusPill status={row.status} /><div className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:block">{row.startTime ?? '—'}</div><div className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:block">{row.endTime ?? '—'}</div><div className="text-right font-mono text-sm tabular-nums">{formatHours(row.totalHours)}</div></div>; })}</div>;
}

function EntriesTable({ entries, onEdit }: { entries: TimeEntry[]; onEdit: (entry: TimeEntry) => void }) {
  if (!entries.length) return <div className="p-12 text-center text-sm text-muted-foreground">Er zijn nog geen tijdregistraties.</div>;
  return <div className="divide-y divide-border/60">{entries.map((entry) => <div data-testid={`row-entry-${entry.id}`} key={entry.id} className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 sm:grid-cols-[1.15fr_.9fr_1fr_1fr_100px_90px_42px] sm:px-6"><div><div className="text-sm font-semibold">{entry.employeeName}</div><div className="text-xs text-muted-foreground">{formatDate(entry.date)}</div></div><div className="hidden truncate text-xs text-muted-foreground sm:block">{entry.projectName ?? 'Geen project'}</div><div className="hidden text-xs text-muted-foreground sm:block">{entry.startTime ?? '—'} – {entry.endTime ?? '—'}</div><div className="hidden text-xs text-muted-foreground sm:block">{entry.breakStart ? `Pauze ${entry.breakStart}` : 'Geen pauze'}</div><div className="font-mono text-sm tabular-nums">{formatHours(entry.totalHours)}</div><StatusPill status={entry.status} /><button aria-label={`Bewerk ${entry.employeeName}`} data-testid={`button-edit-entry-${entry.id}`} onClick={() => onEdit(entry)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"><Pencil className="h-4 w-4" /></button></div>)}</div>;
}

function OvertimeTable({ requests, onDecide, pending }: { requests: OvertimeRequest[]; onDecide: (id: number, status: 'approved' | 'rejected') => void; pending: boolean }) {
  if (!requests.length) return <div className="p-12 text-center text-sm text-muted-foreground">Geen overurenaanvragen. Alles loopt volgens plan.</div>;
  return <div className="divide-y divide-border/60">{requests.map((request) => <div data-testid={`row-overtime-${request.id}`} key={request.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1.1fr_110px_1.5fr_100px_auto] sm:items-center sm:px-6"><div><div className="text-sm font-semibold">{request.employeeName}</div><div className="text-xs text-muted-foreground">{formatDate(request.date)} · cutoff {request.cutoff}</div></div><div className="font-mono text-sm tabular-nums">tot {request.requestedUntil}</div><div className="text-xs text-muted-foreground">{request.reason}</div><StatusPill status={request.status} />{request.status === 'pending' ? <div className="flex gap-2"><button disabled={pending} data-testid={`button-approve-overtime-${request.id}`} onClick={() => onDecide(request.id, 'approved')} className="rounded-lg bg-[hsl(168_31%_43%)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">Goedkeuren</button><button disabled={pending} data-testid={`button-reject-overtime-${request.id}`} onClick={() => onDecide(request.id, 'rejected')} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary disabled:opacity-50">Afwijzen</button></div> : <div />} </div>)}</div>;
}

function EditEntryDialog({ entry, projects, pending, onClose, onSave }: { entry: TimeEntry; projects: Project[]; pending: boolean; onClose: () => void; onSave: (data: { projectId?: number | null; startTime?: string; breakStart?: string | null; breakEnd?: string | null; endTime?: string | null; note?: string }) => void }) {
  const [form, setForm] = useState({ projectId: entry.projectId ?? '', startTime: entry.startTime ?? '', breakStart: entry.breakStart ?? '', breakEnd: entry.breakEnd ?? '', endTime: entry.endTime ?? '', note: entry.note ?? '' });
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[hsl(218_31%_18%/0.45)] p-4" role="dialog"><div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"><div className="flex items-start justify-between"><div><div className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Correctie</div><h2 className="mt-1 text-xl font-semibold">{entry.employeeName}</h2><p className="mt-1 text-sm text-muted-foreground">{formatLongDate(entry.date)}</p></div><button aria-label="Sluit correctie" data-testid="button-close-edit-entry" onClick={onClose} className="rounded-lg p-2 hover:bg-secondary"><X className="h-4 w-4" /></button></div><label className="mt-6 block text-xs font-semibold">Project<select data-testid="select-edit-project" value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value ? Number(event.target.value) : '' })} className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"><option value="">Geen project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label><div className="mt-4 grid grid-cols-2 gap-3">{[['startTime', 'Start'], ['breakStart', 'Pauze start'], ['breakEnd', 'Pauze einde'], ['endTime', 'Einde']].map(([key, label]) => <label key={key} className="text-xs font-semibold">{label}<input data-testid={`input-edit-${key}`} type="time" value={form[key as keyof typeof form]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 font-mono text-sm" /></label>)}</div><label className="mt-3 block text-xs font-semibold">Notitie<textarea data-testid="input-edit-note" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="mt-1.5 w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm" /></label><div className="mt-6 flex justify-end gap-2"><button data-testid="button-cancel-edit-entry" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-secondary">Annuleren</button><button data-testid="button-save-edit-entry" disabled={pending} onClick={() => onSave({ projectId: typeof form.projectId === 'number' ? form.projectId : null, startTime: form.startTime || undefined, breakStart: form.breakStart || null, breakEnd: form.breakEnd || null, endTime: form.endTime || null, note: form.note || undefined })} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{pending ? 'Opslaan…' : 'Correctie opslaan'}</button></div></div></div>;
}

function SettingsPage({ employee, employees, onEmployee, roleMode, onRoleMode }: { employee: Employee; employees: Employee[]; onEmployee: (employee: Employee) => void; roleMode: 'employee' | 'admin'; onRoleMode: (role: 'employee' | 'admin') => void }) {
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  return <div className="mx-auto max-w-[1000px] px-5 py-8 sm:px-8 sm:py-10"><SectionHeading eyebrow="Instellingen" title="De afspraken achter de klok." description="Beleid en demo-profiel voor deze werkruimte." /><div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]"><section className="rounded-2xl border border-card-border bg-card shadow-sm"><div className="border-b border-border/70 px-5 py-4 sm:px-6"><h2 className="font-semibold">Werkdagbeleid</h2><p className="mt-1 text-xs text-muted-foreground">De vaste kaders voor een voorspelbare dag.</p></div><div className="divide-y divide-border/60">{[['Normale dag', '07:30 – 16:30', '8 uur werktijd · pauze van 12:00 tot 13:00'], ['Ochtend', '07:30 – 12:00', '4,5 uur werktijd'], ['Middag', '13:00 – 16:30', '3,5 uur werktijd'], ['Overuren aanvragen', 'vóór cutoff', 'Vraag toestemming voordat je doorwerkt'], ['Automatische klok', '12:00 · 16:30', 'Automatische uitklok wordt gemarkeerd voor controle']].map(([label, value, detail]) => <div key={label} className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6"><div><div className="text-sm font-semibold">{label}</div><div className="mt-1 text-xs text-muted-foreground">{detail}</div></div><div className="shrink-0 font-mono text-sm tabular-nums text-[hsl(168_31%_43%)]">{value}</div></div>)}</div></section><div className="space-y-5"><section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><UserRound className="h-5 w-5 text-[hsl(168_31%_43%)]" /><div><h2 className="font-semibold">Demo-profiel</h2><p className="text-xs text-muted-foreground">Wissel om beide werkruimtes te bekijken.</p></div></div><label className="mt-5 block text-xs font-semibold">Medewerker<select data-testid="select-demo-employee" value={employee.id} onChange={(e) => { const next = employees.find((item) => item.id === Number(e.target.value)); if (next) onEmployee(next); }} className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm">{employees.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.department}</option>)}</select></label><div className="mt-4 flex gap-2"><button data-testid="button-role-employee" onClick={() => onRoleMode('employee')} className={cx('flex-1 rounded-lg border px-3 py-2.5 text-xs font-semibold', roleMode === 'employee' ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-secondary')}>Medewerker</button><button data-testid="button-role-admin" onClick={() => onRoleMode('admin')} className={cx('flex-1 rounded-lg border px-3 py-2.5 text-xs font-semibold', roleMode === 'admin' ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-secondary')}>Beheerder</button></div></section><section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm sm:p-6"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Verbinding</h2><p className="mt-1 text-xs text-muted-foreground">Controle van de registratie-service.</p></div><span data-testid="status-health" className={cx('h-2.5 w-2.5 rounded-full', health.isError ? 'bg-[hsl(2_61%_49%)]' : 'bg-[hsl(168_31%_43%)]')} /></div><div className="mt-4 flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2.5 text-xs"><span className="text-muted-foreground">API status</span><span className="font-semibold">{health.isLoading ? 'Controleren…' : health.isError ? 'Niet beschikbaar' : health.data?.status ?? 'Operationeel'}</span></div></section></div></div></div>;
}

function Router({ employee, employees, roleMode, onEmployee, onRoleMode }: { employee: Employee; employees: Employee[]; roleMode: 'employee' | 'admin'; onEmployee: (employee: Employee) => void; onRoleMode: (role: 'employee' | 'admin') => void }) {
  return <ErrorBoundary resetKey={location.pathname}><Shell employee={employee} roleMode={roleMode} onRoleMode={onRoleMode}><Switch><Route path="/"><EmployeeWorkspace employee={employee} /></Route><Route path="/beheer"><AdminWorkspace /></Route><Route path="/instellingen"><SettingsPage employee={employee} employees={employees} onEmployee={onEmployee} roleMode={roleMode} onRoleMode={onRoleMode} /></Route><Route component={NotFound} /></Switch></Shell></ErrorBoundary>;
}

function AppContent() {
  const employeeQuery = useListEmployees();
  const [employee, setEmployee] = useState<Employee>(employeeFallback[0]);
  const [roleMode, setRoleMode] = useState<'employee' | 'admin'>('employee');
  const employees = employeeQuery.data?.length ? employeeQuery.data : employeeFallback;
  useEffect(() => { const selected = employees.find((item) => item.id === employee.id); if (selected && selected !== employee) setEmployee(selected); }, [employees, employee]);
  return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router employee={employee} employees={employees} roleMode={roleMode} onEmployee={setEmployee} onRoleMode={setRoleMode} /></WouterRouter>;
}

function App() {
  return <QueryClientProvider client={queryClient}><AppContent /></QueryClientProvider>;
}

export default App;