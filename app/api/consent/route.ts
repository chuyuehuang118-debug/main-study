import { env } from 'cloudflare:workers';
import { NextRequest, NextResponse } from 'next/server';
import { questionnaireCorsPreflight, withQuestionnaireCors } from '@/lib/cors';

export const runtime = 'edge';

function authorised(request: NextRequest) {
  const expected = process.env.RESEARCHER_PASSCODE;
  const supplied = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '');
  return Boolean(expected && supplied && supplied === expected);
}

function safeFileName(value: string) {
  return (
    value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'signed-consent.pdf'
  );
}

function formText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

async function handlePost(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const submissionId = formText(form, 'submissionId');
    const participantCode = formText(form, 'participantCode')
      .trim()
      .toUpperCase()
      .slice(0, 30);
    const city = formText(form, 'city');
    const language = formText(form, 'language');
    const signedAt = formText(form, 'signedAt');

    if (
      !(file instanceof File) ||
      !submissionId ||
      !participantCode ||
      !['HK', 'NB'].includes(city) ||
      !['zh', 'en'].includes(language)
    ) {
      return NextResponse.json(
        { error: 'Invalid consent submission' },
        { status: 400 },
      );
    }
    if (
      file.type !== 'application/pdf' ||
      file.size < 1000 ||
      file.size > 3_000_000
    ) {
      return NextResponse.json({ error: 'Invalid PDF file' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    if (header !== '%PDF-')
      return NextResponse.json({ error: 'Invalid PDF data' }, { status: 400 });

    const now = new Date().toISOString();
    const validSignedAt = Number.isNaN(Date.parse(signedAt))
      ? now
      : new Date(signedAt).toISOString();
    const recordId = crypto.randomUUID();
    const objectKey = `signed-consents/${recordId}.pdf`;
    const fileName = safeFileName(
      `${participantCode}-consent-${language}-${validSignedAt.slice(0, 10)}.pdf`,
    );
    const oldRecord = await env.DB.prepare(
      'SELECT object_key FROM consent_records WHERE submission_id = ? LIMIT 1',
    )
      .bind(submissionId)
      .first<{ object_key: string }>();

    await env.CONSENT_FILES.put(objectKey, bytes, {
      httpMetadata: {
        contentType: 'application/pdf',
        contentDisposition: `attachment; filename="${fileName}"`,
      },
      customMetadata: {
        participantCode,
        city,
        language,
        signedAt: validSignedAt,
      },
    });

    try {
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO submissions (id, participant_code, city, consent, status, current_step, started_at, completed_at, updated_at, total_duration_ms, user_agent)
          VALUES (?, ?, ?, 1, 'consent_only', 0, ?, NULL, ?, 0, ?)
          ON CONFLICT(id) DO UPDATE SET
            participant_code = excluded.participant_code,
            city = excluded.city,
            consent = 1,
            updated_at = excluded.updated_at
        `).bind(
          submissionId,
          participantCode,
          city,
          validSignedAt,
          now,
          request.headers.get('user-agent')?.slice(0, 500) || null,
        ),
        env.DB.prepare(`
          INSERT INTO consent_records (id, submission_id, participant_code, city, language, object_key, file_name, signed_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(submission_id) DO UPDATE SET
            id = excluded.id,
            participant_code = excluded.participant_code,
            city = excluded.city,
            language = excluded.language,
            object_key = excluded.object_key,
            file_name = excluded.file_name,
            signed_at = excluded.signed_at,
            created_at = excluded.created_at
        `).bind(
          recordId,
          submissionId,
          participantCode,
          city,
          language,
          objectKey,
          fileName,
          validSignedAt,
          now,
        ),
      ]);
    } catch (databaseError) {
      await env.CONSENT_FILES.delete(objectKey);
      throw databaseError;
    }

    if (oldRecord?.object_key && oldRecord.object_key !== objectKey) {
      await env.CONSENT_FILES.delete(oldRecord.object_key);
    }

    return NextResponse.json({ ok: true, signedAt: validSignedAt, fileName });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Unable to save signed consent' },
      { status: 500 },
    );
  }
}

async function handleGet(request: NextRequest) {
  if (!authorised(request))
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const submissionId = request.nextUrl.searchParams.get('submissionId');
  if (!submissionId)
    return NextResponse.json(
      { error: 'Missing submission ID' },
      { status: 400 },
    );

  const record = await env.DB.prepare(
    'SELECT object_key, file_name FROM consent_records WHERE submission_id = ? LIMIT 1',
  )
    .bind(submissionId)
    .first<{ object_key: string; file_name: string }>();
  if (!record)
    return NextResponse.json(
      { error: 'Consent file not found' },
      { status: 404 },
    );

  const object = await env.CONSENT_FILES.get(record.object_key);
  if (!object)
    return NextResponse.json(
      { error: 'Consent file not found' },
      { status: 404 },
    );

  return new NextResponse(object.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeFileName(record.file_name)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function POST(request: NextRequest) {
  return withQuestionnaireCors(request, await handlePost(request));
}

export async function GET(request: NextRequest) {
  return withQuestionnaireCors(request, await handleGet(request));
}

export function OPTIONS(request: NextRequest) {
  return questionnaireCorsPreflight(request);
}
