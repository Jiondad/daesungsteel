// Google Apps Script 웹앱(서버 v2) 접근 계층. 화면 컴포넌트는 이 파일의 함수만 호출한다.
// 서버는 시트를 표(실적·목표·이력 등)로 나누어 저장하고, 관리자 세션·버전 확인·백업·이력 기록을 담당한다.
import { GOOGLE_WEBAPP_URL } from '../lib/constants';

async function post(payload) {
  const res = await fetch(GOOGLE_WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// 저장된 전체 상태를 불러온다. 반환: { result, data(JSON 문자열), version, changeLog, legacy }
export function loadDbResponse() {
  return post({ action: 'load', cellLocation: 'A1' });
}

// 관리자 로그인. 성공하면 { user, sessionToken } 을 돌려준다.
export function authenticate(password) {
  return post({ action: 'auth', password });
}

export function logoutSession(sessionToken) {
  return post({ action: 'logout', sessionToken });
}

// 전체 상태 저장. baseVersion 은 불러올 때 받은 버전이며, 서버가 다른 사용자의 먼저 저장을 감지하는 데 쓴다.
export function saveDbState(state, { sessionToken, baseVersion, log, unlockReason } = {}) {
  return post({ action: 'save', cellLocation: 'A1', sessionToken, baseVersion, log, unlockReason, data: JSON.stringify(state) });
}
