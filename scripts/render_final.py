#!/usr/bin/env python3
"""Render a validated shorts manifest by invoking FFmpeg with argument arrays."""

from __future__ import annotations

import json
import signal
import subprocess
import sys
from pathlib import Path
from typing import Any


active_process: subprocess.Popen[str] | None = None

# libass renders the same Korean fallback font about 18% smaller than a browser's
# CSS pixel size. Keep the saved/user-facing size in CSS pixels and compensate in
# the ASS scale so the editor preview and exported MP4 have matching glyphs.
ASS_CSS_FONT_SCALE_PERCENT = 121


def terminate(_signum: int, _frame: object) -> None:
    global active_process
    if active_process and active_process.poll() is None:
        active_process.terminate()
        try:
            active_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            active_process.kill()
    raise SystemExit(130)


signal.signal(signal.SIGTERM, terminate)
signal.signal(signal.SIGINT, terminate)


def fail(message: str) -> None:
    raise RuntimeError(message)


def ass_time(seconds: float) -> str:
    centiseconds = max(0, round(seconds * 100))
    hours, remainder = divmod(centiseconds, 360_000)
    minutes, remainder = divmod(remainder, 6_000)
    whole_seconds, fraction = divmod(remainder, 100)
    return f"{hours}:{minutes:02d}:{whole_seconds:02d}.{fraction:02d}"


def ass_color(value: str) -> str:
    red, green, blue = value[1:3], value[3:5], value[5:7]
    return f"&H00{blue}{green}{red}".upper()


def ass_escape(value: str) -> str:
    return value.replace("\\", r"\\").replace("{", r"\{").replace("}", r"\}")


def text_units(value: str) -> float:
    return sum(0.87 if ord(character) > 127 else 0.55 for character in value)


def ass_text(value: str, max_units: float) -> str:
    wrapped_lines: list[str] = []
    paragraphs = value.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    for paragraph in paragraphs:
        words = paragraph.split()
        if not words:
            wrapped_lines.append("")
            continue
        line: list[str] = []
        line_units = 0.0
        for word in words:
            word_units = text_units(word)
            requested_units = word_units if not line else line_units + 0.3 + word_units
            if line and requested_units > max_units:
                wrapped_lines.append(r"\h".join(ass_escape(item) for item in line))
                line = [word]
                line_units = word_units
            else:
                line.append(word)
                line_units = requested_units
        wrapped_lines.append(r"\h".join(ass_escape(item) for item in line))
    return r"\N".join(wrapped_lines)


def write_subtitles(manifest: dict[str, Any], destination: Path) -> None:
    subtitles = manifest["subtitles"]
    style = subtitles["style"]
    font_names = {"sans-serif": "Arial", "serif": "Times New Roman", "monospace": "Courier New"}
    alignments = {"top": 8, "middle": 5, "bottom": 2}
    margin = max(24, round(manifest["settings"]["height"] * 0.07))
    max_text_units = max(8, (manifest["settings"]["width"] - margin * 2) / style["fontSize"])
    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {manifest['settings']['width']}",
        f"PlayResY: {manifest['settings']['height']}",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        "Style: Default,{font},{size},{primary},&H000000FF,{outline},&H80000000,-1,0,0,0,{font_scale},{font_scale},0,0,1,{outline_width},0,{alignment},{margin},{margin},{margin},1".format(
            font=font_names[style["fontFamily"]],
            size=style["fontSize"],
            font_scale=ASS_CSS_FONT_SCALE_PERCENT,
            primary=ass_color(style["color"]),
            outline=ass_color(style["outlineColor"]),
            outline_width=style["outlineWidth"],
            alignment=alignments[style["position"]],
            margin=margin,
        ),
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    lines.extend(
        f"Dialogue: 0,{ass_time(cue['startSeconds'])},{ass_time(cue['endSeconds'])},Default,,0,0,0,,{ass_text(cue['text'], max_text_units)}"
        for cue in subtitles["cues"]
        if cue["text"].strip()
    )
    destination.write_text("\n".join(lines) + "\n", encoding="utf-8")


def escape_filter_path(value: Path) -> str:
    return str(value).replace("\\", r"\\").replace(":", r"\:").replace("'", r"\'")


