import {
  getPreferenceValues,
  Cache,
  updateCommandMetadata,
  environment,
  LaunchType,
  showToast,
  Toast,
} from "@raycast/api";
import { processBackgroundUpdates } from "./lib/updater";
import { GramBuild } from "./lib/gram";

const cache = new Cache({ namespace: "zed-extensions-bg" });

interface Preferences {
  build: GramBuild;
  autoUpdateInterval: string;
}

export default async function Command() {
  const prefs = getPreferenceValues<Preferences>();
  const isUserTriggered = environment.launchType === LaunchType.UserInitiated;

  if (!isUserTriggered && prefs.autoUpdateInterval === "manual") {
    return;
  }

  const now = Date.now();
  const lastRunStr = cache.get("last-successful-run");

  if (!isUserTriggered && lastRunStr) {
    const lastRunTime = parseInt(lastRunStr, 10);
    const hoursPassed = (now - lastRunTime) / (1000 * 60 * 60);

    if (prefs.autoUpdateInterval === "1d" && hoursPassed < 24) {
      return;
    }
    if (prefs.autoUpdateInterval === "7d" && hoursPassed < 168) {
      return;
    }
  }

  if (isUserTriggered) {
    await showToast({
      style: Toast.Style.Animated,
      title: "Checking for extension updates...",
    });
  }

  try {
    const updateCount = await processBackgroundUpdates(prefs.build);
    cache.set("last-successful-run", now.toString());
    const timeString = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (updateCount > 0) {
      const msg = `Updated ${updateCount} extension${updateCount === 1 ? "" : "s"}`;

      await updateCommandMetadata({
        subtitle: `${msg} at ${timeString}`,
      });

      if (isUserTriggered) {
        await showToast({
          style: Toast.Style.Success,
          title: "Updates Installed",
          message: msg,
        });
      }
    } else {
      await updateCommandMetadata({
        subtitle: `Up to date as of ${timeString}`,
      });

      if (isUserTriggered) {
        await showToast({
          style: Toast.Style.Success,
          title: "Everything is up to date",
          message: "No new extension versions found.",
        });
      }
    }
  } catch (error) {
    if (isUserTriggered) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Update check failed",
        message: String(error),
      });
    }
  }
}
