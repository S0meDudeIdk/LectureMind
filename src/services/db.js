import { collection, doc, getDoc, query, where, orderBy, limit, onSnapshot, runTransaction } from 'firebase/firestore';
import { db, isFirebaseConfigured, auth } from './firebase';
import { deleteMediaFromCloud } from './storage';
import { getOwnerScope, isAnonymous } from '../utils/authLimits';
import { createLectureId, localTransaction, requestResult, readLocalRecord, readLocalScope, notifyLocalChange } from './localDb';

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

const CONTENT_FIELDS = ['title', 'markdown', 'notes', 'duration', 'transcript', 'fileName', 'fileSize', 'mimeType', 'isVideo', 'audioUrl', 'playbackUploadId', 'originalMimeType', 'status', 'generationStatus', 'mediaStatus', 'error'];
const syncRuns = new Map();
const retryTimers = new Map();
const retryAttempts = new Map();

function contentOnly(input) {
  return Object.fromEntries(CONTENT_FIELDS.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
}
function canCloudSync(user) {
  return Boolean(isFirebaseConfigured && db && user?.uid && !isAnonymous(user));
}
function sameAuthenticatedUser(user) {
  return !auth || (auth.currentUser?.uid === user?.uid && !auth.currentUser?.isAnonymous);
}
function localStatus(user) { return canCloudSync(user) ? 'pending' : 'local-only'; }
function displayRecord(record) { return { ...record, date: formatRelativeDate(record.createdAt) }; }
function cloudRecord(record, revision, writeId) {
  return { ...contentOnly(record), title: record.title || 'Untitled Lecture', markdown: record.markdown || '', notes: record.notes ?? record.markdown ?? '', transcript: record.transcript || [], id: record.id, ownerUid: record.scope, createdAt: record.createdAt, updatedAt: record.updatedAt, revision, writeId, deleted: Boolean(record.deleted) };
}

export const formatRelativeDate = (timestamp) => {
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return 'Just now';
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days < 1) {
    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
    return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago` : 'Today';
  }
  if (days === 1) return 'Yesterday';
  return days < 7 ? `${days} days ago` : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
export const extractTitleFromMarkdown = (markdown, fallback = 'Untitled Lecture') => markdown?.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback;

async function seedSamples(user) {
  if (getOwnerScope(user) !== 'guest') return;
  await localTransaction(['lectures', 'settings'], 'readwrite', async (transaction) => {
    const settings = transaction.objectStore('settings');
    if (await requestResult(settings.get('guest-samples-v2'))) return;
    const store = transaction.objectStore('lectures');
    const existing = await requestResult(store.getAll());
    if (!existing.some((record) => record.scope === 'guest')) {
      for (const sample of INITIAL_SAMPLE_MINDMAPS) store.put({ ...sample, scope: 'guest', ownerUid: null, revision: 0, baseRevision: 0, syncStatus: 'local-only', deleted: false, anonymousOwner: true });
    }
    settings.put({ id: 'guest-samples-v2', initializedAt: Date.now() });
  });
}

async function registerLocalScope(user) {
  if (!user?.uid || isAnonymous(user) || !sameAuthenticatedUser(user)) return;
  const scope = getOwnerScope(user);
  const changed = await localTransaction(['lectures', 'outbox'], 'readwrite', async (transaction) => {
    const store = transaction.objectStore('lectures');
    const records = await requestResult(store.getAll());
    let updated = false;
    for (const record of records) {
      if (record.scope !== scope || !record.anonymousOwner) continue;
      const next = { ...record, anonymousOwner: false, ownerUid: user.uid };
      store.put(next);
      const pending = await requestResult(transaction.objectStore('outbox').get([scope, record.id]));
      if (pending) transaction.objectStore('outbox').put({ ...pending, record: next });
      updated = true;
    }
    return updated;
  });
  if (changed) notifyLocalChange(scope);
}

export async function saveMindmap(title, markdown, duration = 'Lecture', extraMeta = {}, user = null) {
  const scope = getOwnerScope(user);
  const now = new Date().toISOString();
  const id = createLectureId();
  const record = { ...contentOnly(extraMeta), id, scope, ownerUid: user?.uid || null, anonymousOwner: isAnonymous(user),
    title: title || extractTitleFromMarkdown(markdown), markdown: markdown || '', notes: extraMeta.notes ?? markdown ?? '', duration,
    transcript: extraMeta.transcript || [], createdAt: now, updatedAt: now, revision: 1, baseRevision: 0, deleted: false, syncStatus: localStatus(user) };
  await localTransaction(['lectures', 'outbox'], 'readwrite', (transaction) => {
    transaction.objectStore('lectures').put(record);
    transaction.objectStore('outbox').put({ scope, id, record, baseRevision: 0, mutationId: createLectureId() });
  });
  notifyLocalChange(scope);
  void flushPendingSync(user);
  return displayRecord(record);
}

export async function updateMindmap(id, updates = {}, user = null) {
  const scope = getOwnerScope(user);
  const record = await localTransaction(['lectures', 'outbox'], 'readwrite', async (transaction) => {
    const store = transaction.objectStore('lectures');
    const current = await requestResult(store.get([scope, id]));
    if (!current || current.deleted) throw new Error('This lecture is unavailable in the selected account.');
    const patch = contentOnly(updates);
    if (patch.title && patch.markdown === undefined) patch.markdown = current.markdown?.replace(/^#\s+(.+)$/m, `# ${patch.title}`) || '';
    const next = { ...current, ...patch, revision: current.revision + 1, updatedAt: new Date().toISOString(), syncStatus: current.conflict ? 'conflict' : localStatus(user) };
    store.put(next);
    transaction.objectStore('outbox').put({ scope, id, record: next, baseRevision: current.baseRevision, mutationId: createLectureId(), blocked: Boolean(current.conflict) });
    return next;
  });
  notifyLocalChange(scope);
  void flushPendingSync(user);
  return displayRecord(record);
}

