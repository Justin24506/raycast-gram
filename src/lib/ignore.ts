import { LocalStorage } from "@raycast/api";

export type IgnoredMap = Record<string, number | null>;

export async function getIgnoredExtensionsMap(): Promise<IgnoredMap> {
  const data = await LocalStorage.getItem<string>("ignored-extensions-map");
  if (!data) return {};

  const map: IgnoredMap = JSON.parse(data);
  const now = Date.now();
  let hasChanges = false;

  for (const [id, expiry] of Object.entries(map)) {
    if (expiry !== null && expiry < now) {
      delete map[id];
      hasChanges = true;
    }
  }

  if (hasChanges) {
    await LocalStorage.setItem("ignored-extensions-map", JSON.stringify(map));
  }

  return map;
}

export async function setExtensionIgnore(id: string, durationMs: number | null): Promise<IgnoredMap> {
  const map = await getIgnoredExtensionsMap();

  if (durationMs === null) {
    map[id] = null;
  } else {
    map[id] = Date.now() + durationMs;
  }

  await LocalStorage.setItem("ignored-extensions-map", JSON.stringify(map));
  return map;
}

export async function removeExtensionIgnore(id: string): Promise<IgnoredMap> {
  const map = await getIgnoredExtensionsMap();
  delete map[id];
  await LocalStorage.setItem("ignored-extensions-map", JSON.stringify(map));
  return map;
}
