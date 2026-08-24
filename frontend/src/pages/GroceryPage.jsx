import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useSettingsStore from "../store/useSettingsStore";
import { useT } from "../i18n";
import {
  getHousehold, createHousehold, joinHousehold,
  getGroceryList, addGroceryText, setItemChecked, deleteItem, clearChecked,
  getPlan, addPlanEntry, deletePlanEntry, buildListFromPlan,
} from "../api/groceries";
import { fetchDishes } from "../api/recipes";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";
import BottomNav from "../components/BottomNav";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function GroceryPage() {
  const t = useT();
  const language = useSettingsStore((s) => s.language);

  const [household, setHousehold] = useState(undefined); // undefined = loading, null = none
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");

  const [items, setItems] = useState([]);
  const [newItemText, setNewItemText] = useState("");

  const [plan, setPlan] = useState([]);
  const [dishes, setDishes] = useState([]);
  const [planDate, setPlanDate] = useState(todayISO());
  const [planDish, setPlanDish] = useState("");
  const [planLevel, setPlanLevel] = useState("basic");

  const loadAll = () => {
    getHousehold().then((h) => {
      setHousehold(h);
      if (h) {
        getGroceryList().then(setItems);
        getPlan().then(setPlan);
      }
    });
  };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { fetchDishes({ lang: language }).then(setDishes); }, [language]);
  useEffect(() => { if (dishes.length && !planDish) setPlanDish(dishes[0].slug); }, [dishes]);

  const doCreate = () => createHousehold().then((h) => { setHousehold(h); loadAll(); });
  const doJoin = () => {
    setJoinError("");
    joinHousehold(joinCode.trim())
      .then((h) => { setHousehold(h); loadAll(); })
      .catch(() => setJoinError(t("household_invalid_code")));
  };

  const addText = () => {
    if (!newItemText.trim()) return;
    addGroceryText(newItemText.trim()).then((added) => setItems((it) => [...it, ...added]));
    setNewItemText("");
  };
  const toggleItem = (item) => {
    setItems((it) => it.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)));
    setItemChecked(item.id, !item.checked);
  };
  const removeItem = (item) => {
    setItems((it) => it.filter((i) => i.id !== item.id));
    deleteItem(item.id);
  };
  const doClearChecked = () => clearChecked().then(() => setItems((it) => it.filter((i) => !i.checked)));

  const doAddPlan = () => {
    if (!planDish) return;
    addPlanEntry(planDate, planDish, planLevel, 2).then((entry) => setPlan((p) => [...p, entry]));
  };
  const doRemovePlan = (id) => {
    setPlan((p) => p.filter((e) => e.id !== id));
    deletePlanEntry(id);
  };
  const doBuildList = () => buildListFromPlan(language).then(setItems);

  if (household === undefined) {
    return <div className="min-h-screen p-8" style={{ background: "var(--bg)", color: "var(--muted)" }}>{t("loading")}</div>;
  }

  if (household === null) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
        <header className="max-w-lg mx-auto w-full px-6 pt-6 flex justify-between items-center">
          <Link to="/" className="text-sm font-bold" style={{ color: "var(--muted)" }}>← {t("back_to_all")}</Link>
          <div className="flex gap-3"><LangSwitch /><ThemeSwitch /></div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <h1 className="font-display text-3xl font-bold" style={{ color: "var(--ink)" }}>{t("household_setup_title")}</h1>
          <p className="mt-2 max-w-xs" style={{ color: "var(--muted)" }}>{t("household_setup_sub")}</p>
          <button onClick={doCreate} className="btn-primary mt-6 w-full max-w-xs">{t("household_start")}</button>
          <div className="mt-6 w-full max-w-xs">
            <div className="flex gap-2">
              <input
                className="field flex-1"
                placeholder={t("household_code_placeholder")}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
              />
              <button onClick={doJoin} className="btn-ghost px-4">{t("household_join_button")}</button>
            </div>
            {joinError && <p className="text-sm mt-2 font-semibold" style={{ color: "var(--hot)" }}>{joinError}</p>}
          </div>
        </div>
      </div>
    );
  }

  const doneCount = items.filter((i) => i.checked).length;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="flex-1">
        <div className="max-w-lg mx-auto px-6 pt-6">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-bold" style={{ color: "var(--ink)" }}>{t("grocery_list_title")}</h1>
            <div className="flex gap-3"><LangSwitch /><ThemeSwitch /></div>
          </div>

          <div className="card p-3.5 mt-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase" style={{ color: "var(--muted)" }}>{t("grocery_invite_code")}</div>
              <div className="font-display font-bold text-lg tracking-wide" style={{ color: "var(--brand)" }}>{household.invite_code}</div>
            </div>
            <div className="text-xs text-right max-w-[55%]" style={{ color: "var(--muted)" }}>{t("grocery_invite_hint")}</div>
          </div>

          {items.length > 0 && (
            <div className="rounded-full h-2.5 mt-4 overflow-hidden" style={{ background: "var(--line)" }}>
              <div className="h-full" style={{ width: `${(doneCount / items.length) * 100}%`, background: "var(--basic)" }} />
            </div>
          )}
          <p className="text-xs font-semibold mt-1.5" style={{ color: "var(--muted)" }}>
            {t("grocery_count", { done: doneCount, total: items.length })}
          </p>

          <div className="flex gap-2 mt-4">
            <input
              className="field flex-1"
              placeholder={t("grocery_add_placeholder")}
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addText()}
            />
            <button onClick={addText} className="btn-ghost px-4" aria-label={t("grocery_add_placeholder")}>+</button>
          </div>

          {items.length === 0 && <p className="mt-6 text-sm" style={{ color: "var(--muted)" }}>{t("grocery_empty")}</p>}

          <ul className="mt-4">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-2.5 py-2.5 border-b border-dashed" style={{ borderColor: "var(--line)" }}>
                <button
                  onClick={() => toggleItem(item)}
                  className="w-5 h-5 rounded-md border-2 mt-0.5 shrink-0 flex items-center justify-center text-xs font-bold"
                  style={{ borderColor: "var(--basic)", background: item.checked ? "var(--basic)" : "transparent", color: "var(--brand-ink)" }}
                  aria-label={item.checked ? t("grocery_item_checked") : t("grocery_item_unchecked")}
                >
                  {item.checked ? "✓" : ""}
                </button>
                <div className="flex-1 min-w-0" style={item.checked ? { opacity: 0.45, textDecoration: "line-through" } : undefined}>
                  <div className="text-sm font-medium">
                    {item.qty_g ? `${Math.round(item.qty_g)} g ` : ""}{item.text}
                  </div>
                  {item.sources?.length > 0 && (
                    <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                      {t("grocery_used_in", { list: item.sources.map((s) => s.dish_title).join(", ") })}
                    </div>
                  )}
                </div>
                <button onClick={() => removeItem(item)} className="text-sm px-1" style={{ color: "var(--muted)" }} aria-label={t("remove_item")}>✕</button>
              </li>
            ))}
          </ul>

          {items.some((i) => i.checked) && (
            <button onClick={doClearChecked} className="btn-ghost w-full mt-4 text-sm py-2.5">{t("grocery_clear_checked")}</button>
          )}

          <h2 className="font-display font-bold text-lg mt-8 mb-3" style={{ color: "var(--ink)" }}>{t("planner_title")}</h2>

          {plan.length === 0 && <p className="text-sm" style={{ color: "var(--muted)" }}>{t("planner_empty")}</p>}
          <ul className="space-y-2">
            {plan.map((entry) => {
              const d = dishes.find((x) => x.slug === entry.dish_slug);
              return (
                <li key={entry.id} className="card flex items-center justify-between px-3.5 py-2.5">
                  <div className="text-sm">
                    <span className="font-semibold">{entry.date}</span> — {d?.summary?.title || entry.dish_slug}
                    <span className="ml-1.5 text-xs" style={{ color: "var(--muted)" }}>({t("tier_" + entry.level)})</span>
                  </div>
                  <button onClick={() => doRemovePlan(entry.id)} className="text-sm px-1" style={{ color: "var(--muted)" }} aria-label={t("remove_item")}>✕</button>
                </li>
              );
            })}
          </ul>

          <div className="card p-3.5 mt-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: "var(--muted)" }}>{t("planner_pick_date")}</label>
                <input type="date" className="field !py-2 text-sm" value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: "var(--muted)" }}>{t("planner_pick_level")}</label>
                <select className="field !py-2 text-sm" value={planLevel} onChange={(e) => setPlanLevel(e.target.value)}>
                  <option value="basic">{t("tier_basic")}</option>
                  <option value="intermediate">{t("tier_intermediate")}</option>
                  <option value="advanced">{t("tier_advanced")}</option>
                </select>
              </div>
            </div>
            <label className="text-[10px] font-bold uppercase block mb-1 mt-2.5" style={{ color: "var(--muted)" }}>{t("planner_pick_dish")}</label>
            <select className="field !py-2 text-sm" value={planDish} onChange={(e) => setPlanDish(e.target.value)}>
              {dishes.map((d) => <option key={d.slug} value={d.slug}>{d.summary.title}</option>)}
            </select>
            <button onClick={doAddPlan} className="btn-primary w-full mt-3 text-sm py-2.5">{t("planner_add")}</button>
          </div>

          {plan.length > 0 && (
            <button onClick={doBuildList} className="btn-ghost w-full mt-3 mb-8 text-sm py-2.5">{t("planner_build_list")}</button>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
