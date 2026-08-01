"use client";

import { useEffect } from "react";
import { HumanBehaviorTracker } from "humanbehavior-js";

export function HumanBehaviorInit() {
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_HUMANBEHAVIOR_API_KEY;
    if (!apiKey) return;

    HumanBehaviorTracker.init(apiKey, {
      ingestionUrl: process.env.NEXT_PUBLIC_HUMANBEHAVIOR_INGESTION_URL,
    });
  }, []);

  return null;
}
