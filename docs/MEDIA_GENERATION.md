# Video generation and speech synthesis

Settings has separate **Video generation** and **Speech synthesis** sections with
an enable switch, API URL, model name and masked API key. Speech also has a voice
field. Each key is independently stored in Obsidian secure storage, or kept only
in memory on older hosts. Vault configuration JSON never contains these keys.
Both tools default to disabled and are independent of the chat and image models.

The initial adapters use the DashScope protocols documented for Alibaba Cloud
Token Plan, with default host `https://token-plan.cn-beijing.maas.aliyuncs.com`:

| Tool | Default model | Protocol | Local output |
| --- | --- | --- | --- |
| `generate_video` | `happyhorse-1.1-t2v` | Submit to `/api/v1/services/aigc/video-generation/video-synthesis`, then poll `/api/v1/tasks/<id>` | MP4, maximum 100 MB |
| `generate_audio` | `qwen-audio-3.0-tts-plus` | Synchronous `/api/v1/services/audio/tts/SpeechSynthesizer` | MP3, maximum 30 MB |

Speech handles both a JSON response containing `output.audio.url` and a direct binary audio response. Signed OSS download links use HTTPS.

Speech defaults to voice `longanhuan_v3.6`, 24 kHz MP3, and accepts up to 6000
characters. It is text-to-speech, not music generation, transcription or voice
cloning. Video defaults to five seconds, 720P, 16:9. Supported durations,
resolutions and voices depend on the configured model and account entitlement.
No automatic fallback submits another billable generation.

The Agent exposes each tool only when its configuration is complete and enabled.
Both follow the assist/full vault-write permission policy. The configured media
endpoint receives only the requested prompt/text, generation parameters and model
selection. Download requests never carry the API key. Raw API error bodies and
signed output URLs are not added to chat history.

Video polling runs every ten seconds with a fifteen-minute deadline; speech has a
three-minute deadline. Stop interrupts local requests and polling, but cannot
cancel a submitted cloud video task. Task IDs and status are saved in tool details
before polling. Pass that ID as `task_id` to `generate_video` to resume without
submitting a second job. Failed/canceled/unknown task states terminate polling.

Generated files live under `Attachments/Catea/`. Chat stores local paths and shows
native video/audio controls without autoplay. Outputs remain playable after a
conversation is reopened and do not depend on temporary provider URLs.

[Provider reference](https://help.aliyun.com/zh/model-studio/token-plan-multimodal-gen)

[Speech HTTP reference](https://help.aliyun.com/zh/model-studio/qwen-audio-tts-http-api)
