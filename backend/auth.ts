export interface VerifiedIdentity { id: string; emailConfirmedAt: string | null }
export interface TokenIdentityProvider {
  auth: {
    getUser(token: string): Promise<{
      data: { user: { id: string; email_confirmed_at?: string | null } | null };
      error: unknown;
    }>;
  };
}

export function tokenAuthenticator(provider: TokenIdentityProvider) {
  return async (token: string): Promise<VerifiedIdentity | null> => {
    try {
      const { data, error } = await provider.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id, emailConfirmedAt: data.user.email_confirmed_at || null };
    } catch { return null; }
  };
}
