import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { LocalStorageConfig } from "../configs/LocalStorageConfig.js";
import type {
  LocalStorageFileInput,
  LocalStorageFileRecord,
  LocalStorageRepository
} from "../repositories/LocalStorageRepository.js";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export class LocalStorageDataSource implements LocalStorageRepository {
  constructor(
    private readonly config: typeof LocalStorageConfig = LocalStorageConfig
  ) {}

  async saveTempFile(input: LocalStorageFileInput): Promise<LocalStorageFileRecord> {
    const folder = input.folder
      ? path.join(this.config.tempDirectory, input.folder)
      : this.config.tempDirectory;
    const safeFileName = sanitizeFileName(input.fileName);
    const absolutePath = path.join(folder, safeFileName);

    await mkdir(folder, { recursive: true });
    await writeFile(absolutePath, input.textContent, "utf8");

    return {
      fileName: safeFileName,
      mimeType: input.mimeType ?? "text/plain",
      absolutePath,
      relativePath: path.relative(process.cwd(), absolutePath),
      size: Buffer.byteLength(input.textContent, "utf8")
    };
  }

  async saveTempFiles(
    inputs: LocalStorageFileInput[]
  ): Promise<LocalStorageFileRecord[]> {
    return Promise.all(inputs.map((input) => this.saveTempFile(input)));
  }
}
