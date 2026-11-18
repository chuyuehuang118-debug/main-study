'use client';

import { apiUrl } from '@/lib/runtime-url';

type SubmissionPayload = Record<string, unknown> & { id: string };

type ConsentPayload = {
  submissionId: string;
  participantCode: string;
  city: string;
  language: 'zh' | 'en';
  signedAt: string;
  fileName: string;
  file: Blob;
};

type PendingSubmission = {
  id: string;
  kind: 'submission';
  createdAt: number;
  updatedAt: number;
  attempts: number;
  payload: SubmissionPayload;
};

type PendingConsent = {
  id: string;
  kind: 'consent';
  createdAt: number;
  updatedAt: number;
  attempts: number;
  payload: ConsentPayload;
};

type PendingRequest = PendingSubmission | PendingConsent;

export type StudyRecoveryDraft = {
  submissionId: string;
  participantCode: string;
  city: string;
  consent: boolean;
  consentPending: boolean;
  started: boolean;
  showConsent: boolean;
  stepIndex: number;
  answers: unknown;
  answerHistory: unknown;
  studyStartedAt: number;
  updatedAt: number;
};

export type ReliableSaveState =
  | 'stored_on_device'
  | 'uploading'
  | 'retrying'
  | 'confirmed';

type StatusCallback = (state: ReliableSaveState, attempt: number) => void;

const DATABASE_NAME = 'av-main-study-recovery';
const DATABASE_VERSION = 2;
const OUTBOX_STORE = 'outbox';
const DRAFT_STORE = 'draft';
const ACTIVE_DRAFT_KEY = 'active-study';
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 20_000;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
        database.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(DRAFT_STORE)) {
        database.createObjectStore(DRAFT_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writePending(request: PendingRequest) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(OUTBOX_STORE, 'readwrite');
    transaction.objectStore(OUTBOX_STORE).put(request);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function removePending(id: string) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(OUTBOX_STORE, 'readwrite');
    transaction.objectStore(OUTBOX_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function listPending() {
  const database = await openDatabase();
  const records = await new Promise<PendingRequest[]>((resolve, reject) => {
    const transaction = database.transaction(OUTBOX_STORE, 'readonly');
    const request = transaction.objectStore(OUTBOX_STORE).getAll();
    request.onsuccess = () => resolve(request.result as PendingRequest[]);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return records;
}

export async function saveStudyDraft(draft: StudyRecoveryDraft) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DRAFT_STORE, 'readwrite');
    transaction.objectStore(DRAFT_STORE).put({
      id: ACTIVE_DRAFT_KEY,
      ...draft,
      updatedAt: Date.now(),
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function loadStudyDraft() {
  const database = await openDatabase();
  const draft = await new Promise<(StudyRecoveryDraft & { id: string }) | null>(
    (resolve, reject) => {
      const transaction = database.transaction(DRAFT_STORE, 'readonly');
      const request = transaction
        .objectStore(DRAFT_STORE)
        .get(ACTIVE_DRAFT_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    },
  );
  database.close();
  if (!draft) return null;
  const { id: _id, ...value } = draft;
  return value;
}

export async function deleteStudyDraft() {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DRAFT_STORE, 'readwrite');
    transaction.objectStore(DRAFT_STORE).delete(ACTIVE_DRAFT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function parseReceipt(response: Response) {
  if (!response.ok) {
    const error = new Error(`Server returned ${response.status}`);
    Object.assign(error, {
      retryable:
        response.status >= 500 ||
        response.status === 408 ||
        response.status === 429,
    });
    throw error;
  }
  const receipt = (await response.json()) as {
    ok?: boolean;
    savedAt?: string;
    signedAt?: string;
    fileName?: string;
  };
  if (receipt.ok !== true || (!receipt.savedAt && !receipt.signedAt)) {
    throw new Error('The server did not return a valid save receipt');
  }
  return receipt;
}

function consentFormData(payload: ConsentPayload) {
  const form = new FormData();
  form.append('file', payload.file, payload.fileName);
  form.append('submissionId', payload.submissionId);
  form.append('participantCode', payload.participantCode);
  form.append('city', payload.city);
  form.append('language', payload.language);
  form.append('signedAt', payload.signedAt);
  return form;
}

async function sendPending(request: PendingRequest) {
  if (request.kind === 'submission') {
    return parseReceipt(
      await fetchWithTimeout(apiUrl('/api/submissions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request.payload),
      }),
    );
  }
  return parseReceipt(
    await fetchWithTimeout(apiUrl('/api/consent'), {
      method: 'POST',
      body: consentFormData(request.payload),
    }),
  );
}

async function storeAndSend(
  request: PendingRequest,
  onStatus?: StatusCallback,
) {
  await writePending(request);
  onStatus?.('stored_on_device', 0);

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    onStatus?.(attempt === 1 ? 'uploading' : 'retrying', attempt);
    const updated = { ...request, attempts: attempt, updatedAt: Date.now() };
    await writePending(updated);
    try {
      const receipt = await sendPending(updated);
      await removePending(updated.id);
      onStatus?.('confirmed', attempt);
      return receipt;
    } catch (error) {
      lastError = error;
      const retryable = (error as { retryable?: boolean })?.retryable !== false;
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      await wait(700 * 2 ** (attempt - 1));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Unable to confirm the save');
}

export async function saveSubmissionReliably(
  payload: SubmissionPayload,
  onStatus?: StatusCallback,
) {
  const now = Date.now();
  return storeAndSend(
    {
      id: `submission:${payload.id}`,
      kind: 'submission',
      createdAt: now,
      updatedAt: now,
      attempts: 0,
      payload,
    },
    onStatus,
  );
}

export async function saveConsentReliably(
  payload: ConsentPayload,
  onStatus?: StatusCallback,
) {
  const now = Date.now();
  return storeAndSend(
    {
      id: `consent:${payload.submissionId}`,
      kind: 'consent',
      createdAt: now,
      updatedAt: now,
      attempts: 0,
      payload,
    },
    onStatus,
  );
}

export async function retryPendingSaves(onStatus?: StatusCallback) {
  if (!navigator.onLine)
    return { confirmed: 0, confirmedIds: [] as string[], remaining: 0 };
  const pending = await listPending();
  let confirmed = 0;
  const confirmedIds: string[] = [];
  for (const request of pending) {
    try {
      await storeAndSend(request, onStatus);
      confirmed += 1;
      confirmedIds.push(request.id);
    } catch {
      // Keep the request in IndexedDB for the next online/reload retry.
    }
  }
  return {
    confirmed,
    confirmedIds,
    remaining: (await listPending()).length,
  };
}
