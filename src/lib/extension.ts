import path from "path";
import fs from "fs/promises";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { apiFetch } from "./api";

const execAsync = promisify(exec);

export interface ZedExtension {
  id: string;
  name: string;
  description: string;
  version: string;
  authors: string[];
  repository: string;
  schema_version: number;
  wasm_api_version: string | null;
  provides: string[];
  published_at: string;
  download_count: number;
}

export interface ZedResponse {
  data: ZedExtension[];
}

interface InstallExtensionOptions {
  downloadUrl: string;
  extensionId: string;
  targetInstalledDir: string;
}

interface InstalledExtension {
  id: string;
  version: string;
}

export interface ExtensionVersionInfo {
  published_at: string;
  version: string;
  schema_version: number;
  wasm_api_version: string | null;
}

export function parseAuthor(authorString: string) {
  const match = authorString.match(/^([^<]+)(?:\s*<([^>]+)>)?$/);
  if (match) {
    return {
      name: match[1].trim(),
      email: match[2] ? match[2].trim() : null,
    };
  }
  return { name: authorString.trim(), email: null };
}

export function exactWordMatch(text: string, query: string): boolean {
  if (!query) return true;

  const searchWords = query.toLowerCase().trim().split(/\s+/);
  const cleanText = text.toLowerCase();

  return searchWords.every((word) => cleanText.includes(word));
}

export function getDomainLabel(urlKey: string): string {
  try {
    const hostname = new URL(urlKey).hostname.toLowerCase();

    const platformRegistry: Record<string, string> = {
      "github.com": "GitHub",
      "gitlab.com": "GitLab",
      "bitbucket.org": "BitBucket",
      "sourceforge.net": "SourceForge",
    };

    const matchedKey = Object.keys(platformRegistry).find((key) => hostname.includes(key));

    if (matchedKey) {
      return platformRegistry[matchedKey];
    }

    const cleanName = hostname.replace("www.", "").split(".")[0];
    return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  } catch {
    return "Repository";
  }
}

export async function downloadAndInstallExtension({
  downloadUrl,
  extensionId,
  targetInstalledDir,
}: InstallExtensionOptions): Promise<void> {
  const isTarGz = true;
  const tempFilePath = path.join(os.tmpdir(), `${extensionId}.tar.gz`);
  const finalDestDir = path.join(targetInstalledDir, extensionId);

  try {
    const response = await apiFetch(downloadUrl);
    if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);

    const buffer = await response.arrayBuffer();
    await fs.writeFile(tempFilePath, Buffer.from(buffer));

    await fs.rm(finalDestDir, { recursive: true, force: true });

    await fs.mkdir(finalDestDir, { recursive: true });

    if (isTarGz) {
      await execAsync(`tar -xzf "${tempFilePath}" -C "${finalDestDir}"`);
    } else {
      await execAsync(`unzip -q "${tempFilePath}" -d "${finalDestDir}"`);
    }

    console.log(`Successfully installed ${extensionId} to ${finalDestDir}`);
  } catch (error) {
    await fs.rm(finalDestDir, { recursive: true, force: true });
    throw error;
  } finally {
    await fs.rm(tempFilePath, { force: true });
  }
}

export async function getInstalledExtensions(extensionPath: string): Promise<InstalledExtension[]> {
  const installedFolderPath = path.join(extensionPath, "installed");

  try {
    const files = await fs.readdir(installedFolderPath, { withFileTypes: true });
    const folders = files.filter((file) => file.isDirectory() || file.isSymbolicLink());

    const extensionPromises = folders.map(async (file) => {
      const folderName = file.name;
      const tomlPath = path.join(installedFolderPath, folderName, "extension.toml");

      try {
        const tomlContent = await fs.readFile(tomlPath, "utf-8");

        const versionMatch = tomlContent.match(/^version\s*=\s*"([^"]+)"/m);

        return {
          id: folderName,
          version: versionMatch ? versionMatch[1] : "unknown",
        };
      } catch {
        try {
          const jsonPath = path.join(installedFolderPath, folderName, "package.json");
          const jsonContent = await fs.readFile(jsonPath, "utf-8");
          const pkg = JSON.parse(jsonContent);
          return {
            id: folderName,
            version: pkg.version || "unknown",
          };
        } catch {
          return {
            id: folderName,
            version: "unknown",
          };
        }
      }
    });

    return await Promise.all(extensionPromises);
  } catch (error) {
    console.log("Directory scan failed or directory doesn't exist yet. Error => ", error);
    return [];
  }
}

export async function getExtensionVersions(extensionId: string): Promise<ExtensionVersionInfo[]> {
  try {
    const response = await apiFetch(`https://api.zed.dev/extensions/${extensionId}`);

    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status}`);
    }

    const json = (await response.json()) as ZedResponse;

    const data = json.data || [];

    return data
      .map((item) => ({
        published_at: new Date(item.published_at).toLocaleDateString(),
        version: item.version,
        schema_version: item.schema_version,
        wasm_api_version: item.wasm_api_version,
      }))
      .reverse();
  } catch (error) {
    console.error(`Failed to fetch versions for ${extensionId}:`, error);
    return [];
  }
}
