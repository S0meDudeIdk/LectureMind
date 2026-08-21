import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  disableNetwork
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';

const COLLECTION_NAME = 'mindmaps';
const LOCAL_STORAGE_KEY = 'lecturemind_saved_mindmaps';
const INITIALIZED_KEY = 'lecturemind_db_initialized_v2';
const EVENT_STORAGE_UPDATE = 'lecturemind_storage_update';

const INITIAL_SAMPLE_MINDMAPS = [
  { 
    id: 'sample-1', 
    title: 'Introduction to Quantum Computing', 
    date: 'Sample', 
    duration: '45:20',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    markdown: `# Quantum Computing
## Fundamental Principles
- Superposition states
- Quantum entanglement
- Interference patterns
## Quantum Hardware
- Superconducting qubits
- Trapped ion systems
- Photonic circuits
## Key Algorithms
- Shor factoring algorithm
- Grover search method
- Quantum Fourier transform
## Practical Applications
- Cryptographic security
- Molecular simulation
- Financial modeling`
  },
  { 
    id: 'sample-2', 
    title: 'Machine Learning Ethics', 
    date: 'Sample', 
    duration: '1:12:05',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    markdown: `# Machine Learning Ethics
## Algorithmic Bias
- Training data disparity
- Historical prejudice
- Feedback loops
## Privacy & Security
- Model inversion attacks
- Differential privacy
- Federated learning
## Governance Models
- Regulatory frameworks
- Audit standards
- Explainability tools`
  },
];

let isFirestoreDisabled = false;

// Timeout wrapper: ensures offline queue never hangs the JavaScript execution thread
const timeoutPromise = (promise, ms = 2000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firestore operation timed out / blocked by client')), ms)
    ),
  ]);
};

// Helper: Safely disable Firestore background network retries on adblocker detection
const handleFirestoreError = (err) => {
  if (!isFirestoreDisabled && db) {
    isFirestoreDisabled = true;
    try {
      disableNetwork(db);
    } catch {}
    console.info('[LectureMind] Ad blocker or offline network detected. Using LocalStorage persistence seamlessly.');
  }
};

// Helper: Read local mindmaps from LocalStorage (with initial sample seeding)
const getLocalMindmaps = () => {
  try {
    const initialized = localStorage.getItem(INITIALIZED_KEY);
    if (!initialized) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_SAMPLE_MINDMAPS));
      localStorage.setItem(INITIALIZED_KEY, 'true');
      return INITIAL_SAMPLE_MINDMAPS;
    }
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('Failed reading from localStorage:', err);
    return [];
  }
};

// Helper: Save mindmaps list to LocalStorage and broadcast update
const setLocalMindmaps = (items) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
    localStorage.setItem(INITIALIZED_KEY, 'true');
    window.dispatchEvent(new CustomEvent(EVENT_STORAGE_UPDATE, { detail: items }));
  } catch (err) {
    console.warn('Failed saving to localStorage:', err);
  }
};

