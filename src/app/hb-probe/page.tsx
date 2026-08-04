"use client";

/**
 * HB_PROBE: staging auto-fix proof page. Triggers planted defects so the
 * staging SDK can create Issues. Safe to delete after the run.
 */

import { useState } from "react";
import { greetingFor } from "@/lib/receipt-greeting";
import { loginNudgeAudienceLabel } from "@/lib/login-nudge";

export default function HbProbePage() {
  const [last, setLast] = useState<string>("idle");

  return (
    <main style={{ padding: 32, fontFamily: "system-ui", maxWidth: 560 }}>
      <h1>HB auto-fix probe</h1>
      <p>
        Triggers planted defects for staging.humanbehavior.co. Not linked from
        the product nav.
      </p>
      <p>Last: {last}</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            setLast("clean");
            // Throw outside React's event handler so the SDK window error hook
            // sees it (guest checkout → TypeError in receipt-greeting.ts).
            setTimeout(() => {
              greetingFor({ customer: null });
            }, 0);
          }}
        >
          Trigger clean bug (receipt greeting)
        </button>
        <button
          type="button"
          onClick={() => {
            setLast("guardrail");
            // Path matches auth_logic (`login_*`). Guest → TypeError.
            setTimeout(() => {
              loginNudgeAudienceLabel(null);
            }, 0);
          }}
        >
          Trigger guardrail bug (login-nudge)
        </button>
      </div>
    </main>
  );
}