export async function deleteMindmap(id, user = null) {
  const scope = getOwnerScope(user);
  await localTransaction(['lectures', 'outbox', 'media'], 'readwrite', async (transaction) => {
    const store = transaction.objectStore('lectures');
    const current = await requestResult(store.get([scope, id]));
    if (!current) throw new Error('This lecture is unavailable in the selected account.');
    const next = { ...current, deleted: true, revision: current.revision + 1, updatedAt: new Date().toISOString(), syncStatus: localStatus(user) };
    delete next.conflict;
    store.put(next);
    transaction.objectStore('media').delete([scope, id]);
    transaction.objectStore('outbox').put({ scope, id, record: next, baseRevision: current.baseRevision, mutationId: createLectureId() });
  });
  notifyLocalChange(scope);
  void flushPendingSync(user);
  return { id, localSaved: true, syncStatus: localStatus(user) };
}

async function syncEntry(entry, user) {
  const reference = doc(db, 'mindmaps', entry.id);
  let remoteCandidate;
  let accepted;
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    const remote = snapshot.exists() ? snapshot.data() : null;
    if (remote && remote.ownerUid !== entry.scope) throw new Error('Cloud ownership does not match this account.');
    if (remote?.writeId === entry.mutationId) { accepted = remote; return; }
    if ((remote && remote.revision !== entry.baseRevision) || (!remote && entry.baseRevision > 0)) {
      remoteCandidate = remote || { deleted: true, missing: true, revision: entry.baseRevision + 1, ownerUid: entry.scope, id: entry.id };
      return;
    }
    // Local edits may advance several times offline; the cloud revision advances once per committed write.
    const revision = (remote?.revision || 0) + 1;
    accepted = cloudRecord(entry.record, revision, entry.mutationId);
    transaction.set(reference, accepted);
  });
  if (remoteCandidate) {
    await localTransaction(['lectures', 'outbox'], 'readwrite', async (transaction) => {
      const store = transaction.objectStore('lectures');
      const current = await requestResult(store.get([entry.scope, entry.id]));
      const pending = await requestResult(transaction.objectStore('outbox').get([entry.scope, entry.id]));
      if (!current || !pending) return;
      store.put({ ...current, syncStatus: 'conflict', conflict: { remote: remoteCandidate } });
      transaction.objectStore('outbox').put({ ...pending, blocked: true });
    });
    notifyLocalChange(entry.scope);
    return;
  }
  if (entry.record.deleted) await deleteMediaFromCloud(entry.id, null, user);
  await localTransaction(['lectures', 'outbox'], 'readwrite', async (transaction) => {
    const store = transaction.objectStore('lectures');
    const current = await requestResult(store.get([entry.scope, entry.id]));
    const pending = await requestResult(transaction.objectStore('outbox').get([entry.scope, entry.id]));
    if (!current || !pending) return;
    if (pending.mutationId === entry.mutationId) {
      store.put({ ...current, revision: accepted.revision, baseRevision: accepted.revision, writeId: accepted.writeId, syncStatus: 'synced', anonymousOwner: false, syncError: null });
      transaction.objectStore('outbox').delete([entry.scope, entry.id]);
    } else {
      const next = { ...current, revision: Math.max(current.revision, accepted.revision + 1), baseRevision: accepted.revision };
      store.put(next);
      transaction.objectStore('outbox').put({ ...pending, baseRevision: accepted.revision, record: next });
    }
  });
  notifyLocalChange(entry.scope);
}

