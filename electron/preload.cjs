const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('linea', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (value) => ipcRenderer.invoke('data:save', value),
  export: (value) => ipcRenderer.invoke('data:export', value),
  import: () => ipcRenderer.invoke('data:import'),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body })
});
