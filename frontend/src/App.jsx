import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import useAuthStore from "./store/useAuthStore";
import useSettingsStore from "./store/useSettingsStore";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/Home";
import RecipePage from "./pages/RecipePage";
import CookMode from "./pages/CookMode";
import GroceryPage from "./pages/GroceryPage";
import ProgressPage from "./pages/ProgressPage";
import { GlossaryList, GlossaryDetail } from "./pages/GlossaryPage";
import SettingsPage from "./pages/SettingsPage";
import PrivacyPage from "./pages/PrivacyPage";
import MealPlansPage from "./pages/MealPlansPage";
import SharedMealPlanPage from "./pages/SharedMealPlanPage";

function RequireAuth({ children }) {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const init = useAuthStore((s) => s.init);
  const darkMode = useSettingsStore((s) => s.darkMode);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<Home />} />
        <Route path="/dish/:slug" element={<RecipePage />} />
        <Route
          path="/dish/:slug/cook"
          element={
            <RequireAuth>
              <CookMode />
            </RequireAuth>
          }
        />
        <Route
          path="/groceries"
          element={
            <RequireAuth>
              <GroceryPage />
            </RequireAuth>
          }
        />
        <Route
          path="/progress"
          element={
            <RequireAuth>
              <ProgressPage />
            </RequireAuth>
          }
        />
        <Route
          path="/plans"
          element={
            <RequireAuth>
              <MealPlansPage />
            </RequireAuth>
          }
        />
        <Route path="/plans/:shareSlug" element={<SharedMealPlanPage />} />
        <Route path="/glossary" element={<GlossaryList />} />
        <Route path="/glossary/:slug" element={<GlossaryDetail />} />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          }
        />
        <Route path="/privacy" element={<PrivacyPage />} />
      </Routes>
    </BrowserRouter>
  );
}
