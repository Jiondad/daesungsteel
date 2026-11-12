import { expect } from 'vitest';
import { waitFor } from '@testing-library/react';

// 화면 글자가 나타난 시점과 그래프 설정(Chart 생성)이 만들어지는 시점은 다를 수 있다(그래프는 화면 반영 뒤에 그려진다).
// 느린 환경(CI)에서도 안정적으로 검사하도록, 조건을 만족하는 최신 그래프 설정이 나올 때까지 기다린다.
export async function waitForChart(isTarget, isReady) {
  let found;
  await waitFor(() => {
    found = (globalThis.__chartConfigs || []).filter(isTarget).at(-1);
    expect(found, '그래프 설정이 아직 없습니다').toBeTruthy();
    expect(isReady(found), '그래프에 데이터가 아직 반영되지 않았습니다').toBe(true);
  }, { timeout: 4000 });
  return found;
}

export const hasValue = (series) => series.some((v) => v !== null && v !== undefined);
