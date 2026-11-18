import { withSupabase } from 'npm:@supabase/server@1.6.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.95.0';

const CONSENT_BUCKET = 'study-consents';
const PAGE_SIZE = 1000;
const ALLOWED_ORIGINS = new Set([
  'https://chuyuehuang118-debug.github.io',
  'https://av-main-study-questionnaire.chuyuehuang118.chatgpt.site',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'http://localhost:5173',
]);

type JsonRecord = Record<string, unknown>;

type StudySubmissionRow = JsonRecord & {
  id: string;
  participant_code: string;
  city: 'HK' | 'NB';
  consent: boolean;
  status: 'consent_only' | 'in_progress' | 'completed';
  current_step: number;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
  total_duration_ms: number;
  user_agent: string | null;
};

type StudyResponseRow = JsonRecord & {
  submission_id: string;
  question_id: string;
  section_id: string;
  scenario_code: string | null;
  automation_level: string | null;
  answer_json: unknown;
  unclear: boolean;
  time_spent_ms: number;
  first_interaction_ms: number | null;
  answer_changes: number;
  voice_used: boolean;
  blur_count: number;
  hesitation_flag: boolean;
  created_at: string;
  updated_at: string;
};

type ConsentRow = JsonRecord & {
  submission_id: string;
  language: 'zh' | 'en';
  signed_at: string;
  file_name: string;
  object_path: string;
};

type IncomingResponse = {
  questionId?: unknown;
  sectionId?: unknown;
  scenarioCode?: unknown;
  automationLevel?: unknown;
  answer?: unknown;
  unclear?: unknown;
  timeSpentMs?: unknown;
  firstInteractionMs?: unknown;
  answerChanges?: unknown;
  voiceUsed?: unknown;
  blurCount?: unknown;
  hesitationFlag?: unknown;
};

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin');
  const headers = new Headers({
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
  return headers;
}

function addCors(response: Response, request: Request) {
  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders(request)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(body: JsonRecord, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function shortText(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function nonNegativeInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(maximum, Math.max(0, Math.round(number)));
}

function validIsoDate(value: unknown, fallback: string) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return fallback;
  }
  return new Date(value).toISOString();
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160) || 'consent.pdf';
}

async function digest(value: string) {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
}

async function authorised(request: Request) {
  const expected = Deno.env.get('RESEARCHER_PASSCODE') || '';
  const supplied =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!expected || !supplied) return false;
  const [expectedHash, suppliedHash] = await Promise.all([
    digest(expected),
    digest(supplied),
  ]);
  let difference = 0;
  for (let index = 0; index < expectedHash.length; index += 1) {
    difference |= expectedHash[index] ^ suppliedHash[index];
  }
  return difference === 0;
}

function hesitationReasons(row: {
  unclear: boolean;
  first_interaction_ms: number | null;
  answer_changes: number;
}) {
  const reasons: string[] = [];
  if (row.unclear) reasons.push('unclear');
  if ((row.first_interaction_ms || 0) >= 30_000) {
    reasons.push('first_action_30s_plus');
  }
  if (row.answer_changes >= 2) reasons.push('answer_changed_2_plus');
  return reasons;
}

