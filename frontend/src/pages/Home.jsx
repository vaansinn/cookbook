import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuthStore from "../store/useAuthStore";
import useSettingsStore from "../store/useSettingsStore";
import useFavoritesStore from "../store/useFavoritesStore";
import { useT } from "../i18n";
import { fetchDishes, fetchFilters, discoveryIdentity, startDiscoveryRead } from "../api/recipes";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";
import BottomNav from "../components/BottomNav";
import "../styles/library.css";

const EMPTY_FILTERS = { cuisines: [], meal_types: [], methods: [] };

function LibraryIcon({ kind = "dish" }) {
  const paths = { search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
    settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/></>,
    heart: <path d="M12 20 4 12C-2 5 8 0 12 7c4-7 14-2 8 5Z"/>,
    clock: <><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>,
    dish: <><path d="M3 16h18M5 16a7 7 0 0 1 14 0M8 20h8M12 7V5"/></> };
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>;
}

function FilterTileRow({ label, allLabel, items, active, onSelect, labelFor }) {
  return (
    <label className="library-filter"><span>{label}</span>
      <select value={active || ""} onChange={(event) => onSelect(event.target.value || null)}>
        <option value="">{allLabel}</option>
        {items.map((item) => <option key={item} value={item}>{labelFor ? labelFor(item) : item}</option>)}
      </select>
    </label>
  );
}

export default function Home() {
  const t = useT();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const identity = useAuthStore(discoveryIdentity);
  const language = useSettingsStore((s) => s.language);

  const [dishRead, setDishRead] = useState({ key: null, value: null, error: false });
  const [filterRead, setFilterRead] = useState({ key: null, value: EMPTY_FILTERS, error: false });
  const [dishRetry, setDishRetry] = useState(0);
  const [filterRetry, setFilterRetry] = useState(0);
  const [q, setQ] = useState("");
  const [activeCuisine, setActiveCuisine] = useState(null);
  const [activeMealType, setActiveMealType] = useState(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const favoriteSlugs = useFavoritesStore((s) => s.slugs);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const loadFavorites = useFavoritesStore((s) => s.load);

  const filterKey = JSON.stringify([identity, language, filterRetry]);
  const dishKey = JSON.stringify([identity, language, q, activeCuisine, activeMealType, dishRetry]);
  const latest = useRef(null);
  latest.current = { filterKey, dishKey };
  // Hide previous results during the render that changes the request, before
  // passive-effect cleanup runs. A stale error is not a current-query error.
  const dishes = dishRead.key === dishKey ? dishRead.value : null;
  const dishesError = dishRead.key === dishKey && dishRead.error;
  const filters = filterRead.key === filterKey ? filterRead.value : EMPTY_FILTERS;
  const filtersError = filterRead.key === filterKey && filterRead.error;

  useEffect(() => startDiscoveryRead({
    request: (signal) => fetchFilters(language, signal),
    isCurrent: () => latest.current.filterKey === filterKey && useSettingsStore.getState().language === language,
    onStart: () => setFilterRead({ key: filterKey, value: EMPTY_FILTERS, error: false }),
    onSuccess: (value) => setFilterRead({ key: filterKey, value, error: false }),
    onError: () => setFilterRead({ key: filterKey, value: EMPTY_FILTERS, error: true }),
  }), [filterKey, language]);

  useEffect(() => { if (user) loadFavorites(); }, [user]);

  useEffect(() => {
    const params = { lang: language };
    if (q) params.q = q;
    if (activeCuisine) params.cuisine = activeCuisine;
    if (activeMealType) params.meal_type = activeMealType;
    return startDiscoveryRead({
      request: (signal) => fetchDishes(params, signal), delay: 200,
      isCurrent: () => latest.current.dishKey === dishKey && useSettingsStore.getState().language === language,
      onStart: () => setDishRead({ key: dishKey, value: null, error: false }),
      onSuccess: (value) => setDishRead({ key: dishKey, value, error: false }),
      onError: () => setDishRead({ key: dishKey, value: null, error: true }),
    });
  }, [dishKey, language, q, activeCuisine, activeMealType]);

  const visibleDishes = dishes ? (favoritesOnly ? dishes.filter((d) => favoriteSlugs.has(d.slug)) : dishes) : [];

  return (
    <div className="library-page min-h-screen">
      <div
        className="library-intro"
      >
        <header className="library-shell">
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
                <Link to="/settings" className="library-icon-button" aria-label={t("settings_title")}>
                  <LibraryIcon kind="settings" />
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
        <h1 className="library-shell font-display text-4xl font-bold mt-6">
          {t("home_greeting")}
        </h1>
      </div>

      <main className="library-shell library-content">
        <div className="library-search field flex items-center gap-2">
          <LibraryIcon kind="search" />
          <input
            className="flex-1 bg-transparent outline-none font-medium"
            placeholder={t("search_placeholder")}
            aria-label={t("search_placeholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="library-tools"><button
          onClick={() => setFavoritesOnly((v) => !v)}
          aria-pressed={favoritesOnly}
          className="library-favorites"
        >
          <LibraryIcon kind="heart" /> <span>{t("filter_favorites")}</span>
        </button>

        {filtersError && <div className="mt-4" role="alert">
          <p className="text-sm font-semibold" style={{ color: "var(--danger)" }}>
            {t("filter_meal_label")} / {t("filter_cuisine_label")}: {t("error_generic")}
          </p>
          <button onClick={() => setFilterRetry((value) => value + 1)} className="btn-ghost text-sm py-2 px-4 mt-2">{t("error_retry")}</button>
        </div>}

        <FilterTileRow
          label={t("filter_meal_label")}
          allLabel={t("filter_all")}
          items={filters.meal_types}
          active={activeMealType}
          onSelect={setActiveMealType}
          labelFor={(item) => t(`meal_type_${item}`)}
        />
        <FilterTileRow
          label={t("filter_cuisine_label")}
          allLabel={t("filter_all")}
          items={filters.cuisines}
          active={activeCuisine}
          onSelect={setActiveCuisine}
        />

        </div><div className="library-grid">
          {dishesError && (
            <div className="mt-2" role="alert">
              <p className="text-sm font-semibold" style={{ color: "var(--danger)" }}>{t("error_generic")}</p>
              <button onClick={() => setDishRetry((value) => value + 1)} className="btn-ghost text-sm py-2 px-4 mt-2">{t("error_retry")}</button>
            </div>
          )}
          {!dishesError && dishes === null && <p role="status" style={{ color: "var(--muted)" }}>{t("loading")}</p>}
          {!dishesError && dishes && visibleDishes.length === 0 && <p style={{ color: "var(--muted)" }}>{t("no_dishes_found")}</p>}
          {dishes && visibleDishes.map((d) => (
            <article key={d.slug} className="library-recipe">
              <Link to={`/dish/${d.slug}`} className="library-recipe-link">
                <span className="library-recipe-mark"><LibraryIcon /></span>
                <h2>{d.summary.title}</h2>
                <span className="library-recipe-meta"><LibraryIcon kind="clock" /> ~{d.summary.time_min} {t("min_short")}<span>{d.cuisine}</span></span>
              </Link>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  user ? toggleFavorite(d.slug) : navigate("/login");
                }}
                aria-label={favoriteSlugs.has(d.slug) ? t("favorite_remove") : t("favorite_add")}
                aria-pressed={favoriteSlugs.has(d.slug)}
                className="library-recipe-favorite library-icon-button"
                style={{ color: favoriteSlugs.has(d.slug) ? "var(--brand)" : "var(--muted)" }}
              >
                <LibraryIcon kind="heart" />
              </button>
            </article>
          ))}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
