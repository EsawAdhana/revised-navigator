"use client";

/**
 * HB_PROBE: staging auto-fix proof page. Triggers two planted defects so the
 * staging SDK can create Issues. Safe to delete after the run.
 */

import { useState } from "react";
import { greetingFor } from "@/lib/receipt-greeting";
import { authSessionLabel } from "@/lib/auth-store";

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
            // Guest checkout: no customer → TypeError in receipt-greeting.ts
            greetingFor({ customer: null });
          }}
        >
          Trigger clean bug (receipt greeting)
        </button>
        <button
          type="button"
          onClick={() => {
            setLast("auth");
            // Guest session → TypeError in auth-store.ts (guardrail path)
            authSessionLabel(null);
          }}
        >
          Trigger auth bug (guardrail refusal)
        </button>
      </div>
    </main>
  );
}