function csvCell(value: unknown) {
  let text = '';
  if (value == null) text = '';
  else if (typeof value === 'string') text = value;
  else if (typeof value === 'number' || typeof value === 'boolean') {
    text = String(value);
  } else text = JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

async function selectAll<T extends JsonRecord>(
  admin: SupabaseClient,
  table: string,
  orderColumn: string,
  ascending: boolean,
) {
  const records: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from(table)
      .select('*')
      .order(orderColumn, { ascending })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    records.push(...((data || []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return records;
}

async function saveSubmission(request: Request, admin: SupabaseClient) {
  let body: JsonRecord;
  try {
    body = (await request.json()) as JsonRecord;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const id = body.id;
  const participantCode = shortText(body.participantCode, 30).toUpperCase();
  const city = body.city;
  if (
    !isUuid(id) ||
    !participantCode ||
    (city !== 'HK' && city !== 'NB') ||
    body.consent !== true
  ) {
    return json({ error: 'Invalid submission' }, 400);
  }

  const now = new Date().toISOString();
  const status = body.status === 'completed' ? 'completed' : 'in_progress';
  const completedAt =
    status === 'completed' ? validIsoDate(body.completedAt, now) : null;
  const { error: submissionError } = await admin
    .from('study_submissions')
    .upsert(
      {
        id,
        participant_code: participantCode,
        city,
        consent: true,
        status,
        current_step: nonNegativeInteger(body.currentStep, 100),
        started_at: validIsoDate(body.startedAt, now),
        completed_at: completedAt,
        updated_at: now,
        total_duration_ms: nonNegativeInteger(body.totalDurationMs),
        user_agent: shortText(request.headers.get('user-agent'), 500) || null,
      },
      { onConflict: 'id' },
    );
  if (submissionError) throw submissionError;

  const incomingRows = Array.isArray(body.responses)
    ? (body.responses as IncomingResponse[]).slice(0, 150)
    : [];
  const rows = incomingRows
    .map((row) => {
      const questionId = shortText(row.questionId, 100);
      const sectionId = shortText(row.sectionId, 100);
      if (!questionId || !sectionId) return null;
      return {
        submission_id: id,
        question_id: questionId,
        section_id: sectionId,
        scenario_code: shortText(row.scenarioCode, 50) || null,
        automation_level: shortText(row.automationLevel, 20) || null,
        answer_json: row.answer ?? '',
        unclear: Boolean(row.unclear),
        time_spent_ms: nonNegativeInteger(row.timeSpentMs),
        first_interaction_ms:
          row.firstInteractionMs == null
            ? null
            : nonNegativeInteger(row.firstInteractionMs),
        answer_changes: nonNegativeInteger(row.answerChanges, 1000),
        voice_used: Boolean(row.voiceUsed),
        blur_count: nonNegativeInteger(row.blurCount, 1000),
        hesitation_flag: Boolean(row.hesitationFlag),
        updated_at: now,
      };
    })
    .filter(Boolean);

  if (rows.length) {
    const { error: responseError } = await admin
      .from('study_responses')
      .upsert(rows, { onConflict: 'submission_id,question_id' });
    if (responseError) throw responseError;
  }
  return json({ ok: true, savedAt: now, submissionId: id });
}

async function saveConsent(request: Request, admin: SupabaseClient) {
  const form = await request.formData();
  const file = form.get('file');
  const submissionId = form.get('submissionId');
  const participantCode = shortText(
    form.get('participantCode'),
    30,
  ).toUpperCase();
  const city = form.get('city');
  const language = form.get('language');
  const signedAtInput = form.get('signedAt');
  if (
    !(file instanceof File) ||
    !isUuid(submissionId) ||
    !participantCode ||
    (city !== 'HK' && city !== 'NB') ||
    (language !== 'zh' && language !== 'en')
  ) {
    return json({ error: 'Invalid consent submission' }, 400);
  }
  if (
    file.type !== 'application/pdf' ||
    file.size < 1000 ||
    file.size > 3_000_000
  ) {
    return json({ error: 'Invalid PDF file' }, 400);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
    return json({ error: 'Invalid PDF data' }, 400);
  }

  const now = new Date().toISOString();
  const signedAt = validIsoDate(signedAtInput, now);
  const fileName = safeFileName(
    `${participantCode}-consent-${language}-${signedAt.slice(0, 10)}.pdf`,
  );
  const objectPath = `${submissionId}/${crypto.randomUUID()}.pdf`;
  const { data: previousConsent, error: previousError } = await admin
    .from('study_consent_records')
    .select('object_path')
    .eq('submission_id', submissionId)
    .maybeSingle();
  if (previousError) throw previousError;

  const { error: uploadError } = await admin.storage
    .from(CONSENT_BUCKET)
    .upload(objectPath, bytes, {
      contentType: 'application/pdf',
      cacheControl: '0',
      upsert: false,
    });
  if (uploadError) throw uploadError;

  try {
    const { data: existing, error: existingError } = await admin
      .from('study_submissions')
      .select('id')
      .eq('id', submissionId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      const { error } = await admin
        .from('study_submissions')
        .update({
          participant_code: participantCode,
          city,
          consent: true,
          updated_at: now,
        })
        .eq('id', submissionId);
      if (error) throw error;
    } else {
      const { error } = await admin.from('study_submissions').insert({
        id: submissionId,
        participant_code: participantCode,
        city,
        consent: true,
        status: 'consent_only',
        current_step: 0,
        started_at: signedAt,
        updated_at: now,
        total_duration_ms: 0,
        user_agent: shortText(request.headers.get('user-agent'), 500) || null,
      });
      if (error) throw error;
    }

    const { error: recordError } = await admin
      .from('study_consent_records')
      .upsert(
        {
          submission_id: submissionId,
          participant_code: participantCode,
          city,
          language,
          object_path: objectPath,
          file_name: fileName,
          signed_at: signedAt,
          created_at: now,
        },
        { onConflict: 'submission_id' },
      );
    if (recordError) throw recordError;
  } catch (error) {
    await admin.storage.from(CONSENT_BUCKET).remove([objectPath]);
    throw error;
  }

  if (
    previousConsent?.object_path &&
    previousConsent.object_path !== objectPath
  ) {
    await admin.storage
      .from(CONSENT_BUCKET)
      .remove([previousConsent.object_path]);
  }
  return json({ ok: true, signedAt, fileName, submissionId });
}

function mapSubmission(row: StudySubmissionRow) {
  return {
    id: row.id,
    participantCode: row.participant_code,
    city: row.city,
    consent: row.consent,
    status: row.status,
    currentStep: row.current_step,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
    totalDurationMs: Number(row.total_duration_ms || 0),
    userAgent: row.user_agent,
  };
}

function mapResponse(row: StudyResponseRow) {
  return {
    submissionId: row.submission_id,
    questionId: row.question_id,
    sectionId: row.section_id,
    scenarioCode: row.scenario_code,
    automationLevel: row.automation_level,
    answerJson: JSON.stringify(row.answer_json ?? ''),
    unclear: row.unclear,
    timeSpentMs: Number(row.time_spent_ms || 0),
    firstInteractionMs:
      row.first_interaction_ms == null
        ? null
        : Number(row.first_interaction_ms),
    answerChanges: Number(row.answer_changes || 0),
    voiceUsed: row.voice_used,
    blurCount: Number(row.blur_count || 0),
    hesitationFlag: row.hesitation_flag,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapConsent(row: ConsentRow) {
  return {
    submissionId: row.submission_id,
    language: row.language,
    signedAt: row.signed_at,
    fileName: row.file_name,
  };
}

async function readResearch(request: Request, admin: SupabaseClient) {
  if (!(await authorised(request))) return json({ error: 'Unauthorised' }, 401);
  const url = new URL(request.url);
  const detailId = url.searchParams.get('id');
  const format = url.searchParams.get('format');

  if (detailId) {
    if (!isUuid(detailId)) return json({ error: 'Invalid ID' }, 400);
    const [submissionResult, responsesResult, consentResult] =
      await Promise.all([
        admin
          .from('study_submissions')
          .select('*')
          .eq('id', detailId)
          .maybeSingle(),
        admin
          .from('study_responses')
          .select('*')
          .eq('submission_id', detailId)
          .order('section_id')
          .order('question_id'),
        admin
          .from('study_consent_records')
          .select('submission_id, language, signed_at, file_name')
          .eq('submission_id', detailId)
          .maybeSingle(),
      ]);
    if (submissionResult.error) throw submissionResult.error;
    if (responsesResult.error) throw responsesResult.error;
    if (consentResult.error) throw consentResult.error;
    return json({
      submission: submissionResult.data
        ? mapSubmission(submissionResult.data as StudySubmissionRow)
        : null,
      responses: ((responsesResult.data || []) as StudyResponseRow[]).map(
        (row) => {
          const mapped = mapResponse(row);
          return {
            ...mapped,
            hesitationReasons: hesitationReasons(row),
          };
        },
      ),
      consent: consentResult.data
        ? mapConsent(consentResult.data as ConsentRow)
        : null,
    });
  }

  const [submissionRows, responseRows, consentRows] = await Promise.all([
    selectAll<StudySubmissionRow>(
      admin,
      'study_submissions',
      'updated_at',
      false,
    ),
    selectAll<StudyResponseRow>(admin, 'study_responses', 'question_id', true),
    selectAll<ConsentRow>(admin, 'study_consent_records', 'signed_at', false),
  ]);
  const submissionMap = new Map(submissionRows.map((row) => [row.id, row]));
  const consentMap = new Map(
    consentRows.map((row) => [row.submission_id, row]),
  );

  if (format === 'csv') {
    const header = [
      'participant_code',
      'city',
      'status',
      'consent_signed',
      'consent_language',
      'consent_signed_at',
      'started_at',
      'completed_at',
      'total_duration_seconds',
      'question_id',
      'section_id',
      'scenario',
      'automation_level',
      'answer',
      'unclear',
      'time_spent_seconds',
      'first_interaction_seconds',
      'answer_changes',
      'voice_used',
      'blur_count',
      'hesitation_flag',
      'hesitation_reasons',
    ];
    const lines = responseRows.map((row) => {
      const submission = submissionMap.get(row.submission_id);
      const consent = consentMap.get(row.submission_id);
      return [
        submission?.participant_code,
        submission?.city,
        submission?.status,
        Boolean(consent),
        consent?.language,
        consent?.signed_at,
        submission?.started_at,
        submission?.completed_at,
        (Number(submission?.total_duration_ms || 0) / 1000).toFixed(1),
        row.question_id,
        row.section_id,
        row.scenario_code,
        row.automation_level,
        row.answer_json,
        row.unclear,
        (Number(row.time_spent_ms || 0) / 1000).toFixed(1),
        row.first_interaction_ms == null
          ? ''
          : (Number(row.first_interaction_ms) / 1000).toFixed(1),
        row.answer_changes,
        row.voice_used,
        row.blur_count,
        row.hesitation_flag,
        hesitationReasons(row).join('; '),
      ]
        .map(csvCell)
        .join(',');
    });
    return new Response(
      `\ufeff${[header.map(csvCell).join(','), ...lines].join('\n')}`,
      {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Disposition':
            'attachment; filename="av-main-study-data.csv"',
          'Content-Type': 'text/csv; charset=utf-8',
        },
      },
    );
  }

  const metrics = new Map<
    string,
    {
      count: number;
      unclear: number;
      hesitant: number;
      voice: number;
      totalTime: number;
    }
  >();
  for (const row of responseRows) {
    const metric = metrics.get(row.submission_id) || {
      count: 0,
      unclear: 0,
      hesitant: 0,
      voice: 0,
      totalTime: 0,
    };
    metric.count += 1;
    metric.unclear += row.unclear ? 1 : 0;
    metric.hesitant += row.hesitation_flag ? 1 : 0;
    metric.voice += row.voice_used ? 1 : 0;
    metric.totalTime += Number(row.time_spent_ms || 0);
    metrics.set(row.submission_id, metric);
  }
  return json({
    submissions: submissionRows.map((row) => {
      const consentRecord = consentMap.get(row.id);
      return {
        ...mapSubmission(row),
        consentRecord: consentRecord ? mapConsent(consentRecord) : null,
        metrics: metrics.get(row.id) || {
          count: 0,
          unclear: 0,
          hesitant: 0,
          voice: 0,
          totalTime: 0,
        },
      };
    }),
    summary: {
      total: submissionRows.length,
      completed: submissionRows.filter((row) => row.status === 'completed')
        .length,
      hongKong: submissionRows.filter((row) => row.city === 'HK').length,
      ningbo: submissionRows.filter((row) => row.city === 'NB').length,
      unclearAnswers: responseRows.filter((row) => row.unclear).length,
      hesitationFlags: responseRows.filter((row) => row.hesitation_flag).length,
      signedConsents: consentRows.length,
    },
  });
}

async function downloadConsent(request: Request, admin: SupabaseClient) {
  if (!(await authorised(request))) return json({ error: 'Unauthorised' }, 401);
  const submissionId = new URL(request.url).searchParams.get('submissionId');
  if (!isUuid(submissionId))
    return json({ error: 'Invalid submission ID' }, 400);
  const { data: record, error: recordError } = await admin
    .from('study_consent_records')
    .select('object_path, file_name')
    .eq('submission_id', submissionId)
    .maybeSingle();
  if (recordError) throw recordError;
  if (!record) return json({ error: 'Consent file not found' }, 404);
  const { data: file, error: downloadError } = await admin.storage
    .from(CONSENT_BUCKET)
    .download(record.object_path);
  if (downloadError || !file)
    return json({ error: 'Consent file not found' }, 404);
  return new Response(file, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${safeFileName(record.file_name)}"`,
      'Content-Type': 'application/pdf',
    },
  });
}

const application = withSupabase(
  { auth: 'none', cors: 'disabled' },
  async (request, context) => {
    try {
      const path = new URL(request.url).pathname;
      if (request.method === 'POST' && path.endsWith('/api/submissions')) {
        return await saveSubmission(request, context.supabaseAdmin);
      }
      if (request.method === 'POST' && path.endsWith('/api/consent')) {
        return await saveConsent(request, context.supabaseAdmin);
      }
      if (request.method === 'GET' && path.endsWith('/api/research')) {
        return await readResearch(request, context.supabaseAdmin);
      }
      if (request.method === 'GET' && path.endsWith('/api/consent')) {
        return await downloadConsent(request, context.supabaseAdmin);
      }
      if (request.method === 'GET' && path.endsWith('/health')) {
        return json({ ok: true, time: new Date().toISOString() });
      }
      return json({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('study-api request failed', error);
      return json({ error: 'Unable to process request' }, 500);
    }
  },
);

const studyApi = {
  async fetch(request: Request) {
    const origin = request.headers.get('origin');
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return addCors(json({ error: 'Origin not allowed' }, 403), request);
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    return addCors(await application(request), request);
  },
};

export default studyApi;
