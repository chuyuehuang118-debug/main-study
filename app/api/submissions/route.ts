import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { responses, submissions } from '@/db/schema';

export const runtime = 'edge';

type IncomingResponse = {
  questionId: string;
  sectionId: string;
  scenarioCode?: string | null;
  automationLevel?: string | null;
  answer: string;
  unclear: boolean;
  timeSpentMs: number;
  firstInteractionMs?: number | null;
  answerChanges: number;
  voiceUsed: boolean;
  blurCount: number;
  hesitationFlag: boolean;
};

type IncomingSubmission = {
  id?: string;
  participantCode?: string;
  city?: string;
  consent?: boolean;
  status?: string;
  currentStep?: number;
  startedAt?: string;
  completedAt?: string | null;
  totalDurationMs?: number;
  responses?: IncomingResponse[];
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as IncomingSubmission;
    if (
      typeof body.id !== 'string' ||
      typeof body.participantCode !== 'string' ||
      (body.city !== 'HK' && body.city !== 'NB') ||
      body.consent !== true
    ) {
      return NextResponse.json(
        { error: 'Invalid submission' },
        { status: 400 },
      );
    }
    const submissionId = body.id;
    const participantCode = body.participantCode;
    const studyCity = body.city;
    const db = getDb();
    const now = new Date().toISOString();
    await db
      .insert(submissions)
      .values({
        id: submissionId,
        participantCode: participantCode.slice(0, 30),
        city: studyCity,
        consent: true,
        status: body.status === 'completed' ? 'completed' : 'in_progress',
        currentStep: Number(body.currentStep) || 0,
        startedAt: body.startedAt || now,
        completedAt: body.completedAt || null,
        updatedAt: now,
        totalDurationMs: Math.max(0, Number(body.totalDurationMs) || 0),
        userAgent: request.headers.get('user-agent')?.slice(0, 500) || null,
      })
      .onConflictDoUpdate({
        target: submissions.id,
        set: {
          participantCode: participantCode.slice(0, 30),
          city: studyCity,
          consent: true,
          status: body.status === 'completed' ? 'completed' : 'in_progress',
          currentStep: Number(body.currentStep) || 0,
          startedAt: body.startedAt || now,
          completedAt: body.completedAt || null,
          updatedAt: now,
          totalDurationMs: Math.max(0, Number(body.totalDurationMs) || 0),
        },
      });

    const rows: IncomingResponse[] = Array.isArray(body.responses)
      ? body.responses
      : [];
    for (const row of rows) {
      if (!row.questionId || !row.sectionId) continue;
      await db
        .insert(responses)
        .values({
          id: `${submissionId}:${row.questionId}`,
          submissionId,
          questionId: row.questionId,
          sectionId: row.sectionId,
          scenarioCode: row.scenarioCode || null,
          automationLevel: row.automationLevel || null,
          answerJson: JSON.stringify(row.answer ?? ''),
          unclear: Boolean(row.unclear),
          timeSpentMs: Math.max(0, Number(row.timeSpentMs) || 0),
          firstInteractionMs:
            row.firstInteractionMs == null
              ? null
              : Math.max(0, Number(row.firstInteractionMs) || 0),
          answerChanges: Math.max(0, Number(row.answerChanges) || 0),
          voiceUsed: Boolean(row.voiceUsed),
          blurCount: Math.max(0, Number(row.blurCount) || 0),
          hesitationFlag: Boolean(row.hesitationFlag),
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [responses.submissionId, responses.questionId],
          set: {
            answerJson: JSON.stringify(row.answer ?? ''),
            unclear: Boolean(row.unclear),
            timeSpentMs: Math.max(0, Number(row.timeSpentMs) || 0),
            firstInteractionMs:
              row.firstInteractionMs == null
                ? null
                : Math.max(0, Number(row.firstInteractionMs) || 0),
            answerChanges: Math.max(0, Number(row.answerChanges) || 0),
            voiceUsed: Boolean(row.voiceUsed),
            blurCount: Math.max(0, Number(row.blurCount) || 0),
            hesitationFlag: Boolean(row.hesitationFlag),
            updatedAt: now,
          },
        });
    }
    return NextResponse.json({ ok: true, savedAt: now });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Unable to save submission' },
      { status: 500 },
    );
  }
}
