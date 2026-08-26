import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuthStore from "../store/useAuthStore";
import useSettingsStore from "../store/useSettingsStore";
import useFavoritesStore from "../store/useFavoritesStore";
import { useT } from "../i18n";
import { fetchDishes, fetchFilters } from "../api/recipes";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";
import BottomNav from "../components/BottomNav";
import DISH_EMOJI from "../dishEmoji";

const TIER_DOT_CLASS = { basic: "bg-basic", intermediate: "bg-inter", advanced: "bg-hot" };

const MEAL_TYPE_EMOJI = {
  breakfast: "🍳",
  lunch: "🥪",
  dinner: "🍲",
  dessert: "🍰",
  side: "🥗",
  snack: "🥑",
};

const CUISINE_EMOJI = {
  American: "🍔",
  Chinese: "🥢",
  French: "🥐",
  Greek: "🫒",
  Indian: "🍛",
  Italian: "🍝",
  Japanese: "🍣",
  Mexican: "🌮",
  "Spanish/Mediterranean": "🥘",
  Thai: "🌶️",
};

function FilterTileRow({ label, allLabel, items, active, onSelect, emojiMap, labelFor }) {
  return (
    <div className="mt-4">
      <div
        className="font-display font-bold text-xs uppercase tracking-wide mb-2 ml-0.5"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        <FilterTile
          emoji="🍽️"
          text={allLabel}
          isActive={!active}
          onClick={() => onSelect(null)}
        />
        {items.map((item) => (
          <FilterTile
            key={item}
            emoji={emojiMap[item] || "🍽️"}
            text={labelFor ? labelFor(item) : item}
            isActive={active === item}
            onClick={() => onSelect(active === item ? null : item)}
          />
        ))}
      </div>
    </div>
  );
}

function FilterTile({ emoji, text, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={isActive}
      className="shrink-0 w-16 flex flex-col items-center gap-1.5"
    >
      <span
        className="w-16 h-16 rounded-2xl border-2 flex items-center justify-center text-2xl"
        style={
          isActive
            ? { background: "var(--brand)", borderColor: "var(--brand)", boxShadow: "0 3px 0 var(--brand-dk)" }
            : { background: "var(--card)", borderColor: "var(--line)" }
        }
      >
        {emoji}
      </span>
      <span
        className="font-display font-bold text-[11px] leading-tight text-center"
        style={{ color: isActive ? "var(--brand)" : "var(--ink)" }}
      >
        {text}
      </span>
    </button>
  );
}

