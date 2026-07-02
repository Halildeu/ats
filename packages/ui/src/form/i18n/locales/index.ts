import type { ErrorMessageMap } from '../errorMessages';

/* Tier 1 — Major world languages */
import { errorMessagesDe } from './de';
import { errorMessagesFr } from './fr';
import { errorMessagesEs } from './es';
import { errorMessagesPt } from './pt';
import { errorMessagesIt } from './it';
import { errorMessagesNl } from './nl';
import { errorMessagesPl } from './pl';
import { errorMessagesRu } from './ru';
import { errorMessagesJa } from './ja';
import { errorMessagesKo } from './ko';

/* Tier 2 — Widely spoken / regional */
import { errorMessagesAr } from './ar';
import { errorMessagesZh } from './zh';
import { errorMessagesHi } from './hi';
import { errorMessagesTh } from './th';
import { errorMessagesVi } from './vi';
import { errorMessagesId } from './id';
import { errorMessagesMs } from './ms';
import { errorMessagesUk } from './uk';
import { errorMessagesCs } from './cs';
import { errorMessagesRo } from './ro';
import { errorMessagesHu } from './hu';
import { errorMessagesBg } from './bg';
import { errorMessagesSv } from './sv';
import { errorMessagesDa } from './da';
import { errorMessagesFi } from './fi';

/* Tier 3 — Extended coverage */
import { errorMessagesNo } from './no';
import { errorMessagesSk } from './sk';
import { errorMessagesSl } from './sl';
import { errorMessagesHr } from './hr';
import { errorMessagesSr } from './sr';
import { errorMessagesEl } from './el';
import { errorMessagesHe } from './he';
import { errorMessagesFa } from './fa';
import { errorMessagesUr } from './ur';
import { errorMessagesBn } from './bn';
import { errorMessagesTa } from './ta';
import { errorMessagesKa } from './ka';
import { errorMessagesAz } from './az';
import { errorMessagesKk } from './kk';
import { errorMessagesUz } from './uz';
import { errorMessagesLt } from './lt';
import { errorMessagesLv } from './lv';
import { errorMessagesEt } from './et';
import { errorMessagesMk } from './mk';
import { errorMessagesSq } from './sq';
import { errorMessagesBs } from './bs';
import { errorMessagesMn } from './mn';
import { errorMessagesSw } from './sw';
import { errorMessagesTl } from './tl';
import { errorMessagesCa } from './ca';

export const allLocales: Record<string, ErrorMessageMap> = {
  /* Tier 1 */
  de: errorMessagesDe,
  fr: errorMessagesFr,
  es: errorMessagesEs,
  pt: errorMessagesPt,
  it: errorMessagesIt,
  nl: errorMessagesNl,
  pl: errorMessagesPl,
  ru: errorMessagesRu,
  ja: errorMessagesJa,
  ko: errorMessagesKo,
  /* Tier 2 */
  ar: errorMessagesAr,
  zh: errorMessagesZh,
  hi: errorMessagesHi,
  th: errorMessagesTh,
  vi: errorMessagesVi,
  id: errorMessagesId,
  ms: errorMessagesMs,
  uk: errorMessagesUk,
  cs: errorMessagesCs,
  ro: errorMessagesRo,
  hu: errorMessagesHu,
  bg: errorMessagesBg,
  sv: errorMessagesSv,
  da: errorMessagesDa,
  fi: errorMessagesFi,
  /* Tier 3 */
  no: errorMessagesNo,
  sk: errorMessagesSk,
  sl: errorMessagesSl,
  hr: errorMessagesHr,
  sr: errorMessagesSr,
  el: errorMessagesEl,
  he: errorMessagesHe,
  fa: errorMessagesFa,
  ur: errorMessagesUr,
  bn: errorMessagesBn,
  ta: errorMessagesTa,
  ka: errorMessagesKa,
  az: errorMessagesAz,
  kk: errorMessagesKk,
  uz: errorMessagesUz,
  lt: errorMessagesLt,
  lv: errorMessagesLv,
  et: errorMessagesEt,
  mk: errorMessagesMk,
  sq: errorMessagesSq,
  bs: errorMessagesBs,
  mn: errorMessagesMn,
  sw: errorMessagesSw,
  tl: errorMessagesTl,
  ca: errorMessagesCa,
};
