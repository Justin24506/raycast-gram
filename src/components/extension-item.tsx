import { Color, Icon, List } from "@raycast/api";
import { getDomainLabel, parseAuthor, ZedExtension } from "../lib/extension";

export interface ExtensionItemProps extends Pick<
  List.Item.Props,
  "icon" | "accessoryIcon" | "actions" | "keywords" | "accessories"
> {
  extension: ZedExtension;
  isInstalled: boolean;
  installedVersion?: string;
  areUpdatesIgnored?: boolean;
}

export function ExtensionItem({
  extension,
  isInstalled,
  installedVersion,
  areUpdatesIgnored = false,
  ...props
}: ExtensionItemProps) {
  const publishedDate = new Date(extension.published_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const mainMarkdown = [
    `# ${extension.name}`,
    `***`,
    extension.description ? extension.description.trim() : "_No description provided._",
  ].join("\n\n");

  const remoteVersion = extension.version;
  const hasUpdate = isInstalled && installedVersion && installedVersion !== remoteVersion;

  const itemAccessories = [];

  if (areUpdatesIgnored) {
    itemAccessories.push({
      icon: { source: Icon.EyeDisabled, tintColor: Color.SecondaryText },
      tooltip: "Auto-updates ignored",
    });
  }

  if (hasUpdate) {
    itemAccessories.push({
      icon: { source: Icon.ArrowDownCircle, tintColor: Color.Orange },
      tooltip: `Update available: v${remoteVersion}`,
    });
  } else if (isInstalled) {
    itemAccessories.push({
      icon: { source: Icon.CheckCircle, tintColor: Color.Green },
      tooltip: "Installed",
    });
  }

  return (
    <List.Item
      id={extension.id}
      accessories={itemAccessories}
      title={extension.name}
      {...props}
      detail={
        <List.Item.Detail
          markdown={mainMarkdown}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label
                title="Status"
                text={
                  areUpdatesIgnored
                    ? "Installed (Updates Ignored)"
                    : hasUpdate
                      ? "Update Available"
                      : isInstalled
                        ? "Installed"
                        : "Not Installed"
                }
                icon={
                  areUpdatesIgnored
                    ? { source: Icon.EyeDisabled, tintColor: Color.SecondaryText }
                    : hasUpdate
                      ? { source: Icon.ArrowDownCircle, tintColor: Color.Orange }
                      : isInstalled
                        ? { source: Icon.CheckCircle, tintColor: Color.Green }
                        : { source: Icon.Circle, tintColor: Color.SecondaryText }
                }
              />

              {hasUpdate ? (
                <>
                  <List.Item.Detail.Metadata.Label title="Installed Version" text={`v${installedVersion}`} />
                  <List.Item.Detail.Metadata.Label title="Latest Version" text={`v${remoteVersion}`} />
                </>
              ) : (
                <List.Item.Detail.Metadata.Label title="Latest Version" text={`v${remoteVersion}`} />
              )}

              <List.Item.Detail.Metadata.Separator />

              {extension.authors.map((authorString, index) => {
                const { name, email } = parseAuthor(authorString);
                const isFirst = index === 0;
                const labelTitle = isFirst ? "Authors" : "";
                if (email) {
                  return (
                    <List.Item.Detail.Metadata.Link
                      key={authorString}
                      title={labelTitle}
                      text={`${name} (${email})`}
                      target={`mailto:${email}`}
                    />
                  );
                }
                return <List.Item.Detail.Metadata.Label key={authorString} title={labelTitle} text={name} />;
              })}

              <List.Item.Detail.Metadata.Separator />

              <List.Item.Detail.Metadata.Label
                title="Downloads"
                text={extension.download_count.toLocaleString()}
                icon={Icon.Download}
              />
              <List.Item.Detail.Metadata.Label title="Published on" text={publishedDate} icon={Icon.Calendar} />

              <List.Item.Detail.Metadata.Separator />

              {extension.repository ? (
                <List.Item.Detail.Metadata.Link
                  title="Repository"
                  text={getDomainLabel(extension.repository)}
                  target={extension.repository}
                />
              ) : null}

              <List.Item.Detail.Metadata.Separator />

              {extension.provides && extension.provides.length > 0 ? (
                <List.Item.Detail.Metadata.TagList title="Provides">
                  {extension.provides.map((capability) => (
                    <List.Item.Detail.Metadata.TagList.Item key={capability} text={capability} color={Color.Magenta} />
                  ))}
                </List.Item.Detail.Metadata.TagList>
              ) : null}

              <List.Item.Detail.Metadata.Separator />

              <List.Item.Detail.Metadata.TagList title="Schema Version">
                <List.Item.Detail.Metadata.TagList.Item text={`v${extension.schema_version}`} color={Color.Blue} />
              </List.Item.Detail.Metadata.TagList>

              {extension.wasm_api_version ? (
                <List.Item.Detail.Metadata.TagList title="WASM API Version">
                  <List.Item.Detail.Metadata.TagList.Item text={`v${extension.wasm_api_version}`} color={Color.Green} />
                </List.Item.Detail.Metadata.TagList>
              ) : null}
            </List.Item.Detail.Metadata>
          }
        />
      }
    />
  );
}
