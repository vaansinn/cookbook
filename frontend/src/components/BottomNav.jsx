import { Link, useLocation } from "react-router-dom";
import { useT } from "../i18n";

export default function BottomNav() {
  const t = useT();
  const { pathname } = useLocation();
  const tabs = [
    { to: "/", key: "nav_home", icon: "🏠" },
    { to: "/groceries", key: "nav_groceries", icon: "🧾" },
    { to: "/glossary", key: "nav_glossary", icon: "📖" },
    { to: "/progress", key: "nav_progress", icon: "🔥" },
  ];
  return (
    <nav
      className="sticky bottom-0 flex gap-1 px-2 pt-2 pb-3 border-t-2"
      style={{ background: "var(--card)", borderColor: "var(--line)" }}
    >
      {tabs.map((tab) => {
        const active = pathname === tab.to;
        return (
          <Link key={tab.to} to={tab.to} className="flex-1 flex flex-col items-center gap-1 text-[10px] font-bold" style={{ color: active ? "var(--brand)" : "var(--muted)" }}>
            <span
              className="w-9 h-9 rounded-2xl flex items-center justify-center text-base"
              style={active ? { background: "var(--brand-soft)" } : undefined}
            >
              {tab.icon}
            </span>
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
