import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useSettingsStore from "../store/useSettingsStore";
import { useT } from "../i18n";
import { getProgress } from "../api/progress";
import { fetchDishes } from "../api/recipes";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";
import BottomNav from "../components/BottomNav";
import ChefHats from "../components/ChefHats";
import { dishEmoji } from "../dishEmoji";

// Same tier-colour language as MealPlansPage's dish rows (visual-design.md —
// basic/intermediate/advanced map to the mild/amber/hot accent tokens).
const TIER_ACCENT = { basic: "var(--basic)", intermediate: "var(--inter)", advanced: "var(--hot)" };
const TIER_ACCENT_SOFT = { basic: "var(--basic-soft)", intermediate: "var(--inter-soft)", advanced: "var(--hot-soft)" };

export default function ProgressPage() {
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const [progress, setProgress] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [dishes, setDishes] = useState([]);

  const load = () => {
    setLoadError(false);
    getProgress(language).then(setProgress).catch(() => setLoadError(true));
  };
  useEffect(load, [language]);
  useEffect(() => { fetchDishes({ lang: language }).then(setDishes).catch(() => {}); }, [language]);

  const dishTitle = (slug) => dishes.find((d) => d.slug === slug)?.summary?.title || slug;

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
        <div className="flex-1 p-8">
          <p className="text-sm font-semibold" style={{ color: "var(--hot)" }}>{t("error_generic")}</p>
          <button onClick={load} className="btn-ghost text-sm py-2 px-4 mt-3">{t("error_retry")}</button>
        </div>
        <BottomNav />
      </div>
    );
  }
  if (!progress) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
        <div className="flex-1 p-8" style={{ color: "var(--muted)" }}>{t("loading")}</div>
        <BottomNav />
      </div>
    );
  }

  const dateLocale = language === "de" ? "de-DE" : "en-US";
  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString(dateLocale, { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="flex-1">
        <div
          className="text-center px-6 pt-7 pb-3"
          style={{ background: `linear-gradient(160deg, var(--inter-soft), var(--bg) 70%)` }}
        >
          <div className="flex justify-end gap-3 max-w-lg mx-auto"><LangSwitch /><ThemeSwitch /></div>
          <div
            className="w-20 h-20 rounded-full mx-auto flex items-center justify-center text-4xl mt-1"
            style={{ background: "linear-gradient(180deg, var(--inter), var(--inter-dk))", boxShadow: "0 5px 0 var(--inter-dk)" }}
          >
            🍽️
          </div>
          <div className="font-display font-bold text-2xl mt-2" style={{ color: "var(--ink)" }}>
            {t("nav_progress")}
          </div>
          <div className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
            {t("progress_dishes_cooked", { n: progress.dishes_cooked })}
          </div>
        </div>

        <div className="max-w-lg mx-auto px-6 pb-4">
          {progress.dishes_cooked === 0 && (
            <p className="text-sm mt-8" style={{ color: "var(--muted)" }}>{t("progress_empty")}</p>
          )}

          {progress.nudges.map((n) => (
            <div key={n.dish_slug} className="rounded-2xl p-4 mt-6" style={{ background: "var(--hot-soft)" }}>
              <div className="font-display font-bold text-sm" style={{ color: "var(--hot-dk)" }}>{t("nudge_title")}</div>
              <p className="text-sm mt-1.5 mb-3">
                {t("nudge_body", { dish: n.dish_title, from: t("tier_" + n.from_level), to: t("tier_" + n.to_level) })}
              </p>
              <Link to={`/dish/${n.dish_slug}`} className="btn-primary block text-center text-sm py-2.5" style={{ background: "var(--hot)", boxShadow: "0 4px 0 var(--hot-dk)" }}>
                {t("nudge_button", { to: t("tier_" + n.to_level) })}
              </Link>
            </div>
          ))}

          {progress.history.length > 0 && (
            <>
              <h2 className="font-display font-bold text-lg mt-6 mb-2.5" style={{ color: "var(--ink)" }}>{t("progress_history_title")}</h2>
              <div className="flex flex-col gap-1.5">
                {progress.history.map((entry) => (
                  <Link
                    key={entry.id}
                    to={`/dish/${entry.dish_slug}`}
                    className="card relative flex items-center gap-2.5 overflow-hidden pl-2 pr-3 py-2.5"
                  >
                    <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: TIER_ACCENT[entry.level] }} aria-hidden="true" />
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0 ml-1"
                      style={{ background: TIER_ACCENT_SOFT[entry.level] }}
                      aria-hidden="true"
                    >
                      {dishEmoji(entry.dish_slug)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5">
                        <ChefHats level={entry.level} />
                        <span className="text-sm font-bold truncate" style={{ color: "var(--ink)" }}>{dishTitle(entry.dish_slug)}</span>
                      </span>
                      <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>{formatDate(entry.cooked_at)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
