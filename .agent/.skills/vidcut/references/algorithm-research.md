# Algorithm & Library Research Notes

Supporting research for technology choices in the VidCut skill.

---

## Why Standard Whisper Fails for Filler Detection

Whisper's paper (Appendix C, Text Standardization) explicitly states it removes the following
words from transcription output: `hmm`, `mm`, `mhm`, `mmm`, `uh`, `um`. This is by design —
OpenAI trained Whisper to produce clean, readable transcripts. For filler removal, this is a
fatal flaw: the tool erases the very tokens we need timestamps for.

**Conclusion:** Do not use vanilla Whisper, faster-whisper, or any derivative that inherits
this normalization behavior.

---

## CrisperWhisper: Why It's the Right Choice

Published Aug 2024 by nyrahealth (GitHub: `nyrahealth/CrisperWhisper`).

Key differentiators:
- Fine-tuned Whisper large-v2 with adjusted tokenizer to include filler tokens
- Uses Dynamic Time Warping (DTW) on cross-attention scores for word-level timestamps
- Achieves F1=0.975 on synthetic filled-pause detection dataset
- Outperforms WhisperX and WhisperT on noise robustness + word segmentation
- Verbatim mode: transcribes exactly what was said, including stutters and false starts

Tradeoff: Large model size (large-v2 based). GPU recommended for real-time, but works on CPU
for offline batch processing.

---

## VAD Comparison: silero-vad vs pyannote

### silero-vad (default choice)
- PyTorch + ONNX, CPU-optimized
- ~0.1x realtime on modern CPU
- Geared specifically for speech vs non-speech detection
- Minimum meaningful chunk: 150–250ms (shorter pauses not meaningful in speech)
- No HuggingFace token required
- Well-maintained, active 2024–2025 releases

### pyannote-audio (optional GPU adapter)
- Deep learning, state-of-the-art on complex multi-speaker audio
- Requires HuggingFace access token + model agreement
- Slower on CPU (~47s for 10min video vs silero's ~10s)
- Recommended only when: GPU available, noisy background, or multiple overlapping speakers

### Decision
For solo self-recording (the primary use case), silero-vad is the correct default.
pyannote should be wired as an optional adapter behind the IVADDetector port.

---

## Why FFmpeg with `-c copy`

Re-encoding video (even to the same codec) introduces:
1. Quality loss (generational degradation)
2. Processing time (minutes for long videos)
3. Potential audio/video sync drift

Using `ffmpeg -c copy` for segment concatenation:
- Zero quality loss
- Near-instant processing
- Preserves original codec, bitrate, color space

The only case where re-encoding is needed: segments start/end mid-keyframe (rare with modern
cameras). For this, the config exposes `output_codec: h264 | h265 | copy` as an escape hatch.

---

## Alternative Libraries Considered and Rejected

| Library | Reason rejected |
|---|---|
| auto-editor (WyattBlue) | No filler word support; silence-only |
| VOSK | Low accuracy on filler sounds; outdated |
| QuickCut | VOSK-based, same limitation |
| SilenceTrimmer | macOS only, no cross-platform |
| TimeBolt | Commercial, not open source |
| Descript | SaaS, not embeddable |
