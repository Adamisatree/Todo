import type { AppData } from './types';
import { initialData } from './seed';
import { normalizeData } from './taskUtils';
const KEY = 'linea-tasks-v1';
export async function loadData(): Promise<AppData> {
  const value = window.linea ? await window.linea.load() : JSON.parse(localStorage.getItem(KEY) || 'null');
  return value ? normalizeData(value) : initialData();
}
export async function saveData(data: AppData) {
  if (window.linea) await window.linea.save(data);
  else localStorage.setItem(KEY, JSON.stringify(data));
}
export async function exportData(data: AppData) {
  if (window.linea) return window.linea.export(data);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'linea-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return true;
}
export async function importData(): Promise<AppData | null> {
  if (window.linea) { const value = await window.linea.import(); return value ? normalizeData(value) : null; }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async () => { try { const file = input.files?.[0]; resolve(file ? normalizeData(JSON.parse(await file.text())) : null); } catch (error) { reject(error); } };
    input.click();
  });
}
export function notify(title: string, body: string) {
  if (window.linea) void window.linea.notify(title, body);
  else if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
}
