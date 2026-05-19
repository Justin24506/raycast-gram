import path from "path";
import { getGramExtensionPath, GramBuild } from "./gram";
import { getInstalledExtensions, downloadAndInstallExtension, ZedResponse } from "./extension";
import { getIgnoredExtensionsMap } from "./ignore";
import { apiFetch } from "./api";

export async function processBackgroundUpdates(gramBuild: GramBuild): Promise<number> {
  const extensionPath = getGramExtensionPath(gramBuild);
  const installed = await getInstalledExtensions(extensionPath);

  if (installed.length === 0) return 0;

  const installedMap = installed.reduce<Record<string, string>>((acc, ext) => {
    acc[ext.id] = ext.version;
    return acc;
  }, {});

  const url = new URL("https://api.zed.dev/extensions");
  url.searchParams.append("max_schema_version", "1");
  const response = await apiFetch(url.toString());
  if (!response.ok) throw new Error("Failed to fetch Zed registry");

  const json = (await response.json()) as ZedResponse;
  const allExtensions = json.data || [];

  const ignoredMap = await getIgnoredExtensionsMap();

  const outdated = allExtensions.filter((ext) => {
    if (ext.id in ignoredMap) return false;

    const installedVersion = installedMap[ext.id];
    return installedVersion && installedVersion !== "unknown" && installedVersion !== ext.version;
  });

  if (outdated.length === 0) return 0;

  let successCount = 0;
  const targetInstalledDir = path.join(extensionPath, "installed");

  for (const ext of outdated) {
    try {
      const downloadUrl = `https://api.zed.dev/extensions/${ext.id}/download?min_schema_version=1&max_schema_version=${ext.schema_version}&min_wasm_api_version=0.0.1&max_wasm_api_version=${ext.wasm_api_version || "1.0.0"}`;

      await downloadAndInstallExtension({
        downloadUrl,
        extensionId: ext.id,
        targetInstalledDir,
      });
      successCount++;
    } catch (err) {
      console.error(`Failed to update ${ext.name}:`, err);
    }
  }

  return successCount;
}
