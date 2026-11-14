let currentIdToken: string | null = null;

export function setInMemoryIdToken(token: string | null) {
  currentIdToken = token;
}

export function getInMemoryIdToken(): string | null {
  return currentIdToken;
}

export function getAuthHeaders(): Record<string, string> {
  return currentIdToken ? { Authorization: `Bearer ${currentIdToken}` } : {};
}
