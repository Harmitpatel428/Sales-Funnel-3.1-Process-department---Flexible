export { };

declare global {
    interface Window {
        electron: {
            saveFile: (path: string, content: string | Buffer) => Promise<{ success: boolean; error?: string }>;
            readFile: (path: string) => Promise<{ success: boolean; data?: string; error?: string }>;
            createDirectory: (path: string) => Promise<{ success: boolean; error?: string }>;
            exists: (path: string) => Promise<boolean>;
            joinPath: (...args: string[]) => Promise<string>;
            getDocumentsPath: () => Promise<string>;
            platform: string;
        };
    }
}