function scheduleRetry(user) {
  const scope = getOwnerScope(user);
  if (retryTimers.has(scope)) return;
  const attempts = Math.min((retryAttempts.get(scope) || 0) + 1, 6);
  retryAttempts.set(scope, attempts);
  const timer = setTimeout(() => { retryTimers.delete(scope); void flushPendingSync(user); }, Math.min(60000, 1000 * 2 ** attempts));
  timer.unref?.();
  retryTimers.set(scope, timer);
}

export function flushPendingSync(user = null) {
  if (!canCloudSync(user) || !sameAuthenticatedUser(user) || globalThis.navigator?.onLine === false) return Promise.resolve();
  const scope = getOwnerScope(user);
  if (syncRuns.has(scope)) return syncRuns.get(scope);
  const run = (async () => {
    let encounteredFailure = false;
    for (;;) {
      const pending = (await readLocalScope('outbox', scope)).filter((entry) => !entry.blocked);
      if (!pending.length || !sameAuthenticatedUser(user)) break;
      let failed = false;
      for (const entry of pending) {
        if (!sameAuthenticatedUser(user)) return;
        try { await syncEntry(entry, user); }
        catch (error) {
          failed = true;
          encounteredFailure = true;
          await localTransaction(['lectures'], 'readwrite', async (transaction) => {
            const store = transaction.objectStore('lectures');
            const current = await requestResult(store.get([scope, entry.id]));
            if (current) store.put({ ...current, syncStatus: 'error', syncError: error.message });
          });
          notifyLocalChange(scope);
          if (!['permission-denied', 'unauthenticated', 'invalid-argument'].includes(error.code)) scheduleRetry(user);
          break;
        }
      }
      if (failed) break;
    }
    if (!encounteredFailure) retryAttempts.delete(scope);
  })().catch((error) => { console.warn('Local sync queue is unavailable:', error.message); }).finally(() => syncRuns.delete(scope));
  syncRuns.set(scope, run);
  return run;
}

async function mergeCloudRecords(records, user) {
  const scope = getOwnerScope(user);
  await localTransaction(['lectures', 'outbox'], 'readwrite', async (transaction) => {
    const store = transaction.objectStore('lectures');
    const outbox = transaction.objectStore('outbox');
    for (const remote of records) {
      if (remote.ownerUid !== scope || !remote.id || !Number.isInteger(remote.revision)) continue;
      const current = await requestResult(store.get([scope, remote.id]));
      const pending = await requestResult(outbox.get([scope, remote.id]));
      if (pending) {
        if (remote.writeId !== pending.mutationId && remote.revision > pending.baseRevision && !syncRuns.has(scope)) {
          store.put({ ...current, syncStatus: 'conflict', conflict: { remote } });
          outbox.put({ ...pending, blocked: true });
        }
        continue;
      }
      if (!current || remote.revision >= current.baseRevision) store.put({ ...remote, scope, baseRevision: remote.revision, syncStatus: 'synced', anonymousOwner: false });
    }
  });
  notifyLocalChange(scope);
}

