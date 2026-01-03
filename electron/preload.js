const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    // File System Operations
    saveFile: (path, content) => ipcRenderer.invoke('save-file', path, content),
    readFile: (path) => ipcRenderer.invoke('read-file', path),
    createDirectory: (path) => ipcRenderer.invoke('create-directory', path),
    exists: (path) => ipcRenderer.invoke('file-exists', path),
    joinPath: (...args) => ipcRenderer.invoke('join-path', ...args),

    // App Info
    getDocumentsPath: () => ipcRenderer.invoke('get-documents-path'),

    // Platform info
    platform: process.platform
});
