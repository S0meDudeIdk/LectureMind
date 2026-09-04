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
import { deleteMediaFromCloud } from './storage';
import { deleteMediaFromLocalDb } from './mediaDb';
import { isAnonymous } from '../utils/authLimits';

const COLLECTION_NAME = 'mindmaps';
const LOCAL_STORAGE_KEY = 'lecturemind_saved_mindmaps';
const INITIALIZED_KEY = 'lecturemind_db_initialized_v6';


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
- Financial modeling`,
    notes: `# Introduction to Quantum Computing: Comprehensive Lecture Notes

## Executive Summary
Quantum computing represents a paradigm shift in computational complexity, moving beyond classical binary logic (0 and 1) to harness fundamental principles of quantum mechanics. By exploiting superposition, entanglement, and quantum interference, quantum processors solve specific mathematical problems exponentially faster than classical supercomputers.

## 1. Fundamental Quantum Mechanical Principles

### Quantum Superposition
In classical computing, a bit is constrained to either state 0 or state 1. A quantum bit (qubit) is described by a linear combination of states:
\`|ψ⟩ = α|0⟩ + β|1⟩\` where \`|α|² + |β|² = 1\`.
This allows an n-qubit register to simultaneously represent 2ⁿ states in a continuous Hilbert space.

### Quantum Entanglement
When two or more qubits become entangled, the quantum state of one cannot be described independently of the other, regardless of spatial separation. Einstein referred to this as "spooky action at a distance." Entanglement enables:
- Dense coding and quantum teleportation.
- Exponential state space correlation for multi-qubit parallel evaluation.

### Constructive & Destructive Interference
Quantum algorithms utilize interference patterns to amplify the probability amplitudes of correct solutions while canceling out incorrect computational paths before measurement collapses the wave function.

## 2. Hardware Architectures & Physical Realization

- **Superconducting Transmon Qubits**: Microfabricated Josephson junctions operating at millikelvin temperatures inside dilution refrigerators. Offers fast gate speeds (nanoseconds) but faces thermal decoherence.
- **Trapped Ion Systems**: Individual ionized atoms suspended in electromagnetic vacuum traps manipulated by precision lasers. Highly coherent with long coherence times (T2).
- **Photonic Quantum Computing**: Uses single photons routed through optical waveguides operating at ambient room temperature.

## 3. Groundbreaking Quantum Algorithms

### Shor's Algorithm
Developed by Peter Shor in 1994, this algorithm computes prime factors of integers in polynomial time O((log N)³). This poses a theoretical vulnerability for asymmetric cryptography (RSA / ECC), accelerating global migration to Post-Quantum Cryptography (PQC).

### Grover's Algorithm
Provides a quadratic speedup for unstructured database searches, transforming an O(N) classical brute-force search into O(√N) oracle queries.

## 4. Key Takeaways & Practical Outlook
1. Quantum supremacy has been demonstrated for specific sampling tasks, but fault-tolerant quantum computing (FTQC) requires error correction thresholds (e.g., surface codes).
2. Primary commercial near-term domains include molecular simulation for drug discovery, battery chemistry optimization, and financial risk modeling.`,
    transcript: [
      {
        startTime: "00:00",
        textBlock: "Welcome to our overview of quantum computing architectures. Today, we delve into how quantum mechanical phenomena can be harnessed to process information exponentially faster than classical Turing machines."
      },
      {
        startTime: "00:38",
        textBlock: "The heart of quantum computing lies in superposition and entanglement. Rather than being confined to discrete binary states of zero or one, quantum bits exist in continuous probability amplitudes across the Bloch sphere."
      },
      {
        startTime: "01:25",
        textBlock: "When implementing physical qubits, superconducting circuits and trapped ion traps are leading the race. Superconducting circuits allow rapid gate speeds, though they demand dilution refrigeration close to absolute zero."
      },
      {
        startTime: "02:10",
        textBlock: "Looking at algorithmic advantages, Shor's algorithm provides polynomial-time prime factorization, posing challenges to RSA encryption. Concurrently, Grover's algorithm delivers quadratic acceleration for unstructured database searches."
      }
    ]
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
- Explainability tools`,
    notes: `# Machine Learning Ethics & Governance: Study Notes

## Executive Overview
As artificial intelligence models are deployed in high-stakes societal domains—including healthcare triage, criminal justice, financial underwriting, and recruitment—algorithmic accountability, fairness, and privacy guarantees have become paramount engineering concerns.

## 1. Algorithmic Bias & Representation Disparities

