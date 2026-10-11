const { app, BrowserWindow, ipcMain, dialog, Notification, shell } = require('electron');
const { join } = require('node:path');
const fs = require('node:fs/promises');

let window;
let writeQueue = Promise.resolve();
let pendingWrites = 0;
let quitAfterWrites = false;
const dataPath = () => join(app.getPath('userData'), 'linea-data.json');

function validData(value) {
  return value && typeof value === 'object' && value.version === 1 && Array.isArray(value.tasks) && Array.isArray(value.projects) && value.settings && typeof value.settings === 'object';
}
async function readData() {
  try {
    const value = JSON.parse(await fs.readFile(dataPath(), 'utf8'));
    if (!validData(value)) throw new Error('文件格式无效');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    try {
      const value = JSON.parse(await fs.readFile(dataPath() + '.bak', 'utf8'));
      if (validData(value)) return value;
    } catch (_) { /* no valid backup */ }
    throw new Error('无法读取任务数据。请检查本地数据文件及其备份。');
  }
}
async function saveData(value) {
  if (!validData(value)) throw new Error('无效的任务数据');
  const file = dataPath();
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  const temp = file + '.tmp';
  // Keep the previous successful save as a recovery point; serialize writes via writeQueue.
  try { await fs.copyFile(file, file + '.bak'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temp, file);
}

function createWindow() {
  window = new BrowserWindow({
    width: 1460, height: 940, minWidth: 980, minHeight: 650, backgroundColor: '#0a1014',
    title: 'Linea Tasks', show: false,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (!app.isPackaged) window.loadURL('http://localhost:5173');
  else window.loadFile(join(__dirname, '../dist/index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('data:load', readData);
  ipcMain.handle('data:save', (_, value) => {
    // Catch on the queue so a failed write does not permanently block future writes.
    pendingWrites++;
    writeQueue = writeQueue.catch(() => {}).then(() => saveData(value)).finally(() => { pendingWrites--; });
    return writeQueue;
  });
  ipcMain.handle('data:export', async (_, value) => {
    if (!validData(value)) throw new Error('无效的任务数据');
    const { canceled, filePath } = await dialog.showSaveDialog(window, { title: '导出 Linea 数据', defaultPath: 'linea-backup.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (canceled || !filePath) return false;
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
    return true;
  });
  ipcMain.handle('data:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(window, { title: '导入 Linea 数据', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (canceled || !filePaths.length) return null;
    const value = JSON.parse(await fs.readFile(filePaths[0], 'utf8'));
    if (!validData(value)) throw new Error('不是有效的 Linea 备份文件');
    return value;
  });
  ipcMain.handle('notify', (_, { title, body }) => {
    if (typeof title === 'string' && typeof body === 'string' && Notification.isSupported()) new Notification({ title: title.slice(0, 120), body: body.slice(0, 500) }).show();
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', event => {
  if (pendingWrites && !quitAfterWrites) {
    event.preventDefault();
    writeQueue.finally(() => { quitAfterWrites = true; app.quit(); });
  }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
