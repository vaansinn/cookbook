import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import useSettingsStore from "../store/useSettingsStore";
import { useT } from "../i18n";
import { fetchDish } from "../api/recipes";
import { addRecipeToList } from "../api/groceries";
import { getGlossary } from "../api/progress";
import useFavoritesStore from "../store/useFavoritesStore";
import { scaleIngredientText } from "../utils/scaleIngredient";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";
import GlossaryLinkedText from "../components/GlossaryLinkedText";

const TIER_ORDER = ["basic", "intermediate", "advanced"];
const TIER_ICON = { basic: "🌶️", intermediate: "🌶️🌶️", advanced: "🌶️🌶️🌶️" };

export default function RecipePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const [cookToast, setCookToast] = useState(location.state?.cooked ? location.state : null);

  useEffect(() => {
    if (!cookToast) return;
    const handle = setTimeout(() => setCookToast(null), 4000);
    window.history.replaceState({}, ""); // clear so a refresh doesn't re-show it
    return () => clearTimeout(handle);
  }, []);

  const [dish, setDish] = useState(null);
  const [level, setLevel] = useState(null);
  const [serves, setServes] = useState(null);
  const [doneSteps, setDoneSteps] = useState({});
  const [donePrep, setDonePrep] = useState({});
  const [addedToList, setAddedToList] = useState(false);
  const [listErrorCode, setListErrorCode] = useState(null);
  const [glossary, setGlossary] = useState([]);
  const [dishError, setDishError] = useState(false);
  const favoriteSlugs = useFavoritesStore((s) => s.slugs);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const loadFavorites = useFavoritesStore((s) => s.load);
  const favoritesLoaded = useFavoritesStore((s) => s.loaded);

  useEffect(() => {
    getGlossary(language).then(setGlossary).catch(() => {});
  }, [language]);

  useEffect(() => { if (!favoritesLoaded) loadFavorites(); }, []);

  const loadDish = () => {
    setDish(null);
    setDishError(false);
    fetchDish(slug, language)
      .then((d) => {
        setDish(d);
        const firstAvailable = TIER_ORDER.find((l) => d.tiers[l]);
        setLevel(firstAvailable);
        setServes(d.tiers[firstAvailable]?.serves);
        setDoneSteps({});
        setDonePrep({});
      })
      .catch(() => setDishError(true));
  };

  useEffect(loadDish, [slug, language]);

  if (dishError) {
    return (
      <div className="min-h-screen p-8" style={{ background: "var(--bg)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--hot)" }}>{t("error_generic")}</p>
        <button onClick={loadDish} className="btn-ghost text-sm py-2 px-4 mt-3">{t("error_retry")}</button>
      </div>
    );
  }
  if (!dish || !level) {
    return <div className="min-h-screen p-8" style={{ background: "var(--bg)", color: "var(--muted)" }}>{t("loading")}</div>;
  }

  const tier = dish.tiers[level];
  const factor = serves / tier.serves;

  return (
    <div className="min-h-screen pb-16" style={{ background: "var(--bg)" }}>
      {cookToast && (
        <div className="max-w-2xl mx-auto px-6 pt-4">
          <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: "var(--basic)", color: "var(--brand-ink)" }}>
            {t("cooked_logged")}
            {cookToast.newBadges?.length > 0 && (
              <div className="mt-1">
                {cookToast.newBadges.map((b) => (
                  <div key={b}>🎉 {t("new_badge_earned", { badge: t("badge_" + b) })}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="max-w-2xl mx-auto px-6 pt-6">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm font-bold" style={{ color: "var(--muted)" }}>
            ← {t("back_to_all")}
          </Link>
          <div className="flex items-center gap-3">
            <LangSwitch />
            <ThemeSwitch />
          </div>
        </div>
        <div className="text-xs font-bold uppercase mt-3" style={{ color: "var(--brand)" }}>
          {dish.cuisine}
          {tier.tags?.filter((tg) => tg.toLowerCase() !== (dish.cuisine || "").toLowerCase()).length
            ? " · " + tier.tags.filter((tg) => tg.toLowerCase() !== (dish.cuisine || "").toLowerCase()).join(" · ")
            : ""}
        </div>
        <div className="flex items-start justify-between gap-3 mt-1">
          <h1 className="font-display text-3xl font-bold" style={{ color: "var(--ink)" }}>
            {tier.title}
          </h1>
          <button
            onClick={() => toggleFavorite(slug)}
            aria-label={favoriteSlugs.has(slug) ? t("favorite_remove") : t("favorite_add")}
            aria-pressed={favoriteSlugs.has(slug)}
            className="shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg mt-1"
            style={{
              borderColor: favoriteSlugs.has(slug) ? "var(--brand)" : "var(--line)",
              color: favoriteSlugs.has(slug) ? "var(--brand)" : "var(--muted)",
            }}
          >
            {favoriteSlugs.has(slug) ? "♥" : "♡"}
          </button>
        </div>
        <div className="text-sm font-semibold mt-1" style={{ color: "var(--muted)" }}>
          {t("serves")} {tier.serves} · ~{tier.time_min} {t("min_short")}
        </div>

        <div className="flex gap-2 mt-5">
          {TIER_ORDER.map((lvl) => {
            const available = !!dish.tiers[lvl];
            const active = lvl === level;
            return (
              <button
                key={lvl}
                disabled={!available}
                onClick={() => { setLevel(lvl); setServes(dish.tiers[lvl].serves); setDoneSteps({}); setDonePrep({}); }}
                className="flex-1 rounded-2xl py-2.5 text-xs font-bold flex flex-col items-center gap-0.5"
                style={
                  !available
                    ? { background: "var(--locked-soft)", color: "var(--locked)", border: "2px solid var(--line)" }
                    : active
                    ? lvl === "basic"
                      ? { background: "var(--basic)", color: "var(--brand-ink)", boxShadow: "0 4px 0 var(--basic-dk)" }
                      : lvl === "intermediate"
                      ? { background: "var(--card)", color: "var(--inter-dk)", border: "2px solid var(--inter)" }
                      : { background: "var(--card)", color: "var(--hot-dk)", border: "2px solid var(--hot)" }
                    : { background: "var(--card)", color: "var(--muted)", border: "2px solid var(--line)" }
                }
              >
                <span>{available ? TIER_ICON[lvl] : "🔒"}</span>
                {t("tier_" + lvl)}
              </button>
            );
          })}
        </div>
        {!dish.tiers[level] && <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{t("tier_locked")}</p>}

        <div className="grid grid-cols-3 gap-2 mt-3">
          {TIER_ORDER.map((lvl) => {
            const lvlTier = dish.tiers[lvl];
            const active = lvl === level;
            return (
              <div
                key={lvl}
                className="rounded-xl px-2 py-1.5 text-center"
                style={active ? { background: "var(--brand-soft)" } : undefined}
              >
                <p
                  className="text-[10px] leading-tight"
                  style={{ color: active ? "var(--brand)" : "var(--muted)", fontWeight: active ? 700 : 500 }}
                >
                  {lvlTier?.tier_summary || "—"}
                </p>
              </div>
            );
          })}
        </div>

        {tier.nutrition && Object.keys(tier.nutrition).length > 0 && (
          <>
            <div className="grid grid-cols-4 gap-2 mt-5">
              {[
                ["kcal", tier.nutrition.kcal, "nutri_kcal", "calories"],
                ["protein_g", tier.nutrition.protein_g, "nutri_protein", "protein"],
                ["carbs_g", tier.nutrition.carbs_g, "nutri_carbs", "carbs"],
                ["fiber_g", tier.nutrition.fiber_g, "nutri_fiber", "fiber"],
              ].map(([key, val, labelKey, glossarySlug]) => (
                <Link key={key} to={`/glossary/${glossarySlug}`} className="card text-center py-2.5 px-1">
                  <div className="font-display font-bold text-base" style={{ color: "var(--brand)" }}>
                    {key === "kcal" ? Math.round(val * factor) : Math.round(val * factor * 10) / 10 + "g"}
                  </div>
                  <div className="text-[9px] font-bold uppercase mt-0.5" style={{ color: "var(--muted)" }}>
                    {t(labelKey)}
                  </div>
                </Link>
              ))}
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: "var(--muted)" }}>{t("nutrition_note")}</p>
          </>
        )}

        {tier.prep?.length > 0 && (
          <div className="rounded-2xl mt-5 p-4" style={{ background: "var(--inter-soft)" }}>
            <div className="text-xs font-bold uppercase mb-2" style={{ color: "var(--inter-dk)" }}>{t("before_you_start")}</div>
            <ul className="space-y-1.5">
              {tier.prep.map((p, i) => (
                <li
                  key={i}
                  onClick={() => setDonePrep((s) => ({ ...s, [i]: !s[i] }))}
                  className="text-sm cursor-pointer flex gap-2 items-start"
                  style={donePrep[i] ? { opacity: 0.5, textDecoration: "line-through" } : undefined}
                >
                  <span style={{ color: "var(--inter-dk)" }}>{donePrep[i] ? "✓" : "○"}</span>{p}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3 rounded-2xl mt-6 p-3.5" style={{ background: "var(--card)", border: "2px solid var(--line)" }}>
          <span className="text-sm font-semibold" style={{ color: "var(--muted)" }}>{t("servings")}</span>
          <button onClick={() => setServes((s) => Math.max(1, s - 1))} className="w-9 h-9 rounded-full border-2 font-bold" style={{ borderColor: "var(--line)", color: "var(--brand)" }} aria-label={t("servings_decrease")}>−</button>
          <span className="font-bold w-6 text-center">{serves}</span>
          <button onClick={() => setServes((s) => s + 1)} className="w-9 h-9 rounded-full border-2 font-bold" style={{ borderColor: "var(--line)", color: "var(--brand)" }} aria-label={t("servings_increase")}>+</button>
          {serves !== tier.serves && <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>{t("scaled_from", { n: tier.serves })}</span>}
        </div>

        <h2 className="font-display font-bold text-lg mt-6 mb-1" style={{ color: "var(--ink)" }}>{t("ingredients")}</h2>
        <ul>
          {tier.ingredients.map((ing, i) => (
            <li key={i} className="text-sm py-2 border-b border-dashed" style={{ borderColor: "var(--line)" }}>
              {scaleIngredientText(ing.text, factor)}
            </li>
          ))}
        </ul>

        <h2 className="font-display font-bold text-lg mt-6 mb-1" style={{ color: "var(--ink)" }}>{t("instructions")}</h2>
        <ol>
          {tier.steps.map((s, i) => (
            <li
              key={i}
              onClick={() => setDoneSteps((st) => ({ ...st, [i]: !st[i] }))}
              className="flex gap-3 py-3 border-b border-dashed cursor-pointer"
              style={{ borderColor: "var(--line)", ...(doneSteps[i] ? { opacity: 0.4, textDecoration: "line-through" } : {}) }}
            >
              <span className="font-display font-bold text-xl" style={{ color: "var(--brand)" }}>{i + 1}</span>
              <span className="text-sm pt-0.5"><GlossaryLinkedText text={s} entries={glossary} /></span>
            </li>
          ))}
        </ol>

        {tier.notes?.length > 0 && (
          <>
            <h2 className="font-display font-bold text-lg mt-6 mb-1" style={{ color: "var(--ink)" }}>{t("notes_and_tweaks")}</h2>
            <ul className="space-y-1.5">
              {tier.notes.map((n, i) => (
                <li key={i} className="text-sm pl-4 relative">
                  <span className="absolute left-0" style={{ color: "var(--plum, var(--hot))" }}>·</span>
                  <GlossaryLinkedText text={n} entries={glossary} />
                </li>
              ))}
            </ul>
          </>
        )}

        <button
          onClick={() => {
            setListErrorCode(null);
            addRecipeToList(slug, level, serves, language)
              .then(() => {
                setAddedToList(true);
                setTimeout(() => setAddedToList(false), 2000);
              })
              .catch((err) => {
                setListErrorCode(err.response?.data?.code === "no_household" ? "no_household" : "generic");
              });
          }}
          className="btn-ghost w-full mt-8"
        >
          {addedToList ? t("added_to_list") : t("add_to_list")}
        </button>
        {listErrorCode && (
          <p className="text-sm font-semibold text-center mt-2" style={{ color: "var(--hot)" }}>
            {listErrorCode === "no_household" ? (
              <>{t("list_add_needs_household")} <Link to="/groceries" style={{ color: "var(--brand)", textDecoration: "underline" }}>{t("list_add_setup_link")}</Link></>
            ) : (
              t("list_add_failed")
            )}
          </p>
        )}
        <button
          onClick={() => navigate(`/dish/${slug}/cook?level=${level}&serves=${serves}`)}
          className="btn-primary w-full mt-3"
        >
          {t("start_cooking")}
        </button>
      </div>
    </div>
  );
}
