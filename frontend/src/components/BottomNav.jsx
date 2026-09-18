import { Link, useLocation } from "react-router-dom";
import { useT } from "../i18n";

export default function BottomNav() {
  const t = useT();
  const { pathname } = useLocation();
  const tabs = [
    { to: "/", key: "nav_home", icon: <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m3 11 9-8 9 8M5 9v12h5v-7h4v7h5V9"/></svg> },
    { to: "/shopping", key: "nav_groceries", icon: <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 7h16l-2 13H6L4 7ZM8 8V6a4 4 0 0 1 8 0v2"/></svg> },
    { to: "/planning", key: "nav_meal_plans", icon: <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18M7 15h4m-4 3h7"/></svg> },
    { to: "/glossary", key: "nav_glossary", icon: <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v16M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z"/></svg> },
    { to: "/progress", key: "nav_progress", icon: <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 5v5h5M4 10a8 8 0 1 1 0 5M12 7v5l3 2"/></svg> },
  ];
  return (
    <nav
      className="sticky bottom-0 flex gap-1 px-2 pt-2 pb-3 border-t-2"
      style={{ background: "var(--card)", borderColor: "var(--line)" }}
    >
      {tabs.map((tab) => {
        const active = pathname === tab.to || (tab.to === "/planning" && pathname.startsWith("/planning/"));
        return (
          <Link key={tab.to} to={tab.to} aria-current={active ? "page" : undefined} className="flex-1 flex flex-col items-center gap-1 text-xs font-bold min-h-12" style={{ color: active ? "var(--brand)" : "var(--muted)" }}>
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
