/**
 * [WHO]: Provides FigmaConnectorCall, FigmaMcpCall, buildFigmaIrScript, callFigmaConnector, parseFigmaTarget
 * [FROM]: Depends on ../../agent-core/src/version.ts, ./connectors.ts
 * [TO]: Consumed by packages/integrations/src/connectors.ts,
 *   packages/integrations/src/__tests__/figma-connector.test.ts
 * [HERE]: packages/integrations/src/figma-connector.ts - Figma connector runtime adapter that maps Catea semantic read/write actions to the official Figma MCP tools, including a bounded design IR to Plugin API script compiler for canvas writes
 */
import { PLUGIN_VERSION } from '../../agent-core/src/version.ts'
import type { ConnectorConfig } from './connectors.ts'

export type FigmaConnectorCall = 'read' | 'create' | 'update' | 'share'
export type FigmaMcpCall = (
  tool: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<unknown>

interface FigmaTarget {
  fileKey?: string
  nodeId?: string
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function parseFigmaTarget(args: Record<string, unknown>): FigmaTarget {
  const target = record(args.target)
  const fileUrl = stringValue(args.file_url ?? target.file_url ?? target.url)
  const directFileKey = stringValue(args.file_key ?? target.file_key ?? target.fileKey)
  const directNodeId = stringValue(args.node_id ?? target.node_id ?? target.nodeId)
  let fileKey = directFileKey
  let nodeId = directNodeId
  if (fileUrl) {
    try {
      const url = new URL(fileUrl)
      const match = url.pathname.match(/\/(?:design|file|board|slides)\/([^/]+)/)
      fileKey ||= match?.[1]
      nodeId ||= url.searchParams.get('node-id')?.replace(/-/g, ':') || undefined
    } catch {
      /* The caller may pass a bare file key through file_url; ignore parse errors. */
    }
  }
  return { ...(fileKey ? { fileKey } : {}), ...(nodeId ? { nodeId } : {}) }
}

function normalizeDocument(args: Record<string, unknown>, operation: FigmaConnectorCall) {
  const document = record(args.document)
  if (Object.keys(document).length) return document
  const title = stringValue(args.title) || (operation === 'share' ? 'Shared from Catea' : 'Catea')
  const content = stringValue(args.content_markdown) || ''
  return {
    kind: 'figma_document',
    version: 1,
    nodes: [
      {
        type: 'frame',
        name: title,
        layout: { mode: 'vertical', gap: 12, padding: 24 },
        children: [
          { type: 'text', name: 'Title', text: title, style: 'heading' },
          ...(content
            ? [{ type: 'text', name: 'Content', text: content.slice(0, 4000), style: 'body' }]
            : []),
        ],
      },
    ],
  }
}

export function buildFigmaIrScript(
  document: Record<string, unknown>,
  operation: FigmaConnectorCall,
  target: FigmaTarget,
): string {
  const payload = JSON.stringify({ document, operation, target })
  return `
const input = ${payload};
const createdNodeIds = [];
const mutatedNodeIds = [];
const rootNodeIds = [];
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
await figma.loadFontAsync({ family: "Inter", style: "Bold" });

function clamp(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function paint(value, fallback) {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return {
      type: "SOLID",
      color: {
        r: parseInt(value.slice(1, 3), 16) / 255,
        g: parseInt(value.slice(3, 5), 16) / 255,
        b: parseInt(value.slice(5, 7), 16) / 255,
      },
    };
  }
  if (value && typeof value === "object") {
    return {
      type: "SOLID",
      color: {
        r: clamp(value.r, fallback.r),
        g: clamp(value.g, fallback.g),
        b: clamp(value.b, fallback.b),
      },
    };
  }
  return { type: "SOLID", color: fallback };
}

function safeName(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : fallback;
}

function numberValue(value, fallback, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

async function createFromSpec(spec, depth = 0) {
  if (!spec || typeof spec !== "object" || depth > 6) return null;
  const type = typeof spec.type === "string" ? spec.type : "frame";
  if (type === "text") {
    const node = figma.createText();
    node.name = safeName(spec.name, "Text");
    node.fontName = { family: "Inter", style: spec.style === "heading" ? "Bold" : "Regular" };
    node.fontSize = spec.style === "heading" ? 28 : 15;
    node.lineHeight = { unit: "PERCENT", value: 140 };
    node.characters = typeof spec.text === "string" ? spec.text.slice(0, 8000) : "";
    node.textAutoResize = "HEIGHT";
    node.resize(numberValue(spec.width, spec.style === "heading" ? 560 : 520, 80, 1600), node.height);
    node.fills = [paint(spec.fill, { r: 0.1, g: 0.1, b: 0.1 })];
    createdNodeIds.push(node.id);
    return node;
  }
  if (type === "rectangle") {
    const node = figma.createRectangle();
    node.name = safeName(spec.name, "Rectangle");
    node.resize(numberValue(spec.width, 320, 1, 2000), numberValue(spec.height, 180, 1, 2000));
    node.cornerRadius = numberValue(spec.radius, 8, 0, 80);
    node.fills = [paint(spec.fill, { r: 0.9, g: 0.92, b: 0.94 })];
    createdNodeIds.push(node.id);
    return node;
  }
  const layout = spec.layout && typeof spec.layout === "object" ? spec.layout : {};
  const direction = layout.mode === "horizontal" ? "HORIZONTAL" : "VERTICAL";
  const node =
    typeof figma.createAutoLayout === "function"
      ? figma.createAutoLayout(direction)
      : figma.createFrame();
  node.name = safeName(spec.name, "Frame");
  node.layoutMode = direction;
  node.itemSpacing = numberValue(layout.gap, 12, 0, 200);
  const padding = numberValue(layout.padding, 20, 0, 240);
  node.paddingTop = padding;
  node.paddingRight = padding;
  node.paddingBottom = padding;
  node.paddingLeft = padding;
  node.cornerRadius = numberValue(spec.radius, 12, 0, 80);
  node.fills = [paint(spec.fill, { r: 1, g: 1, b: 1 })];
  node.strokes = [paint(spec.stroke, { r: 0.86, g: 0.88, b: 0.9 })];
  node.strokeWeight = spec.stroke === null ? 0 : 1;
  createdNodeIds.push(node.id);
  const children = Array.isArray(spec.children) ? spec.children.slice(0, 80) : [];
  for (const childSpec of children) {
    const child = await createFromSpec(childSpec, depth + 1);
    if (child) node.appendChild(child);
  }
  if (children.length === 0) node.resize(numberValue(spec.width, 360, 80, 2400), numberValue(spec.height, 240, 80, 2400));
  return node;
}

let parent = null;
if (input.operation === "update" && input.target && input.target.nodeId) {
  parent = await figma.getNodeByIdAsync(input.target.nodeId);
}
const roots = Array.isArray(input.document.nodes) ? input.document.nodes.slice(0, 40) : [];
const visibleRoots = [];
let cursorX = 80;
for (const child of figma.currentPage.children) {
  cursorX = Math.max(cursorX, child.x + child.width + 80);
}
for (const spec of roots) {
  const node = await createFromSpec(spec);
  if (!node) continue;
  if (parent && "appendChild" in parent) {
    parent.appendChild(node);
    mutatedNodeIds.push(parent.id);
  } else {
    figma.currentPage.appendChild(node);
    node.x = cursorX;
    node.y = 80;
    cursorX += node.width + 80;
  }
  rootNodeIds.push(node.id);
  visibleRoots.push(node);
}
if (visibleRoots.length) figma.viewport.scrollAndZoomIntoView(visibleRoots);
return {
  connector: "figma",
  operation: input.operation,
  createdNodeIds,
  mutatedNodeIds,
  rootNodeIds,
  nodeCount: createdNodeIds.length + mutatedNodeIds.length,
};
`.trim()
}

async function defaultFigmaMcpCall(
  tool: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
  ])
  const client = new Client({ name: 'catea-paper', version: PLUGIN_VERSION }, { capabilities: {} })
  const transport = new StreamableHTTPClientTransport(new URL('https://mcp.figma.com/mcp'), {
    requestInit: { headers: { 'X-Figma-Plugin-Bundle': 'figma_prod@2_2_126' } },
  })
  await client.connect(transport, { signal })
  try {
    const result = await client.callTool({ name: tool, arguments: args }, undefined, {
      signal,
      timeout: 120000,
    })
    if (result.isError) throw new Error(JSON.stringify(result.content).slice(0, 2000))
    return result
  } finally {
    await client.close().catch(() => {})
  }
}

export async function callFigmaConnector(
  operation: FigmaConnectorCall,
  args: Record<string, unknown>,
  config: ConnectorConfig,
  call: FigmaMcpCall = defaultFigmaMcpCall,
  signal: AbortSignal,
): Promise<unknown> {
  if (config.adapter && config.adapter !== 'figma_official_mcp')
    throw new Error(`Figma adapter is not executable yet: ${config.adapter}`)
  const target = parseFigmaTarget(args)
  if (!target.fileKey) throw new Error('Figma connector requires target.file_url or file_key')
  if (operation === 'read') {
    const mode = stringValue(args.mode) || 'metadata'
    const tool =
      mode === 'design_context'
        ? 'get_design_context'
        : mode === 'screenshot'
          ? 'get_screenshot'
          : 'get_metadata'
    return call(tool, { ...target }, signal)
  }
  const document = normalizeDocument(args, operation)
  const mcpArgs: Record<string, unknown> = {
    code: buildFigmaIrScript(document, operation, target),
    skillNames: 'figma-use',
    ...target,
  }
  return call('use_figma', mcpArgs, signal)
}
