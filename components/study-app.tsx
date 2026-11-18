'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Database,
  Mic,
  MicOff,
  Save,
  Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress, ProgressLabel } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { ConsentForm } from '@/components/consent-form';
import {
  ReliableSaveState,
  deleteStudyDraft,
  loadStudyDraft,
  retryPendingSaves,
  saveStudyDraft,
  saveSubmissionReliably,
} from '@/lib/reliable-submit';
import { assetUrl } from '@/lib/runtime-url';

type Answer = {
  value: string;
  unclear: boolean;
  timeSpentMs: number;
  firstInteractionMs: number | null;
  answerChanges: number;
  voiceUsed: boolean;
  blurCount: number;
  timingStartedAt: number | null;
};
type Answers = Record<string, Answer>;
type Question = {
  id: string;
  zh: string;
  en: string;
  type: 'choice' | 'multi' | 'scale' | 'text';
  options?: string[];
};
type Step = {
  id: string;
  titleZh: string;
  titleEn: string;
  introZh: string;
  introEn: string;
  image?: string;
  imageAlt?: string;
  scenarioCode?: string;
  automationLevel?: string;
  showAutomationGuide?: boolean;
  questions: Question[];
};

const AUTOMATION_LEVELS = [
  {
    level: 'L2',
    nameZh: '辅助驾驶',
    nameEn: 'Assisted driving',
    driverZh: '驾驶者必须一直看路，并随时控制车辆。',
    driverEn:
      'The driver must watch the road at all times and remain in control.',
    vehicleZh: '车辆可以同时控制方向和速度，但不能代替驾驶者负责。',
    vehicleEn:
      'The vehicle can control steering and speed together, but it does not replace the driver’s responsibility.',
  },
  {
    level: 'L3',
    nameZh: '有条件自动驾驶',
    nameEn: 'Conditional automation',
    driverZh:
      '系统工作时，驾驶者不用一直看路，但收到接管提示后必须能够及时回应。',
    driverEn:
      'While the system is active, the driver does not need to watch continuously, but must respond when asked to take over.',
    vehicleZh: '车辆在规定条件下完成全部驾驶任务；超出条件时会要求驾驶者接管。',
    vehicleEn:
      'The vehicle performs the whole driving task under defined conditions and requests a takeover when those conditions end.',
  },
  {
    level: 'L4',
    nameZh: '高度自动驾驶',
    nameEn: 'High automation',
    driverZh: '在规定区域和条件内，乘客不需要接管，也不一定需要会驾驶。',
    driverEn:
      'Within its defined area and conditions, a passenger is not expected to take over and may not need to be a driver.',
    vehicleZh: '车辆完成驾驶和突发情况处理；如果不能继续，会自行安全停车。',
    vehicleEn:
      'The vehicle handles driving and fallback itself; if it cannot continue, it brings itself to a safe stop.',
  },
] as const;

const AUTOMATION_GUIDE_SPEECH = AUTOMATION_LEVELS.flatMap((item) => [
  `${item.level} ${item.nameZh}，${item.driverZh}${item.vehicleZh}`,
  `${item.level} ${item.nameEn}. ${item.driverEn} ${item.vehicleEn}`,
]).join('。');

function scenarioQuestions(prefix: string): Question[] {
  return [
    {
      id: `${prefix}_trust`,
      zh: '在这个场景中，您有多信任车辆？',
      en: 'How much would you trust the vehicle in this situation?',
      type: 'scale',
    },
    {
      id: `${prefix}_safety`,
      zh: '您觉得这个过程有多安全？',
      en: 'How safe would this feel?',
      type: 'scale',
    },
    {
      id: `${prefix}_usefulness`,
      zh: '自动化在这个场景中有多有用？',
      en: 'How useful would automation be in this situation?',
      type: 'scale',
    },
    {
      id: `${prefix}_willingness`,
      zh: '您有多愿意乘坐？',
      en: 'How willing would you be to travel in it?',
      type: 'scale',
    },
    {
      id: `${prefix}_reason`,
      zh: '什么最影响您的判断？',
      en: 'What most affected your judgement?',
      type: 'text',
    },
  ];
}

