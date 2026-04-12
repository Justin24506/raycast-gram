import { homedir } from "os";
import { getApplications, getPreferenceValues } from "@raycast/api";
import { execWithCleanEnv, isMacOS } from "./utils";
import { gramBuild } from "./preferences";
import fs from "fs";

export type GramBuild = Preferences["build"];
export type GramBundleId = "app.liten.Gram"| "app.liten.Gram-Dev";

const GramBundleIdBuildMapping: Record<GramBuild, { macos: GramBundleId }> = {
  Gram: { macos: "app.liten.Gram" },
  "Gram Dev": { macos: "app.liten.Gram-Dev" },
};

const GramDbNameMapping: Record<GramBuild, string> = {
  Gram: "0-stable",
  "Gram Dev": "0-dev",
};

/**
 * Known CLI installation paths for Gram on macOS.
 * The CLI can be installed via "gram: install cli" command in Gram.
 */
const GramCliPaths: Record<GramBuild, string> = {
  Gram: "/usr/local/bin/gram",
  "Gram Dev": "/usr/local/bin/gram-dev",
};

/**
 * Fallback CLI paths inside the Gram app bundle.
 */
const GramAppCliPaths: Record<GramBuild, string> = {
  Gram: "/Applications/Gram.app/Contents/MacOS/cli",
  "Gram Dev": "/Applications/Gram Dev.app/Contents/MacOS/cli",
};

export function getGramBundleId(build: GramBuild): GramBundleId {
  return GramBundleIdBuildMapping[build].macos;
}

export function getGramDbName(build: GramBuild): string {
  return GramDbNameMapping[build];
}

export function geGramDbPath() {
  const preferences = getPreferenceValues<Preferences>();
  const GramBuild = preferences.build;
  if (isMacOS) {
    return `${homedir()}/Library/Application Support/Gram/db/${getGramDbName(GramBuild)}/db.sqlite`;
  } else { /* empty */ }
}

export async function getGramApp() {
  const applications = await getApplications();
  const gramBundleId = getGramBundleId(gramBuild);
  const app = applications.find((a) => {
    if (isMacOS) {
      return a.bundleId === gramBundleId;
    } else {
      /* empty */
    }
  });

  return app;
}

/**
 * Get the path to the Gram CLI executable.
 * First checks for the installed CLI (via "gram: install cli"), then falls back to the app bundle CLI.
 * Returns null if no CLI is found.
 */
export function getGramCliPath(build: GramBuild = gramBuild): string | null {
  // Check for installed CLI first
  const installedCliPath = GramCliPaths[build];
  if (fs.existsSync(installedCliPath)) {
    return installedCliPath;
  }

  // Fall back to CLI inside app bundle
  const appCliPath = GramAppCliPaths[build];
  if (fs.existsSync(appCliPath)) {
    return appCliPath;
  }

  return null;
}

const GramProcessNameMapping: Record<GramBundleId, string> = {
  "app.liten.Gram": "Gram",
  "app.liten.Gram-Dev": "Gram Dev",
}

/**
 * Open a workspace with multiple paths using the Gram CLI.
 * This is required for multi-folder workspaces since the URI scheme only supports a single path.
 *
 * Uses a clean environment to prevent Raycast's environment variables from
 * being inherited by Gram terminals.
 *
 * @param cliPath - Path to the Gram CLI executable
 * @param paths - Array of paths to open (supports multiple folders)
 * @param newWindow - Whether to open in a new window (default: false)
 * @returns Promise that resolves when the command completes
 */
export async function openWithGramCli(cliPath: string, paths: string[], newWindow = false): Promise<void> {
  const args = newWindow ? ["-n", ...paths] : paths;

  try {
    await execWithCleanEnv(cliPath, args);
  } catch (error) {
    console.error("Failed to open with Gram CLI:", error);
    throw error;
  }
}