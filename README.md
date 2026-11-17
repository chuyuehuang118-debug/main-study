# AV Acceptance Main Study Questionnaire

A bilingual MRes main-study questionnaire for older adults in Hong Kong and Ningbo. The site records participant profiles, automation-level understanding, scenario ratings, voice-assisted open responses, per-question timing, hesitation indicators, and signed consent PDFs.

## 主要功能

- 中英文问卷与朗读功能
- L2、L3、L4 自动驾驶等级说明
- 香港与宁波出行画像问题
- 道路施工、行人横穿与暴雨场景
- 语音输入与“我不理解”选项
- 每题答题时间与犹豫指标
- 中英文电子知情同意书及 PDF 导出
- 受密码保护的研究者数据后台
- D1 结构化数据与 R2 签名文件分离存储

## Privacy

This repository contains application source code and blank consent-form templates only. It does not contain participant responses, signed consent records, researcher passwords, or production environment secrets.

## Local development

```bash
pnpm install
pnpm dev
```

Runtime bindings and secrets must be configured separately. Set `RESEARCHER_PASSCODE` in the deployment environment; never commit it to the repository.

## Build

```bash
pnpm build
```

## Research use

Before recruitment, confirm that the electronic-consent procedure and participant information materials match the institution's approved ethics protocol.
