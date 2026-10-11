import type { AppData, Priority, Sort, Task, View } from './types';
export const uid = () => crypto.randomUUID();
export const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const addDays = (day: string, amount: number) => { const [y, m, d] = day.split('-').map(Number); const date = new Date(y, m - 1, d + amount); return localDay(date); };
export const relativeDay = (day: string | null) => {
  if (!day) return '无截止日期';
  const today = localDay();
  if (day === today) return '今天';
  if (day === addDays(today, 1)) return '明天';
  if (day === addDays(today, -1)) return '昨天';
  const [y, m, d] = day.split('-').map(Number);
  return `${m}月${d}日${y !== new Date().getFullYear() ? ` · ${y}` : ''}`;
};
export const isOverdue = (task: Task, today = localDay()) => task.status !== 'done' && !!task.dueDate && task.dueDate < today;
export const priorityRank: Record<Priority, number> = { high: 3, medium: 2, low: 1, none: 0 };
export const priorityText: Record<Priority, string> = { high: '高优先级', medium: '中优先级', low: '低优先级', none: '无优先级' };
export const repeatText = { none: '不重复', daily: '每天', weekdays: '工作日', weekly: '每周', monthly: '每月' };
export function nextRepeatDate(day: string, repeat: Task['repeat']): string {
  if (repeat === 'daily') return addDays(day, 1);
  if (repeat === 'weekly') return addDays(day, 7);
  if (repeat === 'weekdays') { let next = addDays(day, 1); while ([0, 6].includes(new Date(`${next}T12:00:00`).getDay())) next = addDays(next, 1); return next; }
  if (repeat === 'monthly') {
    const [y, m, d] = day.split('-').map(Number);
    const last = new Date(y, m + 1, 0).getDate();
    return localDay(new Date(y, m, Math.min(d, last)));
  }
  return day;
}
export function completeTask(task: Task, now = new Date()): Task[] {
  if (task.status === 'done') return [task];
  const completed = { ...task, status: 'done' as const, completedAt: now.toISOString(), updatedAt: now.toISOString() };
  if (task.repeat === 'none' || !task.dueDate) return [completed];
  let next = nextRepeatDate(task.dueDate, task.repeat);
  const today = localDay(now);
  // A missed recurring task generates its next actionable occurrence, not a pile of past instances.
  while (next < today) next = nextRepeatDate(next, task.repeat);
  return [completed, { ...task, id: uid(), status: 'todo', dueDate: next, completedAt: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), subtasks: task.subtasks.map(s => ({ ...s, id: uid(), done: false })) }];
}
export function inView(task: Task, view: View, today = localDay()): boolean {
  if (view === 'archive') return task.archived;
  if (task.archived) return false;
  if (view === 'completed') return task.status === 'done';
  if (view === 'starred') return task.starred && task.status !== 'done';
  if (view === 'inbox') return !task.projectId && task.status !== 'done';
  if (view === 'today') return task.status !== 'done' && (task.dueDate === today || (!!task.dueDate && task.dueDate < today));
  if (view === 'upcoming') return task.status !== 'done' && !!task.dueDate && task.dueDate > today;
  if (view.startsWith('project:')) return task.projectId === view.slice(8) && task.status !== 'done';
  if (view === 'focus' || view === 'insights') return false;
  return task.status !== 'done';
}
export function selectTasks(data: AppData, view: View, query: string, sort: Sort, today = localDay()): Task[] {
  const q = query.trim().toLocaleLowerCase();
  const projects = new Map(data.projects.map(p => [p.id, p.name]));
  return data.tasks.filter(t => inView(t, view, today) && (!q || [t.title, t.notes, ...t.tags, ...t.subtasks.map(s => s.title), projects.get(t.projectId || '') || ''].some(v => v.toLocaleLowerCase().includes(q)))).sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title, 'zh-CN');
    if (sort === 'created') return b.createdAt.localeCompare(a.createdAt);
    if (sort === 'priority') return priorityRank[b.priority] - priorityRank[a.priority] || (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
    if (sort === 'due') return (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || priorityRank[b.priority] - priorityRank[a.priority];
    return (a.status === 'doing' ? -1 : 0) - (b.status === 'doing' ? -1 : 0) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || priorityRank[b.priority] - priorityRank[a.priority] || a.createdAt.localeCompare(b.createdAt);
  });
}
export function normalizeData(value: unknown): AppData {
  if (!value || typeof value !== 'object') throw new Error('文件格式无效');
  const raw = value as Partial<AppData>;
  if (raw.version !== 1 || !Array.isArray(raw.tasks) || !Array.isArray(raw.projects) || !raw.settings || typeof raw.settings !== 'object') throw new Error('不是有效的 Linea 备份文件');
  const text = (v: unknown, fallback = '') => typeof v === 'string' ? v.slice(0, 10000) : fallback;
  const day = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  const iso = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : new Date().toISOString();
  const ids = new Set<string>();
  const projects = raw.projects.filter(p => p && typeof p === 'object').map(p => ({ id: text(p.id) || uid(), name: text(p.name, '未命名项目').slice(0, 80), color: /^#[0-9a-fA-F]{6}$/.test(p.color) ? p.color : '#8cdaa9', createdAt: iso(p.createdAt) }));
  const tasks = raw.tasks.filter(t => t && typeof t === 'object').map(t => {
    const id = text(t.id) || uid(); const safeId = ids.has(id) ? uid() : id; ids.add(safeId);
    return {
      id: safeId, title: text(t.title, '未命名任务').slice(0, 300), notes: text(t.notes),
      status: (['todo', 'doing', 'done'].includes(t.status) ? t.status : 'todo') as Task['status'],
      priority: (['none', 'low', 'medium', 'high'].includes(t.priority) ? t.priority : 'none') as Task['priority'],
      dueDate: day(t.dueDate), dueTime: typeof t.dueTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t.dueTime) ? t.dueTime : null,
      projectId: typeof t.projectId === 'string' && projects.some(p => p.id === t.projectId) ? t.projectId : null,
      tags: Array.isArray(t.tags) ? t.tags.filter((v): v is string => typeof v === 'string').slice(0, 30).map(v => v.slice(0, 40)) : [],
      subtasks: Array.isArray(t.subtasks) ? t.subtasks.filter(s => s && typeof s.title === 'string').slice(0, 100).map(s => ({ id: text(s.id) || uid(), title: text(s.title).slice(0, 300), done: !!s.done })) : [],
      repeat: (['none', 'daily', 'weekdays', 'weekly', 'monthly'].includes(t.repeat) ? t.repeat : 'none') as Task['repeat'],
      reminder: typeof t.reminder === 'number' && [0, 5, 15, 30, 60, 1440].includes(t.reminder) ? t.reminder : null,
      estimatedMinutes: typeof t.estimatedMinutes === 'number' && t.estimatedMinutes > 0 && t.estimatedMinutes <= 1440 ? t.estimatedMinutes : null,
      starred: !!t.starred, archived: !!t.archived, createdAt: iso(t.createdAt), updatedAt: iso(t.updatedAt), completedAt: t.completedAt ? iso(t.completedAt) : null
    } satisfies Task;
  });
  return { version: 1, tasks, projects, settings: { theme: raw.settings.theme === 'light' ? 'light' : 'dark', focusMinutes: Number(raw.settings.focusMinutes) >= 1 && Number(raw.settings.focusMinutes) <= 120 ? Number(raw.settings.focusMinutes) : 25, breakMinutes: Number(raw.settings.breakMinutes) >= 1 && Number(raw.settings.breakMinutes) <= 60 ? Number(raw.settings.breakMinutes) : 5, notifications: raw.settings.notifications !== false } };
}
