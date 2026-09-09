import { CLASS_CODE_PATTERN } from "@trellis/core";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";

type JoinOutcome = "idle" | "invalid-code" | "box-unreachable";

/**
 * Joining by code (device-identity: "Joining by code with self-registration").
 * The skeleton validates the code's shape and then reports the box as
 * unreachable, which is true until the LAN transport of task 2.5 and the
 * join flow of task 2.9 give it somewhere to go.
 */
export function JoinForm() {
  const { t } = useTranslation();
  const codeId = useId();
  const [code, setCode] = useState("");
  const [outcome, setOutcome] = useState<JoinOutcome>("idle");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = code.trim().toUpperCase();
    setOutcome(CLASS_CODE_PATTERN.test(trimmed) ? "box-unreachable" : "invalid-code");
  };

  return (
    <form className="join" onSubmit={submit}>
      <h2>{t("join.title")}</h2>
      <label htmlFor={codeId}>{t("join.codeLabel")}</label>
      <input
        id={codeId}
        className="code"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      <p className="hint">{t("join.codeHint")}</p>
      <button type="submit" className="primary">
        {t("join.submit")}
      </button>
      {outcome === "invalid-code" && (
        <p role="alert" className="notice">
          {t("join.invalidCode")}
        </p>
      )}
      {outcome === "box-unreachable" && (
        <p role="alert" className="notice">
          {t("join.boxUnreachable")}
        </p>
      )}
    </form>
  );
}
