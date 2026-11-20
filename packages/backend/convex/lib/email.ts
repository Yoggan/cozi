/** Dominios que no indican un negocio propio: correo personal, ISP o institución. */
const PERSONAL_DOMAINS = new Set([
  // Proveedores de correo personal
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.es",
  "hotmail.com.mx",
  "hotmail.co.uk",
  "hotmail.fr",
  "hotmail.de",
  "hotmail.it",
  "hotmail.com.ar",
  "hotmail.com.co",
  "hotmail.cl",
  "hotmail.com.pe",
  "outlook.com",
  "outlook.es",
  "outlook.com.mx",
  "outlook.co.uk",
  "outlook.fr",
  "outlook.de",
  "outlook.it",
  "live.com",
  "live.com.mx",
  "live.es",
  "live.co.uk",
  "live.fr",
  "live.de",
  "live.it",
  "msn.com",
  "yahoo.com",
  "yahoo.com.mx",
  "yahoo.es",
  "yahoo.co.uk",
  "yahoo.fr",
  "yahoo.de",
  "yahoo.it",
  "yahoo.com.ar",
  "yahoo.com.co",
  "yahoo.cl",
  "yahoo.com.pe",
  "ymail.com",
  "rocketmail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "gmx.com",
  "gmx.de",
  "gmx.net",
  "zoho.com",
  "zohomail.com",
  "yandex.com",
  "yandex.ru",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "tuta.com",
  "tutanota.com",
  "tutamail.com",
  "fastmail.com",
  "hey.com",
  // ISP mexicanos
  "telmex.com",
  "telmexmail.com",
  "prodigy.net.mx",
  "prodigy.com.mx",
  "infinitum.com.mx",
  "infinitummail.com",
  "izzi.mx",
  "izzi.com.mx",
  "totalplay.com.mx",
  "megacable.com.mx",
  "cablemas.com",
  "axtel.com.mx",
  "alestra.com.mx",
  "terra.com.mx",
  "uol.com.mx",
]);

// Cubre el dominio estándar (.edu.mx, .gob.mx), no universidades que usan .mx
// directo (unam.mx). Esas caen en la confirmación del prompt.
const INSTITUTIONAL_SUFFIXES = [".edu", ".edu.mx", ".gob.mx", ".gov", ".gov.mx", ".mil"];

/**
 * Señal de negocio: dominio propio. Es solo una pista — el dominio puede ser
 * personal (sergio.dev), por eso la app siempre pide confirmación.
 */
export function isBusinessEmail(email: string | null | undefined): boolean {
  const domain = email?.trim().toLowerCase().split("@")[1];
  if (!domain) {
    return false;
  }

  if (PERSONAL_DOMAINS.has(domain)) {
    return false;
  }

  return !INSTITUTIONAL_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}