def motion_filter(motion: dict[str, Any], width: int, height: int, fps: int, duration: float) -> str:
    frames = max(1, round(duration * fps))
    start_frame = max(0, round(motion["startSeconds"] * fps))
    motion_frames = max(1, round(motion["durationSeconds"] * fps))
    start, end = motion["start"], motion["end"]
    progress = f"min(1,max(0,(on-{start_frame})/{motion_frames}))"
    zoom = f"{start['scale']}+({end['scale']}-{start['scale']})*{progress}"
    x_percent = f"{start['xPercent']}+({end['xPercent']}-{start['xPercent']})*{progress}"
    y_percent = f"{start['yPercent']}+({end['yPercent']}-{start['yPercent']})*{progress}"
    return (
        f"scale={width * 3}:{height * 3}:force_original_aspect_ratio=increase,"
        f"crop={width * 3}:{height * 3},"
        f"zoompan=z='{zoom}':x='(iw-iw/zoom)*({x_percent})/100':y='(ih-ih/zoom)*({y_percent})/100':"
        f"d={frames}:s={width}x{height}:fps={fps},trim=duration={duration},setpts=PTS-STARTPTS,fps={fps},format=yuv420p,settb=AVTB"
    )


def build_command(manifest: dict[str, Any], subtitle_path: Path | None) -> list[str]:
    settings = manifest["settings"]
    width, height, fps = settings["width"], settings["height"], settings["fps"]
    clips = manifest["clips"]
    if not clips:
        fail("렌더링할 장면이 없습니다.")
    args = ["ffmpeg", "-hide_banner", "-y"]
    for clip in clips:
        if clip["mediaType"] == "image":
            args.extend(["-framerate", str(fps), "-loop", "1", "-t", str(clip["durationSeconds"]), "-i", clip["inputPath"]])
        else:
            args.extend(["-ss", str(clip["trimStartSeconds"]), "-t", str(clip["durationSeconds"]), "-i", clip["inputPath"]])
    narration_index = len(clips) if manifest["narration"] else None
    if manifest["narration"]:
        args.extend(["-i", manifest["narration"]["inputPath"]])
    music_index = len(clips) + (1 if manifest["narration"] else 0) if manifest["music"] else None
    if manifest["music"]:
        args.extend(["-stream_loop", "-1", "-i", manifest["music"]["inputPath"]])

    filters: list[str] = []
    transitions = manifest["transitions"]
    for index, clip in enumerate(clips):
        if clip["mediaType"] == "image" and clip.get("imageMotion"):
            video_filter = motion_filter(clip["imageMotion"], width, height, fps, clip["durationSeconds"])
        else:
            video_filter = (
                f"scale={width}:{height}:force_original_aspect_ratio=increase,"
                f"crop={width}:{height},trim=duration={clip['durationSeconds']},setpts=PTS-STARTPTS,"
                f"fps={fps},format=yuv420p,settb=AVTB"
            )
        filters.append(f"[{index}:v]{video_filter}[v{index}]")

    current = "v0"
    elapsed = float(clips[0]["durationSeconds"])
    for index in range(1, len(clips)):
        transition = transitions[index - 1]
        next_label = f"v{index}"
        output_label = f"joined{index}"
        if transition["type"] == "none" or transition["durationSeconds"] <= 0:
            filters.append(f"[{current}][{next_label}]concat=n=2:v=1:a=0[{output_label}]")
        else:
            duration = float(transition["durationSeconds"])
            padded = f"padded{index}"
            filters.append(f"[{next_label}]tpad=start_mode=clone:start_duration={duration},setpts=PTS-STARTPTS,fps={fps},format=yuv420p,settb=AVTB[{padded}]")
            transition_name = "dissolve" if transition["type"] == "dissolve" else "fadeblack"
            filters.append(f"[{current}][{padded}]xfade=transition={transition_name}:duration={duration}:offset={max(0, elapsed - duration)}[{output_label}]")
        current = output_label
        elapsed += float(clips[index]["durationSeconds"])

    video_output = current
    target_duration = float(manifest.get("durationSeconds", elapsed))
    if target_duration > elapsed + 0.001:
        extended = "extended"
        filters.append(f"[{current}]tpad=stop_mode=clone:stop_duration={target_duration - elapsed},fps={fps},format=yuv420p,settb=AVTB[{extended}]")
        video_output = extended
        elapsed = target_duration
    if subtitle_path is not None:
        subtitle_input = video_output
        video_output = "captioned"
        filters.append(f"[{subtitle_input}]subtitles=filename='{escape_filter_path(subtitle_path)}'[{video_output}]")

    audio_labels: list[str] = []
    narration = manifest["narration"]
    if narration and narration_index is not None:
        segment_count = len(narration["segments"])
        segment_sources = [f"narrsrc{index}" for index in range(segment_count)]
        if segment_count > 1:
            filters.append(
                f"[{narration_index}:a]asplit={segment_count}"
                + "".join(f"[{label}]" for label in segment_sources)
            )
        for index, segment in enumerate(narration["segments"]):
            label = f"narr{index}"
            delay = round(segment["startSeconds"] * 1000)
            source = segment_sources[index] if segment_count > 1 else f"{narration_index}:a"
            filters.append(
                f"[{source}]atrim=start={segment['sourceStartSeconds']}:duration={segment['durationSeconds']},"
                f"asetpts=PTS-STARTPTS,volume={narration['volume']},adelay={delay}:all=1[{label}]"
            )
            audio_labels.append(label)

    music = manifest["music"]
    if music and music_index is not None:
        duration = music["endSeconds"] - music["startSeconds"]
        music_filters = [
            f"atrim=duration={duration}",
            "asetpts=PTS-STARTPTS",
            f"volume={music['volume']}",
        ]
        if music["fadeInSeconds"] > 0:
            music_filters.append(f"afade=t=in:st=0:d={music['fadeInSeconds']}")
        if music["fadeOutSeconds"] > 0:
            music_filters.append(f"afade=t=out:st={max(0, duration - music['fadeOutSeconds'])}:d={music['fadeOutSeconds']}")
        music_filters.append(f"adelay={round(music['startSeconds'] * 1000)}:all=1")
        filters.append(f"[{music_index}:a]" + ",".join(music_filters) + "[music]")
        audio_labels.append("music")

    audio_output = None
    if audio_labels:
        audio_output = "mixed"
        inputs = "".join(f"[{label}]" for label in audio_labels)
        mix = f"amix=inputs={len(audio_labels)}:duration=longest:normalize=0," if len(audio_labels) > 1 else ""
        filters.append(
            f"{inputs}{mix}apad=whole_dur={elapsed},atrim=duration={elapsed}[{audio_output}]"
        )

    quality = settings["quality"]
    args.extend(["-filter_complex", ";".join(filters), "-map", f"[{video_output}]"])
    if audio_output:
        args.extend(["-map", f"[{audio_output}]", "-c:a", "aac", "-b:a", "192k"])
    args.extend([
        "-c:v", "libx264",
        "-preset", "slow" if quality == "high" else "medium",
        "-crf", "18" if quality == "high" else "23",
        "-pix_fmt", "yuv420p",
        "-r", str(fps),
        "-t", str(elapsed),
        "-movflags", "+faststart",
        manifest["outputPath"],
    ])
    return args


