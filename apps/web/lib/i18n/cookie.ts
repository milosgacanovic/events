import { localeCookieName, type AppLocale } from "./config";

export function setLocaleCookie(locale: AppLocale) {
  const host = window.location.hostname;
  const isProdDomain = host === "danceresource.org" || host.endsWith(".danceresource.org");
  const attrs = isProdDomain ? "; Domain=.danceresource.org; Secure" : "";
  document.cookie = `${localeCookieName}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax${attrs}`;
}

export function getLocaleCookie(): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${localeCookieName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}
