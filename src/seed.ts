import type { AppData, Task } from './types';
import { addDays, localDay, uid } from './taskUtils';
export function newTask(title: string, fields: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return { id: uid(), title, notes: '', status: 'todo', priority: 'none', dueDate: null, dueTime: null, projectId: null, tags: [], subtasks: [], repeat: 'none', reminder: null, estimatedMinutes: null, starred: false, archived: false, createdAt: now, updatedAt: now, completedAt: null, ...fields };
}
export function initialData(): AppData {
  const today = localDay();
  const projects = [
    { id: 'study', name: '学习计划', color: '#a9dbad', createdAt: new Date().toISOString() },
    { id: 'life', name: '生活日常', color: '#c8b9ee', createdAt: new Date().toISOString() },
    { id: 'work', name: '工作事项', color: '#e8bd97', createdAt: new Date().toISOString() }
  ];
  return { version: 1, projects, settings: { theme: 'dark', focusMinutes: 25, breakMinutes: 5, notifications: true }, tasks: [
    newTask('完成本周的课程作业', { projectId: 'study', dueDate: today, priority: 'high', starred: true, tags: ['课程'], subtasks: [{ id: uid(), title: '整理课堂笔记', done: true }, { id: uid(), title: '完成练习题', done: false }, { id: uid(), title: '检查并提交', done: false }] }),
    newTask('阅读 30 分钟，做些笔记', { projectId: 'study', dueDate: today, priority: 'medium', status: 'doing', estimatedMinutes: 30 }),
    newTask('回复重要邮件', { projectId: 'work', dueDate: today, dueTime: '16:00', priority: 'medium', reminder: 15 }),
    newTask('整理本周待办和下周计划', { projectId: 'life', dueDate: today, priority: 'low' }),
    newTask('购买日常用品', { projectId: 'life', dueDate: addDays(today, 1), tags: ['采购'] }),
    newTask('准备周五的演示材料', { projectId: 'work', dueDate: addDays(today, 3), priority: 'high' }),
    newTask('每日复习单词', { projectId: 'study', dueDate: addDays(today, 1), repeat: 'daily', estimatedMinutes: 20 }),
    newTask('记录一个突然冒出的想法', { notes: '收件箱适合暂时不知道该放在哪里的事情。' })
  ] };
}
