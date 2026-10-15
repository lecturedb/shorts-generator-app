# 쇼츠 제작 자동화

개인 제작자가 `대본·장면 구성 → 이미지 → 영상 → 더빙 → 배경음악 → 최종 편집` 흐름으로 쇼츠를 만들고 관리하는 로컬 Next.js 애플리케이션이다.

## 개발 환경

- Node.js 22
- npm 10 및 `package-lock.json`
- Python 3.12
- FFmpeg 7.1

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 연다.

```bash
npm run lint
npm run build
```

1차 로컬 실행, 프로젝트 저장 위치, 비밀정보와 장시간 작업 유지 정책은 [`docs/RUNTIME.md`](docs/RUNTIME.md)를 따른다. 제품 범위는 `PRD.md`, 단계별 작업은 `TODO.md`, 개발 규칙은 `AGENTS.md`를 기준으로 한다.
