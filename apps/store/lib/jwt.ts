export interface CustomerTokenClaims {
  scope: "customer";
  user_id: string;
  exp: number;
}

export function decodeJwt<T>(token: string): T | null {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
