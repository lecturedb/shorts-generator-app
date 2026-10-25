export default function GitHubPagesHome() {
  const repositoryUrl = process.env.GITHUB_REPOSITORY
    ? `https://github.com/${process.env.GITHUB_REPOSITORY}`
    : "https://github.com";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f5f6fa] p-6">
      <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-12">
        <p className="text-sm font-black tracking-widest text-violet-600">
          SHORTS STUDIO
        </p>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
          쇼츠 제작 자동화
        </h1>
        <p className="mt-5 text-base leading-7 text-slate-600">
          대본과 장면 구성부터 이미지, 영상, 더빙, 배경음악, 최종 편집까지
          한곳에서 관리하는 개인 제작자용 도구입니다.
        </p>
        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-black text-amber-950">정적 미리보기</h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            GitHub Pages는 서버 실행을 지원하지 않습니다. AI 생성, 프로젝트
            파일 저장, Python·FFmpeg 렌더링을 포함한 제작 기능은 저장소를
            내려받아 로컬 서버에서 실행해 주세요.
          </p>
        </div>
        <a
          className="mt-8 inline-flex h-11 items-center rounded-xl bg-violet-600 px-5 text-sm font-bold text-white transition hover:bg-violet-700"
          href={repositoryUrl}
        >
          GitHub 저장소에서 실행 방법 보기
        </a>
      </section>
    </main>
  );
}