def validate_output(manifest: dict[str, Any]) -> None:
    output_path = Path(manifest["outputPath"])
    if not output_path.is_file() or output_path.stat().st_size == 0:
        fail("FFmpeg가 재생 가능한 출력 파일을 만들지 못했습니다.")
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,duration", "-of", "json", str(output_path)],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    data = json.loads(probe.stdout)
    video = next((stream for stream in data.get("streams", []) if stream.get("codec_type") == "video"), None)
    if not video or video.get("width") != manifest["settings"]["width"] or video.get("height") != manifest["settings"]["height"]:
        fail("출력 영상 해상도 검증에 실패했습니다.")
    output_duration = float(data.get("format", {}).get("duration", 0))
    if output_duration <= 0:
        fail("출력 영상 재생 시간 검증에 실패했습니다.")
    if manifest["narration"] or manifest["music"]:
        audio = next((stream for stream in data.get("streams", []) if stream.get("codec_type") == "audio"), None)
        audio_duration = float(audio.get("duration", 0)) if audio else 0
        if audio_duration < output_duration - 0.25:
            fail("출력 오디오가 영상 끝까지 합성되지 않았습니다.")


def main() -> int:
    global active_process
    if len(sys.argv) != 2:
        fail("렌더링 manifest 경로가 필요합니다.")
    manifest_path = Path(sys.argv[1]).resolve(strict=True)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    output_path = Path(manifest["outputPath"]).resolve()
    if output_path.parent != manifest_path.parent:
        fail("출력 파일은 격리된 작업 디렉터리 안에 있어야 합니다.")
    subtitle_path = None
    if manifest["subtitles"]["enabled"] and manifest["subtitles"]["cues"]:
        subtitle_path = manifest_path.parent / "subtitles.ass"
        write_subtitles(manifest, subtitle_path)
    command = build_command(manifest, subtitle_path)
    print(json.dumps({"stage": "ffmpeg", "message": "최종 MP4 합성을 시작합니다."}, ensure_ascii=False), flush=True)
    active_process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    _, stderr = active_process.communicate()
    if active_process.returncode != 0:
        lines = (stderr or "FFmpeg 렌더링에 실패했습니다.").strip().splitlines()
        fail("\n".join(lines[-20:]))
    active_process = None
    validate_output(manifest)
    print(json.dumps({"stage": "validated", "message": "최종 MP4 검증을 완료했습니다."}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