### Sources of Bias
- **Historical Data Bias**: Training data reflects historical societal prejudices and systemic inequalities.
- **Sampling Disparity**: Under-representation of minority demographics leads to degraded predictive performance and higher error rates for those sub-populations.
- **Feedback Loops**: Predictive policing and recidivism scoring models generate self-fulfilling prophecies when enforcement actions generate the data used to validate future risk predictions.

## 2. Privacy Preservation & Security Guarantees

### Differential Privacy (DP)
Differential privacy provides mathematical bounds on the disclosure of individual training records:
\`P[M(D) ∈ S] ≤ e^ε · P[M(D') ∈ S] + δ\`
By adding calibrated Gaussian or Laplacian noise to gradients during training (DP-SGD), models ensure that no single individual's record substantially influences the final model weights.

### Federated Learning (FL)
Decentralized model training across distributed edge devices without centralizing raw user data.

## 3. Explainability & Governance
- **Post-Hoc Interpretability**: Methods like SHAP and LIME decompose black-box neural predictions.
- **Auditing Standards**: Algorithmic Impact Assessments (AIAs) and the EU AI Act enforce compliance.`,
    transcript: [
      {
        startTime: "00:00",
        textBlock: "In this seminar, we examine the societal implications of deploying machine learning models in high-stakes environments."
      },
      {
        startTime: "00:42",
        textBlock: "Algorithmic bias predominantly stems from skewed historical training datasets."
      }
    ]
  },
  {
    id: 'sample-3',
    title: 'Pythagorean Theorem',
    date: 'Sample',
    duration: '18:40',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    markdown: `# Pythagorean Theorem
## Geometric Concepts
- Right-angled triangle
- 90° angle
- Hypotenuse (c)
- Perpendicular legs (a, b)
## Mathematical Formulas
- Standard: a² + b² = c²
- Hypotenuse: c = √(a² + b²)
- Leg: a = √(c² - b²)
## Calculation Example
- Given: a = 3 cm, b = 4 cm
- 3² = 9
- 4² = 16
- 9 + 16 = 25
- Result: c = 5 cm
## Pythagorean Triples
- 3-4-5 Triplet
- 5-12-13 Triplet
- 8-15-17 Triplet`,
    notes: `# Pythagorean Theorem: Complete Geometry Study Notes

## Executive Summary
The Pythagorean Theorem is a fundamental principle of Euclidean geometry that establishes the mathematical relationship between the lengths of the sides of a right-angled triangle. It provides a straightforward method for calculating Euclidean distance between points on a coordinate plane.

## Fundamental Concepts & Geometric Representation

### Anatomy of a Right Triangle
- **Legs ($a$ and $b$)**: The two perpendicular sides that intersect to form the $90^\\circ$ right angle. On a Cartesian grid, these correspond to the horizontal and vertical intervals $\\Delta x$ and $\\Delta y$.
- **Hypotenuse ($c$)**: The longest side of the right triangle, situated directly opposite the $90^\\circ$ right angle.

### Area Interpretation & Proof
Geometrically, if squares are constructed on each of the three sides:
- The square along leg $a$ has an area of $a^2$.
- The square along leg $b$ has an area of $b^2$.
- The square along hypotenuse $c$ has an area of $c^2$.

The theorem states that the sum of the areas of the two leg squares equals the area of the hypotenuse square:
$$a^2 + b^2 = c^2$$

## Algebraic Formula for Hypotenuse Length
To solve directly for the length of hypotenuse $c$, take the principal square root of both sides:
$$c = \\sqrt{a^2 + b^2}$$

Similarly, to compute an unknown perpendicular leg:
$$a = \\sqrt{c^2 - b^2} \\quad \\text{and} \\quad b = \\sqrt{c^2 - a^2}$$

## Pythagorean Triples
Integer solutions $(a, b, c)$ satisfying $a^2 + b^2 = c^2$:
- **$3, 4, 5$**: $3^2 + 4^2 = 9 + 16 = 25 = 5^2$
- **$5, 12, 13$**: $5^2 + 12^2 = 25 + 144 = 169 = 13^2$
- **$8, 15, 17$**: $8^2 + 15^2 = 64 + 225 = 289 = 17^2$`,
    transcript: [
      {
        startTime: "00:00",
        textBlock: "Welcome to today's geometry session. We will examine the Pythagorean Theorem and its geometric derivations."
      },
      {
        startTime: "00:35",
        textBlock: "For any right triangle with perpendicular sides a and b and hypotenuse c, the sum of the squares of the legs equals the square of the hypotenuse."
      }
    ]
  }
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
 * Save a newly generated mindmap with direct or background Firestore sync.
 */
