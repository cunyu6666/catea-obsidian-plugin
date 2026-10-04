figma.showUI(__html__, { width: 320, height: 180, title: 'Catea Bridge' })

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function color(value, fallback) {
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return {
      r: parseInt(value.slice(1, 3), 16) / 255,
      g: parseInt(value.slice(3, 5), 16) / 255,
      b: parseInt(value.slice(5, 7), 16) / 255,
    }
  }
  return fallback
}

function paint(value, fallback) {
  return { type: 'SOLID', color: color(value, fallback) }
}

function safeText(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function numberValue(value, fallback, min, max) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback
}

async function createNode(spec, created, depth) {
  if (!spec || typeof spec !== 'object' || depth > 6) return null
  if (spec.type === 'text') {
    const node = figma.createText()
    const heading = spec.style === 'heading'
    node.name = safeText(spec.name, 'Text').slice(0, 120)
    node.fontName = { family: 'Inter', style: heading ? 'Bold' : 'Regular' }
    node.fontSize = heading ? 28 : 15
    node.lineHeight = { unit: 'PERCENT', value: 140 }
    node.characters = safeText(spec.text, '').slice(0, 8000)
    node.textAutoResize = 'HEIGHT'
    node.resize(numberValue(spec.width, heading ? 560 : 520, 80, 1600), node.height)
    node.fills = [paint(spec.fill, { r: 0.1, g: 0.1, b: 0.1 })]
    created.push(node.id)
    return node
  }
  if (spec.type === 'rectangle') {
    const node = figma.createRectangle()
    node.name = safeText(spec.name, 'Rectangle').slice(0, 120)
    node.resize(numberValue(spec.width, 320, 1, 2000), numberValue(spec.height, 180, 1, 2000))
    node.cornerRadius = numberValue(spec.radius, 8, 0, 80)
    node.fills = [paint(spec.fill, { r: 0.9, g: 0.92, b: 0.94 })]
    created.push(node.id)
    return node
  }

  const layout = record(spec.layout)
  const frame = figma.createFrame()
  frame.name = safeText(spec.name, 'Frame').slice(0, 120)
  frame.layoutMode = layout.mode === 'horizontal' ? 'HORIZONTAL' : 'VERTICAL'
  frame.primaryAxisSizingMode = 'AUTO'
  frame.counterAxisSizingMode = 'AUTO'
  frame.itemSpacing = numberValue(layout.gap, 12, 0, 200)
  const padding = numberValue(layout.padding, 20, 0, 240)
  frame.paddingTop = padding
  frame.paddingRight = padding
  frame.paddingBottom = padding
  frame.paddingLeft = padding
  frame.cornerRadius = numberValue(spec.radius, 12, 0, 80)
  frame.fills = [paint(spec.fill, { r: 1, g: 1, b: 1 })]
  frame.strokes = [paint(spec.stroke, { r: 0.86, g: 0.88, b: 0.9 })]
  frame.strokeWeight = spec.stroke === null ? 0 : 1
  created.push(frame.id)

  const children = Array.isArray(spec.children) ? spec.children.slice(0, 80) : []
  for (const childSpec of children) {
    const child = await createNode(childSpec, created, depth + 1)
    if (child) frame.appendChild(child)
  }
  if (!children.length) {
    frame.resize(numberValue(spec.width, 360, 80, 2400), numberValue(spec.height, 240, 80, 2400))
  }
  return frame
}

async function render(action) {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' })
  const createdNodeIds = []
  const rootNodeIds = []
  const roots = Array.isArray(action.document?.nodes) ? action.document.nodes.slice(0, 40) : []
  let cursorX = 80
  for (const child of figma.currentPage.children) cursorX = Math.max(cursorX, child.x + child.width + 80)
  const visible = []
  for (const spec of roots) {
    const node = await createNode(spec, createdNodeIds, 0)
    if (!node) continue
    figma.currentPage.appendChild(node)
    node.x = cursorX
    node.y = 80
    cursorX += node.width + 80
    rootNodeIds.push(node.id)
    visible.push(node)
  }
  if (visible.length) figma.viewport.scrollAndZoomIntoView(visible)
  return { createdNodeIds, rootNodeIds, nodeCount: createdNodeIds.length }
}

figma.ui.onmessage = async (message) => {
  if (message.type !== 'render') return
  try {
    const result = await render(message.action)
    figma.ui.postMessage({ type: 'result', actionId: message.action.id, ok: true, result })
  } catch (error) {
    figma.ui.postMessage({
      type: 'result',
      actionId: message.action.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
