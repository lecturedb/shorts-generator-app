export interface WaveformBar {
  amplitude: number;
  active: boolean;
}

export function summarizeAudioSamples(
  samples: Float32Array,
  sampleRate: number,
  startSeconds: number,
  durationSeconds: number,
  bucketCount: number,
): WaveformBar[] {
  if (sampleRate <= 0 || durationSeconds <= 0 || bucketCount <= 0) return [];
  const startSample = Math.max(0, Math.floor(startSeconds * sampleRate));
  const endSample = Math.min(samples.length, Math.ceil((startSeconds + durationSeconds) * sampleRate));
  if (endSample <= startSample) return [];

  const rmsValues = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = startSample + Math.floor(((endSample - startSample) * index) / bucketCount);
    const bucketEnd = startSample + Math.floor(((endSample - startSample) * (index + 1)) / bucketCount);
    let sumOfSquares = 0;
    const sampleCount = Math.max(1, bucketEnd - bucketStart);
    for (let sampleIndex = bucketStart; sampleIndex < bucketEnd; sampleIndex += 1) {
      const value = samples[sampleIndex] ?? 0;
      sumOfSquares += value * value;
    }
    return Math.sqrt(sumOfSquares / sampleCount);
  });
  const peak = Math.max(...rmsValues, 0.001);
  const sorted = [...rmsValues].sort((left, right) => left - right);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.2)] ?? 0;
  const silenceThreshold = Math.min(peak * 0.45, Math.max(0.008, peak * 0.08, noiseFloor * 2.5));

  return rmsValues.map((rms) => ({
    amplitude: Math.max(0.04, Math.min(1, Math.sqrt(rms / peak))),
    active: rms > silenceThreshold,
  }));
}
