import { useTranslation } from "react-i18next";
import { formatBytes } from "../i18n/format";
import { useShellState } from "../shell/register";
import type { StorageState } from "../storage/persistence";
import { useOnline } from "./useOnline";

interface StatusBarProps {
  readonly storage: StorageState | undefined;
}

/** What the device knows about itself: network, storage protection, and shell updates. */
export function StatusBar({ storage }: StatusBarProps) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const shell = useShellState();
  const language = i18n.resolvedLanguage ?? i18n.language;

  let storageText: string | undefined;
  if (storage !== undefined) {
    if (!storage.supported) {
      storageText = t("status.storageUnsupported");
    } else if (storage.persistent) {
      storageText = t("status.storagePersistent");
    } else {
      storageText = t("status.storageBestEffort");
    }
  }

  return (
    <footer className="status">
      <p>{online ? t("status.online") : t("status.offline")}</p>
      {storageText !== undefined && (
        <p className={storage?.supported && !storage.persistent ? "warning" : undefined}>
          {storageText}
          {storage?.quota !== undefined && storage.usage !== undefined && (
            <>
              {" "}
              {t("status.storageUsage", {
                usage: formatBytes(storage.usage, language),
                quota: formatBytes(storage.quota, language),
              })}
            </>
          )}
        </p>
      )}
      {shell === "update-ready" && <p>{t("status.updateReady")}</p>}
      {shell === "offline-ready" && <p>{t("status.offlineReady")}</p>}
      <p className="version">{t("status.version", { version: __APP_VERSION__ })}</p>
    </footer>
  );
}
