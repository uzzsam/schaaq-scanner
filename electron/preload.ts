import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('schaaq', {
  isElectron: true,
});
