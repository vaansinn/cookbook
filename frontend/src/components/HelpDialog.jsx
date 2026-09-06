import { useLayoutEffect, useRef } from "react";

// Native modal dialog supplies focus containment, Escape and focus restoration.
export default function HelpDialog({ children, onClose }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); previousFocus?.focus(); };
  }, []);
  return <dialog ref={ref} aria-labelledby="cook-help-title" onCancel={(event) => { event.preventDefault(); onClose(); }}
    className="p-0 border-0 rounded-3xl w-full max-w-lg" style={{ maxWidth: "calc(100vw - 24px)", background: "var(--card)", color: "var(--ink)" }}>
    {children}
  </dialog>;
}
