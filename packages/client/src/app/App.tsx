import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { availableLanguages, chooseLanguage } from "../i18n";
import { readStoredLanguage } from "../i18n/language";
import { openDeviceStore, provisionalSiteId } from "../storage/deviceStore";
import { requestPersistentStorage, type StorageState } from "../storage/persistence";
import { JoinForm } from "./JoinForm";
import { LanguageScreen } from "./LanguageScreen";
import { StatusBar } from "./StatusBar";

/**
 * The walking skeleton's screens: the first-run language choice, then the
 * home screen with the join form, a language switcher, and the status bar.
 * Later tasks add setup, the class views, the collaboration document, and
 * the teacher's overview.
 */
export function App() {
  const { t, i18n } = useTranslation();
  const [chosen, setChosen] = useState<string | undefined>(readStoredLanguage);
  const [storage, setStorage] = useState<StorageState | undefined>(undefined);
  const switcherId = useId();

  useEffect(() => {
    let cancelled = false;
    const store = openDeviceStore(provisionalSiteId());
    requestPersistentStorage().then((state) => {
      if (!cancelled) {
        setStorage(state);
      }
    });
    return () => {
      cancelled = true;
      void store.shutdown();
    };
  }, []);

  const choose = (tag: string) => {
    void chooseLanguage(tag).then(() => setChosen(tag));
  };

  if (chosen === undefined) {
    return <LanguageScreen onChoose={choose} />;
  }

  const language = i18n.resolvedLanguage ?? i18n.language;
  return (
    <div className="shell">
      <header className="bar">
        <h1>{t("app.name")}</h1>
        <div className="switcher">
          <label htmlFor={switcherId}>{t("language.label")}</label>
          <select id={switcherId} value={language} onChange={(event) => choose(event.target.value)}>
            {availableLanguages().map((option) => (
              <option key={option.tag} value={option.tag} lang={option.tag}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
      </header>
      <main className="screen">
        <p className="tagline">{t("home.tagline")}</p>
        <JoinForm />
      </main>
      <StatusBar storage={storage} />
    </div>
  );
}
