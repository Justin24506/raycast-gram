import { List, getPreferenceValues, ActionPanel, Action, Icon, showToast, Toast, Cache } from "@raycast/api";
import fs from "fs/promises";
import path from "path";
import { useEffect, useState, useMemo } from "react";

import { getGramExtensionPath, GramBuild } from "./lib/gram";
import {
  exactWordMatch,
  getInstalledExtensions,
  ZedExtension,
  ZedResponse,
  downloadAndInstallExtension,
  getDomainLabel,
} from "./lib/extension";
import { getIgnoredExtensionsMap, setExtensionIgnore, removeExtensionIgnore, IgnoredMap } from "./lib/ignore";
import { ExtensionItem } from "./components/extension-item";
import { VersionSubmenu } from "./components/version-submenu";
import { apiFetch } from "./lib/api";

const raycastCache = new Cache({ namespace: "zed-extensions" });

interface Preferences {
  build: string;
  autoUpdateInterval: string;
}

export default function Command() {
  const [extensions, setExtensions] = useState<ZedExtension[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [searchText, setSearchText] = useState<string>("");
  const [selectedProvides, setSelectedProvides] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const [installedExtensionsMap, setInstalledExtensionsMap] = useState<Record<string, string>>({});
  const [ignoredMap, setIgnoredMap] = useState<IgnoredMap>({});
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const [extensionCache, setExtensionCache] = useState<Record<string, ZedExtension>>(() => {
    const cachedData = raycastCache.get("master-list");
    return cachedData ? JSON.parse(cachedData) : {};
  });

  const preferences = getPreferenceValues<Preferences>();
  const gramBuild = preferences.build as GramBuild;

  useEffect(() => {
    getIgnoredExtensionsMap().then(setIgnoredMap);
  }, []);

  useEffect(() => {
    let isCanceled = false;
    const cachedArray = Object.values(extensionCache);

    if (searchText.trim() === "" && selectedProvides === "all" && cachedArray.length > 0) {
      const sortedCache = cachedArray.sort((a, b) => b.download_count - a.download_count);
      setExtensions(sortedCache);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const fetchExtensions = async () => {
      try {
        const url = new URL("https://api.zed.dev/extensions");
        url.searchParams.append("max_schema_version", "1");

        const trimmedSearch = searchText.trim();
        if (trimmedSearch) {
          url.searchParams.append("filter", trimmedSearch);
        }

        if (selectedProvides !== "all") {
          url.searchParams.append("provides", selectedProvides);
        }

        const response = await apiFetch(url.toString());
        if (!response.ok) throw new Error("Fetch failed");

        const json = (await response.json()) as ZedResponse;

        if (!isCanceled) {
          const fetchedData = json.data || [];
          setExtensions(fetchedData);

          setExtensionCache((prevCache) => {
            const updatedCache = { ...prevCache };
            fetchedData.forEach((ext) => {
              updatedCache[ext.id] = ext;
            });
            raycastCache.set("master-list", JSON.stringify(updatedCache));
            return updatedCache;
          });
        }
      } catch (err) {
        if (!isCanceled) console.error("API Error:", err);
      } finally {
        if (!isCanceled) setIsLoading(false);
      }
    };

    if (searchText.trim() !== "") {
      const debounceId = setTimeout(fetchExtensions, 300);
      return () => {
        isCanceled = true;
        clearTimeout(debounceId);
      };
    } else {
      fetchExtensions();
      return () => {
        isCanceled = true;
      };
    }
  }, [searchText, selectedProvides, refreshKey]);

  async function checkInstallations() {
    const extensionPath = getGramExtensionPath(gramBuild);
    const installed = await getInstalledExtensions(extensionPath);

    const installationMap = installed.reduce<Record<string, string>>((acc, ext) => {
      acc[ext.id] = ext.version;
      return acc;
    }, {});

    setInstalledExtensionsMap(installationMap);
  }

  useEffect(() => {
    checkInstallations();
  }, [gramBuild]);

  const outdatedExtensions = useMemo(() => {
    return Object.values(extensionCache).filter((ext) => {
      if (ext.id in ignoredMap) return false;

      const installedVersion = installedExtensionsMap[ext.id];
      return installedVersion && installedVersion !== "unknown" && installedVersion !== ext.version;
    });
  }, [extensionCache, installedExtensionsMap, ignoredMap]);

  const handleUpdateAll = async () => {
    if (outdatedExtensions.length === 0) return;

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Updating ${outdatedExtensions.length} extensions...`,
    });

    try {
      let successCount = 0;

      for (const ext of outdatedExtensions) {
        toast.message = `Updating ${ext.name} (${successCount + 1}/${outdatedExtensions.length})`;

        const baseExtensionPath = getGramExtensionPath(gramBuild);
        const targetInstalledDir = path.join(baseExtensionPath, "installed");

        const downloadUrl = `https://api.zed.dev/extensions/${ext.id}/download?min_schema_version=1&max_schema_version=${ext.schema_version}&min_wasm_api_version=0.0.1&max_wasm_api_version=${ext.wasm_api_version || "1.0.0"}`;

        await downloadAndInstallExtension({
          downloadUrl,
          extensionId: ext.id,
          targetInstalledDir,
        });

        successCount++;
      }

      toast.style = Toast.Style.Success;
      toast.title = `Successfully updated ${successCount} extensions!`;
      toast.message = "";
      await checkInstallations();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Auto-update failed midway";
      toast.message = String(error);
      await checkInstallations();
    }
  };

  const handleInstall = async (ext: ZedExtension, versionOverride?: string) => {
    const targetVersion = versionOverride || ext.version;
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: versionOverride ? `Installing v${targetVersion}...` : `Installing ${ext.name}...`,
    });

    try {
      const baseExtensionPath = getGramExtensionPath(gramBuild);
      const targetInstalledDir = path.join(baseExtensionPath, "installed");

      const downloadUrl = versionOverride
        ? `https://api.zed.dev/extensions/${ext.id}/${targetVersion}/download`
        : `https://api.zed.dev/extensions/${ext.id}/download?min_schema_version=1&max_schema_version=${ext.schema_version}&min_wasm_api_version=0.0.1&max_wasm_api_version=${ext.wasm_api_version || "1.0.0"}`;

      await downloadAndInstallExtension({
        downloadUrl,
        extensionId: ext.id,
        targetInstalledDir,
      });

      toast.style = Toast.Style.Success;
      toast.title = `Installed ${ext.name} v${targetVersion}!`;
      await checkInstallations();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Installation Failed";
      toast.message = String(error);
    }
  };

  const handleUninstall = async (ext: ZedExtension) => {
    const toast = await showToast({ style: Toast.Style.Animated, title: `Uninstalling ${ext.name}...` });
    try {
      const baseExtensionPath = getGramExtensionPath(gramBuild);
      const targetDir = path.join(baseExtensionPath, "installed", ext.id);

      await fs.rm(targetDir, { recursive: true, force: true });

      if (ext.id in ignoredMap) {
        const newMap = await removeExtensionIgnore(ext.id);
        setIgnoredMap(newMap);
      }

      toast.style = Toast.Style.Success;
      toast.title = `Uninstalled ${ext.name}`;
      await checkInstallations();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Uninstall Failed";
      toast.message = String(error);
    }
  };

  const handleClearCache = async () => {
    raycastCache.clear();
    setExtensionCache({});
    setRefreshKey((prev) => prev + 1);
    await showToast({ style: Toast.Style.Success, title: "Cache cleared successfully" });
  };

  const handleIgnore = async (ext: ZedExtension, label: string, durationMs: number | null) => {
    const newMap = await setExtensionIgnore(ext.id, durationMs);
    setIgnoredMap(newMap);
    await showToast({ style: Toast.Style.Success, title: `Updates Ignored: ${label}`, message: ext.name });
  };

  const handleResume = async (ext: ZedExtension) => {
    const newMap = await removeExtensionIgnore(ext.id);
    setIgnoredMap(newMap);
    await showToast({ style: Toast.Style.Success, title: "Updates Resumed", message: ext.name });
  };

  const allProvidesOptions = useMemo(() => {
    const uniqueProvides = new Set<string>();
    Object.values(extensionCache).forEach((ext) => {
      ext.provides?.forEach((item) => {
        uniqueProvides.add(item);
      });
    });
    return Array.from(uniqueProvides).sort();
  }, [extensionCache]);

  const filteredExtensions = useMemo(() => {
    const criteria = [
      {
        key: "id",
        regex: /id:(\S+)/,
        validator: (ext: ZedExtension, val: string) => ext.id.toLowerCase().includes(val),
      },
      {
        key: "name",
        regex: /name:(\S+)/,
        validator: (ext: ZedExtension, val: string) => ext.name.toLowerCase().includes(val),
      },
      {
        key: "desc",
        regex: /desc:(\S+)/,
        validator: (ext: ZedExtension, val: string) => ext.description.toLowerCase().includes(val),
      },
      {
        key: "version",
        regex: /version:(\S+)/,
        validator: (ext: ZedExtension, val: string) => ext.version.toLowerCase().includes(val),
      },
      {
        key: "author",
        regex: /author:(\S+)/,
        validator: (ext: ZedExtension, val: string) => ext.authors.some((a) => a.toLowerCase().includes(val)),
      },
      {
        key: "repo",
        regex: /repo:(\S+)/,
        validator: (ext: ZedExtension, val: string) => ext.repository.toLowerCase().includes(val),
      },
      {
        key: "schema",
        regex: /schema:(\S+)/,
        validator: (ext: ZedExtension, val: string) => ext.schema_version.toString().includes(val),
      },
      {
        key: "wasm",
        regex: /wasm:(\S+)/,
        validator: (ext: ZedExtension, val: string) => !!ext.wasm_api_version?.toLowerCase().includes(val),
      },
      {
        key: "provides",
        regex: /provides:(\S+)/,
        validator: (ext: ZedExtension, val: string) => ext.provides?.some((p) => p.toLowerCase().includes(val)),
      },
      {
        key: "date",
        regex: /date:(\S+)/,
        validator: (ext: ZedExtension, val: string) => ext.published_at.toLowerCase().includes(val),
      },
      {
        key: "downloads",
        regex: /downloads:(\S+)/,
        validator: (ext: ZedExtension, val: string) => ext.download_count.toString().includes(val),
      },
    ];

    return extensions.filter((ext) => {
      const installedVersion = installedExtensionsMap[ext.id];
      const currentlyInstalled = !!installedVersion;
      const isIgnored = ext.id in ignoredMap;
      const isOutdated =
        currentlyInstalled && installedVersion !== "unknown" && installedVersion !== ext.version && !isIgnored;

      if (selectedStatus === "installed" && !currentlyInstalled) return false;
      if (selectedStatus === "uninstalled" && currentlyInstalled) return false;
      if (selectedStatus === "outdated" && !isOutdated) return false;
      if (selectedStatus === "ignored" && !isIgnored) return false;

      if (selectedProvides !== "all" && !ext.provides?.includes(selectedProvides)) {
        return false;
      }

      if (!searchText) return true;

      let query = searchText.toLowerCase();
      let matchesAllRules = true;

      criteria.forEach(({ regex, validator }) => {
        const match = query.match(regex);
        if (match) {
          const val = match[1];
          if (!validator(ext, val)) {
            matchesAllRules = false;
          }
          query = query.replace(regex, "");
        }
      });

      if (!matchesAllRules) return false;

      query = query.trim();
      if (query) {
        const searchBlob = [
          ext.name,
          ext.id,
          ext.description,
          ext.version,
          ext.repository,
          ext.authors.join(" "),
          ext.provides?.join(" ") || "",
          `schema ${ext.schema_version}`,
          ext.wasm_api_version || "",
        ].join(" ");

        return exactWordMatch(searchBlob, query);
      }

      return true;
    });
  }, [extensions, searchText, selectedProvides, selectedStatus, installedExtensionsMap, ignoredMap]);

  return (
    <List
      isShowingDetail
      navigationTitle="Manage Extensions"
      searchBarPlaceholder="Search extensions"
      isLoading={isLoading}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter View"
          storeValue={false}
          onChange={(value) => {
            if (value.startsWith("status:")) {
              setSelectedStatus(value.replace("status:", ""));
            } else if (value.startsWith("provides:")) {
              setSelectedProvides(value.replace("provides:", ""));
            } else {
              setSelectedStatus("all");
              setSelectedProvides("all");
            }
          }}
        >
          <List.Dropdown.Item title="All Extensions" value="all" />
          <List.Dropdown.Section title="Status">
            <List.Dropdown.Item title="Installed" value="status:installed" />
            <List.Dropdown.Item title="Not Installed" value="status:uninstalled" />
            <List.Dropdown.Item title="Outdated" value="status:outdated" />
            <List.Dropdown.Item title="Ignored" value="status:ignored" />
          </List.Dropdown.Section>
          <List.Dropdown.Section title="Capabilities">
            {allProvidesOptions.map((item) => (
              <List.Dropdown.Item key={item} title={item} value={`provides:${item}`} />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      <List.EmptyView
        title="No Extensions Found!"
        description="Check your internet connection or try again later."
        icon="no-view.png"
        actions={
          <ActionPanel>
            <Action
              title="Force Clear Local Cache"
              icon={Icon.CircleProgress}
              style={Action.Style.Destructive}
              onAction={handleClearCache}
              shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
            />
          </ActionPanel>
        }
      />

      {outdatedExtensions.length > 0 && !searchText && (
        <List.Item
          title="Updates"
          icon={{ source: Icon.ArrowDownCircle, tintColor: "#FF9500" }}
          accessories={[{ text: `${outdatedExtensions.length} pending` }]}
          detail={
            <List.Item.Detail
              markdown={
                `### Pending Updates\n` +
                `The following extensions have newer versions available on the Zed registry:\n\n` +
                outdatedExtensions
                  .map((ext) => `* **${ext.name}** (\`v${installedExtensionsMap[ext.id]}\` → \`v${ext.version}\`)`)
                  .join("\n")
              }
            />
          }
          actions={
            <ActionPanel>
              <Action
                title="Update All"
                icon={Icon.CheckCircle}
                onAction={handleUpdateAll}
                shortcut={{ modifiers: ["cmd", "shift"], key: "u" }}
              />
            </ActionPanel>
          }
        />
      )}

      {filteredExtensions.map((ext) => {
        const installedVersion = installedExtensionsMap[ext.id];
        const currentlyInstalled = !!installedVersion;
        const isIgnored = ext.id in ignoredMap;
        const hasUpdate =
          currentlyInstalled && installedVersion !== "unknown" && installedVersion !== ext.version && !isIgnored;

        return (
          <ExtensionItem
            key={ext.id}
            extension={ext}
            keywords={["abc"]}
            isInstalled={currentlyInstalled}
            installedVersion={installedVersion}
            areUpdatesIgnored={isIgnored}
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  {!currentlyInstalled && (
                    <Action title="Install Extension" icon={Icon.Download} onAction={() => handleInstall(ext)} />
                  )}
                  {hasUpdate && (
                    <Action title="Update Extension" icon={Icon.ArrowDownCircle} onAction={() => handleInstall(ext)} />
                  )}
                  <VersionSubmenu
                    extension={ext}
                    installedVersion={installedExtensionsMap[ext.id]}
                    onInstall={handleInstall}
                  />
                  {ext.repository && (
                    <Action.OpenInBrowser title={`Open ${getDomainLabel(ext.repository)}`} url={ext.repository} />
                  )}
                </ActionPanel.Section>

                {currentlyInstalled && (
                  <ActionPanel.Section title="Management">
                    <ActionPanel.Submenu
                      title="Ignore Updates…"
                      icon={isIgnored ? Icon.EyeDisabled : Icon.Clock}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
                    >
                      {isIgnored && (
                        <Action title="Resume Updates" icon={Icon.Play} onAction={() => handleResume(ext)} />
                      )}
                      <Action
                        title="Ignore for 1 Day"
                        onAction={() => handleIgnore(ext, "1 Day", 24 * 60 * 60 * 1000)}
                      />
                      <Action
                        title="Ignore for 1 Week"
                        onAction={() => handleIgnore(ext, "1 Week", 7 * 24 * 60 * 60 * 1000)}
                      />
                      <Action title="Ignore Indefinitely" onAction={() => handleIgnore(ext, "Indefinitely", null)} />
                    </ActionPanel.Submenu>

                    <Action.ShowInFinder
                      title="View in Finder"
                      path={path.join(getGramExtensionPath(gramBuild), "installed", ext.id)}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
                    />
                    <Action
                      title="Uninstall Extension"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      onAction={() => handleUninstall(ext)}
                      shortcut={{ modifiers: ["ctrl"], key: "x" }}
                    />
                  </ActionPanel.Section>
                )}

                <ActionPanel.Section title="Global Actions">
                  {outdatedExtensions.length > 0 && (
                    <Action
                      title={`Update All Outdated (${outdatedExtensions.length})`}
                      icon={Icon.CheckCircle}
                      onAction={handleUpdateAll}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "u" }}
                    />
                  )}
                  <Action
                    title="Force Clear Local Cache"
                    icon={Icon.Eraser}
                    style={Action.Style.Destructive}
                    onAction={handleClearCache}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