export const saveMindmap = async (title, markdown, duration = 'Lecture', extraMeta = {}, user = null) => {
  const docTitle = title || extractTitleFromMarkdown(markdown, 'Untitled Mindmap');
  const localId = 'local-' + Date.now();
  const now = new Date();

  const newDoc = {
    id: localId,
    title: docTitle,
    markdown,
    notes: extraMeta.notes || markdown,
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

  // 2. Sync to Firestore for authenticated users when configured
  if (isFirebaseConfigured && db && !isFirestoreDisabled && !isAnonymous(user)) {
    try {
      const colRef = collection(db, COLLECTION_NAME);
      const firestoreData = {
        title: docTitle,
        markdown,
        notes: extraMeta.notes || markdown,
        duration: duration || 'Lecture',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...extraMeta,
      };

      // Try creating the Firestore document directly
      const docRef = await timeoutPromise(addDoc(colRef, firestoreData), 4000);
      if (docRef?.id) {
        console.log(`[Firestore] Document saved successfully with ID:`, docRef.id);
        newDoc.id = docRef.id;

        const currentList = getLocalMindmaps();
        const syncedList = [newDoc, ...currentList.filter((item) => item.id !== localId && item.id !== docRef.id)];
        setLocalMindmaps(syncedList);
      }
    } catch (err) {
      console.warn('[Firestore] Initial addDoc warning (falling back to LocalStorage):', err?.message || err);
      handleFirestoreError(err);
    }
  }

  return newDoc;
};

/**
 * Update an existing mindmap title or content.
 */
export const updateMindmap = async (id, updates = {}, user = null) => {
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
        markdown: updates.markdown !== undefined ? updates.markdown : updatedMarkdown,
        notes: updates.notes !== undefined ? updates.notes : item.notes,
        updatedAt: new Date().toISOString(),
      };
    }
    return item;
  });
  setLocalMindmaps(updatedList);

  // 2. Sync to Firestore for authenticated users when configured and not a sample ID
  if (isFirebaseConfigured && db && !isFirestoreDisabled && !isAnonymous(user) && !id.startsWith('sample-') && id !== '1' && id !== '2') {
    try {
      if (id.startsWith('local-')) {
        // If it was created as a local ID due to a previous timeout, create it in Firestore now
        const itemToCreate = updatedList.find(i => i.id === id);
        if (itemToCreate) {
          const colRef = collection(db, COLLECTION_NAME);
          const docRef = await timeoutPromise(addDoc(colRef, {
            title: itemToCreate.title || 'Untitled Mindmap',
            markdown: itemToCreate.markdown || '',
            notes: itemToCreate.notes || '',
            duration: itemToCreate.duration || 'Lecture',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            ...updates,
          }), 4000);

          if (docRef?.id) {
            console.log('[Firestore] Local draft promoted to Firestore ID:', docRef.id);
            const currentList = getLocalMindmaps();
            const reindexedList = currentList.map(item => item.id === id ? { ...item, id: docRef.id } : item);
            setLocalMindmaps(reindexedList);
          }
        }
      } else {
        const docRef = doc(db, COLLECTION_NAME, id);
        await timeoutPromise(updateDoc(docRef, {
          ...updates,
          updatedAt: serverTimestamp(),
        }), 4000);
        console.log('[Firestore] Document updated successfully:', id);
      }
    } catch (err) {
      console.warn('[Firestore] Update failed:', err?.message || err);
      handleFirestoreError(err);
    }
  }
};

/**
 * Delete a mindmap by ID.
 * Cleans up LocalStorage, IndexedDB, Firebase Storage, and Firestore.
 */
export const deleteMindmap = async (id) => {
  if (!id) return;

  // 1. Delete from LocalStorage immediately
  const localList = getLocalMindmaps();
  const targetItem = localList.find((item) => item.id === id);
  const filteredList = localList.filter((item) => item.id !== id);
  setLocalMindmaps(filteredList);

  // 2. Delete from IndexedDB (both by ID and by title/filename if cached)
  deleteMediaFromLocalDb(id);
  if (targetItem?.title) {
    deleteMediaFromLocalDb(targetItem.title);
  }
  if (targetItem?.fileName) {
    deleteMediaFromLocalDb(targetItem.fileName);
  }

  // 3. Delete from Firebase Storage for ANY lecture (including local-* IDs)
  if (id !== '1' && id !== '2' && !id.startsWith('sample-')) {
    deleteMediaFromCloud(id, targetItem?.audioUrl);
  }

  // 4. Background sync: delete from Firestore if not a local/sample ID
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
