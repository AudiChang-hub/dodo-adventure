"""依 scripts/.cache/lines.json 產生 public/audio/*.mp3，已存在的檔案會略過。"""
import asyncio
import json
import pathlib

import edge_tts

OUT = pathlib.Path("public/audio")
OUT.mkdir(parents=True, exist_ok=True)
rows = json.loads(pathlib.Path("scripts/.cache/lines.json").read_text(encoding="utf-8"))


async def synth(row, sem):
    path = OUT / f"{row['file']}.mp3"
    if path.exists() and path.stat().st_size > 0:
        return False
    async with sem:
        for attempt in range(4):
            try:
                tts = edge_tts.Communicate(row["text"], row["voice"], rate=row["rate"], pitch=row["pitch"])
                await tts.save(str(path))
                return True
            except Exception as e:  # 網路偶爾會斷，重試幾次
                if attempt == 3:
                    print("FAIL", row["key"], e)
                await asyncio.sleep(1.5 * (attempt + 1))
    return False


async def main():
    sem = asyncio.Semaphore(6)
    made = await asyncio.gather(*(synth(r, sem) for r in rows))
    wanted = {f"{r['file']}.mp3" for r in rows}
    stale = [p for p in OUT.glob("*.mp3") if p.name not in wanted]
    for p in stale:
        p.unlink()
    print(f"generated {sum(made)}, total {len(rows)}, removed {len(stale)}")


asyncio.run(main())
