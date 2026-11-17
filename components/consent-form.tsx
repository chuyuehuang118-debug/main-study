'use client';

import { useRef, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Eraser,
  FileSignature,
  Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Language = 'zh' | 'en';

const CHINESE_STATEMENTS = [
  '本人已阅读声明，项目组织者已经我解释了研究项目的性质和宗旨。本人理解并同意参与。',
  '本人理解项目的目的和在项目中的参与作用。',
  '本人明白可以在研究项目的任何阶段退出并在数据处理流程开始前提出撤回数据信息的要求，不会因此影响现在以及将来的状况。',
  '本人明白研究过程中提供的信息可能会被包括在发表的论文中，也可能会根据发表论文的要求上传至第三方机构，但本人身份不会被确认，个人的调查结果始终是被保密。',
  '本人知道面谈/数据采集，将会被录音/拍摄',
  '本人了解数据会根据数据保护相关法律进行存储',
  '本人知道，如果需要进一步有关研究的信息可以联系研究者或者导师，如果需要对参与研究提出投诉则可以联系宁波诺丁汉大学科研诚信与伦理道德委员会。',
];

const ENGLISH_STATEMENTS = [
  'I have read the Participant Information Sheet and the nature and purpose of the research project has been explained to me. I understand and agree to take part.',
  'I understand the purpose of the research project and my involvement in it.',
  'I understand that I may withdraw from the research project at any stage while my data can be withdrawn prior the completion of the data processing, and that this will not affect my status now or in the future.',
  'I understand that while information gained during the study may be published and/or be deposited in a third-party organization according to the publication requirement, I will not be identified and my personal results will remain confidential.',
  'I understand that the interview/data collection. will be recorded/filmed.',
  'I understand that data will be stored in accordance with data protection laws.',
  'I understand that I may contact the researcher or supervisor if I require more information about the research, and that I may contact the Research Integrity and Ethics Committee of the University of Nottingham Ningbo China if I wish to make a complaint related to my involvement in the research.',
];

const PROJECT_ZH =
  '开发与评估一套面向老年群体的跨文化自动驾驶汽车（AV）接受度工具包：以香港与宁波为比较案例';
const PROJECT_EN =
  'Developing and Evaluating a Cross-Cultural Autonomous Vehicle (AV) Acceptance Toolkit for Older Adults: A Comparative Study between Hong Kong and Ningbo';

type ConsentFormProps = {
  participantCode: string;
  city: string;
  submissionId: string;
  onBack: () => void;
  onSigned: () => void;
  speak: (value: string) => void;
};

export function ConsentForm({
  participantCode,
  city,
  submissionId,
  onBack,
  onSigned,
  speak,
}: ConsentFormProps) {
  const [language, setLanguage] = useState<Language>('zh');
  const [checks, setChecks] = useState<boolean[]>(Array(7).fill(false));
  const [printName, setPrintName] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const statements =
    language === 'zh' ? CHINESE_STATEMENTS : ENGLISH_STATEMENTS;

  const changeLanguage = (next: Language) => {
    setLanguage(next);
    setChecks(Array(7).fill(false));
    setPrintName('');
    clearSignature();
    setError('');
  };

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    };
  };

  const beginDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    const context = canvas.getContext('2d');
    if (!context) return;
    const p = point(event);
    context.beginPath();
    context.moveTo(p.x, p.y);
    drawing.current = true;
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const p = point(event);
    context.lineWidth = 4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#102f3c';
    context.lineTo(p.x, p.y);
    context.stroke();
    setHasSignature(true);
  };

  const endDrawing = () => {
    drawing.current = false;
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const createSignedPdf = async (signedAt: Date) => {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const sourceResponse = await fetch(
      language === 'zh' ? '/consent/consent-zh.pdf' : '/consent/consent-en.pdf',
    );
    if (!sourceResponse.ok) throw new Error('Unable to load consent form');
    const source = await PDFDocument.load(await sourceResponse.arrayBuffer());
    const output = await PDFDocument.create();
    const [page] = await output.copyPages(source, [0]);
    output.addPage(page);
    const signature = await output.embedPng(
      canvasRef.current!.toDataURL('image/png'),
    );
    const dateText = signedAt.toLocaleDateString('en-CA');

    if (language === 'zh') {
      page.drawImage(signature, { x: 132, y: 346, width: 240, height: 34 });
      const font = await output.embedFont(StandardFonts.Helvetica);
      page.drawText(dateText, {
        x: 116,
        y: 322,
        size: 11,
        font,
        color: rgb(0.05, 0.12, 0.16),
      });
    } else {
      page.drawImage(signature, { x: 128, y: 311, width: 220, height: 31 });
      const font = await output.embedFont(StandardFonts.Helvetica);
      const typedName = printName.trim();
      const nameSize = Math.max(
        7.5,
        Math.min(10.5, (195 * 10.5) / font.widthOfTextAtSize(typedName, 10.5)),
      );
      page.drawText(typedName, {
        x: 150,
        y: 279,
        size: nameSize,
        font,
        color: rgb(0.05, 0.12, 0.16),
        maxWidth: 200,
      });
      page.drawText(dateText, {
        x: 395,
        y: 279,
        size: 10.5,
        font,
        color: rgb(0.05, 0.12, 0.16),
      });
    }
    output.setTitle(
      language === 'zh'
        ? '参与者同意书（已签署）'
        : 'Signed Participant Consent Form',
    );
    output.setSubject(`Participant ${participantCode.toUpperCase()} · ${city}`);
    output.setCreationDate(signedAt);
    return output.save();
  };

  const submit = async () => {
    if (!checks.every(Boolean)) {
      setError(
        language === 'zh'
          ? '请逐项确认全部七项内容。'
          : 'Please confirm all seven statements.',
      );
      return;
    }
    if (language === 'en' && !printName.trim()) {
      setError('Please enter the participant’s print name.');
      return;
    }
    if (!hasSignature) {
      setError(
        language === 'zh'
          ? '请在签名框内签名。'
          : 'Please sign inside the signature box.',
      );
      return;
    }

    setSaving(true);
    setError('');
    try {
      const signedAt = new Date();
      const pdfBytes = await createSignedPdf(signedAt);
      const blob = new Blob([pdfBytes as BlobPart], {
        type: 'application/pdf',
      });
      const fileName = `${participantCode.trim().toUpperCase()}-consent-${language}-${signedAt.toLocaleDateString('en-CA')}.pdf`;
      const form = new FormData();
      form.append('file', blob, fileName);
      form.append('submissionId', submissionId);
      form.append('participantCode', participantCode.trim().toUpperCase());
      form.append('city', city);
      form.append('language', language);
      form.append('signedAt', signedAt.toISOString());
      const response = await fetch('/api/consent', {
        method: 'POST',
        body: form,
      });
      if (!response.ok) throw new Error('Unable to save consent');

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onSigned();
    } catch {
      setError(
        language === 'zh'
          ? '暂时无法保存知情同意书，请检查网络后重试。'
          : 'Unable to save the consent form. Please check the connection and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const spoken =
    language === 'zh'
      ? `参与者同意书。项目标题：${PROJECT_ZH}。研究者姓名，魏灵冰。导师姓名，Yoke Chin Lai。${CHINESE_STATEMENTS.join('。')}`
      : `Participant Consent Form. Project title: ${PROJECT_EN}. Researcher's name: Lingbing Wei. Supervisor's name: Yoke Chin Lai. ${ENGLISH_STATEMENTS.join(' ')}`;

  return (
    <Card className="overflow-hidden border-0 shadow-[0_24px_70px_rgba(35,63,78,0.12)] ring-1 ring-border">
      <CardHeader className="border-b bg-white px-5 py-6 sm:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="mb-2 text-xs font-bold tracking-[.14em] text-primary uppercase">
              Consent before questionnaire
            </p>
            <CardTitle className="text-2xl sm:text-3xl">
              知情同意书 Consent form
            </CardTitle>
          </div>
          <Button variant="outline" size="lg" onClick={() => speak(spoken)}>
            <Volume2 /> 朗读 Read aloud
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-7 px-5 py-6 sm:px-8 sm:py-8">
        <section className="rounded-xl border border-primary/15 bg-primary/5 p-5 text-sm leading-6">
          <p className="font-semibold">
            请选择一种语言阅读并签署。Please choose one language to read and
            sign.
          </p>
          <p className="mt-2 text-muted-foreground">
            参与者编号 Participant ID:{' '}
            <strong>{participantCode.toUpperCase()}</strong> · {city}
          </p>
        </section>

        <div
          className="grid gap-3 sm:grid-cols-2"
          aria-label="Consent language"
        >
          <button
            type="button"
            aria-pressed={language === 'zh'}
            onClick={() => changeLanguage('zh')}
            className={`min-h-14 rounded-xl border px-4 text-left font-semibold ${language === 'zh' ? 'border-primary bg-primary text-white' : 'bg-white'}`}
          >
            中文同意书
          </button>
          <button
            type="button"
            aria-pressed={language === 'en'}
            onClick={() => changeLanguage('en')}
            className={`min-h-14 rounded-xl border px-4 text-left font-semibold ${language === 'en' ? 'border-primary bg-primary text-white' : 'bg-white'}`}
          >
            English consent form
          </button>
        </div>

        <section className="rounded-2xl border bg-white p-5 sm:p-7">
          <h2 className="text-center text-xl font-bold">
            {language === 'zh' ? '参与者同意书' : 'PARTICIPANT CONSENT FORM'}
          </h2>
          <dl className="mt-6 grid gap-3 text-sm leading-6 sm:grid-cols-[150px_1fr]">
            <dt className="font-semibold">
              {language === 'zh' ? '项目标题' : 'Project title'}
            </dt>
            <dd>{language === 'zh' ? PROJECT_ZH : PROJECT_EN}</dd>
            <dt className="font-semibold">
              {language === 'zh' ? '研究者姓名' : 'Researcher’s name'}
            </dt>
            <dd>{language === 'zh' ? '魏灵冰' : 'Lingbing Wei'}</dd>
            <dt className="font-semibold">
              {language === 'zh' ? '导师姓名' : 'Supervisor’s name'}
            </dt>
            <dd>Yoke Chin Lai</dd>
          </dl>
          <div className="mt-7 space-y-3">
            {statements.map((statement, index) => (
              <label
                key={statement}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm leading-6 ${checks[index] ? 'border-primary bg-primary/5' : 'bg-white'}`}
              >
                <input
                  type="checkbox"
                  checked={checks[index]}
                  onChange={(event) =>
                    setChecks((current) =>
                      current.map((value, itemIndex) =>
                        itemIndex === index ? event.target.checked : value,
                      ),
                    )
                  }
                  className="mt-1 size-5 shrink-0 accent-[var(--primary)]"
                />
                <span>
                  <strong className="mr-2 text-primary">{index + 1}.</strong>
                  {statement}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-6 rounded-xl bg-muted p-4 text-sm leading-6">
            {language === 'zh' ? (
              <>
                <p className="font-semibold">联系方式</p>
                <p className="mt-2">
                  研究者：Lingbing.WEI@nottingham.edu.cn
                  <br />
                  导师：Yoke-Chin.Lai@nottingham.edu.cn
                  <br />
                  宁波诺丁汉大学科研诚信与伦理道德委员会秘书：Ms Joanna
                  Huang（Joanna.Huang@nottingham.edu.cn）
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">Contact details</p>
                <p className="mt-2">
                  Researcher: Lingbing.WEI@nottingham.edu.cn
                  <br />
                  Supervisor: Yoke-Chin.Lai@nottingham.edu.cn
                  <br />
                  University Research Integrity and Ethics Committee
                  Coordinator: Joanna.Huang@nottingham.edu.cn
                </p>
              </>
            )}
          </div>
          <a
            href={
              language === 'zh'
                ? '/consent/consent-zh.pdf'
                : '/consent/consent-en.pdf'
            }
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
          >
            <Download className="size-4" />
            {language === 'zh' ? '查看原始 PDF' : 'View the original PDF'}
          </a>
        </section>

        {language === 'en' && (
          <div className="space-y-2">
            <label htmlFor="print-name" className="font-semibold">
              Print name
            </label>
            <Input
              id="print-name"
              autoComplete="name"
              value={printName}
              onChange={(event) => setPrintName(event.target.value)}
              className="h-12 text-base"
            />
          </div>
        )}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">
                {language === 'zh' ? '参与者签名' : 'Participant signature'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {language === 'zh'
                  ? '请用手指、触控笔或鼠标在框内签名。'
                  : 'Sign with a finger, stylus or mouse.'}
              </p>
            </div>
            <Button type="button" variant="outline" onClick={clearSignature}>
              <Eraser />
              {language === 'zh' ? '清除' : 'Clear'}
            </Button>
          </div>
          <canvas
            ref={canvasRef}
            width={900}
            height={240}
            onPointerDown={beginDrawing}
            onPointerMove={draw}
            onPointerUp={endDrawing}
            onPointerCancel={endDrawing}
            onPointerLeave={endDrawing}
            className="h-40 w-full touch-none rounded-xl border-2 border-dashed border-primary/40 bg-white shadow-inner"
            aria-label="Signature pad"
          />
          <p className="text-sm text-muted-foreground">
            {language === 'zh'
              ? '日期将自动填入签署的 PDF。'
              : 'The signing date will be added to the PDF automatically.'}
          </p>
        </section>

        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          {language === 'zh'
            ? '签名 PDF 会与问卷回答分开保存。提交后，您的设备也会下载一份副本。'
            : 'The signed PDF is stored separately from questionnaire responses. A copy will also download to this device after submission.'}
        </section>
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-4 text-sm font-medium text-red-800"
          >
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse justify-between gap-3 border-t pt-6 sm:flex-row sm:items-center">
          <Button variant="ghost" onClick={onBack} disabled={saving}>
            <ArrowLeft />
            返回 Back
          </Button>
          <Button
            size="lg"
            className="h-12 min-w-52 text-base"
            onClick={submit}
            disabled={saving}
          >
            {saving ? (
              <>保存中 Saving…</>
            ) : (
              <>
                <FileSignature />
                {language === 'zh' ? '签署并开始问卷' : 'Sign and start'}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
