import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import firebaseConfig from "../../firebase-applet-config.json";

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

export const adminAuth = getAuth();
export const firebaseProjectConfig = firebaseConfig;

export async function verifyFirebaseIdToken(token: string): Promise<DecodedIdToken | null> {
  if (!token.trim()) return null;
  try {
    return await adminAuth.verifyIdToken(token);
  } catch {
    return null;
  }
}
