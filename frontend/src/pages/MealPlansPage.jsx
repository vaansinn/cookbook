import { useEffect, useState } from "react";
import useSettingsStore from "../store/useSettingsStore";
import useAuthStore from "../store/useAuthStore";
import useMealPlansStore from "../store/useMealPlansStore";
import { useT, apiMessage } from "../i18n";
import { fetchDishes } from "../api/recipes";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";
import BottomNav from "../components/BottomNav";
import ShareButton from "../components/ShareButton";
import ChefHats from "../components/ChefHats";

const TIER_ORDER = ["basic", "intermediate", "advanced"];

// Mirrors access.py's tier_access() so the level picker doesn't offer a tier
// the save call would just reject — see .claude/rules/security.md, the real
// gate is still enforced server-side on every create/update.
function allowedLevels(user) {
  return TIER_ORDER.filter((lvl) => lvl === "basic" || (lvl === "intermediate" && user) || (lvl === "advanced" && user?.plan === "premium"));
}

function CreatePlanForm({ dishes, allowedLvls, onSave, onCancel, initial }) {
  const t = useT();
  const [name, setName] = useState(initial?.name || "");
  const [items, setItems] = useState(initial?.items || []);
  const [pickDish, setPickDish] = useState(dishes[0]?.slug || "");
  const [pickLevel, setPickLevel] = useState(allowedLvls[0] || "basic");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const addItem = () => {
    if (!pickDish) return;
    setItems((it) => [...it, { dish_slug: pickDish, level: pickLevel }]);
  };
  const removeItem = (i) => setItems((it) => it.filter((_, idx) => idx !== i));

  const save = () => {
    if (!name.trim()) return;
    setError("");
    setSaving(true);
    onSave(name.trim(), items).catch((err) => {
      setError(apiMessage(err.response?.data, t, t("error_generic")));
      setSaving(false);
    });
  };

  return (
    <div className="card p-4 mt-4">
      <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: "var(--muted)" }}>
        {t("meal_plans_title")}
      </label>
      <input className="field" placeholder={t("meal_plan_name_placeholder")} value={name} onChange={(e) => setName(e.target.value)} />

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div>
          <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: "var(--muted)" }}>{t("meal_plan_pick_dish")}</label>
          <select className="field !py-2 text-sm" value={pickDish} onChange={(e) => setPickDish(e.target.value)}>
            {dishes.map((d) => <option key={d.slug} value={d.slug}>{d.summary?.title || d.slug}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: "var(--muted)" }}>{t("meal_plan_pick_level")}</label>
          <select className="field !py-2 text-sm" value={pickLevel} onChange={(e) => setPickLevel(e.target.value)}>
            {allowedLvls.map((lvl) => <option key={lvl} value={lvl}>{t("tier_" + lvl)}</option>)}
          </select>
        </div>
      </div>
      <button onClick={addItem} className="btn-ghost w-full mt-2 text-sm py-2">{t("meal_plan_add_recipe")}</button>

      <h3 className="font-display font-bold text-sm mt-4 mb-1" style={{ color: "var(--ink)" }}>{t("meal_plan_items_title")}</h3>
      {items.length === 0 && <p className="text-xs" style={{ color: "var(--muted)" }}>{t("meal_plan_no_items")}</p>}
      <ul className="space-y-1.5">
        {items.map((item, i) => {
          const d = dishes.find((x) => x.slug === item.dish_slug);
          return (
            <li key={i} className="flex items-center justify-between text-sm rounded-xl px-2.5 py-1.5" style={{ background: "var(--brand-soft)" }}>
              <span className="flex items-center gap-2">
                <ChefHats level={item.level} />
                {d?.summary?.title || item.dish_slug}
              </span>
              <button onClick={() => removeItem(i)} className="px-1" style={{ color: "var(--muted)" }} aria-label={t("remove_item")}>✕</button>
            </li>
          );
        })}
      </ul>

      {error && <p className="text-sm mt-2 font-semibold" style={{ color: "var(--hot)" }}>{error}</p>}

      <div className="flex gap-2 mt-4">
        <button onClick={save} disabled={!name.trim() || saving} className="btn-primary flex-1 text-sm py-2.5 disabled:opacity-50">{t("meal_plan_save")}</button>
        <button onClick={onCancel} className="btn-ghost flex-1 text-sm py-2.5">{t("meal_plan_cancel")}</button>
      </div>
    </div>
  );
}