export async function getRecentMindmaps(count = 30, user = null) {
  await seedSamples(user);
  await registerLocalScope(user);
  const list = await readLocalScope('lectures', getOwnerScope(user));
  return list.filter((record) => !record.deleted).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, count).map(displayRecord);
}

export async function getMindmapById(id, user = null) {
  const local = await readLocalRecord('lectures', getOwnerScope(user), id);
  if (local) return local.deleted ? null : displayRecord(local);
  if (!canCloudSync(user) || !sameAuthenticatedUser(user)) return null;
  const snapshot = await getDoc(doc(db, 'mindmaps', id));
  if (!snapshot.exists() || snapshot.data().ownerUid !== user.uid) return null;
  if (!Number.isInteger(snapshot.data().revision)) throw new Error('This cloud record requires an administrator migration.');
  await mergeCloudRecords([{ ...snapshot.data(), id: snapshot.id }], user);
  return getMindmapById(id, user);
}

export function subscribeToRecentMindmaps(callback, count = 30, user = null) {
  const scope = getOwnerScope(user);
  let active = true;
  let updateVersion = 0;
  const emit = async () => {
    const version = ++updateVersion;
    try {
      const records = await getRecentMindmaps(count, user);
      if (active && version === updateVersion) callback(records);
    } catch (error) { if (active) callback([], { error: error.message }); }
  };
  const changed = (event) => { if (!event.detail?.scope || event.detail.scope === scope) void emit(); };
  const reportError = async (error, cloudOnly = false) => {
    try {
      const records = await getRecentMindmaps(count, user);
      if (active) callback(records, { error: error.message, cloudOnly });
    } catch (localError) { if (active) callback([], { error: localError.message }); }
  };
  let unsubscribeCloud = () => {};
  const startCloudSubscription = () => {
    unsubscribeCloud();
    if (!active || !canCloudSync(user) || !sameAuthenticatedUser(user)) return;
    const reference = query(collection(db, 'mindmaps'), where('ownerUid', '==', user.uid), orderBy('createdAt', 'desc'), limit(count));
    unsubscribeCloud = onSnapshot(reference, { includeMetadataChanges: true }, (snapshot) => {
      if (!active || snapshot.metadata.hasPendingWrites || !sameAuthenticatedUser(user)) return;
      void mergeCloudRecords(snapshot.docs.map((item) => ({ ...item.data(), id: item.id })), user).catch((error) => { void reportError(error); });
    }, (error) => { void reportError(error, true); });
  };
  const online = () => { startCloudSubscription(); void flushPendingSync(user); };
  globalThis.window?.addEventListener('lecturemind_storage_update', changed);
  globalThis.window?.addEventListener('online', online);
  void emit();
  startCloudSubscription();
  void flushPendingSync(user);
  return () => { active = false; ++updateVersion; unsubscribeCloud(); globalThis.window?.removeEventListener('lecturemind_storage_update', changed); globalThis.window?.removeEventListener('online', online); };
}

