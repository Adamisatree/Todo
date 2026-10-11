import { describe, expect, it } from 'vitest';
import { addDays, completeTask, estimateFromParts, extraToday, formatEstimate, inView, localDay, nextRepeatDate, normalizeData, plannedMinutes, reorderVisibleTasks, selectTasks, skipTask } from './taskUtils';
import { initialData, newTask } from './seed';

describe('calendar helpers', () => {
  it('moves safely over month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(nextRepeatDate('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(nextRepeatDate('2026-10-09', 'weekdays')).toBe('2026-10-12');
    expect(nextRepeatDate('2026-10-11', 'weekly')).toBe('2026-10-18');
  });
  it('completes recurring tasks and creates one next actionable instance', () => {
    const task = newTask('复习', { dueDate: '2026-10-01', repeat: 'daily', subtasks: [{ id: 'step', title: '复习词汇', done: true }] });
    const [done, next] = completeTask(task, new Date('2026-10-11T12:00:00'));
    expect(done.status).toBe('done');
    expect(next.dueDate).toBe('2026-10-12');
    expect(next.status).toBe('todo');
    expect(next.id).not.toBe(task.id);
    expect(next.subtasks[0]).toMatchObject({ title: '复习词汇', done: false });
  });
  it('does not duplicate a completed recurring task', () => {
    const task = newTask('复习', { dueDate: localDay(), repeat: 'daily', status: 'done' });
    expect(completeTask(task)).toEqual([task]);
  });
});

describe('task views and search', () => {
  it('puts overdue tasks in Today and keeps undated tasks in Inbox', () => {
    const late = newTask('过期', { dueDate: '2026-10-09' });
    const undated = newTask('想法');
    expect(inView(late, 'today', '2026-10-11')).toBe(true);
    expect(inView(undated, 'today', '2026-10-11')).toBe(false);
    expect(inView(undated, 'inbox', '2026-10-11')).toBe(true);
    expect(inView({ ...late, archived: true }, 'today', '2026-10-11')).toBe(false);
  });
  it('finds title, notes, tags, subtasks and project name', () => {
    const data = initialData();
    expect(selectTasks(data, 'all', '课堂笔记', 'smart').some(t => t.title === '完成本周的课程作业')).toBe(true);
    expect(selectTasks(data, 'all', '收件箱', 'smart').some(t => t.title === '记录一个突然冒出的想法')).toBe(true);
    expect(selectTasks(data, 'all', '采购', 'smart').some(t => t.title === '购买日常用品')).toBe(true);
    expect(selectTasks(data, 'all', '工作事项', 'smart').some(t => t.title === '回复重要邮件')).toBe(true);
  });
  it('sorts by priority when requested', () => {
    const data = initialData();
    const sorted = selectTasks(data, 'all', '', 'priority');
    expect(sorted[0].priority).toBe('high');
  });
});

describe('backup validation', () => {
  it('rejects invalid or incompatible backups', () => {
    expect(() => normalizeData({ version: 2, tasks: [], projects: [], settings: {} })).toThrow();
    expect(() => normalizeData(null)).toThrow();
  });
  it('normalizes malformed optional fields and orphaned projects', () => {
    const data = normalizeData({ version: 1, settings: { theme: 'rainbow' }, projects: [], tasks: [{ id: 'a', title: 'Hello', status: 'broken', projectId: 'missing', tags: [7, 'valid'], subtasks: [], priority: 'bad' }] });
    expect(data.tasks[0]).toMatchObject({ status: 'todo', priority: 'none', projectId: null, tags: ['valid'] });
    expect(data.settings.focusMinutes).toBe(25);
  });
});

describe('daily routine and planning', () => {
  it('keeps multiple daily completions on the same local day, then advances once', () => {
    const today = '2026-10-11';
    const now = new Date('2026-10-11T12:00:00');
    const task = newTask('单词', { repeat: 'daily', dueDate: today, dailyGoal: 3, estimatedMinutes: 20 });
    const [, second] = completeTask(task, now);
    expect(second).toMatchObject({ dueDate: today, dailyProgress: 1, status: 'todo' });
    const [, third] = completeTask(second, now);
    expect(third).toMatchObject({ dueDate: today, dailyProgress: 2 });
    const [, tomorrow] = completeTask(third, now);
    expect(tomorrow).toMatchObject({ dueDate: '2026-10-12', dailyProgress: 0 });
    expect(plannedMinutes([second], today)).toBe(40);
  });
  it('anchors a future or overdue completion to the system day, never a year later', () => {
    const now = new Date('2026-10-11T12:00:00');
    const future = newTask('单词', { repeat: 'daily', dueDate: '2027-01-01' });
    const overdue = newTask('单词', { repeat: 'daily', dueDate: '2025-01-01' });
    expect(completeTask(future, now)[1].dueDate).toBe('2026-10-12');
    expect(completeTask(overdue, now)[1].dueDate).toBe('2026-10-12');
  });
  it('skips to the next day without counting a completion and resets progress', () => {
    const task = newTask('单词', { repeat: 'daily', dueDate: '2026-10-11', dailyGoal: 3, dailyProgress: 2 });
    const [skipped, next] = skipTask(task, new Date('2026-10-11T12:00:00'));
    expect(skipped).toMatchObject({ status: 'done', completedAt: null });
    expect(skipped.skippedAt).toBeTruthy();
    expect(next).toMatchObject({ status: 'todo', dueDate: '2026-10-12', dailyProgress: 0 });
  });
  it('adds an extra practice session without advancing the recurring schedule', () => {
    const task = newTask('单词', { repeat: 'daily', dueDate: '2026-10-12', dailyGoal: 3 });
    const extra = extraToday(task, new Date('2026-10-11T12:00:00'));
    expect(extra).toMatchObject({ repeat: 'none', dueDate: '2026-10-11', status: 'todo' });
    expect(task.dueDate).toBe('2026-10-12');
  });
  it('converts hours and minutes, totals remaining sessions, and preserves manual ordering', () => {
    expect(estimateFromParts(1, 25)).toBe(85);
    expect(formatEstimate(85)).toBe('1小时25分');
    expect(estimateFromParts(0, 0)).toBeNull();
    const a = newTask('A', { order: 0 });
    const b = newTask('B', { order: 1 });
    const c = newTask('C', { order: 2 });
    const ordered = reorderVisibleTasks([a, b, c], [c.id, a.id]);
    expect(ordered.slice().sort((x, y) => x.order - y.order).map(t => t.title)).toEqual(['C', 'A', 'B']);
    expect(selectTasks({ ...initialData(), tasks: ordered }, 'all', '', 'manual').map(t => t.title)).toEqual(['C', 'A', 'B']);
  });
  it('reads older backups without dropping tasks or project data', () => {
    const older = initialData();
    const oldTask = { ...older.tasks[0] } as Record<string, unknown>;
    delete oldTask.dailyGoal; delete oldTask.dailyProgress; delete oldTask.order; delete oldTask.skippedAt;
    const oldSettings = { ...older.settings } as Record<string, unknown>;
    delete oldSettings.sort;
    const normalized = normalizeData({ ...older, tasks: [oldTask], settings: oldSettings });
    expect(normalized.tasks[0]).toMatchObject({ dailyGoal: 1, dailyProgress: 0, order: 0, skippedAt: null });
    expect(normalized.settings.sort).toBe('smart');
    expect(normalized.projects).toHaveLength(3);
  });
});
