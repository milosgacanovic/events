"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "../i18n/I18nProvider";
import { useKeycloakAuth } from "./KeycloakAuthProvider";
import { pushDataLayer } from "../../lib/gtm";

export function KeycloakCallbackClient() {
  const { t } = useI18n();
  const router = useRouter();
  const { ready, authenticated, authError } = useKeycloakAuth();

  useEffect(() => {
    if (!ready) {
      return;
    }

    let returnPath = "/admin";
    try {
      const saved = sessionStorage.getItem("auth_return_path");
      if (saved && saved.startsWith("/") && !saved.startsWith("/auth")) {
        returnPath = saved;
        sessionStorage.removeItem("auth_return_path");
      }
    } catch {}

    if (authenticated) {
      pushDataLayer({
        event: "login_complete",
        login_return_to: returnPath,
      });
    }

    router.replace(returnPath);
  }, [ready, authenticated, router]);

  if (!ready) {
    return <section className="panel">{t("auth.callback.completing")}</section>;
  }

  if (authError) {
    return <section className="panel">{t("auth.callback.failed", { error: authError })}</section>;
  }

  return <section className="panel">{t("auth.callback.redirecting")}</section>;
}
