import catalog from "../../i18n/tr-TR.json";

/** ATS-0011 I18N-2: hardcoded UI metni YASAK — tüm metin tr-TR kataloğundan. */
const messages: Record<string, string> = catalog.messages;

export function t(key: string, vars?: Record<string, string | number>): string {
  let msg = messages[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      msg = msg.replaceAll(`{${k}}`, String(v));
    }
  }
  return msg;
}
