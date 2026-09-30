# Image generation

Catea has a separate image model configuration under **Settings → Catea → Image
generation**. It does not reuse the chat model's API key or change the selected
chat model. Configure the protocol, API URL, model name and API key, then enable
image generation. The key uses Obsidian's vault-scoped secure storage; hosts
without that API keep it in memory only. It is removed before writing vault JSON.

For Alibaba Cloud Token Plan in Beijing, choose **DashScope** with API URL
`https://token-plan.cn-beijing.maas.aliyuncs.com` and model
`qwen-image-3.0-pro`. The native generation route is
`/api/v1/services/aigc/multimodal-generation/generation`; the `/apps/anthropic`
chat route is not used for image requests. OpenAI-compatible providers use
`/images/generations`, appended to the configured base URL unless already present.

The Agent advertises `generate_image` only when enabled and configured. It creates
one image per invocation and follows the same assist/full write permission policy
as other vault tools. Only the requested image prompt, size and model are sent to
the image API. Image download requests never include the API key. Provider error
bodies and temporary signed image URLs are not recorded in the conversation.

PNG, JPEG and WebP outputs are saved as new files under `Attachments/Catea/`, with
a 20 MB image limit and a bounded request deadline. The chat shows a clickable
local preview and persists its path, so reopening the conversation does not depend
on an expiring remote URL. Disabling the tool removes it from subsequent turns.
Image editing and asynchronous task-based providers are not supported.

References:
- [Token Plan multimodal generation](https://help.aliyun.com/zh/model-studio/token-plan-multimodal-gen)
- [Qwen Image 3.0 API](https://help.aliyun.com/zh/model-studio/qwen-image-generation-and-editing-api-reference)
