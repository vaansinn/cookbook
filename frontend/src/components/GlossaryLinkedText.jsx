import { Link } from "react-router-dom";

// Wraps the first occurrence of any glossary trigger word/phrase in `text`
// with a link to its glossary entry. Trigger words are authored in English
// (content/glossary/*.en.md) so this only auto-links English recipe text —
// German content doesn't have German trigger phrases yet, see PIPELINE.md.
export default function GlossaryLinkedText({ text, entries }) {
  const triggers = (entries || []).flatMap((e) =>
    (e.trigger_words || []).map((word) => ({ word, slug: e.slug, title: e.title }))
  );
  if (!triggers.length) return text;

  triggers.sort((a, b) => b.word.length - a.word.length);
  const escaped = triggers.map((t) => t.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(pattern);

  return parts.map((part, i) => {
    const match = triggers.find((t) => t.word.toLowerCase() === part.toLowerCase());
    if (!match) return part;
    return (
      <Link
        key={i}
        to={`/glossary/${match.slug}`}
        className="font-semibold"
        style={{ color: "var(--brand)", textDecoration: "underline", textDecorationStyle: "dotted" }}
      >
        {part}
      </Link>
    );
  });
}