export default function MealPlansPage() {
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const user = useAuthStore((s) => s.user);
  const plans = useMealPlansStore((s) => s.plans);
  const loaded = useMealPlansStore((s) => s.loaded);
  const load = useMealPlansStore((s) => s.load);
  const create = useMealPlansStore((s) => s.create);
  const update = useMealPlansStore((s) => s.update);
  const remove = useMealPlansStore((s) => s.remove);

  const [dishes, setDishes] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const doLoad = () => { setLoadError(false); load().catch(() => setLoadError(true)); };
  useEffect(doLoad, []);
  useEffect(() => { fetchDishes({ lang: language }).then(setDishes); }, [language]);

  const allowedLvls = allowedLevels(user);

  const dishTitle = (slug) => dishes.find((d) => d.slug === slug)?.summary?.title || slug;

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
        <div className="flex-1 p-8">
          <p className="text-sm font-semibold" style={{ color: "var(--hot)" }}>{t("error_generic")}</p>
          <button onClick={doLoad} className="btn-ghost text-sm py-2 px-4 mt-3">{t("error_retry")}</button>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="flex-1">
        <div className="max-w-lg mx-auto px-6 pt-6">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-bold" style={{ color: "var(--ink)" }}>{t("meal_plans_title")}</h1>
            <div className="flex gap-3"><LangSwitch /><ThemeSwitch /></div>
          </div>

          {!loaded && <p className="mt-6 text-sm" style={{ color: "var(--muted)" }}>{t("loading")}</p>}

          {loaded && plans.length === 0 && !creating && (
            <p className="mt-6 text-sm" style={{ color: "var(--muted)" }}>{t("meal_plans_empty")}</p>
          )}

          <ul className="space-y-3 mt-4">
            {plans.map((plan) => (
              <li key={plan.id} className="card p-4">
                {editingId === plan.id ? (
                  <CreatePlanForm
                    dishes={dishes}
                    allowedLvls={allowedLvls}
                    initial={plan}
                    onCancel={() => setEditingId(null)}
                    onSave={(name, items) => update(plan.id, { name, items }).then(() => setEditingId(null))}
                  />
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-display font-bold text-base" style={{ color: "var(--ink)" }}>{plan.name}</div>
                        <div className="text-xs font-semibold mt-0.5" style={{ color: "var(--muted)" }}>
                          {t("meal_plan_recipe_count", { n: plan.items.length })}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 mt-3">
                      {plan.items.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--ink)" }}>
                          <ChefHats level={item.level} />
                          {dishTitle(item.dish_slug)}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-4">
                      <ShareButton
                        variant="text"
                        url={`${window.location.origin}/plans/${plan.share_slug}`}
                        title={plan.name}
                        className="btn-primary flex-1 text-sm py-2.5"
                      />
                      <button onClick={() => setEditingId(plan.id)} className="btn-ghost text-sm py-2.5 px-4">{t("meal_plan_edit")}</button>
                      <button
                        onClick={() => window.confirm(t("meal_plan_delete_confirm")) && remove(plan.id)}
                        className="btn-ghost text-sm py-2.5 px-4"
                        style={{ color: "var(--hot)" }}
                      >
                        {t("meal_plan_delete")}
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>

          {creating ? (
            <CreatePlanForm
              dishes={dishes}
              allowedLvls={allowedLvls}
              onCancel={() => setCreating(false)}
              onSave={(name, items) => create(name, items).then(() => setCreating(false))}
            />
          ) : (
            <button onClick={() => setCreating(true)} className="btn-primary w-full mt-4 mb-8">{t("meal_plan_new")}</button>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
