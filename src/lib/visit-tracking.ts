/**
 * Détection des robots connus pour le compteur de visites des liens publics.
 * Volontairement sans dépendance : le User-Agent est lu à la volée et n'est
 * jamais persisté.
 */
const BOT_USER_AGENT_PATTERN = new RegExp(
  [
    "bot",
    "crawler",
    "spider",
    "slurp",
    "facebookexternalhit",
    "facebookcatalog",
    "whatsapp",
    "telegrambot",
    "discordbot",
    "slackbot",
    "linkedinbot",
    "twitterbot",
    "pinterest",
    "embedly",
    "headlesschrome",
    "headless",
    "lighthouse",
    "pagespeed",
    "curl",
    "wget",
    "python-requests",
    "python-urllib",
    "aiohttp",
    "go-http-client",
    "axios",
    "node-fetch",
    "postmanruntime",
    "insomnia",
  ].join("|"),
  "i",
);

/** Vrai si le User-Agent correspond à un robot ou outil automatisé connu. */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const value = userAgent?.trim() ?? "";
  if (value === "") return false;
  return BOT_USER_AGENT_PATTERN.test(value);
}
