"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "../i18n/I18nProvider";
import { useKeycloakAuth } from "./KeycloakAuthProvider";

export function KeycloakCallbackClient() {
  const { t } = useI18n();
  const router = useRouter();
  const { ready, authenticated, authError } = useKeycloakAuth();

  useEffect(() => {
    if (!ready) {
      return;
    }

    router.replace("/admin");
  }, [ready, authenticated, router]);

  if (!ready) {
    return <section className="panel">{t("auth.callback.completing")}</section>;
  }

  if (authError) {
    return <section className="panel">{t("auth.callback.failed", { error: authError })}</section>;
  }

  return <section className="panel">{t("auth.callback.redirecting")}</section>;
}
