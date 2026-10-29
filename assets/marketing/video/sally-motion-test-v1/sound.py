from pathlib import Path
import math,wave,struct,random
p=Path(__file__).parent/'public/motion-cues.wav'; sr=48000; duration=18
samples=[0.0]*(sr*duration); rng=random.Random(74)
for t,freq,vol in [(0.40,660,.14),(2.15,523,.09),(5.45,587,.10),(7.65,740,.08),(11.10,784,.10),(15.10,659,.12)]:
    start=int(t*sr)
    for j in range(int(.22*sr)):
        q=j/sr;env=(1-math.exp(-q*130))*math.exp(-q*23)
        samples[start+j]+=vol*env*(math.sin(2*math.pi*freq*q)+.25*math.sin(2*math.pi*freq*2*q))
for t in [2.1,5.4,7.35,11,15]:
    start=int(t*sr)
    for j in range(int(.32*sr)):
        env=math.sin(math.pi*j/(.32*sr))**2
        samples[start+j]+=.018*env*rng.uniform(-1,1)
with wave.open(str(p),'wb') as out:
    out.setnchannels(1);out.setsampwidth(2);out.setframerate(sr)
    out.writeframes(b''.join(struct.pack('<h',int(max(-1,min(1,x))*32767)) for x in samples))
print('Created original restrained motion cues; no voice or licensed music.')
