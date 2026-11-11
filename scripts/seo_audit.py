#!/usr/bin/env python3
"""
SEO audit for events.danceresource.org.
Samples URLs from the events sitemaps, fetches them as Googlebot and checks the
rules from the round-3 handoff. Exit code 1 if any check fails.

Usage: python3 scripts/seo_audit.py [--sample 60] [--seed 1]
"""
import argparse
import json
import random
import re
import sys
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

BASE = "https://events.danceresource.org"
UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
ENTITY_LEFTOVERS = ("&amp;", "&quot;", "&#39;", "&nbsp;", "&lt;", "&gt;")


PUBLIC_BASE = BASE


def set_base(base):
    global BASE
    BASE = base.rstrip("/")


def get(url):
    if BASE != PUBLIC_BASE:
        url = url.replace(PUBLIC_BASE, BASE)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "ignore")


def sitemap_urls(sitemap_marker, path_segment):
    index = get(f"{BASE}/sitemap.xml")
    urls = []
    for sitemap in re.findall(r"<loc>([^<]+)</loc>", index):
        if sitemap_marker in sitemap:
            urls += re.findall(rf"<loc>([^<]+/{path_segment}/[^<]+)</loc>", get(sitemap))
    return urls


def sitemap_event_urls():
    return sitemap_urls("sitemap-events", "events")


def page_robots_noindex(url):
    """True/False for a page's robots meta, None when the fetch fails."""
    try:
        html = get(url)
    except Exception:
        return None
    robots = re.search(r'<meta name="robots" content="([^"]*)"', html)
    return bool(robots and "noindex" in robots.group(1))


def noindex_in_sitemap(sitemap_marker, path_segment, sample_size):
    """Sample a non-event sitemap; every listed page must be indexable."""
    urls = sitemap_urls(sitemap_marker, path_segment)
    sample = random.sample(urls, min(sample_size, len(urls)))
    with ThreadPoolExecutor(max_workers=4) as pool:
        flags = list(pool.map(page_robots_noindex, sample))
    bad = [u for u, f in zip(sample, flags) if f]
    return len(urls), len([f for f in flags if f is not None]), bad


def event_jsonld(html):
    for block in re.findall(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S):
        try:
            data = json.loads(block)
        except ValueError:
            continue
        for item in data if isinstance(data, list) else [data]:
            if isinstance(item, dict) and item.get("@type") == "Event":
                return item
    return None


def audit(url):
    try:
        html = get(url)
    except Exception as exc:  # report network errors, don't crash
        return {"url": url, "error": str(exc)}
    robots = re.search(r'<meta name="robots" content="([^"]*)"', html)
    canonical = re.search(r'<link[^>]*rel="canonical"[^>]*href="([^"]+)"', html)
    title = re.search(r"<title>([^<]*)</title>", html)
    host = re.search(r'href="(?:https://events\.danceresource\.org)?/hosts/([a-z0-9-]+)"', html)
    ld = event_jsonld(html) or {}
    description = ld.get("description") or ""
    return {
        "url": url,
        "noindex": bool(robots and "noindex" in robots.group(1)),
        "self_canonical": bool(canonical and canonical.group(1).rstrip("/") == url.replace(BASE, PUBLIC_BASE).rstrip("/")),
        "title": title.group(1).strip() if title else "",
        "has_ld": bool(ld),
        "has_source": "isBasedOn" in ld,
        "has_offers": "offers" in ld,
        "has_image": bool(ld.get("image")),
        "desc_ok": len(description) >= 80,
        "entity_bug": "&amp;amp;" in html or any(e in description for e in ENTITY_LEFTOVERS),
        "host": host.group(1) if host else None,
    }


