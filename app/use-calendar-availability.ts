"use client";

import { useEffect, useState } from "react";
import type { BlockScope, CalendarBlocks } from "../lib/calendar-date-blocks";

export function useCalendarAvailability(month: string) {
  const [result, setResult] = useState<{ month: string; blocks: CalendarBlocks; error?: string }>();
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/calendar-availability?month=${month}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Date blocks could not be loaded.");
        if (!controller.signal.aborted) setResult({ month, blocks: data.blocks });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ month, blocks: {}, error: error instanceof Error ? error.message : "Date blocks could not be loaded." });
      });
    return () => controller.abort();
  }, [month, revision]);

  async function save(dates: string[], scope: BlockScope, action: "block" | "unblock") {
    const response = await fetch("/api/calendar-availability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dates, scope, action }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Date blocks could not be saved.");
    refresh();
  }

  return { blocks: result?.month === month ? result.blocks : {}, error: result?.month === month ? result.error : undefined, refresh, save };
}
