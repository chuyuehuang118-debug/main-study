create table public.study_submissions (
  id uuid primary key,
  participant_code varchar(30) not null check (char_length(trim(participant_code)) between 1 and 30),
  city text not null check (city in ('HK', 'NB')),
  consent boolean not null default false,
  status text not null default 'consent_only' check (status in ('consent_only', 'in_progress', 'completed')),
  current_step integer not null default 0 check (current_step between 0 and 100),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  total_duration_ms bigint not null default 0 check (total_duration_ms >= 0),
  user_agent varchar(500),
  constraint completed_submission_has_timestamp check (
    status <> 'completed' or completed_at is not null
  )
);

create table public.study_responses (
  submission_id uuid not null references public.study_submissions(id) on delete cascade,
  question_id varchar(100) not null,
  section_id varchar(100) not null,
  scenario_code varchar(50),
  automation_level varchar(20),
  answer_json jsonb not null default '""'::jsonb,
  unclear boolean not null default false,
  time_spent_ms bigint not null default 0 check (time_spent_ms >= 0),
  first_interaction_ms bigint check (first_interaction_ms is null or first_interaction_ms >= 0),
  answer_changes integer not null default 0 check (answer_changes >= 0),
  voice_used boolean not null default false,
  blur_count integer not null default 0 check (blur_count >= 0),
  hesitation_flag boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (submission_id, question_id)
);

create table public.study_consent_records (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.study_submissions(id) on delete cascade,
  participant_code varchar(30) not null,
  city text not null check (city in ('HK', 'NB')),
  language text not null check (language in ('zh', 'en')),
  object_path text not null unique,
  file_name varchar(160) not null,
  signed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index study_submissions_updated_at_idx
  on public.study_submissions (updated_at desc);
create index study_submissions_city_status_idx
  on public.study_submissions (city, status);
create index study_responses_question_id_idx
  on public.study_responses (question_id);
create index study_responses_section_id_idx
  on public.study_responses (section_id);
create index study_responses_hesitation_idx
  on public.study_responses (submission_id, hesitation_flag)
  where hesitation_flag = true;
create index study_consent_signed_at_idx
  on public.study_consent_records (signed_at desc);

alter table public.study_submissions enable row level security;
alter table public.study_responses enable row level security;
alter table public.study_consent_records enable row level security;

alter table public.study_submissions force row level security;
alter table public.study_responses force row level security;
alter table public.study_consent_records force row level security;

revoke all on table public.study_submissions from anon, authenticated;
revoke all on table public.study_responses from anon, authenticated;
revoke all on table public.study_consent_records from anon, authenticated;

grant select, insert, update, delete on table public.study_submissions to service_role;
grant select, insert, update, delete on table public.study_responses to service_role;
grant select, insert, update, delete on table public.study_consent_records to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'study-consents',
  'study-consents',
  false,
  3000000,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
