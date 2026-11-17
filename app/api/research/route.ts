import { NextRequest, NextResponse } from 'next/server';
import { asc, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { consentRecords, responses, submissions } from '@/db/schema';

export const runtime = 'edge';

function authorised(request: NextRequest) {
  const expected = process.env.RESEARCHER_PASSCODE;
  const supplied = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '');
  return Boolean(expected && supplied && supplied === expected);
}

function csvCell(value: unknown) {
  let text = '';
  if (value == null) text = '';
  else if (typeof value === 'object') text = JSON.stringify(value);
  else if (typeof value === 'string') text = value;
  else if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    text = value.toString();
  else text = JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  if (!authorised(request))
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const db = getDb();
  const detailId = request.nextUrl.searchParams.get('id');
  const format = request.nextUrl.searchParams.get('format');

  if (detailId) {
    const submission = (
      await db
        .select()
        .from(submissions)
        .where(eq(submissions.id, detailId))
        .limit(1)
    )[0];
    const answerRows = await db
      .select()
      .from(responses)
      .where(eq(responses.submissionId, detailId))
      .orderBy(asc(responses.sectionId), asc(responses.questionId));
    const consent =
      (
        await db
          .select({
            language: consentRecords.language,
            signedAt: consentRecords.signedAt,
            fileName: consentRecords.fileName,
          })
          .from(consentRecords)
          .where(eq(consentRecords.submissionId, detailId))
          .limit(1)
      )[0] || null;
    return NextResponse.json({ submission, responses: answerRows, consent });
  }

  const submissionRows = await db
    .select()
    .from(submissions)
    .orderBy(desc(submissions.updatedAt));
  const responseRows = await db
    .select()
    .from(responses)
    .orderBy(asc(responses.submissionId), asc(responses.questionId));
  const consentRows = await db
    .select({
      submissionId: consentRecords.submissionId,
      language: consentRecords.language,
      signedAt: consentRecords.signedAt,
      fileName: consentRecords.fileName,
    })
    .from(consentRecords)
    .orderBy(desc(consentRecords.signedAt));
  const consentMap = new Map(consentRows.map((row) => [row.submissionId, row]));

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
    ];
    const submissionMap = new Map(submissionRows.map((row) => [row.id, row]));
    const lines = responseRows.map((row) => {
      const sub = submissionMap.get(row.submissionId);
      const consent = consentMap.get(row.submissionId);
      let answer = row.answerJson;
      try {
        answer = JSON.parse(row.answerJson);
      } catch {}
      return [
        sub?.participantCode,
        sub?.city,
        sub?.status,
        Boolean(consent),
        consent?.language,
        consent?.signedAt,
        sub?.startedAt,
        sub?.completedAt,
        ((sub?.totalDurationMs || 0) / 1000).toFixed(1),
        row.questionId,
        row.sectionId,
        row.scenarioCode,
        row.automationLevel,
        answer,
        row.unclear,
        (row.timeSpentMs / 1000).toFixed(1),
        row.firstInteractionMs == null
          ? ''
          : (row.firstInteractionMs / 1000).toFixed(1),
        row.answerChanges,
        row.voiceUsed,
        row.blurCount,
        row.hesitationFlag,
      ]
        .map(csvCell)
        .join(',');
    });
    return new NextResponse(
      [header.map(csvCell).join(','), ...lines].join('\n'),
      {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition':
            'attachment; filename="av-main-study-data.csv"',
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
    const m = metrics.get(row.submissionId) || {
      count: 0,
      unclear: 0,
      hesitant: 0,
      voice: 0,
      totalTime: 0,
    };
    m.count += 1;
    m.unclear += row.unclear ? 1 : 0;
    m.hesitant += row.hesitationFlag ? 1 : 0;
    m.voice += row.voiceUsed ? 1 : 0;
    m.totalTime += row.timeSpentMs;
    metrics.set(row.submissionId, m);
  }
  return NextResponse.json({
    submissions: submissionRows.map((row) => ({
      ...row,
      consentRecord: consentMap.get(row.id) || null,
      metrics: metrics.get(row.id) || {
        count: 0,
        unclear: 0,
        hesitant: 0,
        voice: 0,
        totalTime: 0,
      },
    })),
    summary: {
      total: submissionRows.length,
      completed: submissionRows.filter((row) => row.status === 'completed')
        .length,
      hongKong: submissionRows.filter((row) => row.city === 'HK').length,
      ningbo: submissionRows.filter((row) => row.city === 'NB').length,
      unclearAnswers: responseRows.filter((row) => row.unclear).length,
      hesitationFlags: responseRows.filter((row) => row.hesitationFlag).length,
      signedConsents: consentRows.length,
    },
  });
}
