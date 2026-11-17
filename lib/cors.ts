import { NextRequest, NextResponse } from 'next/server';

const GITHUB_PAGES_ORIGIN = 'https://chuyuehuang118-debug.github.io';

export function withQuestionnaireCors(
  request: NextRequest,
  response: Response,
) {
  if (request.headers.get('origin') === GITHUB_PAGES_ORIGIN) {
    response.headers.set('Access-Control-Allow-Origin', GITHUB_PAGES_ORIGIN);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type',
    );
    response.headers.set('Access-Control-Max-Age', '86400');
    response.headers.append('Vary', 'Origin');
  }
  return response;
}

export function questionnaireCorsPreflight(request: NextRequest) {
  return withQuestionnaireCors(
    request,
    new NextResponse(null, { status: 204 }),
  );
}