def host_links_to(host_slug, event_url):
    slug = event_url.rstrip("/").rsplit("/", 1)[1]
    html = get(f"{BASE}/hosts/{host_slug}")
    # A ?date=… variant is still a link to that event page (it canonicalizes
    # to /events/<slug>); host cards use it for single-date events.
    pattern = rf'<a[^>]+href="(?:{re.escape(PUBLIC_BASE)})?/events/{re.escape(slug)}(?:\?[^"]*)?"'
    return re.search(pattern, html) is not None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample", type=int, default=60)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--base", default=BASE, help="site origin (e.g. a local build); sitemap URLs are rewritten to it")
    args = parser.parse_args()
    set_base(args.base)
    random.seed(args.seed)

    urls = sitemap_event_urls()
    sample = random.sample(urls, min(args.sample, len(urls)))
    with ThreadPoolExecutor(max_workers=8) as pool:
        rows = list(pool.map(audit, sample))
    ok = [r for r in rows if "error" not in r]
    n = len(ok)

    def count(key):
        return sum(1 for r in ok if r[key])

    dup_titles = {t: c for t, c in Counter(r["title"] for r in ok).items() if c > 1}
    with_source = [r for r in ok if r["has_source"]]
    offers_ratio = (sum(r["has_offers"] for r in with_source) / len(with_source)) if with_source else 1.0
    host_checks = [r for r in ok if r["host"] and not r["noindex"]][:5]
    host_fail = [r["url"] for r in host_checks if not host_links_to(r["host"], r["url"])]
    # Thin-host policy: the hosts sitemap lists only indexable host pages.
    hosts_total, hosts_checked, hosts_noindex = noindex_in_sitemap("sitemap-hosts", "hosts", 10)
    # Landing pages (city pages, series hubs): every listed page indexable.
    cities_total, cities_checked, cities_noindex = noindex_in_sitemap("sitemap-cities", "events/in", 5)
    series_total, series_checked, series_noindex = noindex_in_sitemap("sitemap-series", "series", 5)

    print(f"Event URLs in sitemaps: {len(urls)} | sampled: {len(sample)} | fetch errors: {len(rows) - n}")
    results = [
        ("noindex pages listed in sitemap", count("noindex"), count("noindex") == 0),
        ("non-self canonicals", n - count("self_canonical"), count("self_canonical") == n),
        ("pages without Event JSON-LD", n - count("has_ld"), count("has_ld") == n),
        ("entity-encoding bugs", count("entity_bug"), count("entity_bug") == 0),
        # Informational only: offers is intentionally NOT emitted (no price
        # fields in the DB; a price-less Offer just trades one GSC warning
        # for another — see commit bbc982b and SEO round 3 decision).
        ("offers coverage (info, not enforced)", f"{offers_ratio:.0%}", None),
        ("duplicate titles in sample", len(dup_titles), not dup_titles),
        ("descriptions >= 80 chars", f"{count('desc_ok')}/{n}", count("desc_ok") >= 0.95 * n),
        ("JSON-LD image present", f"{count('has_image')}/{n}", count("has_image") == n),
        ("host pages linking back to event", f"{len(host_checks) - len(host_fail)}/{len(host_checks)}", not host_fail),
        (f"noindex host pages in hosts sitemap ({hosts_total} listed)", f"{len(hosts_noindex)}/{hosts_checked}", not hosts_noindex),
        (f"noindex city pages in cities sitemap ({cities_total} listed)", f"{len(cities_noindex)}/{cities_checked}", not cities_noindex),
        (f"noindex series hubs in series sitemap ({series_total} listed)", f"{len(series_noindex)}/{series_checked}", not series_noindex),
    ]
    failed = False
    for name, value, passed in results:
        label = "INFO" if passed is None else ("PASS" if passed else "FAIL")
        print(f"  [{label}] {name}: {value}")
        failed = failed or passed is False
    for title, c in list(dup_titles.items())[:5]:
        print(f"      duplicate title x{c}: {title}")
    for r in [r for r in ok if r["entity_bug"]][:5]:
        print(f"      entity-encoding bug: {r['url']}")
    for url in host_fail:
        print(f"      host page missing link to: {url}")
    for url in hosts_noindex + cities_noindex + series_noindex:
        print(f"      noindex page in sitemap: {url}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
