import assert from "node:assert/strict";
import test from "node:test";

import { summarizeAudioSamples } from "../lib/audio-waveform.ts";

test("간략 파형에서 무음과 발화 구간을 구분한다", () => {
  const sampleRate = 100;
  const samples = new Float32Array(sampleRate * 4);
  for (let index = sampleRate; index < sampleRate * 3; index += 1) {
    samples[index] = Math.sin(index / 2) * 0.7;
  }
  const bars = summarizeAudioSamples(samples, sampleRate, 0, 4, 8);
  assert.equal(bars.length, 8);
  assert.equal(bars.slice(0, 2).every((bar) => !bar.active), true);
  assert.equal(bars.slice(2, 6).every((bar) => bar.active), true);
  assert.equal(bars.slice(6).every((bar) => !bar.active), true);
});

test("지정한 오디오 구간만 파형으로 축약한다", () => {
  const sampleRate = 100;
  const samples = new Float32Array(sampleRate * 4);
  samples.fill(0.5, sampleRate * 2, sampleRate * 3);
  const bars = summarizeAudioSamples(samples, sampleRate, 2, 1, 4);
  assert.equal(bars.length, 4);
  assert.equal(bars.every((bar) => bar.active), true);
});
