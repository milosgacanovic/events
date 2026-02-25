"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useKeycloakAuth } from "./KeycloakAuthProvider";

export function KeycloakCallbackClient() {
  const router = useRouter();
  const { ready, authenticated, authError } = useKeycloakAuth();

  useEffect(() => {
    if (!ready) {
      return;
    }

    router.replace("/admin");
  }, [ready, authenticated, router]);

  if (!ready) {
    return <section className="panel">Completing sign-in...</section>;
  }

  if (authError) {
    return <section className="panel">Sign-in failed: {authError}</section>;
  }

  return <section className="panel">Redirecting to admin...</section>;
}