const STEPS: Step[] = [
  {
    id: 'profile',
    titleZh: '基本资料',
    titleEn: 'Participant profile',
    introZh: '这些资料帮助我们了解不同生活和科技经验是否影响回答。',
    introEn:
      'This information helps us understand whether life and technology experience influence responses.',
    questions: [
      {
        id: 'age_band',
        zh: '您的年龄范围是？',
        en: 'What is your age range?',
        type: 'choice',
        options: ['60–64', '65–69', '70–74', '75–79', '80+'],
      },
      {
        id: 'living_arrangement',
        zh: '您目前与谁一起居住？',
        en: 'Who do you currently live with?',
        type: 'choice',
        options: [
          '独居 Live alone',
          '与伴侣 With spouse/partner',
          '与子女或家人 With children/family',
          '养老或支援居所 Supported residence',
          '其他 Other',
        ],
      },
      {
        id: 'driving_status',
        zh: '您目前是否驾驶？',
        en: 'Do you currently drive?',
        type: 'choice',
        options: [
          '经常 Regularly',
          '偶尔 Sometimes',
          '以前驾驶 Used to drive',
          '从不 Never',
        ],
      },
      {
        id: 'mobility_support',
        zh: '您外出时是否需要行动辅助？',
        en: 'Do you need mobility support when going out?',
        type: 'choice',
        options: [
          '不需要 None',
          '手杖 Walking stick',
          '助行架 Walker',
          '轮椅 Wheelchair',
          '他人协助 Help from another person',
          '不愿回答 Prefer not to say',
        ],
      },
      {
        id: 'digital_confidence',
        zh: '您使用智能手机或平板电脑有多自信？',
        en: 'How confident are you using a smartphone or tablet?',
        type: 'scale',
      },
      {
        id: 'av_awareness',
        zh: '在今天以前，您对自动驾驶汽车了解多少？',
        en: 'Before today, how much did you know about automated vehicles?',
        type: 'scale',
      },
    ],
  },
  {
    id: 'travel_profile',
    titleZh: '日常出行习惯',
    titleEn: 'Everyday travel profile',
    introZh:
      '请根据您平时真实的出行情况回答。可以在多选题中选择所有适用的答案。',
    introEn:
      'Please answer based on your usual travel. For multiple-choice items, select all options that apply.',
    questions: [
      {
        id: 'outing_frequency',
        zh: '您平时多久出门一次？',
        en: 'How often do you usually go out?',
        type: 'choice',
        options: [
          '每天 Daily',
          '每周4–6天 4–6 days a week',
          '每周2–3天 2–3 days a week',
          '每周1天 About once a week',
          '少于每周1次 Less than once a week',
        ],
      },
      {
        id: 'trip_purposes',
        zh: '您平时出门通常是为了什么？（可多选）',
        en: 'What do you usually go out for? (Select all that apply)',
        type: 'multi',
        options: [
          '买菜或购物 Groceries/shopping',
          '看医生或健康服务 Medical/healthcare',
          '探亲访友 Visiting family/friends',
          '工作或志愿活动 Work/volunteering',
          '运动或散步 Exercise/walking',
          '休闲娱乐 Leisure',
          '处理日常事务 Daily errands',
          '其他 Other',
        ],
      },
      {
        id: 'transport_modes',
        zh: '您平时使用哪些交通工具？（可多选）',
        en: 'Which transport modes do you usually use? (Select all that apply)',
        type: 'multi',
        options: [
          '步行 Walking',
          '巴士 Bus',
          '地铁或轻轨 MTR/metro/light rail',
          '出租车或网约车 Taxi/ride-hailing',
          '自己开车 Drive myself',
          '家人或朋友接送 Family/friend drives',
          '自行车或电动自行车 Bicycle/e-bike',
          '社区或无障碍接送 Community/accessible transport',
        ],
      },
      {
        id: 'travel_companion',
        zh: '您大多数时候怎样出门？',
        en: 'How do you travel most of the time?',
        type: 'choice',
        options: [
          '通常独自 Usually alone',
          '通常与伴侣 With spouse/partner',
          '通常与家人或照护者 With family/carer',
          '视情况而定 It depends',
        ],
      },
      {
        id: 'public_transport_frequency',
        zh: '您多久使用一次公共交通？',
        en: 'How often do you use public transport?',
        type: 'choice',
        options: [
          '每天 Daily',
          '每周数次 Several times a week',
          '每月数次 Several times a month',
          '很少 Rarely',
          '从不 Never',
        ],
      },
      {
        id: 'travel_app_use',
        zh: '您会使用地图、乘车码或叫车软件来帮助出行吗？',
        en: 'Do you use maps, travel codes or ride-hailing apps for trips?',
        type: 'choice',
        options: [
          '经常 Often',
          '有时 Sometimes',
          '在别人帮助下 With help',
          '从不 Never',
        ],
      },
    ],
  },
  {
    id: 'responsibility',
    titleZh: '自动化责任',
    titleEn: 'Automation responsibility',
    introZh: '请先阅读下面三种自动化等级的解释，再回答责任问题。',
    introEn:
      'Please read the three automation-level explanations before answering the responsibility questions.',
    showAutomationGuide: true,
    questions: [
      {
        id: 'responsibility_l2',
        zh: 'L2 辅助驾驶：谁要持续看路？',
        en: 'L2 assisted driving: who must continuously watch the road?',
        type: 'choice',
        options: [
          '驾驶者 Driver',
          '车辆 Vehicle',
          '双方 Both',
          '不确定 Unsure',
        ],
      },
      {
        id: 'responsibility_l3',
        zh: 'L3 有条件自动驾驶：谁要持续看路？',
        en: 'L3 conditional automation: who must continuously watch the road?',
        type: 'choice',
        options: [
          '驾驶者 Driver',
          '车辆 Vehicle',
          '双方 Both',
          '不确定 Unsure',
        ],
      },
      {
        id: 'responsibility_l4',
        zh: 'L4 高度自动驾驶：在规定区域内谁负责驾驶？',
        en: 'L4 high automation: who drives within its operating area?',
        type: 'choice',
        options: [
          '驾驶者 Driver',
          '车辆 Vehicle',
          '双方 Both',
          '不确定 Unsure',
        ],
      },
    ],
  },
  ...(['L2', 'L3', 'L4'] as const).map((level) => ({
    id: `roadworks_${level.toLowerCase()}`,
    titleZh: `道路施工场景 · ${level}`,
    titleEn: `Roadworks scenario · ${level}`,
    introZh: `请想象您正坐在一辆 ${level} 自动化汽车内。前方车道因施工收窄，车辆需要减速并决定是否变道。`,
    introEn: `Imagine you are travelling in an ${level} automated vehicle. Roadworks narrow the lane ahead, so the vehicle must slow down and decide whether to change lane.`,
    image: `/scenarios/roadworks-${level.toLowerCase()}.png`,
    imageAlt: `Roadworks scene for ${level} automation`,
    scenarioCode: 'roadworks',
    automationLevel: level,
    questions: scenarioQuestions(`roadworks_${level.toLowerCase()}`),
  })),
  {
    id: 'pedestrian',
    titleZh: '行人突然横过马路',
    titleEn: 'Pedestrian crossing unexpectedly',
    introZh:
      '请查看场景，并想象车辆需要快速识别行人、减速和清楚说明它正在做什么。',
    introEn:
      'Imagine the vehicle must quickly detect the pedestrian, slow down and clearly explain its action.',
    image: '/scenarios/pedestrian-comparison-v2.png',
    imageAlt: 'Pedestrian crossing scenario',
    scenarioCode: 'pedestrian',
    questions: scenarioQuestions('pedestrian'),
  },
  {
    id: 'heavy_rain',
    titleZh: '暴雨场景',
    titleEn: 'Heavy rain scenario',
    introZh:
      '请想象暴雨影响传感器和视线。车辆可能减速、请求接管或寻找安全位置停车。',
    introEn:
      'Imagine heavy rain affects sensors and visibility. The vehicle may slow down, request a takeover or find a safe place to stop.',
    image: '/scenarios/heavy-rain-comparison-v2.png',
    imageAlt: 'Heavy rain driving scenario',
    scenarioCode: 'heavy_rain',
    questions: scenarioQuestions('heavy_rain'),
  },
  {
    id: 'service',
    titleZh: '信息和服务支持',
    titleEn: 'Information and service support',
    introZh: '最后，请告诉我们怎样的支持会让自动驾驶服务更容易理解和使用。',
    introEn:
      'Finally, tell us what support would make automated transport easier to understand and use.',
    questions: [
      {
        id: 'guidance_preference',
        zh: '您最希望车辆怎样解释它的行动？',
        en: 'How would you most like the vehicle to explain its actions?',
        type: 'choice',
        options: [
          '语音 Voice',
          '屏幕文字 Screen text',
          '灯光或图标 Lights or icons',
          '多种方式结合 A combination',
        ],
      },
      {
        id: 'help_preference',
        zh: '遇到问题时，您最希望得到哪种帮助？',
        en: 'What help would you prefer if something goes wrong?',
        type: 'choice',
        options: [
          '车内真人客服 Human support',
          '一键求助 Help button',
          '家人联系 Family contact',
          '自动说明 Automatic guidance',
        ],
      },
      {
        id: 'design_priority',
        zh: '如果只能改善一件事，您希望设计者先改善什么？',
        en: 'If designers could improve one thing first, what should it be?',
        type: 'text',
      },
    ],
  },
];

