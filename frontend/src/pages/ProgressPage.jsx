import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useSettingsStore from "../store/useSettingsStore";
import { useT } from "../i18n";
import { getProgress } from "../api/progress";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";
import BottomNav from "../components/BottomNav";

const BADGE_ICON = { first_dish: "🍳", first_advanced: "🌶️", five_cuisines: "🌍", week_streak: "🔥" };

export default function ProgressPage() {
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const [progress, setProgress] = useState(null);
  const [loadError, setLoadError] = useState(false);

  const load = () => {
    setLoadError(false);
    getProgress(language).then(setProgress).catch(() => setLoadError(true));
  };
  useEffect(load, [language]);

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

  const pct = progress.next_level_xp
    ? Math.min(100, Math.round((progress.xp / progress.next_level_xp) * 100))
    : 100;

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
            🔥
          </div>
          <div className="font-display font-bold text-2xl mt-2" style={{ color: "var(--ink)" }}>
            {progress.streak_days} {t("progress_streak")}
          </div>
          <div className="text-sm font-semibold" style={{ color: "var(--muted)" }}>{t("progress_streak_sub")}</div>
        </div>

        <div className="max-w-lg mx-auto px-6">
          <div className="flex justify-between text-xs font-bold mt-4 mb-1.5" style={{ color: "var(--muted)" }}>
            <span>Lv{progress.level_number} · {progress.level_name}</span>
            <span>{progress.next_level_xp ? t("progress_level_xp", { xp: progress.xp, next: progress.next_level_xp }) : t("progress_level_max", { xp: progress.xp })}</span>
          </div>
          <div className="rounded-full h-2.5 overflow-hidden" style={{ background: "var(--line)" }}>
            <div className="h-full" style={{ width: `${pct}%`, background: "var(--inter)" }} />
          </div>
          <p className="text-xs font-semibold mt-1.5" style={{ color: "var(--muted)" }}>{t("progress_dishes_cooked", { n: progress.dishes_cooked })}</p>

          <h2 className="font-display font-bold text-lg mt-6 mb-2.5" style={{ color: "var(--ink)" }}>{t("progress_badges")}</h2>
          <div className="grid grid-cols-4 gap-2.5">
            {progress.badges.map((b) => (
              <div
                key={b.slug}
                className="aspect-square rounded-2xl flex items-center justify-center text-2xl"
                style={
                  b.earned
                    ? { background: "var(--basic-soft)", boxShadow: "0 3px 0 var(--line)" }
                    : { background: "var(--locked-soft)", color: "var(--locked)", opacity: 0.7 }
                }
                title={t("badge_" + b.slug)}
              >
                {b.earned ? BADGE_ICON[b.slug] : "🔒"}
              </div>
            ))}
          </div>

          {progress.nudges.length === 0 && progress.dishes_cooked === 0 && (
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
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
