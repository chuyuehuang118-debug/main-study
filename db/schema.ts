import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';

export const submissions = sqliteTable(
  'submissions',
  {
    id: text('id').primaryKey(),
    participantCode: text('participant_code').notNull(),
    city: text('city').notNull(),
    consent: integer('consent', { mode: 'boolean' }).notNull().default(false),
    status: text('status').notNull().default('in_progress'),
    currentStep: integer('current_step').notNull().default(0),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
    updatedAt: text('updated_at').notNull(),
    totalDurationMs: integer('total_duration_ms').notNull().default(0),
    userAgent: text('user_agent'),
  },
  (table) => [
    index('submissions_participant_idx').on(table.participantCode),
    index('submissions_city_status_idx').on(table.city, table.status),
  ],
);

export const responses = sqliteTable(
  'responses',
  {
    id: text('id').primaryKey(),
    submissionId: text('submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'cascade' }),
    questionId: text('question_id').notNull(),
    sectionId: text('section_id').notNull(),
    scenarioCode: text('scenario_code'),
    automationLevel: text('automation_level'),
    answerJson: text('answer_json').notNull(),
    unclear: integer('unclear', { mode: 'boolean' }).notNull().default(false),
    timeSpentMs: integer('time_spent_ms').notNull().default(0),
    firstInteractionMs: integer('first_interaction_ms'),
    answerChanges: integer('answer_changes').notNull().default(0),
    voiceUsed: integer('voice_used', { mode: 'boolean' })
      .notNull()
      .default(false),
    blurCount: integer('blur_count').notNull().default(0),
    hesitationFlag: integer('hesitation_flag', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('responses_submission_question_idx').on(
      table.submissionId,
      table.questionId,
    ),
    index('responses_submission_idx').on(table.submissionId),
    index('responses_question_idx').on(table.questionId),
  ],
);

export const consentRecords = sqliteTable(
  'consent_records',
  {
    id: text('id').primaryKey(),
    submissionId: text('submission_id').notNull(),
    participantCode: text('participant_code').notNull(),
    city: text('city').notNull(),
    language: text('language').notNull(),
    objectKey: text('object_key').notNull(),
    fileName: text('file_name').notNull(),
    signedAt: text('signed_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('consent_records_submission_idx').on(table.submissionId),
    index('consent_records_participant_idx').on(table.participantCode),
    index('consent_records_signed_at_idx').on(table.signedAt),
  ],
);
