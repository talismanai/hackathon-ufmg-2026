export type LocalStorageFileInput = {
  fileName: string;
  mimeType?: string;
  textContent: string;
  folder?: string;
};

export type LocalStorageFileRecord = {
  fileName: string;
  mimeType: string;
  absolutePath: string;
  relativePath: string;
  size: number;
};

export interface LocalStorageRepository {
  saveTempFile(input: LocalStorageFileInput): Promise<LocalStorageFileRecord>;
  saveTempFiles(inputs: LocalStorageFileInput[]): Promise<LocalStorageFileRecord[]>;
}
