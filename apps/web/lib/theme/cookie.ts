export const themeCookieName = "dr_theme";
export type Theme = "light" | "dark";

export function setThemeCookie(theme: Theme) {
  const host = window.location.hostname;
  const isProdDomain =
    host === "danceresource.org" || host.endsWith(".danceresource.org");
  const attrs = isProdDomain ? "; Domain=.danceresource.org; Secure" : "";
  document.cookie = `${themeCookieName}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${attrs}`;
}

export function getThemeCookie(): Theme | undefined {
  const m = document.cookie.match(/(?:^|; )dr_theme=([^;]*)/);
  const v = m ? decodeURIComponent(m[1]) : undefined;
  return v === "light" || v === "dark" ? v : undefined;
}
