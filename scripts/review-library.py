"""Independently decode every shipped Opus file and verify levels, playtime, and credit coverage."""
import argparse
import concurrent.futures
import hashlib
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parents[1]
audio = root/"public"/"music"
parser = argparse.ArgumentParser()
parser.add_argument("--ffmpeg", default="ffmpeg")
args = parser.parse_args()
catalog = json.loads((audio/"catalog.json").read_text(encoding="utf-8"))
page = (audio/"credits.html").read_text(encoding="utf-8")
credits = (audio/"youtube-credits.txt").read_text(encoding="utf-8")
assert len(credits) < 5000 and len({r["id"] for r in catalog}) == 56
assert Counter(r["mood"] for r in catalog) == {"intermission":12,"race":24,"chase":12,"celebration":8}
assert set(p.name for p in audio.glob("*.ogg")) == {r["file"] for r in catalog}

def verify(row):
    path = audio/row["file"]
    assert row["title"] in credits and row["file"] in page and row["license"] == "CC BY 4.0"
    assert hashlib.sha256(path.read_bytes()).hexdigest() == row["sha256"]
    result = subprocess.run([args.ffmpeg,"-nostdin","-hide_banner","-nostats","-i",str(path),"-af",
        "ebur128=peak=true:framelog=verbose","-f","null","-"],capture_output=True,encoding="utf-8",errors="replace",check=True)
    scan = result.stderr.split("Summary:")[-1]
    level = float(re.search(r"I:\s*([-\d.]+) LUFS",scan).group(1))
    peak = float(re.search(r"Peak:\s*([-\d.]+) dBFS",scan).group(1))
    time = re.search(r"Duration: (\d+):(\d+):([\d.]+)",result.stderr)
    seconds = int(time[1])*3600+int(time[2])*60+float(time[3])
    assert abs(seconds-row["duration"])<6 and -23<level<-17 and peak<0, (row["title"],seconds,level,peak)
    return {"id":row["id"],"title":row["title"],"seconds":seconds,"LUFS":level,"dBTP":peak,"bytes":path.stat().st_size}

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    rows=list(pool.map(verify,catalog))
report=root/"verification-output"/"course-review"/"music-library-audit.json"
report.write_text(json.dumps(rows,indent=2))
print(len(rows),"decoded files,",round(sum(r["seconds"] for r in rows)/60),"minutes,",round(sum(r["bytes"] for r in rows)/1e6,1),"MB",
      "loudness range",min(r["LUFS"] for r in rows),max(r["LUFS"] for r in rows))

