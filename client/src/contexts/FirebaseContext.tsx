import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { onIdTokenChanged, signInWithPopup, signOut, type User as FirebaseUser } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  auth,
  BLUEPRINT_LIMITS,
  db,
  googleAuthProvider,
  handleFirestoreError,
  OperationType,
  sanitizeBoundedString,
} from "@/lib/firebase";
import { setInMemoryIdToken } from "@/lib/authToken";
import { trpc } from "@/lib/trpc";

export type FirestoreAttemptSummary = {
  id: string;
  userId: string;
  subjectSlug: "informatika" | "mentiq";
  topicSlug: string;
  examYear?: number;
  totalQuestions: number;
  scoredQuestions: number;
  correctCount: number;
  incorrectCount: number;
  unscoredCount: number;
  scorePercent?: number;
  status: "submitted";
};

type FirebaseContextValue = {
  authReady: boolean;
  firebaseUser: FirebaseUser | null;
  attempts: FirestoreAttemptSummary[];
  signingIn: boolean;
  signInWithGoogle: () => Promise<FirebaseUser | null>;
  signOutFirebase: () => Promise<void>;
  saveAttemptToFirestore: (input: {
    subjectSlug: "informatika" | "mentiq";
    topicSlug: string;
    examYear: number | null;
    totalQuestions: number;
    scoredQuestions: number;
    correctCount: number;
    incorrectCount: number;
    unscoredCount: number;
    scorePercent: number | null;
  }) => Promise<void>;
};

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

