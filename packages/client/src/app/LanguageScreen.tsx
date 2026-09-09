import { useTranslation } from "react-i18next";
import { availableLanguages } from "../i18n";

interface LanguageScreenProps {
  readonly onChoose: (tag: string) => void;
}

/** First run: the device chooses its language. Each language is named in itself. */
export function LanguageScreen({ onChoose }: LanguageScreenProps) {
  const { t } = useTranslation();
  return (
    <main className="screen screen-centred">
      <h1>{t("language.choose")}</h1>
      <ul className="choices">
        {availableLanguages().map((language) => (
          <li key={language.tag}>
            <button
              type="button"
              className="choice"
              lang={language.tag}
              onClick={() => onChoose(language.tag)}
            >
              {language.name}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
