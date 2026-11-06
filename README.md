# 대성스틸 온실가스 인벤토리 시스템

Scope 1(경유·도시가스)·Scope 2(구매전력) 배출량 관리, 목표 대비 실적 대시보드, 감축 로드맵 시뮬레이터.
(Scope 3는 산정 대상에서 제외, 수도 사용량은 참고 지표)

## 폴더 구조

```
src/
  lib/            계산 로직(순수 함수 — 테스트 대상)
    constants.js    연도별 배출계수, KPI·로드맵 목표, 설정값(GOOGLE_WEBAPP_URL)
    emissions.js    배출량 계산, 입력 여부 판단, 숫자 표시
    planning.js     계절 프로파일, 연간 계획 자동 수립, 연말 예상(연환산)
    roadmap.js      로드맵 시나리오 계산
  services/
    db.js           Google Apps Script(구글 시트 A1) 저장·불러오기
  components/       화면(Dashboard, DataEntry, TargetSetting, Roadmap, YearPicker, 차트 등)
  App.jsx           상태 관리, 탭, 저장/불러오기 흐름
tests/              단위 테스트(lib)와 화면 시나리오 테스트(app)
.github/workflows/  테스트 → 빌드 → GitHub Pages 배포
```

## 개발

```bash
npm install
npm run dev      # 개발 서버
npm test         # 계산 로직·화면 시나리오 테스트
npm run build    # dist/ 생성
```

## 배포 (GitHub Pages)

1. 저장소 Settings → Pages → Source 를 **GitHub Actions** 로 설정
2. `main` 브랜치에 push 하면 테스트가 통과한 경우에만 자동 배포

> 빌드는 상대 경로(`base: './'`)라 저장소 하위 경로나 사내 웹서버 어디에 올려도 동작합니다.
> 테스트가 실패하면 배포되지 않으므로, 계산식이 의도치 않게 바뀌는 것을 막아 줍니다.

## 수정 시 주의

- **배출계수**: `src/lib/constants.js` 의 `EMISSION_FACTORS_BY_YEAR` 에서 연도별로 관리합니다.
  현재 2024~2026 값이 동일하므로, 연도별 공식 고시값과 출처를 확인해 교체하세요.
- **공식 감축 목표**: `ROADMAP_TARGETS` (2025 기준 579.116 tCO₂e).
- **저장소 주소**: `GOOGLE_WEBAPP_URL` (Apps Script 웹앱).
- 계산 로직을 바꾸면 `npm test` 로 기준값(2025 = 579.116 tCO₂e 등)이 유지되는지 확인하세요.