async function ensureUserProfileDocs(user: FirebaseUser) {
  if (!BLUEPRINT_LIMITS.idPattern.test(user.uid) || user.uid.length > BLUEPRINT_LIMITS.maxIdLength) {
    return;
  }
  const userDocPath = `users/${user.uid}`;
  const userRef = doc(db, "users", user.uid);
  const displayName = sanitizeBoundedString(
    user.displayName || user.email?.split("@")[0] || "İstifadəçi",
    BLUEPRINT_LIMITS.maxDisplayNameLength,
  );

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        displayName,
        role: "user",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        displayName,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userDocPath);
  }

  if (user.email && user.email.length >= 3 && user.email.length <= BLUEPRINT_LIMITS.maxEmailLength) {
    const privatePath = `users/${user.uid}/private/info`;
    const privateRef = doc(db, "users", user.uid, "private", "info");
    try {
      const privSnap = await getDoc(privateRef);
      if (!privSnap.exists()) {
        await setDoc(privateRef, {
          uid: user.uid,
          email: user.email.slice(0, BLUEPRINT_LIMITS.maxEmailLength),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(privateRef, {
          email: user.email.slice(0, BLUEPRINT_LIMITS.maxEmailLength),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, privatePath);
    }
  }
}

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [attempts, setAttempts] = useState<FirestoreAttemptSummary[]>([]);
  const [signingIn, setSigningIn] = useState(false);
  const syncedUidRef = useRef<string | null>(null);
  const utils = trpc.useUtils();
  const syncFirestoreMutation = trpc.questionBank.syncFirestore.useMutation();
  const syncMutationRef = useRef(syncFirestoreMutation);
  syncMutationRef.current = syncFirestoreMutation;

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async user => {
      if (user) {
        try {
          const token = await user.getIdToken();
          setInMemoryIdToken(token);
          if (user.emailVerified) {
            const me = await utils.auth.me.fetch();
            if (me?.role === "admin" && me.loginMethod === "firebase" && syncedUidRef.current !== user.uid) {
              syncedUidRef.current = user.uid;
              void syncMutationRef.current.mutateAsync().catch(() => {
                syncedUidRef.current = null;
              });
            }
          }
        } catch {
          setInMemoryIdToken(null);
        }
      } else {
        setInMemoryIdToken(null);
        syncedUidRef.current = null;
      }
      setFirebaseUser(user);
      setAuthReady(true);
      void utils.auth.me.invalidate();
    });
    return () => unsubscribe();
  }, [utils]);

  useEffect(() => {
    if (!authReady || !firebaseUser) {
      setAttempts([]);
      return;
    }

    const attemptsPath = `users/${firebaseUser.uid}/attempts`;
    const q = query(
      collection(db, "users", firebaseUser.uid, "attempts"),
      where("userId", "==", firebaseUser.uid),
      orderBy("createdAt", "desc"),
      limit(25),
    );
    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        setAttempts(
          snapshot.docs.map(docSnap => {
            const data = docSnap.data() as Omit<FirestoreAttemptSummary, "id">;
            return { id: docSnap.id, ...data };
          }),
        );
      },
      error => {
        handleFirestoreError(error, OperationType.LIST, attemptsPath);
      },
    );
    return () => unsubscribe();
  }, [authReady, firebaseUser]);

  const signInWithGoogle = useCallback(async () => {
    setSigningIn(true);
    try {
      const credential = await signInWithPopup(auth, googleAuthProvider);
      const token = await credential.user.getIdToken();
      setInMemoryIdToken(token);
      if (credential.user.emailVerified) {
        await ensureUserProfileDocs(credential.user);
      }
      const me = await utils.auth.me.fetch();
      if (me?.role === "admin" && me.loginMethod === "firebase" && syncedUidRef.current !== credential.user.uid) {
        syncedUidRef.current = credential.user.uid;
        void syncFirestoreMutation.mutateAsync().catch(() => {
          syncedUidRef.current = null;
        });
      }
      return credential.user;
    } finally {
      setSigningIn(false);
    }
  }, [syncFirestoreMutation, utils]);

  const signOutFirebase = useCallback(async () => {
    setInMemoryIdToken(null);
    syncedUidRef.current = null;
    await signOut(auth);
    await utils.auth.me.invalidate();
  }, [utils]);

  const saveAttemptToFirestore = useCallback(
    async (input: {
      subjectSlug: "informatika" | "mentiq";
      topicSlug: string;
      examYear: number | null;
      totalQuestions: number;
      scoredQuestions: number;
      correctCount: number;
      incorrectCount: number;
      unscoredCount: number;
      scorePercent: number | null;
    }) => {
      if (!firebaseUser || !firebaseUser.emailVerified) return;
      await ensureUserProfileDocs(firebaseUser);
      const path = `users/${firebaseUser.uid}/attempts`;
      const payload: Record<string, unknown> = {
        userId: firebaseUser.uid,
        subjectSlug: input.subjectSlug,
        topicSlug: sanitizeBoundedString(input.topicSlug, BLUEPRINT_LIMITS.maxTopicSlugLength, "topic"),
        totalQuestions: Math.max(1, Math.min(input.totalQuestions, BLUEPRINT_LIMITS.maxTotalQuestions)),
        scoredQuestions: Math.max(0, input.scoredQuestions),
        correctCount: Math.max(0, input.correctCount),
        incorrectCount: Math.max(0, input.incorrectCount),
        unscoredCount: Math.max(0, input.unscoredCount),
        status: "submitted",
        createdAt: serverTimestamp(),
      };
      if (input.examYear !== null && input.examYear >= 1900 && input.examYear <= 2100) {
        payload.examYear = input.examYear;
      }
      if (input.scorePercent !== null && input.scorePercent >= 0 && input.scorePercent <= 100) {
        payload.scorePercent = Math.round(input.scorePercent);
      }

      try {
        await addDoc(collection(db, "users", firebaseUser.uid, "attempts"), payload);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [firebaseUser],
  );

  const value = useMemo(
    () => ({
      authReady,
      firebaseUser,
      attempts,
      signingIn,
      signInWithGoogle,
      signOutFirebase,
      saveAttemptToFirestore,
    }),
    [authReady, firebaseUser, attempts, signingIn, signInWithGoogle, signOutFirebase, saveAttemptToFirestore],
  );

  return <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>;
}

export function useFirebase() {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error("useFirebase must be used inside FirebaseProvider");
  }
  return ctx;
}