const emptyAnswer = (): Answer => ({
  value: '',
  unclear: false,
  timeSpentMs: 0,
  firstInteractionMs: null,
  answerChanges: 0,
  voiceUsed: false,
  blurCount: 0,
  timingStartedAt: null,
});

function applyAnswerUpdate(
  previous: Answer,
  value: Partial<Answer>,
  now = Date.now(),
): Answer {
  const elapsed =
    previous.timingStartedAt == null
      ? 0
      : Math.max(0, now - previous.timingStartedAt);
  const timeSpentMs = previous.timeSpentMs + elapsed;
  const hadAnswer = Boolean(previous.value || previous.unclear);
  const nextValue = value.value ?? previous.value;
  const nextUnclear = value.unclear ?? previous.unclear;
  const responseChanged =
    hadAnswer &&
    (nextValue !== previous.value || nextUnclear !== previous.unclear);

  return {
    ...previous,
    ...value,
    timeSpentMs,
    firstInteractionMs: previous.firstInteractionMs ?? timeSpentMs,
    answerChanges: previous.answerChanges + (responseChanged ? 1 : 0),
    timingStartedAt: now,
  };
}

function pauseAnswerTimers(source: Answers): Answers {
  return Object.fromEntries(
    Object.entries(source).map(([id, answer]) => [
      id,
      { ...answer, timingStartedAt: null },
    ]),
  );
}

