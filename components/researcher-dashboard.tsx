'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Clock3,
  Download,
  Eye,
  FileSignature,
  Filter,
  KeyRound,
  Mic,
  RefreshCw,
  Search,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiUrl } from '@/lib/runtime-url';

type Metrics = {
  count: number;
  unclear: number;
  hesitant: number;
  voice: number;
  totalTime: number;
};
type ConsentRecord = { language: string; signedAt: string; fileName: string };
type Submission = {
  id: string;
  participantCode: string;
  city: string;
  status: string;
  currentStep: number;
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
  totalDurationMs: number;
  consentRecord: ConsentRecord | null;
  metrics: Metrics;
};
type Summary = {
  total: number;
  completed: number;
  hongKong: number;
  ningbo: number;
  unclearAnswers: number;
  hesitationFlags: number;
  signedConsents: number;
};
type DetailRow = {
  id: string;
  questionId: string;
  sectionId: string;
  answerJson: string;
  unclear: boolean;
  timeSpentMs: number;
  firstInteractionMs: number | null;
  answerChanges: number;
  voiceUsed: boolean;
  blurCount: number;
  hesitationFlag: boolean;
  hesitationReasons: string[];
};

export function ResearcherDashboard() {
  const [passcode, setPasscode] = useState('');
  const [data, setData] = useState<{
    submissions: Submission[];
    summary: Summary;
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('all');
  const [status, setStatus] = useState('all');
  const [detail, setDetail] = useState<{
    submission: Submission;
    responses: DetailRow[];
    consent: ConsentRecord | null;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(apiUrl('/api/research'), {
        headers: { Authorization: `Bearer ${passcode}` },
      });
      if (response.status === 401)
        throw new Error('密码不正确。Incorrect passcode.');
      if (!response.ok)
        throw new Error('暂时无法读取数据库。Unable to read the database.');
      setData(await response.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load');
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (id: string) => {
    const response = await fetch(
      apiUrl(`/api/research?id=${encodeURIComponent(id)}`),
      {
        headers: { Authorization: `Bearer ${passcode}` },
      },
    );
    if (response.ok) setDetail(await response.json());
  };

  const exportCsv = async () => {
    const response = await fetch(apiUrl('/api/research?format=csv'), {
      headers: { Authorization: `Bearer ${passcode}` },
    });
    if (!response.ok) return;
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'av-main-study-data.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadConsent = async (submission: Submission) => {
    const response = await fetch(
      apiUrl(`/api/consent?submissionId=${encodeURIComponent(submission.id)}`),
      { headers: { Authorization: `Bearer ${passcode}` } },
    );
    if (!response.ok) {
      setError('无法下载知情同意书。Unable to download the consent form.');
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download =
      submission.consentRecord?.fileName ||
      `${submission.participantCode}-consent.pdf`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const rows = useMemo(
    () =>
      (data?.submissions || []).filter((row) => {
        const matchesQuery = row.participantCode
          .toLowerCase()
          .includes(query.toLowerCase());
        return (
          matchesQuery &&
          (city === 'all' || row.city === city) &&
          (status === 'all' || row.status === status)
        );
      }),
    [data, query, city, status],
  );

  if (!data)
    return (
      <main className="grid min-h-screen place-items-center bg-background px-5">
        <Card className="w-full max-w-md border-0 shadow-xl ring-1 ring-border">
          <CardHeader>
            <div className="mb-3 grid size-12 place-items-center rounded-xl bg-primary text-white">
              <KeyRound />
            </div>
            <CardTitle>研究者数据后台</CardTitle>
            <p className="text-sm text-muted-foreground">
              Researcher data dashboard
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              className="h-12"
              placeholder="请输入研究者密码 Passcode"
            />
            {error && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                {error}
              </p>
            )}
            <Button
              className="h-12 w-full"
              onClick={load}
              disabled={!passcode || loading}
            >
              {loading ? '读取中 Loading…' : '进入后台 Open dashboard'}
            </Button>
            <Link
              href="/"
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:underline"
            >
              <ArrowLeft className="size-4" /> 返回问卷 Back to study
            </Link>
          </CardContent>
        </Card>
      </main>
    );

  const summary = data.summary;
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-5 py-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-bold tracking-[.15em] text-primary uppercase">
              MRes Main Study
            </p>
            <h1 className="mt-1 text-2xl font-semibold">
              研究者数据后台{' '}
              <span className="text-muted-foreground">Research dashboard</span>
            </h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load}>
              <RefreshCw /> 刷新 Refresh
            </Button>
            <Button onClick={exportCsv}>
              <Download /> 导出 CSV
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-6 px-5 py-7">
        {error && (
          <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
            {error}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Metric
            icon={<Users />}
            label="总参与者 Total"
            value={summary.total}
            note={`HK ${summary.hongKong} · NB ${summary.ningbo}`}
          />
          <Metric
            icon={<Clock3 />}
            label="完成 Completed"
            value={summary.completed}
            note={`${summary.total ? Math.round((summary.completed / summary.total) * 100) : 0}% completion`}
          />
          <Metric
            icon={<FileSignature />}
            label="已签署 Consent"
            value={summary.signedConsents}
            note="PDF stored separately"
          />
          <Metric
            icon={<TriangleAlert />}
            label="犹豫标记 Hesitation"
            value={summary.hesitationFlags}
            note="≥30s / ≥2 changes / unclear"
          />
          <Metric
            icon={<Mic />}
            label="不理解 Unclear"
            value={summary.unclearAnswers}
            note="可按题目追踪"
          />
        </div>
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-col gap-3 lg:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
                <Input
                  aria-label="Search participant ID"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-11 pl-10"
                  placeholder="搜索参与者编号 Search ID"
                />
              </div>
              <label className="flex items-center gap-2">
                <Filter className="size-4" />
                <select
                  aria-label="Filter by study site"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="h-11 rounded-lg border bg-white px-3"
                >
                  <option value="all">全部地点 All sites</option>
                  <option value="HK">Hong Kong</option>
                  <option value="NB">Ningbo</option>
                </select>
              </label>
              <select
                aria-label="Filter by completion status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-11 rounded-lg border bg-white px-3"
              >
                <option value="all">全部状态 All status</option>
                <option value="completed">Completed</option>
                <option value="in_progress">In progress</option>
                <option value="consent_only">Consent only</option>
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="border-y bg-muted/60 text-xs uppercase text-muted-foreground">
                  <tr>
                    {[
                      'Participant',
                      'Site',
                      'Status',
                      'Consent PDF',
                      'Progress',
                      'Duration',
                      'Questions',
                      'Unclear',
                      'Hesitation',
                      'Voice',
                      'Updated',
                      '',
                    ].map((h) => (
                      <th key={h} className="px-3 py-3 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b hover:bg-muted/30">
                      <td className="px-3 py-4 font-semibold">
                        {row.participantCode}
                      </td>
                      <td className="px-3 py-4">{row.city}</td>
                      <td className="px-3 py-4">
                        <Badge
                          variant={
                            row.status === 'completed' ? 'default' : 'secondary'
                          }
                        >
                          {row.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-4">
                        {row.consentRecord ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadConsent(row)}
                          >
                            <Download />{' '}
                            {row.consentRecord.language.toUpperCase()}
                          </Button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-4">{row.currentStep}/9</td>
                      <td className="px-3 py-4">
                        {formatTime(row.totalDurationMs)}
                      </td>
                      <td className="px-3 py-4">{row.metrics.count}</td>
                      <td className="px-3 py-4">{row.metrics.unclear}</td>
                      <td className="px-3 py-4">{row.metrics.hesitant}</td>
                      <td className="px-3 py-4">{row.metrics.voice}</td>
                      <td className="px-3 py-4 text-muted-foreground">
                        {new Date(row.updatedAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDetail(row.id)}
                        >
                          <Eye /> 查看
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && (
                <p className="py-12 text-center text-muted-foreground">
                  暂无符合条件的数据 No matching records
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        {detail && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>
                  {detail.submission.participantCode} · 逐题记录
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Question-level answers and timing
                </p>
              </div>
              <Button variant="ghost" onClick={() => setDetail(null)}>
                关闭 Close
              </Button>
            </CardHeader>
            <CardContent>
              <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
                <p className="font-semibold">逐题计时口径 Timing definition</p>
                <p>
                  Answer time records the active visible time from when a
                  question appears to the participant’s last response action.
                  First action is the delay before the first response. These
                  values support coding but do not by themselves prove
                  hesitation.
                </p>
              </div>
              {detail.consent && (
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div>
                    <p className="font-semibold">
                      知情同意书已签署 · Signed consent
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {detail.consent.language.toUpperCase()} ·{' '}
                      {new Date(detail.consent.signedAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      downloadConsent({
                        ...detail.submission,
                        consentRecord: detail.consent,
                      })
                    }
                  >
                    <Download /> 下载 PDF
                  </Button>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead className="border-y bg-muted/60">
                    <tr>
                      {[
                        'Question',
                        'Answer',
                        'Answer time',
                        'First action delay',
                        'Changes',
                        'Page leaves',
                        'Unclear',
                        'Voice',
                        'Possible hesitation',
                      ].map((h) => (
                        <th key={h} className="px-3 py-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.responses.map((row) => (
                      <tr key={row.id} className="border-b">
                        <td className="px-3 py-3 font-medium">
                          {row.questionId}
                        </td>
                        <td className="max-w-72 px-3 py-3">
                          {safeAnswer(row.answerJson)}
                        </td>
                        <td className="px-3 py-3">
                          {formatTime(row.timeSpentMs)}
                        </td>
                        <td className="px-3 py-3">
                          {row.firstInteractionMs == null
                            ? '—'
                            : formatTime(row.firstInteractionMs)}
                        </td>
                        <td className="px-3 py-3">{row.answerChanges}</td>
                        <td className="px-3 py-3">{row.blurCount}</td>
                        <td className="px-3 py-3">
                          {row.unclear ? 'Yes' : '—'}
                        </td>
                        <td className="px-3 py-3">
                          {row.voiceUsed ? 'Yes' : '—'}
                        </td>
                        <td className="px-3 py-3">
                          {row.hesitationFlag ? (
                            <div className="space-y-1">
                              <Badge variant="secondary">Review</Badge>
                              <p className="max-w-48 text-xs text-muted-foreground">
                                {row.hesitationReasons.join(', ')}
                              </p>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

function Metric({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{note}</p>
          </div>
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
function formatTime(ms: number) {
  const seconds = Math.round(ms / 1000);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
function safeAnswer(value: string) {
  try {
    return String(JSON.parse(value));
  } catch {
    return value;
  }
}
