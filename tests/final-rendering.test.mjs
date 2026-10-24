import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Python·FFmpeg가 장면, 전환, 오디오와 자막을 검증된 MP4로 합성한다", { timeout: 60_000 }, async () => {
  const workDirectory = await mkdtemp(path.join(tmpdir(), "shorts-render-test-"));
  try {
    const image = path.join(repositoryRoot, "public", "samples", "scene-01.png");
    const inputVideo = path.join(repositoryRoot, "public", "samples", "clip-01.mp4");
    const narration = path.join(repositoryRoot, "public", "samples", "narration.mp3");
    const music = path.join(repositoryRoot, "public", "samples", "background.mp3");
    const outputPath = path.join(workDirectory, "render.mp4");
    const manifest = {
      outputPath,
      durationSeconds: 2,
      settings: { aspectRatio: "9:16", width: 180, height: 320, fps: 24, quality: "standard" },
      clips: [
        { sceneId: "scene-01", assetId: "asset-01", mediaType: "image", inputPath: image, startSeconds: 0, durationSeconds: 1, trimStartSeconds: 0, imageMotion: { type: "zoom-in", start: { xPercent: 50, yPercent: 50, scale: 1 }, end: { xPercent: 50, yPercent: 50, scale: 1.1 }, startSeconds: 0, durationSeconds: 1 } },
        { sceneId: "scene-02", assetId: "asset-02", mediaType: "video", inputPath: inputVideo, startSeconds: 1, durationSeconds: 1, trimStartSeconds: 0.2, imageMotion: null },
      ],
      transitions: [{ id: "transition-scene-02", fromSceneId: "scene-01", toSceneId: "scene-02", type: "dissolve", durationSeconds: 0.25 }],
      narration: { inputPath: narration, volume: 0.8, segments: [{ sceneId: "scene-01", startSeconds: 0, endSeconds: 0.6, sourceStartSeconds: 0, durationSeconds: 0.6 }, { sceneId: "scene-02", startSeconds: 1, endSeconds: 2, sourceStartSeconds: 0.6, durationSeconds: 1 }] },
      music: { inputPath: music, assetId: "music", startSeconds: 0, endSeconds: 2, volume: 0.1, fadeInSeconds: 0.2, fadeOutSeconds: 0.2 },
      subtitles: { enabled: true, alignment: "estimated", style: { fontFamily: "sans-serif", fontSize: 28, color: "#ffffff", outlineColor: "#000000", outlineWidth: 2, position: "bottom" }, cues: [{ id: "subtitle-scene-01", sceneId: "scene-01", text: "자막 테스트 문장입니다", startSeconds: 0, endSeconds: 1 }] },
    };
    const manifestPath = path.join(workDirectory, "manifest.json");
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    await execFileAsync("python3", [path.join(repositoryRoot, "scripts", "render_final.py"), manifestPath]);
    const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,duration", "-of", "json", outputPath]);
    const probe = JSON.parse(stdout);
    const video = probe.streams.find((stream) => stream.codec_type === "video");
    assert.equal(video.width, 180);
    assert.equal(video.height, 320);
    assert.ok(Number(probe.format.duration) >= 1.9);
    const audio = probe.streams.find((stream) => stream.codec_type === "audio");
    assert.ok(audio);
    assert.ok(Number(audio.duration) >= 1.9);
    assert.ok((await readFile(outputPath)).byteLength > 0);
    const subtitles = await readFile(path.join(workDirectory, "subtitles.ass"), "utf8");
    assert.match(subtitles, /자막\\h테스트\\N문장입니다/);
    assert.doesNotMatch(subtitles, /자\\N막/);
    assert.match(subtitles, /Arial,28,[^\n]+,121,121,/);
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
});
