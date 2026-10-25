# 쇼츠 제작 자동화

개인 제작자가 `대본·장면 구성 → 이미지 → 영상 → 더빙 → 배경음악 → 최종 편집` 흐름으로 쇼츠를 만들고 관리하는 로컬 Next.js 애플리케이션이다.

## 개발 환경

- Node.js 22
- npm 10 및 `package-lock.json`
- Python 3.12
- FFmpeg 7.1

최종 MP4 렌더링은 Next.js 서버가 `python3`를 실행하고, Python이 `ffmpeg`와 `ffprobe`를 호출한다. 세 명령이 모두 `PATH`에 있어야 하며 앱은 렌더링 시작 전에 설치 여부를 확인한다.

macOS(Homebrew):

```bash
brew install python@3.12 ffmpeg
python3 --version
ffmpeg -version
ffprobe -version
```

Ubuntu/Debian에서는 배포판 패키지가 Python 3.12와 FFmpeg 7.1을 제공하는지 먼저 확인하고 설치한다. 기본 저장소 버전이 낮다면 Python과 FFmpeg 공식 설치 안내에 따라 3.12/7.1 이상을 설치한다.

```bash
sudo apt update
sudo apt install python3 ffmpeg
python3 --version
ffmpeg -version
ffprobe -version
```

FFmpeg 빌드에는 `libx264`, `libass`, `zoompan`, `xfade`, `afade`, `amix` 필터 지원이 필요하다. 설치가 없거나 명령을 찾을 수 없으면 앱은 원본과 기존 완료본을 변경하지 않고 README 확인 오류를 표시한다.

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 연다.

```bash
npm run lint
npm run build
```

## GitHub Pages 배포

`main` 브랜치에 푸시하면 `.github/workflows/deploy-pages.yml`이 정적 사이트를
빌드해 GitHub Pages에 배포한다. 최초 1회 저장소의 **Settings → Pages → Build
and deployment → Source**에서 **GitHub Actions**를 선택해야 한다.

로컬에서 정적 빌드를 확인하려면 다음 명령을 실행한다. 결과물은 `out/`에
생성된다.

```bash
GITHUB_REPOSITORY=owner/repository npm run build:pages
```

GitHub Pages는 정적 파일만 제공하므로 배포본은 제품 소개와 실행 안내만
표시한다. AI API 호출, 프로젝트 파일 저장, Python·FFmpeg 렌더링 등 실제 제작
기능은 `npm run dev` 또는 `npm run build && npm run start`로 실행한 Node.js
서버에서만 사용할 수 있다.

최종 편집 화면에서는 장면별 자막 문구·시작·종료 시간과 자막 스타일, 24/30/60fps, 표준/고품질 출력을 설정할 수 있다. 렌더링 결과는 검증을 통과한 MP4만 프로젝트의 `output/`과 `project.json`에 등록되며 실패·취소한 작업의 임시 디렉터리는 정리된다.

1차 로컬 실행, 프로젝트 저장 위치, 비밀정보와 장시간 작업 유지 정책은 [`docs/RUNTIME.md`](docs/RUNTIME.md)를 따른다. 제품 범위는 `PRD.md`, 단계별 작업은 `TODO.md`, 개발 규칙은 `AGENTS.md`를 기준으로 한다.