export async function resolveMindmapConflict(id, choice, user = null) {
  if (!['local', 'remote', 'copy'].includes(choice)) throw new Error('Choose local, remote, or copy.');
  const scope = getOwnerScope(user);
  let copy;
  const result = await localTransaction(['lectures', 'outbox', 'media'], 'readwrite', async (transaction) => {
    const store = transaction.objectStore('lectures');
    const current = await requestResult(store.get([scope, id]));
    if (!current?.conflict) return current;
    const remote = current.conflict.remote;
    if (choice === 'copy') {
      copy = { ...current, id: createLectureId(), title: `${current.title} (local copy)`, revision: 1, baseRevision: 0, syncStatus: localStatus(user), createdAt: new Date().toISOString() };
      delete copy.conflict;
      store.put(copy);
      transaction.objectStore('outbox').put({ scope, id: copy.id, record: copy, baseRevision: 0, mutationId: createLectureId() });
      const media = await requestResult(transaction.objectStore('media').get([scope, id]));
      if (media) transaction.objectStore('media').put({ ...media, id: copy.id });
    }
    const next = choice === 'local' ? { ...current, revision: Math.max(current.revision, remote.revision + 1), baseRevision: remote.missing ? 0 : remote.revision, syncStatus: localStatus(user) } : { ...remote, scope, baseRevision: remote.revision, syncStatus: 'synced' };
    delete next.conflict;
    store.put(next);
    if (choice === 'local') transaction.objectStore('outbox').put({ scope, id, record: next, baseRevision: next.baseRevision, mutationId: createLectureId() });
    else transaction.objectStore('outbox').delete([scope, id]);
    return next;
  });
  notifyLocalChange(scope);
  void flushPendingSync(user);
  return copy || result;
}

export async function listLegacyMindmaps(user = null) {
  await registerLocalScope(user);
  let legacy = [];
  try {
    const raw = globalThis.localStorage?.getItem('lecturemind_saved_mindmaps');
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) legacy = parsed.filter((item) => item?.id).map((item) => ({ ...item, legacyId: item.id, id: `legacy:${item.id}`, legacySource: 'legacy', ownership: 'unverified' }));
  } catch (error) { throw new Error(`Legacy browser records could not be read: ${error.message}`); }
  const locals = await localTransaction(['lectures'], 'readonly', (transaction) => requestResult(transaction.objectStore('lectures').getAll()));
  const scope = getOwnerScope(user);
  for (const item of locals) {
    if (item.scope !== scope && (item.scope === 'guest' || item.anonymousOwner) && !item.deleted && !item.id.startsWith('sample-')) legacy.push({ ...item, legacyId: item.id, id: `local:${item.scope}:${item.id}`, legacySource: item.scope, ownership: 'guest' });
  }
  return legacy;
}

export async function importLegacyMindmap(id, user = null) {
  const source = (await listLegacyMindmaps(user)).find((item) => item.id === id);
  if (!source) throw new Error('That legacy record is unavailable.');
  const scope = getOwnerScope(user);
  const imported = await localTransaction(['lectures', 'outbox', 'imports', 'media', 'media_files'], 'readwrite', async (transaction) => {
    const imports = transaction.objectStore('imports');
    const prior = await requestResult(imports.get([scope, id]));
    if (prior) {
      const existing = await requestResult(transaction.objectStore('lectures').get([scope, prior.lectureId]));
      if (existing) return existing;
    }
    const newId = createLectureId();
    const now = new Date().toISOString();
    const record = { ...contentOnly(source), id: newId, scope, ownerUid: user?.uid || null, anonymousOwner: isAnonymous(user), createdAt: now, updatedAt: now, revision: 1, baseRevision: 0, deleted: false, syncStatus: localStatus(user) };
    // Never reuse an ownerless cloud URL or upload ID as a claimed media association.
    record.audioUrl = null;
    delete record.playbackUploadId;
    const media = source.legacySource === 'legacy'
      ? await requestResult(transaction.objectStore('media_files').get(String(source.legacyId)))
      : await requestResult(transaction.objectStore('media').get([source.legacySource, source.legacyId]));
    if (media?.blob) transaction.objectStore('media').put({ ...media, id: newId, scope });
    else record.mediaStatus = 'unavailable';
    transaction.objectStore('lectures').put(record);
    transaction.objectStore('outbox').put({ scope, id: newId, record, baseRevision: 0, mutationId: createLectureId() });
    imports.put({ scope, id, lectureId: newId, importedAt: now });
    return record;
  });
  notifyLocalChange(scope);
  void flushPendingSync(user);
  return displayRecord(imported);
}
