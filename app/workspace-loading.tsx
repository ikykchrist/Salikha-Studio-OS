"use client";

import { useEffect, useState } from "react";

export function WorkspaceLoading({ view }: { view: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 280);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;
  return <div className="workspace-loading" role="status" aria-live="polite" aria-label={`Loading ${view}`}>
    <div className="workspace-loading-heading"><span className="workspace-loading-kicker skeleton" /><span className="workspace-loading-title skeleton" /><span className="workspace-loading-description skeleton" /></div>
    <div className="workspace-loading-cards" aria-hidden="true">{[0, 1, 2, 3].map((item) => <span className="workspace-loading-card" key={item}><i className="skeleton" /><b className="skeleton" /><i className="skeleton" /></span>)}</div>
    <div className="workspace-loading-panel" aria-hidden="true"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div>
    <span className="sr-only">Loading {view} workspace</span>
  </div>;
}
