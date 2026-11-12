// 테스트용 서버: 실제 Apps Script 코드(apps-script/Code.gs)를 가짜 스프레드시트 위에서 그대로 실행한다.
// 화면 ↔ 서버 연동(로그인·버전·마감·이력)을 실제 운영과 같은 규칙으로 검증하기 위함.
import { vi } from 'vitest';
import { createEnv } from '../apps-script/fakes';

export const ADMIN_PASSWORD = 'test-password';

export function startServer(seed = null, { override = {}, legacy = null, noAdmin = false } = {}) {
  const env = createEnv({ legacy });
  if (!noAdmin) env.props.ADMIN_PASSWORD = ADMIN_PASSWORD;
  if (seed) env.call({ action: 'save', data: JSON.stringify(seed) }); // 호환 모드로 초기 데이터 적재
  env.props.ENFORCE_AUTH = 'true';                                    // 이후는 운영과 같이 인증 필수
  const saves = [];
  const bodies = [];
  vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
    const body = JSON.parse(opts.body);
    bodies.push(body);
    const res = override[body.action] ? override[body.action](body) : env.call(body);
    if (body.action === 'save' && res.result === 'success') saves.push(JSON.parse(body.data));
    // __throw: 구버전 서버처럼 JSON이 아닌 응답이 오는 상황을 흉내 낸다
    return { json: async () => { if (res && res.__throw) throw new SyntaxError('Unexpected end of JSON input'); return res; } };
  }));
  return { env, saves, bodies };
}
