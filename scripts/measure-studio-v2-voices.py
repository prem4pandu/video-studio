#!/usr/bin/env python3
"""Measured delivery evidence; these metrics cannot establish perceived voice quality."""
import json
import re
import subprocess
import sys
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly

root = Path(sys.argv[1] if len(sys.argv)>1 else 'outputs/studio-v2-voice-review')
report={'humanListeningReview':False,'method':{'silence':'10ms RMS windows below -40 dBFS; consecutive intervals >=120ms; excludes leading/trailing silence from internal pauses','pitch':'Autocorrelation on 40ms windows at 8kHz; 70–450Hz lag search, normalized peak >=0.6 and energy >-40dBFS. Octave errors possible. Descriptive variation, not a quality score.','pace':'Whitespace script words divided by complete audio duration, including pauses.','loudness':'FFmpeg ebur128 integrated LUFS and true peak.'},'results':[]}
for provider in ['kokoro','qwentts']:
 project=root/provider
 plan=json.loads((project/'plan.json').read_text())
 tracks=json.loads((project/'narration.json').read_text())
 by_id={s['id']:s for s in plan['scenes']}
 for track in tracks:
  file=project/track['file'];sr,raw=wavfile.read(file);x=raw.astype(np.float64)/(2**15)
  if x.ndim!=1:raise ValueError('Expected mono narration')
  hop=round(sr*.01);rms=np.array([np.sqrt(np.mean(x[i:i+hop]**2)) for i in range(0,len(x),hop)])
  quiet=rms<.01;changes=np.diff(np.r_[False,quiet,False].astype(int));starts=np.where(changes==1)[0];ends=np.where(changes==-1)[0]
  pauses=[{'startSeconds':round(a*.01,3),'durationSeconds':round((b-a)*.01,3)}for a,b in zip(starts,ends)if b-a>=12 and a>0 and b<len(quiet)]
  y=resample_poly(x,8000,sr);pitches=[]
  for i in range(0,len(y)-320,80):
   frame=y[i:i+320];frame=frame-frame.mean()
   if np.sqrt(np.mean(frame**2))<.01:continue
   cor=np.correlate(frame,frame,mode='full')[319:];lo,hi=round(8000/450),round(8000/70);lag=lo+np.argmax(cor[lo:hi+1]);confidence=cor[lag]/cor[0]
   if confidence>=.6:pitches.append(8000/lag)
  text=by_id[track['sceneId']]['narration'];duration=len(x)/sr
  command=subprocess.run(['ffmpeg','-hide_banner','-i',str(file),'-af','ebur128=peak=true','-f','null','-'],text=True,capture_output=True,check=True)
  summary=command.stderr.rsplit('Summary:',1)[-1];lufs=re.search(r'I:\s+(-?[\d.]+) LUFS',summary);peak=re.search(r'Peak:\s+(-?[\d.]+) dBFS',summary)
  entry={'provider':provider,'sceneId':track['sceneId'],'voice':track['voice'],'script':text,'durationSeconds':duration,'words':len(text.split()),'wordsPerMinute':len(text.split())/duration*60,'integratedLufs':float(lufs[1]) if lufs else None,'truePeakDbfs':float(peak[1]) if peak else None,'peakAmplitude':float(np.abs(x).max()),'clippedSamples':int((np.abs(x)>=.999).sum()),'internalPauseCount':len(pauses),'internalPauses':pauses,'internalPauseTotalSeconds':sum(p['durationSeconds']for p in pauses),'pitchMedianHz':float(np.median(pitches))if pitches else None,'pitchP10Hz':float(np.percentile(pitches,10))if pitches else None,'pitchP90Hz':float(np.percentile(pitches,90))if pitches else None,'pitchCoefficientVariation':float(np.std(pitches)/np.mean(pitches))if pitches else None}
  report['results'].append(entry)
  print(json.dumps({k:v for k,v in entry.items()if k not in ['script','internalPauses']}),flush=True)
(root/'delivery-measurements.json').write_text(json.dumps(report,indent=2)+'\n')
