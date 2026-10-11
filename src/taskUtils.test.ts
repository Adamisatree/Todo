import { describe, expect, it } from 'vitest';
import { addDays, completeTask, inView, localDay, nextRepeatDate, normalizeData, selectTasks } from './taskUtils';
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
    expect(next.dueDate).toBe('2026-10-11');
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
