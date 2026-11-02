"""
中文課文語音的批次守護：照筆電電量跑 gen_zh_breezy.py，一段一段做（家長 2026-11-02：插著電還在掉電，工作要做完）。

- 同一時間只跑一個生成（gen_zh_breezy.py 自己也有 run.lock 排隊）。
- 每 10 分鐘讀 C:\\Users\\user\\Documents\\BatteryMonitor\\battery_log.csv 最後一列的「電量%」「電壓V」（其他欄是假值）。
- 電量低於 PAUSE_BELOW：停掉這一段，充到 RESUME_AT 再接著做（gen_zh_breezy.py 從快取續跑，做過的不重做）。
- 用 N 個執行緒跑了 30 分鐘電量還是往下掉：降一個執行緒重開（最少 1 個）。

    python -I scripts/zh_batch_guard.py 步驟.json
步驟.json：[{"log": "紀錄檔", "args": ["--days", "1-150", ...]}, ...]（--threads、--stay-awake 由這裡加）
"""
import csv
import json
import pathlib
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
PY = r"C:\Users\user\breezyvoice\venv\Scripts\python.exe"
BATTERY = pathlib.Path(r"C:\Users\user\Documents\BatteryMonitor\battery_log.csv")
PAUSE_BELOW, RESUME_AT = 10, 20
CHECK_S = 600       # 每 10 分鐘看一次電量
WINDOW_S = 1800     # 用同樣的執行緒數跑 30 分鐘，電量還在掉就往下調


def battery():
    """(時間, 電量%, 電壓V)；讀不到回傳 None"""
    try:
        with BATTERY.open(encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))
        r = rows[-1]
        return r["時間"], int(float(r["電量%"])), float(r["電壓V"])
    except (OSError, ValueError, KeyError, IndexError):
        return None


def say(log: pathlib.Path, msg: str):
    line = f"=== 電量守護 {time.strftime('%F %T')}：{msg}"
    print(line, flush=True)
    with log.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def kill(p):
    subprocess.run(["taskkill", "/PID", str(p.pid), "/T", "/F"], capture_output=True)
    p.wait()


def main():
    steps = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    threads = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    for step in steps:
        log = pathlib.Path(step["log"])
        while True:
            b = battery()
            if b and b[1] < PAUSE_BELOW:
                say(log, f"電量 {b[1]}%（{b[2]} V），低於 {PAUSE_BELOW}% 先不跑，充到 {RESUME_AT}% 再開始")
                while (b := battery()) and b[1] < RESUME_AT:
                    time.sleep(120)
            b = battery()
            say(log, f"開始：{' '.join(step['args'])} --threads {threads}（電量 {b and b[1]}%、{b and b[2]} V）")
            with log.open("a", encoding="utf-8") as out:
                p = subprocess.Popen([PY, "-I", str(ROOT / "scripts" / "gen_zh_breezy.py"), *step["args"],
                                      "--threads", str(threads), "--stay-awake"], cwd=ROOT, stdout=out, stderr=subprocess.STDOUT)
            start, base, why = time.time(), b, None
            while p.poll() is None:
                try:
                    p.wait(timeout=CHECK_S)
                    break
                except subprocess.TimeoutExpired:
                    pass
                b = battery()
                if not b:
                    continue
                say(log, f"電量 {b[1]}%、{b[2]} V（{threads} 個執行緒，這段開始時 {base and base[1]}%）")
                if b[1] < PAUSE_BELOW:
                    why = "pause"
                elif threads > 1 and base and time.time() - start >= WINDOW_S and b[1] < base[1]:
                    why = "slower"
                if why:
                    kill(p)
                    break
            if why == "pause":
                say(log, f"電量低於 {PAUSE_BELOW}%，先停（做過的都在快取），充到 {RESUME_AT}% 再接著做")
                while (b := battery()) and b[1] < RESUME_AT:
                    time.sleep(120)
                continue
            if why == "slower":
                threads -= 1
                say(log, f"插著電 30 分鐘電量還在掉，降成 {threads} 個執行緒重開")
                continue
            if p.returncode != 0:
                say(log, f"結束 exit {p.returncode}，停下來不往下做")
                sys.exit(p.returncode)
            say(log, "這一段做完")
            break
    print("all-done", flush=True)


if __name__ == "__main__":
    main()