export function StudyApp() {
  const [started, setStarted] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [participantCode, setParticipantCode] = useState('');
  const [city, setCity] = useState('');
  const [consent, setConsent] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [answerHistory, setAnswerHistory] = useState<Record<string, Answers>>(
    {},
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveState, setSaveState] = useState<ReliableSaveState | null>(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [studyStartedAt, setStudyStartedAt] = useState(() => Date.now());
  const [consentPending, setConsentPending] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const visibleQuestionIds = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;

    const restoreAndRetry = async () => {
      try {
        const draft = await loadStudyDraft();
        const freshDraft =
          draft && Date.now() - draft.updatedAt < 7 * 24 * 60 * 60 * 1000
            ? draft
            : null;
        if (draft && !freshDraft) await deleteStudyDraft();
        if (freshDraft && !cancelled) {
          setSubmissionId(freshDraft.submissionId);
          setParticipantCode(freshDraft.participantCode);
          setCity(freshDraft.city);
          setConsent(freshDraft.consent);
          setConsentPending(freshDraft.consentPending);
          setStarted(freshDraft.started);
          setShowConsent(freshDraft.showConsent);
          setStepIndex(freshDraft.stepIndex);
          setAnswers(pauseAnswerTimers((freshDraft.answers as Answers) || {}));
          setAnswerHistory(
            (freshDraft.answerHistory as Record<string, Answers>) || {},
          );
          setStudyStartedAt(freshDraft.studyStartedAt);
          setRecoveryMessage(
            '已恢复上次未完成的问卷 · The unfinished questionnaire has been restored.',
          );
        }

        const retry = await retryPendingSaves();
        if (cancelled) return;
        if (
          freshDraft?.consentPending &&
          retry.confirmedIds.includes(`consent:${freshDraft.submissionId}`)
        ) {
          const now = Date.now();
          setConsent(true);
          setConsentPending(false);
          setStarted(true);
          setShowConsent(false);
          setStudyStartedAt(now);
          setRecoveryMessage(
            '知情同意书已补传并由服务器确认 · The consent form has been recovered and confirmed by the server.',
          );
        } else if (retry.confirmed > 0) {
          setRecoveryMessage(
            '先前暂存的数据已补传并由服务器确认 · Previously stored data has been uploaded and confirmed.',
          );
        }
      } finally {
        if (!cancelled) setDraftReady(true);
      }
    };

    void restoreAndRetry();
    const retryWhenOnline = () => void restoreAndRetry();
    window.addEventListener('online', retryWhenOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', retryWhenOnline);
    };
  }, []);

  useEffect(() => {
    if (!draftReady || finished || (!started && !showConsent)) return;
    const timeout = window.setTimeout(() => {
      void saveStudyDraft({
        submissionId,
        participantCode,
        city,
        consent,
        consentPending,
        started,
        showConsent,
        stepIndex,
        answers: pauseAnswerTimers(answers),
        answerHistory,
        studyStartedAt,
        updatedAt: Date.now(),
      });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [
    answerHistory,
    answers,
    city,
    consent,
    consentPending,
    draftReady,
    finished,
    participantCode,
    showConsent,
    started,
    stepIndex,
    studyStartedAt,
    submissionId,
  ]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const visibleIds = [...visibleQuestionIds.current];
      if (!visibleIds.length) return;
      const now = Date.now();
      setAnswers((current) => {
        let changed = false;
        const next = { ...current };
        for (const questionId of visibleIds) {
          const previous = current[questionId];
          if (!previous) continue;
          if (document.hidden) {
            const elapsed =
              previous.timingStartedAt == null
                ? 0
                : Math.max(0, now - previous.timingStartedAt);
            next[questionId] = {
              ...previous,
              timeSpentMs:
                previous.firstInteractionMs == null
                  ? previous.timeSpentMs + elapsed
                  : previous.timeSpentMs,
              blurCount: previous.blurCount + 1,
              timingStartedAt: null,
            };
            changed = true;
          } else if (previous.timingStartedAt == null) {
            next[questionId] = { ...previous, timingStartedAt: now };
            changed = true;
          }
        }
        return changed ? next : current;
      });
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options?: { signal: AbortSignal },
          ) => void;
        };
      }
    ).modelContext;
    if (!context) return;
    const controller = new AbortController();
    try {
      context.registerTool(
        {
          name: 'mark_study_question_unclear',
          title: 'Mark a study question as unclear',
          description:
            'Marks one questionnaire item as “I do not understand”, using the same state as the visible unclear button.',
          inputSchema: {
            type: 'object',
            properties: { questionId: { type: 'string', minLength: 1 } },
            required: ['questionId'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input: unknown) {
            const questionId = (input as { questionId?: unknown })?.questionId;
            if (typeof questionId !== 'string' || !questionId.trim())
              throw new Error('questionId is required');
            setAnswers((current) => ({
              ...current,
              [questionId]: applyAnswerUpdate(
                current[questionId] || emptyAnswer(),
                { value: '', unclear: true },
              ),
            }));
            setSaved(false);
            return { questionId, unclear: true };
          },
        },
        { signal: controller.signal },
      );
    } catch (registrationError) {
      console.warn('WebMCP registration unavailable', registrationError);
    }
    return () => controller.abort();
  }, []);

  const step = STEPS[stepIndex];
  const spokenText = useMemo(
    () =>
      [
        step.titleZh,
        step.titleEn,
        step.introZh,
        step.introEn,
        ...(step.showAutomationGuide ? [AUTOMATION_GUIDE_SPEECH] : []),
        ...step.questions.flatMap((q) => [q.zh, q.en]),
      ].join('。 '),
    [step],
  );
  const speak = useCallback((text: string) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-HK';
    u.rate = 0.82;
    window.speechSynthesis.speak(u);
  }, []);

  const updateAnswer = (id: string, value: Partial<Answer>) => {
    setSaved(false);
    setSaveState(null);
    setAnswers((current) => ({
      ...current,
      [id]: applyAnswerUpdate(current[id] || emptyAnswer(), value),
    }));
  };

  const updateQuestionVisibility = useCallback(
    (id: string, isVisible: boolean) => {
      const now = Date.now();
      if (isVisible) {
        visibleQuestionIds.current.add(id);
        setAnswers((current) => {
          const previous = current[id] || emptyAnswer();
          if (previous.timingStartedAt != null) return current;
          return {
            ...current,
            [id]: { ...previous, timingStartedAt: now },
          };
        });
        return;
      }

      visibleQuestionIds.current.delete(id);
      setAnswers((current) => {
        const previous = current[id];
        if (!previous || previous.timingStartedAt == null) return current;
        const elapsed = Math.max(0, now - previous.timingStartedAt);
        return {
          ...current,
          [id]: {
            ...previous,
            timeSpentMs:
              previous.firstInteractionMs == null
                ? previous.timeSpentMs + elapsed
                : previous.timeSpentMs,
            timingStartedAt: null,
          },
        };
      });
    },
    [],
  );

  const save = async (
    status: 'in_progress' | 'completed',
    nextStep: number,
  ) => {
    setSaving(true);
    setError('');
    const now = Date.now();
    const responseRows = Object.entries(answers).map(
      ([questionId, answer]) => ({
        questionId,
        sectionId: step.id,
        scenarioCode: step.scenarioCode || null,
        automationLevel: step.automationLevel || null,
        answer: answer.value,
        unclear: answer.unclear,
        timeSpentMs: answer.timeSpentMs,
        firstInteractionMs: answer.firstInteractionMs,
        answerChanges: answer.answerChanges,
        voiceUsed: answer.voiceUsed,
        blurCount: answer.blurCount,
        hesitationFlag: Boolean(
          answer.unclear ||
          (answer.firstInteractionMs && answer.firstInteractionMs > 30000) ||
          answer.answerChanges >= 2,
        ),
      }),
    );
    try {
      await saveSubmissionReliably(
        {
          id: submissionId,
          participantCode: participantCode.trim().toUpperCase(),
          city,
          consent,
          status,
          currentStep: nextStep,
          startedAt: new Date(studyStartedAt).toISOString(),
          completedAt: status === 'completed' ? new Date().toISOString() : null,
          totalDurationMs: now - studyStartedAt,
          responses: responseRows,
        },
        (state) => setSaveState(state),
      );
      setSaved(true);
      return true;
    } catch {
      setError(
        '回答已暂存在此设备，但服务器尚未确认收到。请保持本页开启、检查网络后再次点击。Answers are protected on this device, but the server has not confirmed receipt. Keep this page open, check the connection, and try again.',
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openConsent = () => {
    if (!participantCode.trim() || !city) {
      setError(
        '请填写参与者编号和研究地点。Please complete the participant ID and study site.',
      );
      return;
    }
    setShowConsent(true);
    setConsentPending(false);
    setError('');
  };

  const completeConsent = () => {
    const now = Date.now();
    setConsent(true);
    setConsentPending(false);
    setStarted(true);
    setShowConsent(false);
    setError('');
    setStudyStartedAt(now);
  };

  const next = async () => {
    const unanswered = step.questions.some((question) => {
      const answer = answers[question.id];
      return !answer || (!answer.value && !answer.unclear);
    });
    if (unanswered) {
      setError(
        '请回答每一道题，或选择“我不理解”。Please answer every question or choose “I do not understand”.',
      );
      return;
    }
    const done = stepIndex === STEPS.length - 1;
    if (!(await save(done ? 'completed' : 'in_progress', stepIndex + 1)))
      return;
    setAnswerHistory((history) => ({
      ...history,
      [step.id]: pauseAnswerTimers(answers),
    }));
    if (done) {
      await deleteStudyDraft();
      setFinished(true);
    } else {
      setStepIndex((i) => i + 1);
      setAnswers(answerHistory[STEPS[stepIndex + 1].id] || {});
      visibleQuestionIds.current.clear();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (finished) return <Completion code={participantCode} />;
  const content = !started ? (
    showConsent ? (
      <ConsentForm
        participantCode={participantCode}
        city={city}
        submissionId={submissionId}
        onBack={() => setShowConsent(false)}
        onPending={() => setConsentPending(true)}
        onSigned={completeConsent}
        speak={speak}
      />
    ) : (
      <Welcome
        {...{
          participantCode,
          setParticipantCode,
          city,
          setCity,
          error,
          saving,
          speak,
        }}
        onContinue={openConsent}
      />
    )
  ) : (
    <Card className="overflow-hidden border-0 shadow-[0_24px_70px_rgba(35,63,78,0.12)] ring-1 ring-border">
      <CardHeader className="border-b bg-white px-5 py-6 sm:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="mb-2 text-xs font-bold tracking-[.14em] text-primary uppercase">
              {step.titleEn}
            </p>
            <CardTitle className="text-2xl sm:text-3xl">
              {step.titleZh}
            </CardTitle>
          </div>
          <Button variant="outline" size="lg" onClick={() => speak(spokenText)}>
            <Volume2 /> 朗读 Read aloud
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-7 px-5 py-6 sm:px-8 sm:py-8">
        <section className="rounded-xl border border-primary/15 bg-primary/5 p-5 text-[15px] leading-7">
          <p>{step.introZh}</p>
          <p className="mt-2 text-muted-foreground">{step.introEn}</p>
        </section>
        {step.showAutomationGuide && <AutomationGuide speak={speak} />}
        {step.image && (
          <div className="overflow-hidden rounded-2xl border bg-muted">
            <Image
              src={assetUrl(step.image)}
              alt={step.imageAlt || ''}
              width={1400}
              height={780}
              className="h-auto w-full object-cover"
            />
          </div>
        )}
        {step.questions.map((question, index) => (
          <QuestionBlock
            key={question.id}
            question={question}
            number={index + 1}
            answer={answers[question.id] || emptyAnswer()}
            update={(value) => updateAnswer(question.id, value)}
            onVisibilityChange={updateQuestionVisibility}
            speak={speak}
            speechLang={city === 'NB' ? 'zh-CN' : 'zh-HK'}
          />
        ))}
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-4 text-sm font-medium text-red-800"
          >
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse justify-between gap-3 border-t pt-6 sm:flex-row sm:items-center">
          <Button
            variant="ghost"
            disabled={stepIndex === 0 || saving}
            onClick={() => {
              const previousIndex = stepIndex - 1;
              setAnswerHistory((history) => ({
                ...history,
                [step.id]: pauseAnswerTimers(answers),
              }));
              setStepIndex(previousIndex);
              setAnswers(answerHistory[STEPS[previousIndex].id] || {});
              visibleQuestionIds.current.clear();
            }}
          >
            <ArrowLeft /> 上一步 Back
          </Button>
          <div className="flex items-center gap-3">
            {saveState === 'stored_on_device' && (
              <span className="text-sm text-blue-800">
                设备暂存 · On-device copy
              </span>
            )}
            {saveState === 'retrying' && (
              <span className="text-sm text-amber-800">
                自动重试 · Retrying
              </span>
            )}
            {(saveState === 'uploading' || saving) && !saved && (
              <span className="text-sm text-blue-800">上传中 · Uploading</span>
            )}
            {saved && saveState === 'confirmed' && (
              <span className="flex items-center gap-1 text-sm text-primary">
                <Check className="size-4" /> 服务器已确认 Server confirmed
              </span>
            )}
            <Button
              size="lg"
              className="h-12 min-w-44 text-base"
              disabled={saving}
              onClick={next}
            >
              {saving ? (
                <>
                  <Save className="animate-pulse" /> 保存中 Saving
                </>
              ) : stepIndex === STEPS.length - 1 ? (
                <>
                  提交 Submit <Check />
                </>
              ) : (
                <>
                  保存并继续 Save & next <ArrowRight />
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-7 sm:px-8 lg:grid-cols-[230px_minmax(0,1fr)] lg:py-10">
        <Aside started={started} stepIndex={stepIndex} signing={showConsent} />
        <div className="space-y-4">
          {recoveryMessage && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">
              {recoveryMessage}
            </p>
          )}
          {content}
        </div>
      </div>
    </main>
  );
}

function Header() {
  return (
    <header className="border-b border-border/80 bg-white/95">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
            MRes Main Study
          </p>
          <h1 className="mt-1 text-lg font-semibold sm:text-xl">
            AV Acceptance Study{' '}
            <span className="text-muted-foreground">自动驾驶接受度研究</span>
          </h1>
        </div>
        <span className="hidden rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground sm:block">
          中英双语
        </span>
      </div>
    </header>
  );
}

function Aside({
  started,
  stepIndex,
  signing,
}: {
  started: boolean;
  stepIndex: number;
  signing: boolean;
}) {
  return (
    <aside className="space-y-5">
      <Progress
        value={
          started ? ((stepIndex + 1) / STEPS.length) * 100 : signing ? 7 : 4
        }
        className="rounded-2xl border bg-card p-5 shadow-sm"
      >
        <ProgressLabel>研究进度 Study progress</ProgressLabel>
        <span className="ml-auto text-sm tabular-nums text-muted-foreground">
          {started
            ? `${stepIndex + 1} / ${STEPS.length}`
            : signing
              ? '同意 Consent'
              : '准备 Ready'}
        </span>
      </Progress>
      <div className="rounded-2xl border bg-card p-5 text-sm leading-6 text-muted-foreground">
        <p className="font-semibold text-foreground">约 25–30 分钟</p>
        <p className="mt-2">
          每题会记录答题时间，只用于研究分析。您可以使用朗读、语音回答或“我不理解”。
        </p>
        <p className="mt-3 flex items-center gap-2 text-primary">
          <Database className="size-4" /> 回答逐页自动保存
        </p>
      </div>
    </aside>
  );
}

type WelcomeProps = {
  participantCode: string;
  setParticipantCode: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  error: string;
  saving: boolean;
  onContinue: () => void;
  speak: (v: string) => void;
};
function Welcome(p: WelcomeProps) {
  const intro =
    '欢迎参加。本研究了解香港和宁波老年人如何看待不同自动化等级及道路场景。不会收集姓名，您可以随时停止。Welcome. This study explores how older adults in Hong Kong and Ningbo respond to automation levels and road situations. Your name is not collected, and you may stop at any time.';
  return (
    <Card className="border-0 shadow-[0_24px_70px_rgba(35,63,78,0.12)] ring-1 ring-border">
      <CardHeader className="border-b">
        <div className="flex flex-col justify-between gap-4 sm:flex-row">
          <div>
            <CardTitle className="text-2xl">欢迎参加 Welcome</CardTitle>
            <p className="mt-2 text-muted-foreground">
              请先填写研究编号和地点。Please enter the study ID and site.
            </p>
          </div>
          <Button variant="outline" size="lg" onClick={() => p.speak(intro)}>
            <Volume2 /> 朗读 Read aloud
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-7 px-6 py-7 sm:px-8">
        <section className="rounded-xl border border-primary/15 bg-primary/5 p-5 text-[15px] leading-7">
          <p>
            本研究了解香港和宁波老年人如何看待不同自动化等级及道路场景。开始问卷前，您需要选择中文或英文知情同意书并电子签名。
          </p>
          <p className="mt-2 text-muted-foreground">
            This study explores how older adults in Hong Kong and Ningbo respond
            to automation levels and road situations. Before the questionnaire,
            you will choose and electronically sign either the Chinese or
            English consent form.
          </p>
        </section>
        <div className="space-y-2">
          <label htmlFor="participant-code" className="block font-semibold">
            参与者编号 Participant ID
          </label>
          <Input
            id="participant-code"
            value={p.participantCode}
            onChange={(e) => p.setParticipantCode(e.target.value)}
            className="h-12 text-base"
            placeholder="例如 HK06 / NB06"
          />
          <span className="block text-sm text-muted-foreground">
            请使用研究者提供的编号，不要填写姓名。
          </span>
        </div>
        <fieldset className="space-y-3">
          <legend className="font-semibold">研究地点 Study site</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Hong Kong 香港', 'HK'],
              ['Ningbo 宁波', 'NB'],
            ].map(([label, value]) => (
              <label
                key={value}
                className={`flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 ${p.city === value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-white'}`}
              >
                <input
                  type="radio"
                  name="city"
                  checked={p.city === value}
                  onChange={() => p.setCity(value)}
                  className="size-5 accent-[var(--primary)]"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {p.error && (
          <p className="rounded-xl bg-red-50 p-4 text-sm font-medium text-red-800">
            {p.error}
          </p>
        )}
        <div className="flex flex-col-reverse justify-between gap-3 border-t pt-6 sm:flex-row sm:items-center">
          <Link
            href="/researcher"
            className="text-sm font-medium text-muted-foreground hover:underline"
          >
            研究者入口 Researcher access
          </Link>
          <Button
            size="lg"
            className="h-12 min-w-48 text-base"
            disabled={p.saving}
            onClick={p.onContinue}
          >
            继续阅读同意书 Continue <ArrowRight />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AutomationGuide({ speak }: { speak: (value: string) => void }) {
  return (
    <section
      className="rounded-2xl border-2 border-primary/25 bg-white p-5 sm:p-6"
      aria-labelledby="automation-guide-title"
    >
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 id="automation-guide-title" className="text-xl font-semibold">
            L2、L3、L4 有什么区别？
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            What is the difference between L2, L3 and L4?
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => speak(AUTOMATION_GUIDE_SPEECH)}
        >
          <Volume2 /> 朗读解释 Read explanation
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {AUTOMATION_LEVELS.map((item) => (
          <article
            key={item.level}
            className="overflow-hidden rounded-xl border bg-card"
          >
            <div className="bg-primary px-4 py-3 text-primary-foreground">
              <p className="text-2xl font-bold">{item.level}</p>
              <p className="text-sm font-medium">
                {item.nameZh} · {item.nameEn}
              </p>
            </div>
            <div className="space-y-4 p-4 text-sm leading-6">
              <div>
                <p className="font-semibold text-foreground">
                  驾驶者要做什么？
                </p>
                <p>{item.driverZh}</p>
                <p className="mt-1 text-muted-foreground">{item.driverEn}</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">车辆会做什么？</p>
                <p>{item.vehicleZh}</p>
                <p className="mt-1 text-muted-foreground">{item.vehicleEn}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-4 rounded-lg bg-muted px-4 py-3 text-xs leading-5 text-muted-foreground">
        这是本研究使用的简化说明。实际功能会因车辆、道路和法规而不同。These are
        simplified definitions used consistently in this study. Actual functions
        vary by vehicle, road and regulation.
      </p>
    </section>
  );
}

function QuestionBlock({
  question,
  number,
  answer,
  update,
  onVisibilityChange,
  speak,
  speechLang,
}: {
  question: Question;
  number: number;
  answer: Answer;
  update: (v: Partial<Answer>) => void;
  onVisibilityChange: (id: string, visible: boolean) => void;
  speak: (v: string) => void;
  speechLang: string;
}) {
  const selected = answer.value ? answer.value.split(' | ') : [];
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    const element = fieldsetRef.current;
    if (!element) return;
    if (!('IntersectionObserver' in window)) {
      onVisibilityChange(question.id, true);
      return () => onVisibilityChange(question.id, false);
    }
    const observer = new IntersectionObserver(
      ([entry]) => onVisibilityChange(question.id, entry.isIntersecting),
      { threshold: 0.15 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      onVisibilityChange(question.id, false);
    };
  }, [onVisibilityChange, question.id]);

  return (
    <fieldset
      ref={fieldsetRef}
      className={`rounded-2xl border p-5 sm:p-6 ${answer.unclear ? 'border-amber-400 bg-amber-50/60' : 'bg-white'}`}
    >
      <legend className="sr-only">{question.zh}</legend>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold leading-6">
            <span className="mr-2 text-primary">{number}.</span>
            {question.zh}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {question.en}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Read question aloud"
          onClick={() => speak(`${question.zh}。${question.en}`)}
        >
          <Volume2 />
        </Button>
      </div>
      {question.type === 'scale' && (
        <div className="grid grid-cols-5 gap-2">
          {['1 很低', '2', '3', '4', '5 很高'].map((option) => (
            <button
              type="button"
              key={option}
              onClick={() =>
                update({ value: option.split(' ')[0], unclear: false })
              }
              className={`min-h-14 rounded-xl border px-1 text-sm font-semibold ${answer.value === option.split(' ')[0] ? 'border-primary bg-primary text-white' : 'bg-white hover:border-primary/50'}`}
            >
              {option}
            </button>
          ))}
        </div>
      )}
      {question.type === 'choice' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {question.options?.map((option) => (
            <button
              type="button"
              key={option}
              onClick={() => update({ value: option, unclear: false })}
              className={`min-h-13 rounded-xl border px-4 py-3 text-left text-sm font-medium ${answer.value === option ? 'border-primary bg-primary text-white' : 'bg-white hover:border-primary/50'}`}
            >
              {option}
            </button>
          ))}
        </div>
      )}
      {question.type === 'multi' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {question.options?.map((option) => {
            const isSelected = selected.includes(option);
            return (
              <button
                type="button"
                key={option}
                aria-pressed={isSelected}
                onClick={() => {
                  const nextSelected = isSelected
                    ? selected.filter((value) => value !== option)
                    : [...selected, option];
                  update({ value: nextSelected.join(' | '), unclear: false });
                }}
                className={`flex min-h-13 items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium ${isSelected ? 'border-primary bg-primary text-white' : 'bg-white hover:border-primary/50'}`}
              >
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded border ${isSelected ? 'border-white bg-white text-primary' : 'border-muted-foreground/40'}`}
                >
                  {isSelected && <Check className="size-3.5" />}
                </span>
                {option}
              </button>
            );
          })}
        </div>
      )}
      {question.type === 'text' && (
        <VoiceTextarea
          value={answer.value}
          speechLang={speechLang}
          onChange={(value, voiceUsed) =>
            update({
              value,
              voiceUsed: answer.voiceUsed || voiceUsed,
              unclear: false,
            })
          }
        />
      )}
      <button
        type="button"
        onClick={() => update({ unclear: !answer.unclear, value: '' })}
        className={`mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium ${answer.unclear ? 'border-amber-500 bg-amber-100 text-amber-950' : 'border-dashed bg-muted/40 text-muted-foreground'}`}
      >
        <CircleHelp className="size-4" /> 我不理解 / I do not understand
      </button>
    </fieldset>
  );
}

function VoiceTextarea({
  value,
  onChange,
  speechLang,
}: {
  value: string;
  onChange: (v: string, voice: boolean) => void;
  speechLang: string;
}) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(
    () =>
      typeof window !== 'undefined' &&
      Boolean(
        (
          window as unknown as {
            SpeechRecognition?: unknown;
            webkitSpeechRecognition?: unknown;
          }
        ).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown })
          .webkitSpeechRecognition,
      ),
  );
  const listen = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const R = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!R) {
      setSupported(false);
      return;
    }
    const r = new R();
    r.lang = speechLang;
    r.continuous = false;
    r.interimResults = false;
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.onresult = (event) => {
      const text = event.results[0][0].transcript;
      onChange(value ? `${value} ${text}` : text, true);
    };
    r.start();
  };
  return (
    <div className="space-y-3">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value, false)}
        rows={4}
        className="min-h-28 resize-y text-base leading-7"
        placeholder="可输入文字，或按下方按钮说话 / Type or use the microphone"
      />
      <Button
        type="button"
        variant={listening ? 'default' : 'outline'}
        onClick={listen}
        disabled={!supported}
      >
        {listening ? (
          <>
            <MicOff /> 正在聆听 Listening…
          </>
        ) : (
          <>
            <Mic /> 语音输入 Voice input
          </>
        )}
      </Button>
      {!supported && (
        <p className="text-sm text-muted-foreground">
          此浏览器不支持语音输入，请使用键盘。Voice input is unavailable in this
          browser.
        </p>
      )}
    </div>
  );
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: () => void;
  onend: () => void;
  onerror: () => void;
  onresult: (event: {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
  }) => void;
  start: () => void;
};

function Completion({ code }: { code: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5">
      <Card className="max-w-xl border-0 p-4 text-center shadow-xl ring-1 ring-border">
        <CardContent className="space-y-5 py-10">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-primary text-white">
            <Check className="size-8" />
          </div>
          <h1 className="text-3xl font-semibold">感谢您的参与</h1>
          <p className="text-xl text-muted-foreground">
            Thank you for taking part
          </p>
          <p className="rounded-xl bg-muted p-4 text-sm">
            参与者编号 Participant ID: <strong>{code.toUpperCase()}</strong>
            <br />
            回答已安全保存。Your responses have been saved.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
