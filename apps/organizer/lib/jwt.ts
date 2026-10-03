export interface OrgTokenClaims {
  /** "org": organizador. "door": portero (solo escáner). */
  scope: "org" | "door";
  organization_id: string;
  user_id: string;
  exp: number;
}

/** Decodifica el payload de un JWT sin verificar la firma: solo para leer
 * claims no sensibles en el cliente (la verificación real la hace el
 * backend en cada petición). */
export function decodeJwt<T>(token: string): T | null {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