export default function Home() {
  const t = useT();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const language = useSettingsStore((s) => s.language);

  const [dishes, setDishes] = useState(null);
  const [dishesError, setDishesError] = useState(false);
  const [filters, setFilters] = useState({ cuisines: [], meal_types: [], methods: [] });
  const [q, setQ] = useState("");
  const [activeCuisine, setActiveCuisine] = useState(null);
  const [activeMealType, setActiveMealType] = useState(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const favoriteSlugs = useFavoritesStore((s) => s.slugs);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const loadFavorites = useFavoritesStore((s) => s.load);

  useEffect(() => {
    fetchFilters(language).then(setFilters).catch(() => {});
  }, [language]);

  useEffect(() => { if (user) loadFavorites(); }, [user]);

  const loadDishes = () => {
    const params = { lang: language };
    if (q) params.q = q;
    if (activeCuisine) params.cuisine = activeCuisine;
    if (activeMealType) params.meal_type = activeMealType;
    setDishesError(false);
    fetchDishes(params).then(setDishes).catch(() => setDishesError(true));
  };

  const visibleDishes = dishes ? (favoritesOnly ? dishes.filter((d) => favoriteSlugs.has(d.slug)) : dishes) : [];

  useEffect(() => {
    const handle = setTimeout(loadDishes, 200);
    return () => clearTimeout(handle);
  }, [language, q, activeCuisine, activeMealType]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div
        className="px-6 pt-8 pb-4"
        style={{ background: `linear-gradient(160deg, var(--brand-soft), var(--bg) 70%)` }}
      >
        <header className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between">
            <span className="font-display font-bold text-lg" style={{ color: "var(--brand)" }}>
              {t("app_name")}
            </span>
            <div className="flex items-center gap-3">
              <LangSwitch />
              <ThemeSwitch />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 mt-3">
            {user ? (
              <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
                {t("home_signed_in_as", { name: user.display_name || user.email })}
              </p>
            ) : (
              <span />
            )}
            {user ? (
              <div className="flex items-center gap-3">
                <Link to="/settings" className="w-9 h-9 rounded-full border-2 flex items-center justify-center" style={{ borderColor: "var(--line)" }} aria-label={t("settings_title")}>
                  ⚙️
                </Link>
                <button onClick={logout} className="btn-ghost text-sm py-2 px-4">
                  {t("auth_logout")}
                </button>
              </div>
            ) : (
              <Link to="/login" className="btn-ghost text-sm py-2 px-4">
                {t("auth_login_button")}
              </Link>
            )}
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

        <button
          onClick={() => setFavoritesOnly((v) => !v)}
          aria-pressed={favoritesOnly}
          className="inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 mt-4 font-display font-bold text-xs"
          style={
            favoritesOnly
              ? { background: "var(--brand)", color: "var(--brand-ink)", boxShadow: "0 3px 0 var(--brand-dk)" }
              : { background: "var(--card)", color: "var(--ink)", border: "2px solid var(--line)" }
          }
        >
          <span aria-hidden="true">{favoritesOnly ? "♥" : "♡"}</span> {t("filter_favorites")}
        </button>

        <FilterTileRow
          label={t("filter_meal_label")}
          allLabel={t("filter_all")}
          items={filters.meal_types}
          active={activeMealType}
          onSelect={setActiveMealType}
          emojiMap={MEAL_TYPE_EMOJI}
          labelFor={(item) => t(`meal_type_${item}`)}
        />
        <FilterTileRow
          label={t("filter_cuisine_label")}
          allLabel={t("filter_all")}
          items={filters.cuisines}
          active={activeCuisine}
          onSelect={setActiveCuisine}
          emojiMap={CUISINE_EMOJI}
        />

        <div className="mt-5 flex flex-col gap-3">
          {dishesError && (
            <div className="mt-2">
              <p className="text-sm font-semibold" style={{ color: "var(--hot)" }}>{t("error_generic")}</p>
              <button onClick={loadDishes} className="btn-ghost text-sm py-2 px-4 mt-2">{t("error_retry")}</button>
            </div>
          )}
          {!dishesError && dishes === null && <p style={{ color: "var(--muted)" }}>{t("loading")}</p>}
          {!dishesError && dishes && visibleDishes.length === 0 && <p style={{ color: "var(--muted)" }}>{t("no_dishes_found")}</p>}
          {dishes && visibleDishes.map((d) => (
            <Link key={d.slug} to={`/dish/${d.slug}`} className="card relative flex gap-3 p-4 shadow-[0_3px_0_var(--line)]">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  user ? toggleFavorite(d.slug) : navigate("/login");
                }}
                aria-label={favoriteSlugs.has(d.slug) ? t("favorite_remove") : t("favorite_add")}
                aria-pressed={favoriteSlugs.has(d.slug)}
                className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center text-base"
                style={{ color: favoriteSlugs.has(d.slug) ? "var(--brand)" : "var(--muted)" }}
              >
                {favoriteSlugs.has(d.slug) ? "♥" : "♡"}
              </button>
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-2xl shrink-0"
                style={{ background: "var(--basic-soft)" }}
              >
                {DISH_EMOJI[d.slug] || "🍽️"}
              </div>
              <div className="min-w-0 pr-6">
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
