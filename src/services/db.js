// Google Apps Script 웹앱(구글 시트 A1 셀) 저장소 접근 계층.
// 화면 컴포넌트는 이 파일의 함수만 호출한다. (4단계에서 인증 토큰·이력 기록을 이곳에 추가)
import { GOOGLE_WEBAPP_URL } from '../lib/constants';

async function post(payload) {
  const res = await fetch(GOOGLE_WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// 저장된 전체 상태(JSON 문자열)를 불러온다. 반환: { result, data }
export function loadDbResponse() {
  return post({ action: 'load', cellLocation: 'A1' });
}

// 전체 상태 객체를 저장한다. 반환: { result, ... }
export function saveDbState(state) {
  return post({ action: 'save', cellLocation: 'A1', data: JSON.stringify(state) });
}
