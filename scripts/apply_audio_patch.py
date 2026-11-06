"""把另外重產好的一批音檔套進 public/audio（音檔不在 git 裡，換掉幾個檔時用；2026-11-06 T-98）。

<資料夾>/audio/*.mp3 複製到 public/audio（同檔名蓋掉），<資料夾>/timings-patch.json（{檔名: 逐字時間}）併進 public/audio/timings.json。
只換清單裡有的檔，其他音檔、時間軸不動。套完跑 python scripts/gen_audio.py --check 確認缺 0。

用法：python scripts/apply_audio_patch.py <資料夾> [--out public/audio]
例：python scripts/apply_audio_patch.py "docs/voice-samples/seven尾聲/重產音檔"
"""
import argparse
import json
import pathlib
import shutil


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--out", default="public/audio")
    args = ap.parse_args()
    src, out = pathlib.Path(args.src), pathlib.Path(args.out)
    patch = json.loads((src / "timings-patch.json").read_text(encoding="utf-8"))
    files = sorted(p for p in (src / "audio").glob("*.mp3"))
    if {p.stem for p in files} != set(patch):
        raise SystemExit("audio/ 和 timings-patch.json 的檔名對不上，沒有套用")
    for p in files:
        if not (out / p.name).exists():
            raise SystemExit(f"{out / p.name} 不存在（台詞清單可能變了），沒有套用")
    timings_path = out / "timings.json"
    timings = json.loads(timings_path.read_text(encoding="utf-8"))
    for p in files:
        shutil.copyfile(p, out / p.name)
    timings.update(patch)
    tmp = timings_path.with_suffix(".tmp")
    tmp.write_text(json.dumps({k: timings[k] for k in sorted(timings)}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(timings_path)
    print(f"換了 {len(files)} 個音檔、{len(patch)} 筆時間軸")


if __name__ == "__main__":
    main()
