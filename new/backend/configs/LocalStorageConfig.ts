import path from "node:path";

export const LocalStorageConfig = {
  tempDirectory:
    process.env.NEW_LOCAL_STORAGE_TEMP_DIR ??
    path.resolve(process.cwd(), "temp")
};

export type LocalStorageConnection = {
  tempDirectory: string;
};
