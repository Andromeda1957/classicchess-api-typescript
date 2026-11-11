// The parts of the Electron API this example uses, so building it needs no
// Electron install. The `electron` package supplies the complete types.
export interface WebFrameMain { readonly url: string }

export interface WebContents {
  readonly mainFrame: WebFrameMain;
  setWindowOpenHandler(handler: () => { action: 'deny' }): void;
  on(event: 'will-navigate', listener: (event: { preventDefault(): void }) => void): this;
}

export interface BrowserWindowOptions {
  width: number;
  height: number;
  webPreferences: { preload: string; contextIsolation: boolean; sandbox: boolean; nodeIntegration: boolean };
}

export declare class BrowserWindow {
  constructor(options: BrowserWindowOptions);
  readonly webContents: WebContents;
  on(event: 'closed', listener: () => void): this;
  loadURL(url: string): Promise<void>;
}

export interface IpcMainInvokeEvent {
  readonly sender: WebContents;
  readonly senderFrame: WebFrameMain | null;
}

export declare const app: {
  whenReady(): Promise<void>;
  on(event: 'window-all-closed', listener: () => void): unknown;
  quit(): void;
};

export declare const ipcMain: {
  handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>): void;
  removeHandler(channel: string): void;
};

export declare const contextBridge: { exposeInMainWorld(apiKey: string, api: object): void };

export declare const ipcRenderer: { invoke(channel: string, ...args: unknown[]): Promise<unknown> };
