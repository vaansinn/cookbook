import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import useSettingsStore from "../store/useSettingsStore";
import { useT } from "../i18n";
import useAuthStore, { getAuthEpoch } from "../store/useAuthStore";
import { readSnapshot } from "../api/snapshots";
import { createRequestScope } from "../utils/requestScope";
import { getLessonBySlug } from "../api/lessons";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";
import LessonBody, { stripMd } from "../components/LessonBody";

// Real GET /api/lessons/<slug> wiring (docs/contracts/pilot-fixtures.md §11).
// Same body-as-cards visual approved in the Step 2 mockup - see LessonBody.
export default function LessonPage() {
  const initialized = useAuthStore((s) => s.initialized);
  const epoch = useAuthStore((s) => s.epoch);
  const { slug } = useParams();
  const [params] = useSearchParams();
  const lang = useSettingsStore((s) => s.language);
  const t = useT();
  if (!initialized) return <p className="p-8">{t("loading")}</p>;
  return <LessonContent key={`${epoch}:${slug}:${params.toString()}:${lang}`} />;
}

function LessonContent() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const epoch = useAuthStore((s) => s.epoch);
  const [retry, setRetry] = useState(0);
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const [lesson, setLesson] = useState(null);
  const [errorCode, setErrorCode] = useState(null);

  useEffect(() => {
    const scope = createRequestScope(() => getAuthEpoch() === epoch);
    setLesson(null); setErrorCode(null);
    const request = params.has("snapshot")
      ? readSnapshot(Number(params.get("snapshot")), params.get("dish_slug"), params.get("level"), params.get("lang"), scope.signal)
          .then((res) => {
            const pinned = Object.values(res.content.lessons || {}).find((l) => l.slug === slug);
            if (!pinned) throw new Error("No retained lesson");
            return { ...pinned, next_practice: res.next_practice };
          })
      : getLessonBySlug(slug, params.get("lang") || language, scope.signal);
    request.then((data) => { if (scope.current()) setLesson(data); })
      .catch(() => { if (scope.current()) setErrorCode("unavailable"); });
    return scope.cancel;
  }, [slug, language, epoch, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  if (errorCode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-8" style={{ background: "var(--bg)" }}>
        <p className="font-display text-xl font-bold" style={{ color: "var(--ink)" }}>{t("error_generic")}</p>
        <button className="btn-primary mt-4" onClick={() => setRetry((n) => n + 1)}>{t("error_retry")}</button>
        <Link to="/" className="btn-ghost mt-4 px-6 py-2.5">{t("lesson_back")}</Link>
      </div>
    );
  }

  if (!lesson) {
    return <div className="min-h-screen p-8" style={{ background: "var(--bg)", color: "var(--muted)" }}>{t("loading")}</div>;
  }

  const cookHref = `/dish/${lesson.dish_slug}/cook?level=${lesson.level}&lang=${lesson.lang}${params.get("attempt") ? `&attempt=${params.get("attempt")}` : ""}`;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="max-w-lg mx-auto px-6 pt-6 pb-12">
        <div className="flex justify-between items-center">
          <Link to={cookHref} className="text-sm font-bold" style={{ color: "var(--muted)" }}>
            {t("lesson_back")}
          </Link>
          <div className="flex gap-3"><LangSwitch /><ThemeSwitch /></div>
        </div>

        <div
          className="rounded-full mt-5 mb-1 inline-flex items-center justify-center font-display font-bold text-xl"
          style={{ width: 56, height: 56, background: "var(--basic-soft)", color: "var(--basic-dk)" }}
        >
          🍲
        </div>
        <h1 className="font-display text-3xl font-bold mt-2" style={{ color: "var(--ink)" }}>{lesson.title}</h1>

        <LessonBody body={lesson.body} />

        {lesson.next_practice && (
          <div className="card px-4 py-4 mt-6" style={{ borderColor: "var(--brand)" }}>
            <p className="font-display font-bold text-sm uppercase tracking-wide" style={{ color: "var(--brand)" }}>
              {t("lesson_next_practice_label")}
            </p>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{stripMd(lesson.next_practice.reason)}</p>
            <Link
              to={`/dish/${lesson.next_practice.dish_slug}?level=${lesson.next_practice.level}&lang=${lesson.next_practice.lang}`}
              className="btn-primary inline-block mt-3 text-sm py-2.5 px-4"
            >
              {t("lesson_next_practice_cta")}
            </Link>
          </div>
        )}

        <Link to={cookHref} className="btn-ghost block text-center mt-6 text-sm py-3">
          {t("lesson_back")}
        </Link>
      </div>
    </div>
  );
}
