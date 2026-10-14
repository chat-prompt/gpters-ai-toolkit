#!/usr/bin/env python3
"""YouTube auto-caption SRT cleaner.
YouTube 자동자막은 프로그레시브 프레임을 계속 덮어써서 중복 라인이 많음.
각 블록의 '새로 추가된 마지막 줄'만 추출.

Usage:
    python3 clean-srt.py <SRT_PATH> [--glossary <JSON>]

Glossary JSON format:
    {"클러드": "Claude", "엔트로픽": "Anthropic", ...}
"""
import argparse
import json
import re
from pathlib import Path

DEFAULT_GLOSSARY = {
    # Claude 관련
    "클러드\\s?코드": "Claude Code",
    "클로드\\s?코드": "Claude Code",
    "클로드": "Claude",
    "클러드": "Claude",
    # OAuth
    "오스터큰": "OAuth 토큰",
    "오어스": "OAuth",
    "오스(?!\\S)": "OAuth",
    # Anthropic
    "엔트로픽": "Anthropic",
    # Tailscale
    "테일\\s?스케을": "Tailscale",
    "테일\\s?스케일": "Tailscale",
    # Termux
    "터먹스": "Termux",
    # WSL
    "WSL\\s?오븐2": "WSL2",
    # 기타
    "아이덴티티": "Identity",
    "툴즈": "Tools",
    "하트비트": "Heartbeat",
    "카트비트": "Heartbeat",
    "파트비트": "Heartbeat",
    "퍼스날리티": "Personality",
    "퍼스널리티": "Personality",
    "프리세스": "프리셋",
    "컨피그": "Config",
    "컨피나": "Config",
    "Don't take this the need": "",
}


def parse_srt(path: Path):
    raw = path.read_text(encoding="utf-8")
    blocks = re.split(r"\n\s*\n", raw.strip())
    out = []
    for blk in blocks:
        lines = [l for l in blk.split("\n") if l.strip()]
        if len(lines) < 3:
            continue
        timecode = lines[1]
        text = lines[2:]
        m = re.match(r"(\d+):(\d+):(\d+)[,.]", timecode)
        if not m:
            continue
        start_sec = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
        out.append((start_sec, text))
    return out


def dedupe(blocks):
    """Keep only last line of each block (newest addition in progressive captions)."""
    cleaned = []
    for start, text in blocks:
        last_line = None
        for l in reversed(text):
            s = l.strip().lstrip(">").strip()
            if s:
                last_line = s
                break
        if not last_line:
            continue
        if cleaned and cleaned[-1][1] == last_line:
            continue
        cleaned.append((start, last_line))
    return cleaned


def apply_glossary(text: str, glossary: dict) -> str:
    for pat, repl in glossary.items():
        text = re.sub(pat, repl, text)
    return re.sub(r"\s+", " ", text).strip()


def fmt_ts(sec: int) -> str:
    h, r = divmod(sec, 3600)
    m, s = divmod(r, 60)
    return f"{h:d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("srt", help="SRT file path")
    ap.add_argument("--glossary", help="Additional glossary JSON file")
    ap.add_argument("--out", help="Output path (default: <srt>.clean.normalized.txt)")
    args = ap.parse_args()

    src = Path(args.srt)
    glossary = dict(DEFAULT_GLOSSARY)
    if args.glossary:
        extra = json.loads(Path(args.glossary).read_text(encoding="utf-8"))
        glossary.update(extra)

    blocks = parse_srt(src)
    cleaned = dedupe(blocks)

    # Group into paragraphs by ~20s chunks
    out_lines = []
    buf = []
    last_ts = None
    for sec, line in cleaned:
        if last_ts is None:
            last_ts = sec
        if sec - last_ts > 20:
            if buf:
                joined = apply_glossary(" ".join(buf), glossary)
                if joined:
                    out_lines.append(f"[{fmt_ts(last_ts)}] {joined}")
            buf = [line]
            last_ts = sec
        else:
            buf.append(line)
    if buf:
        joined = apply_glossary(" ".join(buf), glossary)
        if joined:
            out_lines.append(f"[{fmt_ts(last_ts)}] {joined}")

    out = Path(args.out) if args.out else src.with_suffix(".clean.normalized.txt")
    out.write_text("\n\n".join(out_lines), encoding="utf-8")
    print(f"✅ Wrote {out}")
    print(f"   {len(out_lines)} paragraphs, {len(cleaned)} lines")


if __name__ == "__main__":
    main()
