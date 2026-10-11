// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

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
