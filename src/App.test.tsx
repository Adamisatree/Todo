// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { addDays, localDay } from './taskUtils';

let root: Root;
let mount: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('crypto', { randomUUID: () => Math.random().toString(36).slice(2) });
  localStorage.clear();
  mount = document.createElement('div'); document.body.appendChild(mount);
  root = createRoot(mount);
});
afterEach(async () => { await act(async () => root.unmount()); mount.remove(); vi.unstubAllGlobals(); });
const wait = async () => { await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };

describe('desktop task workflow', () => {
  it('loads the offline starter tasks and saves a new task', async () => {
    await act(async () => root.render(<App />)); await wait();
    expect(mount.textContent).toContain('完成本周的课程作业');
    const input = mount.querySelector<HTMLInputElement>('input[aria-label="快速添加任务"]')!;
    await act(async () => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; setter.call(input, '编写实验报告'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    const button = mount.querySelector<HTMLButtonElement>('button[aria-label="添加任务"]')!;
    await act(async () => button.click());
    expect(mount.textContent).toContain('编写实验报告');
    expect(JSON.parse(localStorage.getItem('linea-tasks-v1')!).tasks.some((t: {title: string}) => t.title === '编写实验报告')).toBe(true);
  });
  it('opens task details and allows updating status', async () => {
    await act(async () => root.render(<App />)); await wait();
    const row = [...mount.querySelectorAll('.task-row')].find(el => el.textContent?.includes('完成本周的课程作业')) as HTMLElement;
    await act(async () => row.click());
    expect(mount.querySelector('.inspector')).not.toBeNull();
    expect(mount.querySelector<HTMLTextAreaElement>('textarea[aria-label="任务标题"]')?.value).toBe('完成本周的课程作业');
    await act(async () => mount.querySelector<HTMLButtonElement>('button[aria-label="关闭详情"]')!.click());
    expect(mount.querySelector('.inspector')).toBeNull();
  });
});

describe('planning controls', () => {
  it('adds hour/minute estimate in the quick-add form and shows total on Today', async () => {
    await act(async () => root.render(<App />)); await wait();
    const change = async (label: string, value: string) => {
      const el = mount.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
    };
    await change('新增任务预估小时', '1'); await change('新增任务预估分钟', '25');
    await change('快速添加任务', '写读书笔记');
    await act(async () => mount.querySelector<HTMLButtonElement>('button[aria-label="添加任务"]')!.click());
    const saved = JSON.parse(localStorage.getItem('linea-tasks-v1')!);
    expect(saved.tasks.find((t: { title: string }) => t.title === '写读书笔记').estimatedMinutes).toBe(85);
    expect(mount.textContent).toContain('1小时25分');
    expect(mount.textContent).toContain('今日任务总时长');
  });
  it('skips daily practice without adding a completion and moves it to tomorrow', async () => {
    await act(async () => root.render(<App />)); await wait();
    const skip = mount.querySelector<HTMLButtonElement>('button[aria-label="跳过 每日复习单词"]')!;
    expect(skip).toBeTruthy();
    await act(async () => skip.click());
    const saved = JSON.parse(localStorage.getItem('linea-tasks-v1')!);
    const practice = saved.tasks.filter((t: { title: string }) => t.title === '每日复习单词');
    expect(practice).toHaveLength(2);
    expect(practice[0].skippedAt).toBeTruthy();
    expect(practice[0].completedAt).toBeNull();
    expect(practice[1].dueDate).toBe(addDays(localDay(), 1));
  });
});

describe('recurrence and ordering UI', () => {
  it('lets daily practice finish three times today before moving to tomorrow', async () => {
    await act(async () => root.render(<App />)); await wait();
    for (let n = 1; n <= 3; n++) {
      const row = [...mount.querySelectorAll('.task-row')].find(el => el.textContent?.includes('每日复习单词')) as HTMLElement;
      expect(row).toBeTruthy();
      await act(async () => row.querySelector<HTMLButtonElement>('button[aria-label="完成任务"]')!.click());
      if (n < 3) expect(mount.textContent).toContain(`${n}/3 次`);
    }
    const saved = JSON.parse(localStorage.getItem('linea-tasks-v1')!);
    const practice = saved.tasks.filter((t: { title: string }) => t.title === '每日复习单词');
    expect(practice).toHaveLength(4);
    expect(practice.filter((t: { completedAt: string | null }) => !!t.completedAt)).toHaveLength(3);
    expect(practice[3].dueDate).toBe(addDays(localDay(), 1));
  });
  it('saves manual ordering using visible up/down controls', async () => {
    await act(async () => root.render(<App />)); await wait();
    const select = mount.querySelector<HTMLSelectElement>('select[aria-label="排序方式"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, 'manual'); select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(mount.textContent).toContain('自定义顺序');
    const before = [...mount.querySelectorAll('.task-row')].map(el => el.querySelector('.task-name')?.textContent);
    const down = mount.querySelector<HTMLButtonElement>(`button[aria-label="下移 ${before[0]}"]`)!;
    await act(async () => down.click());
    const after = [...mount.querySelectorAll('.task-row')].map(el => el.querySelector('.task-name')?.textContent);
    expect(after.slice(0, 2)).toEqual([before[1], before[0]]);
    expect(JSON.parse(localStorage.getItem('linea-tasks-v1')!).settings.sort).toBe('manual');
  });
});
