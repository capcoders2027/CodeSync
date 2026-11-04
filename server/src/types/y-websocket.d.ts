declare module 'y-websocket/bin/utils' {
  export const setupWSConnection: (
    conn: any,
    req: any,
    options?: { docName?: string; gc?: boolean }
  ) => void;
  export const setPersistence: (persistence: {
    bindState: (docName: string, ydoc: any) => void;
    writeState: (docName: string, ydoc: any) => Promise<any>;
  }) => void;
}
