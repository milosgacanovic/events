/**
 * ISO 3166-1 alpha-2 → alpha-3 mapping for fetching country GeoJSON boundaries.
 * Only includes countries likely to appear in our event data.
 */
const ALPHA2_TO_ALPHA3: Record<string, string> = {
  ad: "AND", ae: "ARE", af: "AFG", ag: "ATG", al: "ALB", am: "ARM", ao: "AGO",
  ar: "ARG", at: "AUT", au: "AUS", az: "AZE", ba: "BIH", bb: "BRB", bd: "BGD",
  be: "BEL", bf: "BFA", bg: "BGR", bh: "BHR", bi: "BDI", bj: "BEN", bn: "BRN",
  bo: "BOL", br: "BRA", bs: "BHS", bt: "BTN", bw: "BWA", by: "BLR", bz: "BLZ",
  ca: "CAN", cd: "COD", cf: "CAF", cg: "COG", ch: "CHE", ci: "CIV", cl: "CHL",
  cm: "CMR", cn: "CHN", co: "COL", cr: "CRI", cu: "CUB", cv: "CPV", cy: "CYP",
  cz: "CZE", de: "DEU", dj: "DJI", dk: "DNK", do: "DOM", dz: "DZA", ec: "ECU",
  ee: "EST", eg: "EGY", er: "ERI", es: "ESP", et: "ETH", fi: "FIN", fj: "FJI",
  fr: "FRA", ga: "GAB", gb: "GBR", ge: "GEO", gh: "GHA", gm: "GMB", gn: "GIN",
  gq: "GNQ", gr: "GRC", gt: "GTM", gw: "GNB", gy: "GUY", hn: "HND", hr: "HRV",
  ht: "HTI", hu: "HUN", id: "IDN", ie: "IRL", il: "ISR", in: "IND", iq: "IRQ",
  ir: "IRN", is: "ISL", it: "ITA", jm: "JAM", jo: "JOR", jp: "JPN", ke: "KEN",
  kg: "KGZ", kh: "KHM", km: "COM", kp: "PRK", kr: "KOR", kw: "KWT", kz: "KAZ",
  la: "LAO", lb: "LBN", lk: "LKA", lr: "LBR", ls: "LSO", lt: "LTU", lu: "LUX",
  lv: "LVA", ly: "LBY", ma: "MAR", md: "MDA", me: "MNE", mg: "MDG", mk: "MKD",
  ml: "MLI", mm: "MMR", mn: "MNG", mr: "MRT", mt: "MLT", mu: "MUS", mv: "MDV",
  mw: "MWI", mx: "MEX", my: "MYS", mz: "MOZ", na: "NAM", ne: "NER", ng: "NGA",
  ni: "NIC", nl: "NLD", no: "NOR", np: "NPL", nz: "NZL", om: "OMN", pa: "PAN",
  pe: "PER", pg: "PNG", ph: "PHL", pk: "PAK", pl: "POL", pr: "PRI", ps: "PSE",
  pt: "PRT", py: "PRY", qa: "QAT", ro: "ROU", rs: "SRB", ru: "RUS", rw: "RWA",
  sa: "SAU", sb: "SLB", sd: "SDN", se: "SWE", sg: "SGP", si: "SVN", sk: "SVK",
  sl: "SLE", sn: "SEN", so: "SOM", sr: "SUR", ss: "SSD", sv: "SLV", sy: "SYR",
  td: "TCD", tg: "TGO", th: "THA", tj: "TJK", tl: "TLS", tm: "TKM", tn: "TUN",
  tr: "TUR", tt: "TTO", tw: "TWN", tz: "TZA", ua: "UKR", ug: "UGA", us: "USA",
  uy: "URY", uz: "UZB", ve: "VEN", vn: "VNM", ye: "YEM", za: "ZAF", zm: "ZMB",
  zw: "ZWE",
};

export function alpha2ToAlpha3(code: string): string | null {
  return ALPHA2_TO_ALPHA3[code.toLowerCase()] ?? null;
}
