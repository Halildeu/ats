import type React from 'react';

/**
 * @ats/ui erişim-kontrol sözlüğü — upstream shared-types/access.ts (saf, 82 satır)
 * BURAYA INLINE edildi: shared-types PAKETİ MFE START GATE gereği alınmadı;
 * tek-dosya sözlük + design-system DOM yardımcıları birleşik. Sahiplik ATS.
 */

/**
 * Dört-durumlu erişim merdiveni (tüm UI yüzeylerinde ortak):
 *
 * | Level     | UI davranışı                                                          |
 * | --------- | --------------------------------------------------------------------- |
 * | `full`    | Varsayılan. Tüm etkileşim açık, kimlik dönüşümü.                       |
 * | `readonly`| Görünür, etkileşimsiz. Click/brush/zoom/edit no-op.                    |
 * | `disabled`| Görünür, soluk, etkileşimsiz. Opsiyonel `accessReason` gösterilir.     |
 * | `hidden`  | Bileşen `null` döner. Layout alanı kapanır.                            |
 */
export type AccessLevel = 'full' | 'readonly' | 'disabled' | 'hidden';

/**
 * Erişim-kontrollü her bileşenin kabul ettiği opt-in props. `access`
 * default'u `'full'` (veya `undefined`) KİMLİK dönüşümü OLMAK ZORUNDA —
 * mevcut tüketiciler piksel-aynı çıktı görür.
 */
export type AccessControlledProps = {
  access?: AccessLevel;
  accessReason?: string;
};

/**
 * Ucuz boolean ayrıştırıcılarla çözülmüş durum. Boolean alanlar yalnız
 * kısaltmadır; kanonik kaynak `state`tir.
 */
export type AccessResolution = {
  state: AccessLevel;
  isHidden: boolean;
  isReadonly: boolean;
  isDisabled: boolean;
};

/**
 * Ham `access` prop'unu yapılandırılmış çözüme dönüştürür. `undefined`
 * `'full'`e düşer — tüketici `props.access`i fallback'siz geçebilir.
 */
export const resolveAccessState = (access?: AccessLevel): AccessResolution => {
  const state: AccessLevel = access ?? 'full';
  return {
    state,
    isHidden: state === 'hidden',
    isReadonly: state === 'readonly',
    isDisabled: state === 'disabled',
  };
};

/**
 * Saf yüklem — etkileşim bastırılacaksa `true`. "Bastırma"nın anlamına
 * çağıran karar verir (handler atla, preventDefault çağır, vb.); DOM'a
 * bağımlı değildir.
 */
export const shouldBlockInteraction = (
  state: AccessLevel,
  externallyDisabled?: boolean,
): boolean => {
  if (externallyDisabled) {
    return true;
  }
  return state === 'readonly' || state === 'disabled';
};

/**
 * Verilen erişim seviyesi için Tailwind utility class string'i döner.
 *
 * @example
 * ```tsx
 * <div className={cn("...", accessStyles(access))}>
 *   Content
 * </div>
 * ```
 */
export function accessStyles(access: AccessLevel): string {
  switch (access) {
    case 'disabled':
      return 'cursor-not-allowed opacity-50 pointer-events-none';
    case 'readonly':
      return 'cursor-default opacity-70';
    case 'hidden':
      return 'invisible';
    default:
      return '';
  }
}

/** @deprecated Use `accessStyles` instead. */
export const _accessStyles = accessStyles;

/** @deprecated Use `AccessControlledProps` instead. */
export type _AccessControlledProps = AccessControlledProps;

export const withAccessGuard = <E extends React.SyntheticEvent = React.SyntheticEvent>(
  state: AccessLevel,
  handler?: ((event: E) => void | Promise<void>) | (() => void | Promise<void>),
  externallyDisabled?: boolean,
) => {
  return (event: E) => {
    if (shouldBlockInteraction(state, externallyDisabled)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    (handler as ((event: E) => void | Promise<void>) | undefined)?.(event);
  };
};
