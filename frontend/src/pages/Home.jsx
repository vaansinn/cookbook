import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useAuthStore from "../store/useAuthStore";
import useSettingsStore from "../store/useSettingsStore";
import { useT } from "../i18n";
import { fetchDishes, fetchFilters } from "../api/recipes";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";
import BottomNav from "../components/BottomNav";

const TIER_DOT_CLASS = { basic: "bg-basic", intermediate: "bg-inter", advanced: "bg-hot" };
const DISH_EMOJI = {
  "lentil-bolognese": "🍝",
  "chickpea-tikka-masala": "🍛",
  "spinach-egg-fried-rice": "🍳",
  "sushi-rice": "🍚",
  "lemon-ricotta-spaghetti": "🍋",
  "potato-chickpea-skillet": "🥘",
  "eggs-benedict": "🍳",
  "tiramisu": "🍰",
  "banana-bread": "🍞",
  "no-knead-bread": "🥖",
};

export default function Home() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const language = useSettingsStore((s) => s.language);

  const [dishes, setDishes] = useState(null);
  const [dishesError, setDishesError] = useState(false);
  const [filters, setFilters] = useState({ cuisines: [], meal_types: [], methods: [] });
  const [q, setQ] = useState("");
  const [activeCuisine, setActiveCuisine] = useState(null);

  useEffect(() => {
    fetchFilters(language).then(setFilters).catch(() => {});
  }, [language]);

  const loadDishes = () => {
    const params = { lang: language };
    if (q) params.q = q;
    if (activeCuisine) params.cuisine = activeCuisine;
    setDishesError(false);
    fetchDishes(params).then(setDishes).catch(() => setDishesError(true));
  };

  useEffect(() => {
    const handle = setTimeout(loadDishes, 200);
    return () => clearTimeout(handle);
  }, [language, q, activeCuisine]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div
        className="px-6 pt-8 pb-4"
        style={{ background: `linear-gradient(160deg, var(--brand-soft), var(--bg) 70%)` }}
      >
        <header className="max-w-3xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div>
            <span className="font-display font-bold text-lg" style={{ color: "var(--brand)" }}>
              {t("app_name")}
            </span>
            {user && (
              <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
                {t("home_signed_in_as", { name: user.display_name || user.email })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <LangSwitch />
            <ThemeSwitch />
            <Link to="/settings" className="w-9 h-9 rounded-full border-2 flex items-center justify-center" style={{ borderColor: "var(--line)" }} aria-label={t("settings_title")}>
              ⚙️
            </Link>
            <button onClick={logout} className="btn-ghost text-sm py-2 px-4">
              {t("auth_logout")}
            </button>
          </div>
        </header>
        <h1 className="max-w-3xl mx-auto font-display text-4xl font-bold mt-6" style={{ color: "var(--ink)" }}>
          {t("home_greeting")}
        </h1>
      </div>

      <main className="max-w-3xl mx-auto px-6 pb-16">
        <div className="field flex items-center gap-2 mt-2">
          <span aria-hidden="true">🔍</span>
          <input
            className="flex-1 bg-transparent outline-none font-medium"
            placeholder={t("search_placeholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="flex gap-2 overflow-x-auto mt-4 pb-1">
          <button onClick={() => setActiveCuisine(null)} className="chip" style={!activeCuisine ? { background: "var(--brand)", color: "var(--brand-ink)", borderColor: "var(--brand)" } : {}}>
            {t("filter_all")}
          </button>
          {filters.cuisines.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCuisine(activeCuisine === c ? null : c)}
              className="chip"
              style={activeCuisine === c ? { background: "var(--brand)", color: "var(--brand-ink)", borderColor: "var(--brand)" } : {}}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-3">
          {dishesError && (
            <div className="mt-2">
              <p className="text-sm font-semibold" style={{ color: "var(--hot)" }}>{t("error_generic")}</p>
              <button onClick={loadDishes} className="btn-ghost text-sm py-2 px-4 mt-2">{t("error_retry")}</button>
            </div>
          )}
          {!dishesError && dishes === null && <p style={{ color: "var(--muted)" }}>{t("loading")}</p>}
          {!dishesError && dishes && dishes.length === 0 && <p style={{ color: "var(--muted)" }}>{t("no_dishes_found")}</p>}
          {dishes && dishes.map((d) => (
            <Link key={d.slug} to={`/dish/${d.slug}`} className="card flex gap-3 p-4 shadow-[0_3px_0_var(--line)]">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-2xl shrink-0"
                style={{ background: "var(--basic-soft)" }}
              >
                {DISH_EMOJI[d.slug] || "🍽️"}
              </div>
              <div className="min-w-0">
                <div className="font-display font-semibold text-lg" style={{ color: "var(--ink)" }}>
                  {d.summary.title}
                </div>
                <div className="text-xs font-semibold flex gap-1.5 flex-wrap" style={{ color: "var(--muted)" }}>
                  <span>{d.cuisine}</span>·<span>~{d.summary.time_min} {t("min_short")}</span>
                  {d.summary.kcal && <>·<span>{d.summary.kcal} {t("kcal")}</span></>}
                </div>
                <div className="flex gap-1 mt-2">
                  {["basic", "intermediate", "advanced"].map((lvl) => (
                    <span
                      key={lvl}
                      className={`w-4 h-1.5 rounded-sm ${d.tiers_available.includes(lvl) ? TIER_DOT_CLASS[lvl] : ""}`}
                      style={!d.tiers_available.includes(lvl) ? { background: "var(--line)" } : undefined}
                    />
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
