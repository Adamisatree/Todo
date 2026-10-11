import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Archive, ArrowDown, ArrowDownUp, ArrowRight, ArrowUp, Bell, CalendarDays, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clock3, Download, Flag, Focus, GripVertical, Inbox, LayoutGrid, ListFilter, Menu, MoreHorizontal, Pause, Play, Plus, RotateCcw, Search, Settings2, SkipForward, Sparkles, Star, Sun, Moon, Tag, Trash2, Upload, X } from 'lucide-react';
import type { AppData, Priority, Project, Sort, Task, View } from './types';
import { addDays, completeTask, estimateFromParts, extraToday, formatEstimate, inView, isOverdue, localDay, plannedMinutes, priorityText, relativeDay, reorderVisibleTasks, repeatText, selectTasks, skipTask, uid } from './taskUtils';
import { newTask } from './seed';
import { exportData, importData, loadData, notify, saveData } from './storage';

type Modal = 'settings' | 'project' | 'shortcuts' | null;
const nav: { key: View; label: string; icon: typeof Sun }[] = [
  { key: 'today', label: '今天', icon: Sun }, { key: 'inbox', label: '收件箱', icon: Inbox },
  { key: 'upcoming', label: '即将到来', icon: CalendarDays }, { key: 'all', label: '所有任务', icon: LayoutGrid },
  { key: 'starred', label: '重要任务', icon: Star }, { key: 'completed', label: '已完成', icon: CheckCheck }
];
const titles: Record<string, { title: string; subtitle: string }> = {
  today: { title: '把今天，过得漂亮。', subtitle: '专注眼前重要的事，一件一件完成。' },
  inbox: { title: '收件箱', subtitle: '先记下来，稍后再安排。' }, upcoming: { title: '即将到来', subtitle: '提前看见接下来要发生的事。' },
  all: { title: '所有任务', subtitle: '所有待办，一目了然。' }, starred: { title: '重要任务', subtitle: '把注意力留给真正重要的事。' },
  completed: { title: '已完成', subtitle: '每一个勾选，都是向前的一步。' }, archive: { title: '归档', subtitle: '已收起的任务，随时可以找回。' },
  focus: { title: '进入专注状态。', subtitle: '给重要的事情，一段不被打扰的时间。' },
  insights: { title: '看见自己的进步。', subtitle: '小小的坚持，会慢慢累积成改变。' }
};
const projectColors = ['#a9dbad', '#c8b9ee', '#e8bd97', '#98c5df', '#e6a9b3', '#d7d29b'];
function formatWeekday(date: Date) { return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(date); }
function displayDuration(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function iconButton(label: string, icon: React.ReactNode, onClick: () => void, className = '') { return <button className={`icon-button ${className}`} onClick={onClick} title={label} aria-label={label}>{icon}</button>; }

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState('已保存在本机');
  const [view, setView] = useState<View>('today');
  const [query, setQuery] = useState('');
  const sort: Sort = data?.settings.sort || 'smart';
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quickTitle, setQuickTitle] = useState('');
  const [quickDate, setQuickDate] = useState('');
  const [quickProject, setQuickProject] = useState('');
  const [quickHours, setQuickHours] = useState(0);
  const [quickMinutes, setQuickMinutes] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [projectName, setProjectName] = useState('');
  const [projectColor, setProjectColor] = useState(projectColors[0]);
  const [newSubtask, setNewSubtask] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [toast, setToast] = useState('');
  const [canUndo, setCanUndo] = useState(false);
  const undoRef = useRef<AppData | null>(null);
  const draggingRef = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const quickRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(new Date());
  const [focusTaskId, setFocusTaskId] = useState('');
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusBreak, setFocusBreak] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(25 * 60);
  const focusDeadlineRef = useRef<number | null>(null);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => { loadData().then(setData).catch(e => setLoadError(e instanceof Error ? e.message : '无法读取数据')); }, []);
  useEffect(() => { if (!data) return; let active = true; setSaveState('正在保存…'); saveData(data).then(() => { if (active) setSaveState('已保存在本机'); }).catch(() => { if (active) { setSaveState('保存失败'); setToast('保存失败，请导出备份并检查磁盘空间'); } }); return () => { active = false; }; }, [data]);
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = setInterval(refresh, 15_000);
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = data?.settings.theme || 'dark'; }, [data?.settings.theme]);
  useEffect(() => { setNewSubtask(''); setTagInput(''); }, [selectedId]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => { setToast(''); setCanUndo(false); }, 5500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!data?.settings.notifications) return;
    const time = now.getTime();
    data.tasks.forEach(task => {
      if (task.status === 'done' || task.archived || !task.dueDate || !task.dueTime || task.reminder === null) return;
      const due = new Date(`${task.dueDate}T${task.dueTime}:00`).getTime();
      const alertAt = due - task.reminder * 60_000;
      const key = `${task.id}:${task.dueDate}:${task.dueTime}:${task.reminder}`;
      if (time >= alertAt && time < due + 60_000 && !notifiedRef.current.has(key)) { notifiedRef.current.add(key); notify('任务提醒 · Linea', task.title); }
    });
  }, [data, now]);
  useEffect(() => {
    if (!focusRunning) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil(((focusDeadlineRef.current || Date.now()) - Date.now()) / 1000));
      setFocusSeconds(remaining);
      if (remaining === 0) {
        focusDeadlineRef.current = null; setFocusRunning(false);
        notify('专注时间结束', focusBreak ? '休息结束，准备好继续了吗？' : '做得好！现在休息一下吧。');
        setToast(focusBreak ? '休息结束，继续加油！' : '专注完成，休息一下吧！');
      }
    }, 500);
    return () => clearInterval(timer);
  }, [focusRunning, focusBreak]);
  const update = useCallback((fn: (prev: AppData) => AppData) => setData(prev => prev ? fn(prev) : prev), []);
  const changeTask = (id: string, patch: Partial<Task>) => update(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t) }));
  const action = (fn: (prev: AppData) => AppData, message: string) => {
    update(prev => { undoRef.current = prev; return fn(prev); }); setToast(message); setCanUndo(true);
  };
  const toggleDone = (task: Task) => {
    action(prev => ({ ...prev, tasks: prev.tasks.flatMap(t => t.id !== task.id ? [t] : t.status === 'done' ? [{ ...t, status: 'todo', completedAt: null, skippedAt: null, updatedAt: new Date().toISOString() }] : completeTask(t)) }), task.status === 'done' ? '已恢复任务' : '已完成任务');
  };
  const skipOccurrence = (task: Task) => {
    action(prev => ({ ...prev, tasks: prev.tasks.flatMap(t => t.id === task.id ? skipTask(t) : [t]) }), '已跳过本次，排到下一个日期');
    setSelectedId(null);
  };
  const addTask = (title: string, open = false) => {
    if (!title.trim()) { quickRef.current?.focus(); return; }
    const projectId = quickProject || (view.startsWith('project:') ? view.slice(8) : null);
    const task = newTask(title.trim(), { dueDate: quickDate || (view === 'today' ? localDay() : null), projectId: view === 'inbox' ? null : projectId, priority: 'none', estimatedMinutes: estimateFromParts(quickHours, quickMinutes) });
    update(prev => ({ ...prev, tasks: [task, ...prev.tasks] }));
    setQuickTitle(''); setQuickDate(''); setQuickProject(''); setQuickHours(0); setQuickMinutes(0); setQuery('');
    if (open) setSelectedId(task.id); else { setToast('任务已添加'); setCanUndo(false); }
  };
  const createProject = () => {
    if (!projectName.trim()) return;
    const project: Project = { id: uid(), name: projectName.trim().slice(0, 80), color: projectColor, createdAt: new Date().toISOString() };
    update(prev => ({ ...prev, projects: [...prev.projects, project] })); setView(`project:${project.id}`); setModal(null); setProjectName(''); setProjectColor(projectColors[0]);
  };
  const editProject = (project: Project) => {
    const name = prompt('重命名项目', project.name);
    if (name === null) return;
    if (name.trim()) update(prev => ({ ...prev, projects: prev.projects.map(p => p.id === project.id ? { ...p, name: name.trim().slice(0, 80) } : p) }));
  };
  const removeProject = (project: Project) => {
    if (!confirm(`删除项目「${project.name}」？其中的任务会移到收件箱，不会被删除。`)) return;
    action(prev => ({ ...prev, projects: prev.projects.filter(p => p.id !== project.id), tasks: prev.tasks.map(t => t.projectId === project.id ? { ...t, projectId: null } : t) }), '项目已删除，任务已移入收件箱'); setView('inbox');
  };
  const batch = (kind: 'done' | 'reopen' | 'archive' | 'restore' | 'delete' | 'priority' | 'project', value?: string) => {
    if (!selected.size) return;
    if (kind === 'delete' && !confirm(`确定永久删除选中的 ${selected.size} 个任务吗？你可以在提示消失前撤销。`)) return;
    const count = selected.size;
    action(prev => ({ ...prev, tasks: kind === 'delete' ? prev.tasks.filter(t => !selected.has(t.id)) : prev.tasks.flatMap(t => {
      if (!selected.has(t.id)) return [t];
      if (kind === 'done') return completeTask(t);
      if (kind === 'reopen') return [{ ...t, status: 'todo' as const, completedAt: null, skippedAt: null }];
      if (kind === 'archive' || kind === 'restore') return [{ ...t, archived: kind === 'archive' }];
      if (kind === 'priority') return [{ ...t, priority: value as Priority }];
      if (kind === 'project') return [{ ...t, projectId: value === 'inbox' ? null : value || null }];
      return [t];
    }) }), `已处理 ${count} 个任务`);
    setSelected(new Set()); setSelectionMode(false); setSelectedId(null);
  };
  const reorder = (source: string, target: string) => {
    if (!source || source === target) return;
    const ids = tasks.map(t => t.id);
    const from = ids.indexOf(source), to = ids.indexOf(target);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1); ids.splice(to, 0, source);
    action(prev => ({ ...prev, tasks: reorderVisibleTasks(prev.tasks, ids) }), '任务顺序已保存');
  };
  const moveTask = (id: string, direction: number) => {
    const index = tasks.findIndex(t => t.id === id);
    if (index < 0 || index + direction < 0 || index + direction >= tasks.length) return;
    reorder(id, tasks[index + direction].id);
  };
  const doImport = async () => {
    try {
      const imported = await importData(); if (!imported) return;
      if (!confirm('导入会替换当前全部任务和项目。建议先导出备份，确定继续吗？')) return;
      action(() => imported, '数据已导入'); setModal(null); setSelectedId(null); setView('today');
    } catch (e) { setToast(e instanceof Error ? `导入失败：${e.message}` : '导入失败'); setCanUndo(false); }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || (e.target instanceof HTMLElement && e.target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === 'Escape') { setSelectedId(null); setModal(null); setSelectionMode(false); setSelected(new Set()); setMobileSidebar(false); (document.activeElement as HTMLElement)?.blur(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/' ) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); quickRef.current?.focus(); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, []);

  const today = localDay(now);
  const tasks = useMemo(() => {
    if (!data) return [];
    let result = query.trim() ? [...selectTasks(data, 'all', query, sort, today), ...selectTasks(data, 'completed', query, sort, today)] : selectTasks(data, view, '', sort, today);
    if (filterPriority !== 'all') result = result.filter(t => t.priority === filterPriority);
    return result;
  }, [data, view, query, sort, filterPriority, today]);
  const activeTask = data?.tasks.find(t => t.id === selectedId) || null;
  const outstanding = data?.tasks.filter(t => !t.archived && t.status !== 'done') || [];
  const todayCount = outstanding.filter(t => t.dueDate && t.dueDate <= today).length;
  const completedToday = data?.tasks.filter(t => t.completedAt && localDay(new Date(t.completedAt)) === today && !t.archived).length || 0;
  const scheduled = outstanding.filter(t => t.dueDate && t.dueDate <= today);
  const totalMinutes = plannedMinutes(view === 'all' ? outstanding : scheduled, today);
  const unestimated = (view === 'all' ? outstanding : scheduled).filter(t => !t.estimatedMinutes).length;
  const viewTitle = query.trim() ? { title: '搜索结果', subtitle: `在所有任务中搜索 “${query.trim()}”` } : view.startsWith('project:') ? { title: data?.projects.find(p => p.id === view.slice(8))?.name || '项目', subtitle: '让一个项目里的所有事，清晰可见。' } : titles[view];
  const navCount = (key: View) => data?.tasks.filter(t => inView(t, key, today)).length || 0;
  const groups = useMemo(() => {
    if (sort === 'manual') return [{ label: '自定义顺序 · 拖动或点击箭头调整', tasks }];
    if (query.trim() || view === 'completed' || view === 'archive' || view.startsWith('project:') || view === 'starred' || view === 'inbox') return [{ label: query.trim() ? '匹配的任务' : '任务列表', tasks }];
    if (view === 'today') return [{ label: '已逾期', tasks: tasks.filter(t => isOverdue(t, today)) }, { label: '今天要做', tasks: tasks.filter(t => !isOverdue(t, today)) }].filter(g => g.tasks.length);
    if (view === 'upcoming') return [{ label: '明天', tasks: tasks.filter(t => t.dueDate === addDays(today, 1)) }, { label: '接下来', tasks: tasks.filter(t => t.dueDate !== addDays(today, 1)) }].filter(g => g.tasks.length);
    return [{ label: '已逾期', tasks: tasks.filter(t => isOverdue(t, today)) }, { label: '今天', tasks: tasks.filter(t => t.dueDate === today) }, { label: '即将到来', tasks: tasks.filter(t => t.dueDate && t.dueDate > today) }, { label: '待安排', tasks: tasks.filter(t => !t.dueDate) }].filter(g => g.tasks.length);
  }, [tasks, view, query, today, sort]);

  if (loadError) return <div className="fatal"><div className="brand-icon"><Activity size={21}/></div><h1>无法打开任务数据</h1><p>{loadError}</p><p>请检查本地数据文件，或从备份恢复后重新启动应用。</p></div>;
  if (!data) return <div className="loading"><div className="brand-icon"><Activity size={21}/></div><span>正在打开 Linea…</span></div>;
  const projectOf = (task: Task) => data.projects.find(p => p.id === task.projectId);
  const switchView = (v: View) => { setView(v); setQuery(''); setSelectedId(null); setSelectionMode(false); setSelected(new Set()); setMobileSidebar(false); setFilterPriority('all'); };
  const selectedCount = selected.size;
  return <div className="app-shell">
    <aside className={`sidebar ${mobileSidebar ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-icon"><Activity size={21} strokeWidth={2.1}/></div><div><strong>linea<span className="brand-period">.</span></strong><small>YOUR DAY, IN ORDER</small></div></div>
      <div className="workspace-label"><span className="workspace-avatar">L</span><span>我的工作空间<small>PERSONAL SPACE</small></span><ChevronDown size={14}/></div>
      <div className="sidebar-section"><div className="section-caption">工作台 <span>01</span></div>
        {nav.map(item => <button key={item.key} className={`nav-item ${view === item.key && !query ? 'active' : ''}`} onClick={() => switchView(item.key)}><item.icon size={17} strokeWidth={1.8}/><span>{item.label}</span><span className="nav-count">{navCount(item.key) || ''}</span></button>)}
      </div>
      <div className="sidebar-section projects-section"><div className="section-caption">我的项目 <button onClick={() => setModal('project')} title="新建项目" aria-label="新建项目"><Plus size={16}/></button></div>
        {data.projects.map(p => <div className={`project-nav ${view === `project:${p.id}` ? 'active' : ''}`} key={p.id}><button onClick={() => switchView(`project:${p.id}`)}><span className="project-dot" style={{ background: p.color }}/><span className="truncate">{p.name}</span><span className="nav-count">{navCount(`project:${p.id}`) || ''}</span></button><button className="project-more" onClick={() => editProject(p)} title="重命名项目；删除项目请在项目页面操作"><MoreHorizontal size={15}/></button></div>)}
        <button className="add-project" onClick={() => setModal('project')}><Plus size={15}/> 新建项目</button>
      </div>
      <div className="sidebar-spacer"/>
      <div className="sidebar-section bottom-nav"><div className="section-caption">更多空间</div>
        <button className={`nav-item ${view === 'focus' ? 'active' : ''}`} onClick={() => switchView('focus')}><Focus size={17}/> <span>专注模式</span></button>
        <button className={`nav-item ${view === 'insights' ? 'active' : ''}`} onClick={() => switchView('insights')}><Activity size={17}/> <span>效率统计</span></button>
        <button className={`nav-item ${view === 'archive' ? 'active' : ''}`} onClick={() => switchView('archive')}><Archive size={17}/> <span>归档</span></button>
      </div>
      <div className="sidebar-footer"><div className="footer-top"><span className="online-dot"/> 离线可用 · 数据仅存本机</div><div className="footer-actions"><span>{saveState}</span><button title="设置" aria-label="设置" onClick={() => setModal('settings')}><Settings2 size={17}/></button></div></div>
    </aside>
    {mobileSidebar && <div className="mobile-shade" onClick={() => setMobileSidebar(false)}/>}
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileSidebar(true)} aria-label="打开菜单"><Menu size={20}/></button><span className="topbar-path">工作空间</span><ChevronRight size={14} className="muted"/><span className="topbar-current">{view.startsWith('project:') ? data.projects.find(p => p.id === view.slice(8))?.name : (nav.find(n => n.key === view)?.label || ({ archive: '归档', focus: '专注模式', insights: '效率统计' } as Record<string, string>)[view])}</span></div><div className="topbar-right"><div className="top-search"><Search size={16}/><input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索任务、项目、标签…" aria-label="搜索任务"/><kbd>⌘ K</kbd></div>{iconButton('快捷键', <CircleHelp size={18}/>, () => setModal('shortcuts'))}<span className="top-divider"/>{iconButton('设置', <Settings2 size={18}/>, () => setModal('settings'))}</div></header>
      <div className="content-scroll"><div className={`content-inner ${view === 'focus' || view === 'insights' ? 'special-content' : ''}`}>
        <div className="eyebrow"><span className="eyebrow-line"/> {view === 'today' ? 'YOUR DAILY OVERVIEW' : view === 'focus' ? 'DEEP WORK SESSION' : view === 'insights' ? 'YOUR PROGRESS' : 'YOUR WORKSPACE'} <span className="eyebrow-number">/ {now.getFullYear()}</span></div>
        <div className="page-heading"><div><div className="date-line">{formatWeekday(now)} <span className="date-line-sep">/</span> 本机时间 {new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now)}</div><h1>{viewTitle?.title || '所有任务'}</h1><p>{viewTitle?.subtitle}</p></div><button className="primary-btn heading-new" onClick={() => { if (view === 'focus' || view === 'insights' || view === 'archive' || view === 'completed') switchView('today'); quickRef.current?.focus(); setTimeout(() => quickRef.current?.focus(), 0); }}><Plus size={17}/> 新建任务 <span>↗</span></button></div>
        {view === 'focus' && !query ? <section className="focus-page"><div className="focus-card"><div className="focus-card-top"><span><span className="pulse-dot"/> FOCUS SESSION</span><span>专注于当下</span></div><div className="focus-ring" style={{ '--progress': `${100 * (1 - focusSeconds / ((focusBreak ? data.settings.breakMinutes : data.settings.focusMinutes) * 60))}%` } as React.CSSProperties}><div><span className="focus-phase">{focusBreak ? '短暂休息' : '专注时间'}</span><strong>{displayDuration(focusSeconds)}</strong><span className="focus-message">{focusRunning ? '保持节奏，你做得很好' : '深呼吸，准备好就开始'}</span></div></div><div className="focus-controls"><button className="timer-secondary" onClick={() => { focusDeadlineRef.current = null; setFocusRunning(false); setFocusSeconds((focusBreak ? data.settings.breakMinutes : data.settings.focusMinutes) * 60); }}><RotateCcw size={18}/> 重置</button><button className="primary-btn timer-main" onClick={() => { if (focusSeconds === 0) setFocusSeconds((focusBreak ? data.settings.breakMinutes : data.settings.focusMinutes) * 60); if (focusRunning) { setFocusSeconds(Math.max(0, Math.ceil(((focusDeadlineRef.current || Date.now()) - Date.now()) / 1000))); focusDeadlineRef.current = null; } else focusDeadlineRef.current = Date.now() + (focusSeconds || (focusBreak ? data.settings.breakMinutes : data.settings.focusMinutes) * 60) * 1000; setFocusRunning(!focusRunning); }}>{focusRunning ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}{focusRunning ? '暂停专注' : '开始专注'}</button><button className="timer-secondary" onClick={() => { focusDeadlineRef.current = null; setFocusRunning(false); setFocusBreak(!focusBreak); setFocusSeconds((focusBreak ? data.settings.focusMinutes : data.settings.breakMinutes) * 60); }}>{focusBreak ? '专注时间' : '休息时间'} <ArrowRight size={18}/></button></div></div><div className="focus-side"><div className="mini-label">当前专注任务 <span>01 / 02</span></div><select value={focusTaskId} onChange={e => setFocusTaskId(e.target.value)}><option value="">选择一件要完成的事</option>{outstanding.map(t => <option value={t.id} key={t.id}>{t.title}</option>)}</select><div className="focus-quote">“把注意力放在你能控制的事情上。”<span>ONE THING AT A TIME</span></div><button className="text-link" onClick={() => setModal('settings')}>调整专注时长 <ArrowRight size={15}/></button></div></section> : view === 'insights' && !query ? <Insights data={data} today={today} onNavigate={switchView}/> : <>
          {(view === 'today' || view === 'all') && !query && <div className="overview-grid"><div className="overview-card"><div className="overview-label"><span>待处理</span><LayoutGrid size={18}/></div><div className="overview-value">{outstanding.length}<small>项任务</small></div><div className="overview-foot"><span className="tiny-line"/> 保持节奏，逐个击破</div></div><div className="overview-card"><div className="overview-label"><span>今天要做</span><CalendarDays size={18}/></div><div className="overview-value">{todayCount}<small>项任务</small></div><div className="overview-foot"><span className="tiny-line peach"/> {todayCount ? '从最重要的一件开始' : '今天的任务都处理好了'}</div></div><div className="overview-card accent-card"><div className="overview-label"><span>今日完成</span><CheckCheck size={18}/></div><div className="overview-value">{completedToday}<small>项任务</small></div><div className="overview-foot"><span className="tiny-line green"/> 每一点进步都算数</div><div className="accent-art"/></div><div className="overview-card time-card"><div className="overview-label"><span>{view === 'all' ? '待办总时长' : '今日任务总时长'}</span><Clock3 size={18}/></div><div className="overview-value overview-duration">{totalMinutes ? formatEstimate(totalMinutes) : '0分钟'}</div><div className="overview-foot"><span className="tiny-line green"/> {unestimated ? `另有 ${unestimated} 项未估时` : '全部任务已估时'}</div></div></div>}
          <div className="quick-add-card"><div className="quick-add"><div className="quick-plus"><Plus size={20}/></div><input ref={quickRef} value={quickTitle} onChange={e => setQuickTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTask(quickTitle); }} placeholder="添加一个新任务，按 Enter 保存…" aria-label="快速添加任务"/><div className="quick-options"><label className="quick-date" title="设置截止日期"><CalendarDays size={16}/><input type="date" aria-label="快速设置截止日期" value={quickDate} onChange={e => setQuickDate(e.target.value)}/></label><select aria-label="快速选择项目" title="项目" value={quickProject} onChange={e => setQuickProject(e.target.value)}><option value="">项目</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="quick-submit" onClick={() => addTask(quickTitle)} aria-label="添加任务"><ArrowRight size={19}/></button></div></div><div className="quick-add-bottom"><span><Clock3 size={14}/> 预估用时</span><label><input type="number" min="0" max="24" aria-label="新增任务预估小时" value={quickHours} onChange={e => { setQuickHours(Math.min(24, Math.max(0, Number(e.target.value) || 0))); if (Number(e.target.value) >= 24) setQuickMinutes(0); }}/> 小时</label><label><input type="number" min="0" max="59" aria-label="新增任务预估分钟" value={quickMinutes} onChange={e => setQuickMinutes(quickHours >= 24 ? 0 : Math.min(59, Math.max(0, Number(e.target.value) || 0)))}/> 分钟</label><span className="quick-estimate-hint">{estimateFromParts(quickHours, quickMinutes) ? `共 ${formatEstimate(estimateFromParts(quickHours, quickMinutes)!)}` : '可选，随时修改'}</span></div></div>
          <section className="task-section"><div className="list-heading"><div className="list-title"><span className="section-index">01 /</span><h2>{query ? '搜索结果' : view === 'today' ? '今日任务' : viewTitle?.title}</h2><span className="task-total">{tasks.length}</span></div><div className="list-actions"><button className={selectionMode ? 'small-action active' : 'small-action'} onClick={() => { setSelectionMode(!selectionMode); setSelected(new Set()); }}><CheckCheck size={15}/> 批量管理</button><div className="select-wrap"><ListFilter size={15}/><select aria-label="优先级筛选" value={filterPriority} onChange={e => setFilterPriority(e.target.value as Priority | 'all')}><option value="all">全部优先级</option><option value="high">高优先级</option><option value="medium">中优先级</option><option value="low">低优先级</option><option value="none">无优先级</option></select><ChevronDown size={13}/></div><div className="select-wrap"><ArrowDownUp size={15}/><select aria-label="排序方式" value={sort} onChange={e => update(prev => ({ ...prev, settings: { ...prev.settings, sort: e.target.value as Sort } }))}><option value="smart">智能排序</option><option value="due">按截止日期</option><option value="priority">按优先级</option><option value="created">最近创建</option><option value="title">按名称</option><option value="shortest">用时：短到长</option><option value="longest">用时：长到短</option><option value="manual">手动排序</option></select><ChevronDown size={13}/></div></div></div>
            {selectionMode && <div className="batch-bar"><label><input type="checkbox" checked={tasks.length > 0 && tasks.every(t => selected.has(t.id))} onChange={e => setSelected(e.target.checked ? new Set(tasks.map(t => t.id)) : new Set())}/> 全选当前列表</label><span>已选 {selectedCount} 项</span><div className="batch-actions"><button disabled={!selectedCount} onClick={() => batch('done')}><Check size={15}/> 完成</button><button disabled={!selectedCount} onClick={() => batch('reopen')}><RotateCcw size={15}/> 恢复</button><button disabled={!selectedCount} onClick={() => batch(view === 'archive' ? 'restore' : 'archive')}><Archive size={15}/> {view === 'archive' ? '取消归档' : '归档'}</button><select disabled={!selectedCount} value="" onChange={e => { if (e.target.value) batch('priority', e.target.value); }} aria-label="批量设置优先级"><option value="">优先级…</option>{(['high', 'medium', 'low', 'none'] as Priority[]).map(p => <option key={p} value={p}>{priorityText[p]}</option>)}</select><select disabled={!selectedCount} value="" onChange={e => batch('project', e.target.value)} aria-label="批量移动到项目"><option value="">移动到…</option><option value="inbox">收件箱</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button disabled={!selectedCount} className="danger-text" onClick={() => batch('delete')}><Trash2 size={15}/></button></div></div>}
            {tasks.length ? <div className="task-groups">{groups.map(group => <div className="task-group" key={group.label}><div className="group-label"><span>{group.label}</span><span className="group-line"/><span>{String(group.tasks.length).padStart(2, '0')}</span></div><div className="task-list">{group.tasks.map(task => <div key={task.id} className={`task-row ${selectedId === task.id ? 'task-active' : ''} ${task.status === 'done' ? 'task-done' : ''}`} onDragOver={e => { if (sort === 'manual' && draggingRef.current) e.preventDefault(); }} onDrop={e => { if (sort === 'manual') { e.preventDefault(); reorder(draggingRef.current || '', task.id); draggingRef.current = null; } }} onClick={() => { if (selectionMode) setSelected(prev => { const next = new Set(prev); if (next.has(task.id)) next.delete(task.id); else next.add(task.id); return next; }); else setSelectedId(task.id); }} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setSelectedId(task.id); }}>
                  {sort === 'manual' && !selectionMode && <span className="drag-handle" draggable onDragStart={e => { draggingRef.current = task.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', task.id); }} onDragEnd={() => { draggingRef.current = null; }} title="拖动调整顺序" aria-label="拖动调整顺序"><GripVertical size={16}/></span>}
                  {selectionMode ? <input type="checkbox" className="row-select" checked={selected.has(task.id)} onChange={() => {}} aria-label={`选择 ${task.title}`}/> : <button className={`task-check ${task.status === 'done' ? 'checked' : ''}`} aria-label={task.status === 'done' ? '恢复任务' : '完成任务'} onClick={e => { e.stopPropagation(); toggleDone(task); }}>{task.status === 'done' && <Check size={14} strokeWidth={3}/>}</button>}
                  <div className="task-info"><div className="task-name-line"><span className="task-name">{task.title}</span>{task.status === 'doing' && <span className="doing-badge"><span/>进行中</span>}{task.repeat !== 'none' && <span className="repeat-mark" title={repeatText[task.repeat]}><RotateCcw size={13}/></span>}{task.skippedAt && <span className="skipped-badge">已跳过</span>}</div><div className="task-meta">{projectOf(task) && <span><i className="project-dot" style={{ background: projectOf(task)?.color }}/>{projectOf(task)?.name}</span>}{task.dueDate && <span className={isOverdue(task, today) ? 'overdue' : ''}><CalendarDays size={13}/>{relativeDay(task.dueDate)}{task.dueTime ? ` ${task.dueTime}` : ''}</span>}{task.subtasks.length > 0 && <span><CheckCheck size={13}/>{task.subtasks.filter(s => s.done).length}/{task.subtasks.length}</span>}{task.estimatedMinutes && <span><Clock3 size={13}/>{formatEstimate(task.estimatedMinutes)}</span>}{['daily', 'weekdays'].includes(task.repeat) && task.dailyGoal > 1 && task.status !== 'done' && <span>{task.dailyProgress}/{task.dailyGoal} 次</span>}{!task.dueDate && !projectOf(task) && <span>尚未安排</span>}</div></div>
                  <div className="row-right">{sort === 'manual' && !selectionMode && <span className="move-controls"><button onClick={e => { e.stopPropagation(); moveTask(task.id, -1); }} aria-label={`上移 ${task.title}`} title="上移"><ArrowUp size={14}/></button><button onClick={e => { e.stopPropagation(); moveTask(task.id, 1); }} aria-label={`下移 ${task.title}`} title="下移"><ArrowDown size={14}/></button></span>}{task.repeat !== 'none' && task.status !== 'done' && !!task.dueDate && !selectionMode && <button className="skip-row" onClick={e => { e.stopPropagation(); skipOccurrence(task); }} title="跳过本次，排到下一天" aria-label={`跳过 ${task.title}`}><SkipForward size={16}/></button>}{task.priority !== 'none' && <span className={`priority-pill ${task.priority}`}><span/> {priorityText[task.priority]}</span>}<button className={`star-btn ${task.starred ? 'starred' : ''}`} onClick={e => { e.stopPropagation(); changeTask(task.id, { starred: !task.starred }); }} title={task.starred ? '取消重要标记' : '标记为重要'} aria-label="切换重要标记"><Star size={17} fill={task.starred ? 'currentColor' : 'none'}/></button><ChevronRight size={17} className="row-chevron"/></div>
                </div>)}</div></div>)}</div> : <div className="empty-state"><div className="empty-icon">{query ? <Search size={27}/> : <Sparkles size={27}/>}</div><h3>{query ? '没有找到匹配的任务' : view === 'today' ? '今天已经清空啦' : '这里还没有任务'}</h3><p>{query ? '试试换个关键词，搜索会查找标题、备注、子任务、标签和项目。' : '给自己一个新的开始，添加一件想完成的事。'}</p>{!query && <button className="text-link" onClick={() => quickRef.current?.focus()}>添加一个任务 <ArrowRight size={15}/></button>}</div>}
          </section>
          {view.startsWith('project:') && <button className="delete-project-link" onClick={() => { const p = data.projects.find(p => p.id === view.slice(8)); if (p) removeProject(p); }}><Trash2 size={14}/> 删除此项目</button>}
        </>}
        <footer className="content-footer"><span>LINEA / MAKE SPACE FOR WHAT MATTERS</span><span>本地优先 · 无需联网</span></footer>
      </div></div>
    </main>
    {activeTask && <><div className="inspector-shade" onClick={() => setSelectedId(null)}/><aside className="inspector"><div className="inspector-top"><span>任务详情 <small>/ TASK DETAILS</small></span>{iconButton('关闭详情', <X size={19}/>, () => setSelectedId(null))}</div><div className="inspector-scroll"><div className="inspector-kicker">TASK / {activeTask.id.slice(0, 8).toUpperCase()}</div><textarea className="detail-title" value={activeTask.title} onChange={e => changeTask(activeTask.id, { title: e.target.value })} rows={2} aria-label="任务标题" placeholder="任务标题"/><div className="detail-status"><span>当前状态</span><select value={activeTask.status} onChange={e => { if (e.target.value === 'done') toggleDone(activeTask); else changeTask(activeTask.id, { status: e.target.value as Task['status'], completedAt: null, skippedAt: null }); }}><option value="todo">待处理</option><option value="doing">进行中</option><option value="done">已完成</option></select></div>
      <div className="detail-divider"/><div className="detail-section-title">基本信息 <span>01</span></div><div className="detail-field"><label><CalendarDays size={16}/> 截止日期</label><input type="date" value={activeTask.dueDate || ''} onChange={e => changeTask(activeTask.id, { dueDate: e.target.value || null, dueTime: e.target.value ? activeTask.dueTime : null, reminder: e.target.value ? activeTask.reminder : null })}/></div><div className="detail-field"><label><Clock3 size={16}/> 具体时间</label><input type="time" disabled={!activeTask.dueDate} value={activeTask.dueTime || ''} onChange={e => changeTask(activeTask.id, { dueTime: e.target.value || null })}/></div><div className="detail-field"><label><Flag size={16}/> 优先级</label><select value={activeTask.priority} onChange={e => changeTask(activeTask.id, { priority: e.target.value as Priority })}>{(['none', 'low', 'medium', 'high'] as Priority[]).map(p => <option key={p} value={p}>{priorityText[p]}</option>)}</select></div><div className="detail-field"><label><LayoutGrid size={16}/> 所属项目</label><select value={activeTask.projectId || ''} onChange={e => changeTask(activeTask.id, { projectId: e.target.value || null })}><option value="">收件箱</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div className="detail-field"><label><RotateCcw size={16}/> 重复</label><select value={activeTask.repeat} onChange={e => changeTask(activeTask.id, { repeat: e.target.value as Task['repeat'] })}>{Object.entries(repeatText).map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></div>{activeTask.repeat !== 'none' && !activeTask.dueDate && <p className="field-note">设置截止日期后，完成任务时会自动创建下一次。</p>}{['daily', 'weekdays'].includes(activeTask.repeat) && <><div className="detail-field"><label><RotateCcw size={16}/> 每天完成次数</label><div className="number-field"><input type="number" min="1" max="99" aria-label="每天完成次数" value={activeTask.dailyGoal} onChange={e => changeTask(activeTask.id, { dailyGoal: Math.max(1, Math.min(99, Number(e.target.value) || 1)), dailyProgress: Math.min(activeTask.dailyProgress, Math.max(1, Math.min(99, Number(e.target.value) || 1)) - 1) })}/><span>次/天</span></div></div><p className="field-note">{activeTask.dueDate === today ? `今天已完成 ${activeTask.dailyProgress} / ${activeTask.dailyGoal} 次；达到目标后才排到下一天。` : '按本机日期计算；可以在当天额外加练。'}</p></>}<div className="detail-field"><label><Bell size={16}/> 提醒</label><select value={activeTask.reminder ?? ''} disabled={!activeTask.dueDate || !activeTask.dueTime} onChange={e => changeTask(activeTask.id, { reminder: e.target.value === '' ? null : Number(e.target.value) })}><option value="">不提醒</option><option value="0">到点提醒</option><option value="5">提前 5 分钟</option><option value="15">提前 15 分钟</option><option value="30">提前 30 分钟</option><option value="60">提前 1 小时</option><option value="1440">提前 1 天</option></select></div><div className="detail-field"><label><Focus size={16}/> 预估用时</label><div className="estimate-fields"><label><input type="number" min="0" max="24" aria-label="任务预估小时" value={Math.floor((activeTask.estimatedMinutes || 0) / 60)} onChange={e => changeTask(activeTask.id, { estimatedMinutes: estimateFromParts(Math.min(24, Math.max(0, Number(e.target.value) || 0)), Number(e.target.value) >= 24 ? 0 : (activeTask.estimatedMinutes || 0) % 60) })}/>时</label><label><input type="number" min="0" max="59" aria-label="任务预估分钟" value={(activeTask.estimatedMinutes || 0) % 60} onChange={e => changeTask(activeTask.id, { estimatedMinutes: estimateFromParts(Math.floor((activeTask.estimatedMinutes || 0) / 60), (activeTask.estimatedMinutes || 0) >= 1440 ? 0 : Math.min(59, Math.max(0, Number(e.target.value) || 0))) })}/>分</label></div></div>
      <div className="detail-divider"/><div className="detail-section-title">备注与标签 <span>02</span></div><textarea className="notes-input" value={activeTask.notes} onChange={e => changeTask(activeTask.id, { notes: e.target.value })} placeholder="写下一些补充信息、想法或链接…" rows={4} aria-label="任务备注"/><div className="tag-list">{activeTask.tags.map(tag => <span className="tag-chip" key={tag}># {tag}<button onClick={() => changeTask(activeTask.id, { tags: activeTask.tags.filter(t => t !== tag) })} aria-label={`删除标签 ${tag}`}><X size={12}/></button></span>)}</div><div className="inline-add"><Tag size={15}/><input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && tagInput.trim()) { changeTask(activeTask.id, { tags: [...new Set([...activeTask.tags, tagInput.trim().slice(0, 40)])] }); setTagInput(''); } }} placeholder="添加标签，按 Enter" aria-label="添加标签"/></div>
      <div className="detail-divider"/><div className="detail-section-title">子任务 <span>{String(activeTask.subtasks.length).padStart(2, '0')}</span></div><div className="subtask-list">{activeTask.subtasks.map(s => <div className="subtask-row" key={s.id}><button className={`task-check ${s.done ? 'checked' : ''}`} onClick={() => changeTask(activeTask.id, { subtasks: activeTask.subtasks.map(item => item.id === s.id ? { ...item, done: !item.done } : item) })} aria-label={s.done ? '取消完成子任务' : '完成子任务'}>{s.done && <Check size={12}/>}</button><span className={s.done ? 'struck' : ''}>{s.title}</span><button className="subtask-remove" onClick={() => changeTask(activeTask.id, { subtasks: activeTask.subtasks.filter(item => item.id !== s.id) })} aria-label="删除子任务"><X size={14}/></button></div>)}</div><div className="inline-add"><Plus size={16}/><input value={newSubtask} onChange={e => setNewSubtask(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newSubtask.trim()) { changeTask(activeTask.id, { subtasks: [...activeTask.subtasks, { id: uid(), title: newSubtask.trim(), done: false }] }); setNewSubtask(''); } }} placeholder="添加子任务，按 Enter" aria-label="添加子任务"/></div>
      <div className="detail-divider"/><div className="detail-meta">创建于 {new Date(activeTask.createdAt).toLocaleDateString('zh-CN')}{activeTask.completedAt && ` · 完成于 ${new Date(activeTask.completedAt).toLocaleDateString('zh-CN')}`}{activeTask.skippedAt && ` · 跳过于 ${new Date(activeTask.skippedAt).toLocaleDateString('zh-CN')}`}</div></div><div className="inspector-bottom">{activeTask.repeat !== 'none' && activeTask.dueDate && activeTask.status !== 'done' && <button onClick={() => skipOccurrence(activeTask)} title="跳过本次，排到下一周期"><SkipForward size={16}/>跳过</button>}{['daily', 'weekdays'].includes(activeTask.repeat) && <button onClick={() => { const extra = extraToday(activeTask); update(prev => ({ ...prev, tasks: [...prev.tasks, extra] })); setSelectedId(extra.id); setToast('已添加今天的额外一次'); setCanUndo(false); }} title="加练一次，不推迟明天的计划"><Plus size={16}/>今天加练</button>}<button onClick={() => changeTask(activeTask.id, { starred: !activeTask.starred })}><Star size={16} fill={activeTask.starred ? 'currentColor' : 'none'}/>{activeTask.starred ? '取消重要' : '设为重要'}</button><button onClick={() => { action(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === activeTask.id ? { ...t, archived: !t.archived } : t) }), activeTask.archived ? '已取消归档' : '已归档任务'); setSelectedId(null); }}><Archive size={16}/>{activeTask.archived ? '取消归档' : '归档'}</button><button className="danger-text" onClick={() => { if (!confirm('确定删除这个任务吗？')) return; action(prev => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== activeTask.id) }), '任务已删除'); setSelectedId(null); }}><Trash2 size={16}/>删除</button></div></aside></>}
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><div className="modal"><div className="modal-head"><div><span className="modal-kicker">LINEA / PREFERENCES</span><h2>{modal === 'settings' ? '设置' : modal === 'project' ? '新建项目' : '快捷键'}</h2></div>{iconButton('关闭', <X size={19}/>, () => setModal(null))}</div>{modal === 'project' ? <div className="modal-body"><p className="modal-description">给相关任务一个共同的空间。</p><label className="form-label">项目名称</label><input className="form-input" autoFocus placeholder="例如：期末复习计划" value={projectName} onChange={e => setProjectName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createProject(); }}/><label className="form-label">标记颜色</label><div className="color-choices">{projectColors.map(color => <button key={color} style={{ background: color }} className={projectColor === color ? 'chosen' : ''} onClick={() => setProjectColor(color)} aria-label={`选择颜色 ${color}`}>{projectColor === color && <Check size={16}/>}</button>)}</div><button className="primary-btn modal-primary" onClick={createProject} disabled={!projectName.trim()}>创建项目 <ArrowRight size={16}/></button></div> : modal === 'shortcuts' ? <div className="modal-body"><p className="modal-description">让常用操作变得更快一点。</p>{[['⌘ / Ctrl + K', '搜索任务'], ['N', '快速新建任务'], ['/', '聚焦搜索'], ['Esc', '关闭面板或取消选择'], ['Enter', '保存快速添加的任务']].map(([key, desc]) => <div className="shortcut-row" key={key}><span>{desc}</span><kbd>{key}</kbd></div>)}</div> : <div className="modal-body"><div className="settings-group"><div className="settings-title">外观</div><div className="settings-row"><div><strong>界面主题</strong><small>选择更适合你的阅读环境</small></div><div className="theme-switch"><button className={data.settings.theme === 'dark' ? 'selected' : ''} onClick={() => update(prev => ({ ...prev, settings: { ...prev.settings, theme: 'dark' } }))}><Moon size={15}/>深色</button><button className={data.settings.theme === 'light' ? 'selected' : ''} onClick={() => update(prev => ({ ...prev, settings: { ...prev.settings, theme: 'light' } }))}><Sun size={15}/>浅色</button></div></div></div><div className="settings-group"><div className="settings-title">专注与提醒</div><div className="settings-row"><div><strong>专注时长</strong><small>每轮专注的分钟数</small></div><input type="number" min="1" max="120" value={data.settings.focusMinutes} onChange={e => update(prev => ({ ...prev, settings: { ...prev.settings, focusMinutes: Math.max(1, Math.min(120, Number(e.target.value) || 1)) } }))}/></div><div className="settings-row"><div><strong>休息时长</strong><small>每轮休息的分钟数</small></div><input type="number" min="1" max="60" value={data.settings.breakMinutes} onChange={e => update(prev => ({ ...prev, settings: { ...prev.settings, breakMinutes: Math.max(1, Math.min(60, Number(e.target.value) || 1)) } }))}/></div><div className="settings-row"><div><strong>桌面提醒</strong><small>应用运行时按设定时间提醒</small></div><button className={`toggle ${data.settings.notifications ? 'on' : ''}`} role="switch" aria-checked={data.settings.notifications} onClick={() => { update(prev => ({ ...prev, settings: { ...prev.settings, notifications: !prev.settings.notifications } })); if (!window.linea && 'Notification' in window && Notification.permission === 'default') void Notification.requestPermission(); }}><span/></button></div><button className="text-link" onClick={() => { focusDeadlineRef.current = null; setFocusRunning(false); setFocusBreak(false); setFocusSeconds(data.settings.focusMinutes * 60); setModal(null); setView('focus'); }}>前往专注模式 <ArrowRight size={14}/></button></div><div className="settings-group"><div className="settings-title">数据管理</div><div className="settings-row"><div><strong>本地备份</strong><small>导出 JSON 文件，或从备份恢复</small></div><div className="settings-buttons"><button onClick={async () => { try { const ok = await exportData(data); if (ok) { setToast('备份已导出'); setCanUndo(false); } } catch { setToast('导出失败'); } }}><Download size={15}/>导出</button><button onClick={doImport}><Upload size={15}/>导入</button></div></div><p className="privacy-note">所有任务仅保存在此设备，不需要账户，也不会上传云端。浏览器预览使用浏览器本地存储；桌面应用使用本地文件，并保留上一版本备份。</p></div></div>}</div></div>}
    {toast && <div className="toast"><span className="toast-mark"><Check size={15}/></span>{toast}{canUndo && <button onClick={() => { if (undoRef.current) { setData(undoRef.current); undoRef.current = null; setToast('已撤销操作'); setCanUndo(false); } }}>撤销</button>}{iconButton('关闭提示', <X size={14}/>, () => { setToast(''); setCanUndo(false); })}</div>}
  </div>;
}

function Insights({ data, today, onNavigate }: { data: AppData; today: string; onNavigate: (v: View) => void }) {
  const active = data.tasks.filter(t => !t.archived);
  const completed = active.filter(t => t.status === 'done' && !!t.completedAt && !t.skippedAt);
  const week = Array.from({ length: 7 }, (_, i) => { const day = addDays(today, i - 6); return { day, count: completed.filter(t => t.completedAt && localDay(new Date(t.completedAt)) === day).length }; });
  const max = Math.max(3, ...week.map(d => d.count));
  const rate = active.length ? Math.round(completed.length / active.length * 100) : 0;
  return <div className="insights-page"><div className="insight-stats"><div className="insight-stat"><span>累计完成</span><strong>{completed.length}<small>件</small></strong><p>每个小进展，都值得记录。</p></div><div className="insight-stat"><span>完成率</span><strong>{rate}<small>%</small></strong><p>已完成任务 / 全部任务</p></div><div className="insight-stat"><span>进行中的计划</span><strong>{data.projects.length}<small>个</small></strong><p>有方向，就有前进的动力。</p></div></div><div className="insight-columns"><div className="chart-card"><div className="chart-head"><div><span className="mini-label">ACTIVITY / 01</span><h3>最近 7 天</h3></div><span>完成任务趋势</span></div><div className="chart-bars">{week.map(d => <div className="bar-col" key={d.day}><span className="bar-value">{d.count || ''}</span><div className={`bar ${d.day === today ? 'current' : ''}`} style={{ height: `${Math.max(5, d.count / max * 100)}%` }}/><span>{new Date(`${d.day}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' })}</span></div>)}</div></div><div className="project-progress"><div className="chart-head"><div><span className="mini-label">PROJECTS / 02</span><h3>项目进度</h3></div><span>{data.projects.length} 个项目</span></div>{data.projects.length ? data.projects.map(p => { const tasks = active.filter(t => t.projectId === p.id); const done = tasks.filter(t => t.status === 'done' && !!t.completedAt && !t.skippedAt).length; const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0; return <button className="progress-item" key={p.id} onClick={() => onNavigate(`project:${p.id}`)}><div><span className="project-dot" style={{ background: p.color }}/><strong>{p.name}</strong><small>{done}/{tasks.length}</small></div><div className="progress-track"><span style={{ width: `${pct}%`, background: p.color }}/></div></button>; }) : <p className="muted">还没有项目，先创建一个吧。</p>}</div></div></div>;
}
