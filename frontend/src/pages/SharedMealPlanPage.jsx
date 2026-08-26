import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import useSettingsStore from "../store/useSettingsStore";
import { useT } from "../i18n";
import { getSharedMealPlan } from "../api/mealPlans";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";
import ChefHats from "../components/ChefHats";

// Public, unauthenticated — reachable only via an unguessable share_slug
// (see routes/meal_plans.py). No BottomNav: a visitor without an account
// shouldn't be steered into authed-only tabs from here.
export default function SharedMealPlanPage() {
  const { shareSlug } = useParams();
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const [plan, setPlan] = useState(undefined); // undefined = loading, null = not found
  const [loadError, setLoadError] = useState(false);

  const load = () => {
    setLoadError(false);
    setPlan(undefined);
    getSharedMealPlan(shareSlug, language)
      .then(setPlan)
      .catch((err) => (err.response?.status === 404 ? setPlan(null) : setLoadError(true)));
  };
  useEffect(load, [shareSlug, language]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="max-w-lg mx-auto px-6 pt-6 pb-16">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm font-bold" style={{ color: "var(--muted)" }}>← {t("back_to_all")}</Link>
          <div className="flex gap-3"><LangSwitch /><ThemeSwitch /></div>
        </div>

        {loadError && (
          <div className="mt-6">
            <p className="text-sm font-semibold" style={{ color: "var(--hot)" }}>{t("error_generic")}</p>
            <button onClick={load} className="btn-ghost text-sm py-2 px-4 mt-2">{t("error_retry")}</button>
          </div>
        )}

        {plan === undefined && !loadError && <p className="mt-6 text-sm" style={{ color: "var(--muted)" }}>{t("loading")}</p>}

        {plan === null && (
          <div className="mt-10 text-center">
            <div className="font-display font-bold text-xl" style={{ color: "var(--ink)" }}>{t("meal_plan_not_found")}</div>
            <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{t("meal_plan_not_found_sub")}</p>
          </div>
        )}

        {plan && (
          <>
            <div className="rounded-2xl px-4 py-3 mt-4 text-xs font-bold" style={{ background: "var(--brand-soft)", color: "var(--brand-dk)" }}>
              🔗 {t("meal_plan_shared_banner")}
            </div>
            <h1 className="font-display text-2xl font-bold mt-3" style={{ color: "var(--ink)" }}>{plan.name}</h1>
            <div className="text-sm font-semibold mt-1" style={{ color: "var(--muted)" }}>
              {t("meal_plan_shared_by", { name: plan.owner_name || t("app_name") })} · {t("meal_plan_recipe_count", { n: plan.items.length })}
            </div>

            <ul className="mt-5 space-y-2">
              {plan.items.map((item, i) => (
                <li key={i}>
                  <Link to={`/dish/${item.dish_slug}`} className="card flex items-center gap-3 px-3.5 py-3">
                    <ChefHats level={item.level} size="1.2em" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{item.title}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>{item.cuisine} · {t("tier_" + item.level)}</div>
                    </div>
                    <span style={{ color: "var(--brand)" }}>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
