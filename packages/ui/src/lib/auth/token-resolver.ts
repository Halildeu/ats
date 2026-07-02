export type TokenResolver = () => string | null;

const readLocalStorageToken = (): string | null => null;

const defaultResolver: TokenResolver = () => readLocalStorageToken();

let resolveToken: TokenResolver = defaultResolver;

export const getResolvedToken = (): string | null => {
  try {
    const token = resolveToken();
    return token ?? null;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Token resolver çalıştırılamadı:', error);
    }
    return null;
  }
};

export const registerTokenResolver = (resolver?: TokenResolver | null): void => {
  resolveToken = resolver ?? defaultResolver;
};

export const resetTokenResolver = (): void => {
  resolveToken = defaultResolver;
};

export const buildAuthHeaders = (): Record<string, string> => {
  const token = getResolvedToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};
