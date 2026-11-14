import { firebaseProjectConfig } from "./_core/firebaseAdmin";

const { projectId, firestoreDatabaseId, apiKey } = firebaseProjectConfig;

function documentsRoot() {
  return `projects/${projectId}/databases/${firestoreDatabaseId}/documents`;
}

function firestoreBaseUrl() {
  return `https://firestore.googleapis.com/v1/${documentsRoot()}`;
}

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }
  | { nullValue: null };

function toFirestoreValue(val: unknown): FirestoreValue {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === "object") {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined && v !== null) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(val: FirestoreValue | undefined): unknown {
  if (!val) return null;
  if ("stringValue" in val) return val.stringValue;
  if ("integerValue" in val) return Number(val.integerValue);
  if ("doubleValue" in val) return val.doubleValue;
  if ("booleanValue" in val) return val.booleanValue;
  if ("timestampValue" in val) return new Date(val.timestampValue);
  if ("nullValue" in val) return null;
  if ("arrayValue" in val) return (val.arrayValue.values ?? []).map(fromFirestoreValue);
  if ("mapValue" in val) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields ?? {})) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return null;
}

export async function checkFirestoreAdminDoc(uid: string, idToken: string): Promise<boolean> {
  if (!uid || !idToken) return false;
  try {
    const url = `${firestoreBaseUrl()}/admins/${encodeURIComponent(uid)}?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function commitFirestoreUpsert(
  docPath: string,
  fields: Record<string, unknown>,
  options: { idToken: string; serverTimestampFields?: string[]; preserveCreatedAt?: boolean },
): Promise<boolean> {
  const { idToken, serverTimestampFields = ["createdAt", "updatedAt"], preserveCreatedAt = true } = options;
  if (!idToken) return false;

  const cleanFields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null && !serverTimestampFields.includes(k)) {
      cleanFields[k] = toFirestoreValue(v);
    }
  }

  const fullDocName = `${documentsRoot()}/${docPath}`;
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${firestoreDatabaseId}/documents:commit?key=${encodeURIComponent(apiKey)}`;

  // Check if document exists when preserving createdAt
  let exists = false;
  if (preserveCreatedAt) {
    try {
      const checkRes = await fetch(`${firestoreBaseUrl()}/${docPath}?key=${encodeURIComponent(apiKey)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      exists = checkRes.ok;
    } catch {
      exists = false;
    }
  }

  const fieldTransforms = serverTimestampFields
    .filter(f => !(exists && f === "createdAt"))
    .map(fieldPath => ({
      fieldPath,
      setToServerValue: "REQUEST_TIME",
    }));

  const updateMaskPaths = exists
    ? Object.keys(cleanFields).filter(k => k !== "createdAt")
    : undefined;

  const writes = [
    {
      update: {
        name: fullDocName,
        fields: cleanFields,
      },
      ...(updateMaskPaths ? { updateMask: { fieldPaths: updateMaskPaths } } : {}),
      ...(fieldTransforms.length ? { updateTransforms: fieldTransforms } : {}),
    },
  ];

  try {
    const res = await fetch(commitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ writes }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkFirestoreDocExists(docPath: string, idToken: string): Promise<boolean> {
  if (!idToken) return false;
  try {
    const res = await fetch(`${firestoreBaseUrl()}/${docPath}?mask.fieldPaths=createdAt&key=${encodeURIComponent(apiKey)}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function commitFirestoreBatch(
  items: Array<{ docPath: string; fields: Record<string, unknown> }>,
  idToken: string,
): Promise<{ committed: number; failed: number }> {
  if (!idToken || !items.length) return { committed: 0, failed: 0 };
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${firestoreDatabaseId}/documents:commit?key=${encodeURIComponent(apiKey)}`;

  // Check existence in small concurrent batches so createdAt is preserved on updates
  const existsList: boolean[] = new Array(items.length).fill(false);
  for (let i = 0; i < items.length; i += 20) {
    const slice = items.slice(i, i + 20);
    const results = await Promise.all(slice.map(item => checkFirestoreDocExists(item.docPath, idToken)));
    results.forEach((val, idx) => {
      existsList[i + idx] = val;
    });
  }

  let committed = 0;
  let failed = 0;
  const CHUNK_SIZE = 100;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const writes = chunk.map((item, idx) => {
      const exists = existsList[i + idx];
      const cleanFields: Record<string, FirestoreValue> = {};
      for (const [k, v] of Object.entries(item.fields)) {
        if (v !== undefined && v !== null && k !== "createdAt" && k !== "updatedAt") {
          cleanFields[k] = toFirestoreValue(v);
        }
      }
      const fieldTransforms = (exists ? ["updatedAt"] : ["createdAt", "updatedAt"]).map(fieldPath => ({
        fieldPath,
        setToServerValue: "REQUEST_TIME",
      }));
      const updateMaskPaths = exists ? Object.keys(cleanFields) : undefined;
      return {
        update: {
          name: `${documentsRoot()}/${item.docPath}`,
          fields: cleanFields,
        },
        ...(updateMaskPaths ? { updateMask: { fieldPaths: updateMaskPaths } } : {}),
        updateTransforms: fieldTransforms,
      };
    });

    try {
      const res = await fetch(commitUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ writes }),
      });
      if (res.ok) {
        committed += chunk.length;
      } else {
        failed += chunk.length;
      }
    } catch {
      failed += chunk.length;
    }
  }

  return { committed, failed };
}

export async function deleteFirestoreDoc(docPath: string, idToken: string): Promise<boolean> {
  if (!idToken) return false;
  try {
    const res = await fetch(`${firestoreBaseUrl()}/${docPath}?key=${encodeURIComponent(apiKey)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function queryPublicCollection(collectionId: string): Promise<Record<string, unknown>[]> {
  try {
    const url = `https://firestore.googleapis.com/v1/${documentsRoot()}:runQuery?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where: {
            fieldFilter: {
              field: { fieldPath: "visibility" },
              op: "EQUAL",
              value: { stringValue: "public" },
            },
          },
          limit: 1000,
        },
      }),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ document?: { name: string; fields?: Record<string, FirestoreValue> } }>;
    return rows
      .filter(r => r.document?.fields)
      .map(r => {
        const obj: Record<string, unknown> = {
          _docId: r.document!.name.split("/").pop(),
        };
        for (const [k, v] of Object.entries(r.document!.fields!)) {
          obj[k] = fromFirestoreValue(v);
        }
        return obj;
      });
  } catch {
    return [];
  }
}
