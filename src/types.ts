export type Status = 'todo' | 'doing' | 'done';
export type Priority = 'none' | 'low' | 'medium' | 'high';
export type Repeat = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';
export type View = 'today' | 'inbox' | 'upcoming' | 'all' | 'starred' | 'completed' | 'archive' | 'focus' | 'insights' | `project:${string}`;
export type Sort = 'smart' | 'due' | 'priority' | 'created' | 'title' | 'manual' | 'shortest' | 'longest';
export interface Subtask { id: string; title: string; done: boolean }
export interface Task {
  id: string; title: string; notes: string; status: Status; priority: Priority;
  dueDate: string | null; dueTime: string | null; projectId: string | null;
  tags: string[]; subtasks: Subtask[]; repeat: Repeat; reminder: number | null;
  estimatedMinutes: number | null; dailyGoal: number; dailyProgress: number; order: number;
  starred: boolean; archived: boolean; skippedAt: string | null;
  createdAt: string; updatedAt: string; completedAt: string | null;
}
export interface Project { id: string; name: string; color: string; createdAt: string }
export interface Settings { theme: 'dark' | 'light'; focusMinutes: number; breakMinutes: number; notifications: boolean; sort: Sort }
export interface AppData { version: 1; tasks: Task[]; projects: Project[]; settings: Settings }
export interface DesktopBridge {
  load: () => Promise<AppData | null>;
  save: (data: AppData) => Promise<void>;
  export: (data: AppData) => Promise<boolean>;
  import: () => Promise<AppData | null>;
  notify: (title: string, body: string) => Promise<void>;
}
declare global { interface Window { linea?: DesktopBridge } }
