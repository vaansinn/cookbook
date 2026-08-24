import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import useSettingsStore from "../store/useSettingsStore";
import { useT } from "../i18n";
import { getGlossary, getGlossaryEntry } from "../api/progress";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";
import BottomNav from "../components/BottomNav";

export function GlossaryList() {
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const [entries, setEntries] = useState(null);

  useEffect(() => { getGlossary(language).then(setEntries); }, [language]);

  const techniques = entries?.filter((e) => e.type === "technique") || [];
  const nutrition = entries?.filter((e) => e.type === "nutrition") || [];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="flex-1 max-w-lg mx-auto w-full px-6 pt-6">
        <div className="flex justify-between items-center">
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--ink)" }}>{t("glossary_title")}</h1>
          <div className="flex gap-3"><LangSwitch /><ThemeSwitch /></div>
        </div>

        {entries === null && <p className="mt-6 text-sm" style={{ color: "var(--muted)" }}>{t("loading")}</p>}

        {techniques.length > 0 && (
          <>
            <h2 className="font-display font-bold text-sm uppercase tracking-wide mt-6 mb-2" style={{ color: "var(--brand)" }}>{t("glossary_techniques")}</h2>
            <div className="flex flex-col gap-2">
              {techniques.map((e) => (
                <Link key={e.slug} to={`/glossary/${e.slug}`} className="card px-4 py-3 text-sm font-semibold">{e.title}</Link>
              ))}
            </div>
          </>
        )}

        {nutrition.length > 0 && (
          <>
            <h2 className="font-display font-bold text-sm uppercase tracking-wide mt-6 mb-2" style={{ color: "var(--brand)" }}>{t("glossary_nutrition")}</h2>
            <div className="flex flex-col gap-2 pb-8">
              {nutrition.map((e) => (
                <Link key={e.slug} to={`/glossary/${e.slug}`} className="card px-4 py-3 text-sm font-semibold">{e.title}</Link>
              ))}
            </div>
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}

export function GlossaryDetail() {
  const { slug } = useParams();
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const [entry, setEntry] = useState(null);

  useEffect(() => { setEntry(null); getGlossaryEntry(slug, language).then(setEntry); }, [slug, language]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="max-w-lg mx-auto px-6 pt-6 pb-10">
        <div className="flex justify-between items-center">
          <Link to="/glossary" className="text-sm font-bold" style={{ color: "var(--muted)" }}>← {t("glossary_back")}</Link>
          <div className="flex gap-3"><LangSwitch /><ThemeSwitch /></div>
        </div>
        {!entry ? (
          <p className="mt-6 text-sm" style={{ color: "var(--muted)" }}>{t("loading")}</p>
        ) : (
          <>
            <h1 className="font-display text-3xl font-bold mt-4" style={{ color: "var(--ink)" }}>{entry.title}</h1>
            <p className="mt-4 leading-relaxed" style={{ color: "var(--ink)" }}>{entry.body}</p>
          </>
        )}
      </div>
    </div>
  );
}
