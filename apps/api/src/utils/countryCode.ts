const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  "argentina": "ar",
  "australia": "au",
  "austria": "at",
  "belgium": "be",
  "brazil": "br",
  "canada": "ca",
  "croatia": "hr",
  "czech republic": "cz",
  "denmark": "dk",
  "ecuador": "ec",
  "finland": "fi",
  "france": "fr",
  "germany": "de",
  "greece": "gr",
  "hungary": "hu",
  "india": "in",
  "indonesia": "id",
  "ireland": "ie",
  "israel": "il",
  "italy": "it",
  "japan": "jp",
  "luxembourg": "lu",
  "mexico": "mx",
  "netherlands": "nl",
  "new zealand": "nz",
  "peru": "pe",
  "poland": "pl",
  "portugal": "pt",
  "romania": "ro",
  "serbia": "rs",
  "slovakia": "sk",
  "south africa": "za",
  "spain": "es",
  "switzerland": "ch",
  "turkiye": "tr",
  "turkey": "tr",
  "united arab emirates": "ae",
  "united kingdom": "gb",
  "united kingdom (uk)": "gb",
  "united states": "us",
  "uruguay": "uy",
};

export function inferCountryCode(countryCode: string | null | undefined, formattedAddress: string | null | undefined): string | null {
  const normalizedCode = countryCode?.trim().toLowerCase() ?? "";
  if (/^[a-z]{2}$/.test(normalizedCode)) {
    return normalizedCode;
  }

  const address = formattedAddress?.trim().toLowerCase() ?? "";
  if (!address) {
    return null;
  }

  const segments = address
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const lastSegment = segments[segments.length - 1] ?? "";

  if (COUNTRY_NAME_TO_CODE[lastSegment]) {
    return COUNTRY_NAME_TO_CODE[lastSegment];
  }

  if (address.includes("united arab emirates")) {
    return "ae";
  }

  return null;
}
