import { localeCookieName, type AppLocale } from "./config";

export function setLocaleCookie(locale: AppLocale) {
  const host = window.location.hostname;
  const isProdDomain = host === "danceresource.org" || host.endsWith(".danceresource.org");

  // Browsers can hold a host-only cookie AND a domain-scoped cookie with the
  // same name simultaneously; both get sent in the Cookie header and the
  // server reads only one (browser-defined order). If they disagree, the
  // language flips back to whichever variant the server happens to pick.
  // Pre-emptively delete BOTH variants before writing the fresh value so only
  // one entry survives.
  const expire = "Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/";
  document.cookie = `${localeCookieName}=; ${expire}`;
  if (isProdDomain) {
    document.cookie = `${localeCookieName}=; ${expire}; Domain=.danceresource.org`;
  }

  const attrs = isProdDomain ? "; Domain=.danceresource.org; Secure" : "";
  document.cookie = `${localeCookieName}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax${attrs}`;
}

export function getLocaleCookie(): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${localeCookieName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}