// Helper: Format a timestamp or Date into human-readable relative string
export const formatRelativeDate = (timestamp) => {
  if (!timestamp) return 'Just now';
  let date;
  if (timestamp?.toDate) {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp);
  }

  if (isNaN(date?.getTime())) return 'Just now';

  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 0) {
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    return 'Today';
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// Helper: Extract top-level title from markdown (# Title)
export const extractTitleFromMarkdown = (markdown, fallback = 'Untitled Lecture') => {
  if (!markdown) return fallback;
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
};

/**
 * Save a newly generated mindmap immediately with non-blocking Firestore sync.
 */
export const saveMindmap = async (title, markdown, duration = 'Lecture', extraMeta = {}) => {
  const docTitle = title || extractTitleFromMarkdown(markdown, 'Untitled Mindmap');
  const localId = 'local-' + Date.now();
  const now = new Date();

  const newDoc = {
    id: localId,
    title: docTitle,
    markdown,
    duration: duration || 'Lecture',
    date: 'Just now',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...extraMeta,
  };

  // 1. Immediately persist locally & notify UI without blocking
  const localList = getLocalMindmaps();
  const updatedList = [newDoc, ...localList.filter((item) => item.id !== localId)];
  setLocalMindmaps(updatedList);

  // 2. Non-blocking background Firestore sync
  if (isFirebaseConfigured && db && !isFirestoreDisabled) {
    (async () => {
      try {
        const colRef = collection(db, COLLECTION_NAME);
        const firestoreData = {
          title: docTitle,
          markdown,
          duration: duration || 'Lecture',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          ...extraMeta,
        };

        const docRef = await timeoutPromise(addDoc(colRef, firestoreData), 2000);
        newDoc.id = docRef.id;

        const currentList = getLocalMindmaps();
        const syncedList = [newDoc, ...currentList.filter((item) => item.id !== localId && item.id !== docRef.id)];
        setLocalMindmaps(syncedList);
      } catch (err) {
        handleFirestoreError(err);
      }
    })();
  }

  return newDoc;
};

/**
 * Update an existing mindmap title or content.
 */
export const updateMindmap = async (id, updates = {}) => {
  if (!id) return;

  // 1. Update in LocalStorage immediately
  const localList = getLocalMindmaps();
  const updatedList = localList.map((item) => {
    if (item.id === id) {
      let updatedMarkdown = item.markdown;
      if (updates.title && item.markdown) {
        updatedMarkdown = item.markdown.replace(/^#\s+(.+)$/m, `# ${updates.title}`);
      }
      return {
        ...item,
        ...updates,
        markdown: updates.markdown || updatedMarkdown,
        updatedAt: new Date().toISOString(),
      };
    }
    return item;
  });
  setLocalMindmaps(updatedList);

  // 2. Background sync to Firestore if not a local/sample ID
  if (isFirebaseConfigured && db && !isFirestoreDisabled && !id.startsWith('local-') && !id.startsWith('sample-') && id !== '1' && id !== '2') {
    (async () => {
      try {
        const docRef = doc(db, COLLECTION_NAME, id);
        await timeoutPromise(updateDoc(docRef, {
          ...updates,
          updatedAt: serverTimestamp(),
        }), 2000);
      } catch (err) {
        handleFirestoreError(err);
      }
    })();
  }
};

/**
 * Delete a mindmap by ID.
 */
export const deleteMindmap = async (id) => {
  if (!id) return;

  // 1. Delete from LocalStorage immediately
  const localList = getLocalMindmaps();
  const filteredList = localList.filter((item) => item.id !== id);
  setLocalMindmaps(filteredList);

  // 2. Background sync to Firestore if not a local/sample ID
  if (isFirebaseConfigured && db && !isFirestoreDisabled && !id.startsWith('local-') && !id.startsWith('sample-') && id !== '1' && id !== '2') {
    (async () => {
      try {
        const docRef = doc(db, COLLECTION_NAME, id);
        await timeoutPromise(deleteDoc(docRef), 2000);
      } catch (err) {
        handleFirestoreError(err);
      }
    })();
  }
};

/**
 * Fetch saved mindmaps ordered by creation date descending with timeout protection.
 */
export const getRecentMindmaps = async (count = 30) => {
  const localList = getLocalMindmaps();

  if (!isFirebaseConfigured || !db || isFirestoreDisabled) {
    return localList.slice(0, count);
  }

  try {
    const colRef = collection(db, COLLECTION_NAME);
    const q = query(colRef, orderBy('createdAt', 'desc'), limit(count));
    const snapshot = await timeoutPromise(getDocs(q), 2000);

    const firestoreItems = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        date: formatRelativeDate(data.createdAt),
      };
    });

    if (firestoreItems.length > 0) {
      setLocalMindmaps(firestoreItems);
      return firestoreItems;
    }

    return localList.slice(0, count);
  } catch (err) {
    handleFirestoreError(err);
    return localList.slice(0, count);
  }
};

/**
 * Fetch a single mindmap by ID with timeout protection.
 */
export const getMindmapById = async (id) => {
  if (!id) return null;

  // Check LocalStorage first
  const localList = getLocalMindmaps();
  const localMatch = localList.find((item) => item.id === id);
  if (localMatch) return localMatch;

  if (isFirestoreDisabled || !isFirebaseConfigured || !db) return null;

  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await timeoutPromise(getDoc(docRef), 2000);

    if (!docSnap.exists()) return null;

    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      date: formatRelativeDate(data.createdAt),
    };
  } catch (err) {
    handleFirestoreError(err);
    return null;
  }
};

/**
 * Subscribe to real-time updates for recent mindmaps.
 */
export const subscribeToRecentMindmaps = (callback, count = 30) => {
  // 1. Instantly return local items
  const initialLocal = getLocalMindmaps();
  callback(initialLocal);

  // 2. Listen to internal local storage broadcasts
  const handleStorageEvent = (e) => {
    callback(e.detail || getLocalMindmaps());
  };
  const handleWindowStorage = () => {
    callback(getLocalMindmaps());
  };

  window.addEventListener(EVENT_STORAGE_UPDATE, handleStorageEvent);
  window.addEventListener('storage', handleWindowStorage);

  // 3. One-time initial background sync with Firestore if active
  if (isFirebaseConfigured && db && !isFirestoreDisabled) {
    getRecentMindmaps(count).then((items) => {
      if (items && items.length > 0) {
        callback(items);
      }
    }).catch(handleFirestoreError);
  }

  return () => {
    window.removeEventListener(EVENT_STORAGE_UPDATE, handleStorageEvent);
    window.removeEventListener('storage', handleWindowStorage);
  };
};
