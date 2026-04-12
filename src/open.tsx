import { runAppleScript } from "@raycast/utils";
import { closeMainWindow, getSelectedFinderItems, showToast, Toast, open } from "@raycast/api";
import { getGramApp } from "./lib/gram";

export const getCurrentFinderPath = async (): Promise<string> => {
  const getCurrentFinderPathScript = `
      try
        tell application "Finder"
          return POSIX path of (insertion location as alias)
        end tell
      on error
        return ""
      end try
    `;
  return await runAppleScript(getCurrentFinderPathScript);
};

export default async function openWithGram() {
  try {
    let selectedItems: { path: string }[] = [];

    const finderItems = await getSelectedFinderItems();
    if (finderItems.length === 0) {
      const currentPath = await getCurrentFinderPath();
      if (currentPath) {
        selectedItems = [{ path: currentPath }];
      } else {
        throw new Error("No Finder item selected");
      }
    } else {
      selectedItems = finderItems.map((i) => ({ path: i.path }));
    }
    const app = await getGramApp();
    for (const { path } of selectedItems) {
      open(encodeURI(path), app);
    }

    await closeMainWindow();
  } catch (e) {
    await showToast({
      title: `Failed opening selected Finder item`,
      style: Toast.Style.Failure,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
