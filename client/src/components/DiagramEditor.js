import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Stage, Layer, Line, Arrow, Rect, Circle, RegularPolygon, Text, Transformer } from 'react-konva';

// ─── Constants ───────────────────────────────────────────────────────────────

const CANVAS_W = 700;
const CANVAS_H = 480;
const GRID = 20;
const MAX_UNDO = 30;

const STROKE_COLOURS = ['#1e293b', '#6366f1', '#ef4444', '#10b981', '#f59e0b', '#64748b'];
const FILL_COLOURS   = ['transparent', '#f8fafc', '#ede9fe', '#fef9c3', '#dcfce7', '#fee2e2'];

const TOOLS = [
  { id: 'select',    label: 'Select',    icon: '↖' },
  { id: 'text',      label: 'Text',      icon: 'T' },
  { id: 'line',      label: 'Line',      icon: '╱' },
  { id: 'arrow',     label: 'Arrow',     icon: '→' },
  { id: 'rect',      label: 'Rectangle', icon: '▭' },
  { id: 'circle',    label: 'Circle',    icon: '○' },
  { id: 'triangle',  label: 'Triangle',  icon: '△' },
  { id: 'eraser',    label: 'Delete',    icon: '⌫' },
];

const TEMPLATES = [
  { id: 'numberLine',   label: 'Number Line',    icon: '📏' },
  { id: 'coordGrid',    label: 'Coord Grid',     icon: '📐' },
  { id: 'barChart',     label: 'Bar Chart',      icon: '📊' },
  { id: 'clockFace',    label: 'Clock Face',     icon: '🕐' },
  { id: 'labelledShape',label: 'Labelled Shape', icon: '△' },
  { id: 'patternSeq',   label: 'Pattern Seq',    icon: '⬡' },
];

// ─── Template generators (return arrays of shape objects) ────────────────────

function makeNumberLine({ start = 0, end = 10, step = 1, markedPoints = [], questionMark = null }) {
  const shapes = [];
  const x0 = 60, x1 = CANVAS_W - 60, y = CANVAS_H / 2;
  const range = end - start;
  const toX = v => x0 + ((v - start) / range) * (x1 - x0);

  shapes.push({ id: uid(), type: 'arrow', points: [x0, y, x1, y], stroke: '#1e293b', strokeWidth: 2 });

  for (let v = start; v <= end; v += step) {
    const x = toX(v);
    shapes.push({ id: uid(), type: 'line', points: [x, y - 8, x, y + 8], stroke: '#1e293b', strokeWidth: 1.5 });
    shapes.push({ id: uid(), type: 'text', x: x - 10, y: y + 14, text: String(v), fontSize: 13, fill: '#1e293b', width: 20, align: 'center' });
  }

  markedPoints.forEach(v => {
    const x = toX(v);
    shapes.push({ id: uid(), type: 'circle', x, y, radius: 6, fill: '#6366f1', stroke: '#6366f1', strokeWidth: 1 });
  });

  if (questionMark !== null) {
    const x = toX(questionMark);
    shapes.push({ id: uid(), type: 'circle', x, y, radius: 10, fill: '#ede9fe', stroke: '#6366f1', strokeWidth: 2 });
    shapes.push({ id: uid(), type: 'text', x: x - 10, y: y - 7, text: '?', fontSize: 14, fill: '#6366f1', fontStyle: 'bold', width: 20, align: 'center' });
  }

  return shapes;
}

function makeCoordGrid({ xMin = -5, xMax = 5, yMin = -5, yMax = 5, points = [] }) {
  const shapes = [];
  const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
  const scale = Math.min((CANVAS_W - 80) / (xMax - xMin), (CANVAS_H - 80) / (yMax - yMin));
  const toX = v => cx + v * scale;
  const toY = v => cy - v * scale;

  // Grid lines
  for (let x = xMin; x <= xMax; x++) {
    const sx = toX(x);
    shapes.push({ id: uid(), type: 'line', points: [sx, toY(yMin), sx, toY(yMax)], stroke: x === 0 ? '#1e293b' : '#e2e8f0', strokeWidth: x === 0 ? 2 : 1 });
    if (x !== 0) shapes.push({ id: uid(), type: 'text', x: sx - 8, y: toY(0) + 6, text: String(x), fontSize: 11, fill: '#64748b', width: 16, align: 'center' });
  }
  for (let y = yMin; y <= yMax; y++) {
    const sy = toY(y);
    shapes.push({ id: uid(), type: 'line', points: [toX(xMin), sy, toX(xMax), sy], stroke: y === 0 ? '#1e293b' : '#e2e8f0', strokeWidth: y === 0 ? 2 : 1 });
    if (y !== 0) shapes.push({ id: uid(), type: 'text', x: toX(0) - 20, y: sy - 7, text: String(y), fontSize: 11, fill: '#64748b', width: 16, align: 'right' });
  }
  // Axis arrows
  shapes.push({ id: uid(), type: 'arrow', points: [toX(xMin), cy, toX(xMax), cy], stroke: '#1e293b', strokeWidth: 2 });
  shapes.push({ id: uid(), type: 'arrow', points: [cx, toY(yMin), cx, toY(yMax)], stroke: '#1e293b', strokeWidth: 2 });
  shapes.push({ id: uid(), type: 'text', x: toX(xMax) - 4, y: cy + 6, text: 'x', fontSize: 13, fill: '#1e293b', fontStyle: 'bold' });
  shapes.push({ id: uid(), type: 'text', x: cx + 6, y: toY(yMax) - 2, text: 'y', fontSize: 13, fill: '#1e293b', fontStyle: 'bold' });

  points.forEach(({ x, y: yv, label }) => {
    shapes.push({ id: uid(), type: 'circle', x: toX(x), y: toY(yv), radius: 5, fill: '#6366f1', stroke: '#6366f1', strokeWidth: 1 });
    if (label) shapes.push({ id: uid(), type: 'text', x: toX(x) + 8, y: toY(yv) - 8, text: label, fontSize: 12, fill: '#6366f1' });
  });

  return shapes;
}

function makeBarChart({ categories = ['A', 'B', 'C', 'D'], values = [4, 7, 3, 6], yMax = 10, title = '' }) {
  const shapes = [];
  const x0 = 70, y0 = 60, chartW = CANVAS_W - 120, chartH = CANVAS_H - 120;
  const barW = Math.min(60, (chartW / categories.length) * 0.6);
  const gap = chartW / categories.length;

  // Axes
  shapes.push({ id: uid(), type: 'line', points: [x0, y0, x0, y0 + chartH], stroke: '#1e293b', strokeWidth: 2 });
  shapes.push({ id: uid(), type: 'line', points: [x0, y0 + chartH, x0 + chartW, y0 + chartH], stroke: '#1e293b', strokeWidth: 2 });

  // Y axis ticks
  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const v = Math.round((yMax / ySteps) * i);
    const sy = y0 + chartH - (v / yMax) * chartH;
    shapes.push({ id: uid(), type: 'line', points: [x0 - 5, sy, x0, sy], stroke: '#1e293b', strokeWidth: 1 });
    shapes.push({ id: uid(), type: 'text', x: x0 - 30, y: sy - 7, text: String(v), fontSize: 11, fill: '#64748b', width: 24, align: 'right' });
  }

  // Bars
  categories.forEach((cat, i) => {
    const val = values[i] || 0;
    const bx = x0 + i * gap + (gap - barW) / 2;
    const bh = (val / yMax) * chartH;
    const by = y0 + chartH - bh;
    shapes.push({ id: uid(), type: 'rect', x: bx, y: by, width: barW, height: bh, fill: '#6366f1', stroke: '#4f46e5', strokeWidth: 1 });
    shapes.push({ id: uid(), type: 'text', x: bx, y: y0 + chartH + 8, text: cat, fontSize: 12, fill: '#1e293b', width: barW, align: 'center' });
    shapes.push({ id: uid(), type: 'text', x: bx, y: by - 16, text: String(val), fontSize: 11, fill: '#4f46e5', width: barW, align: 'center' });
  });

  if (title) shapes.push({ id: uid(), type: 'text', x: x0, y: 20, text: title, fontSize: 14, fill: '#1e293b', fontStyle: 'bold', width: chartW });

  return shapes;
}

function makeClockFace({ hours = 3, minutes = 0 }) {
  const shapes = [];
  const cx = CANVAS_W / 2, cy = CANVAS_H / 2, r = 140;

  shapes.push({ id: uid(), type: 'circle', x: cx, y: cy, radius: r, fill: '#f8fafc', stroke: '#1e293b', strokeWidth: 3 });
  shapes.push({ id: uid(), type: 'circle', x: cx, y: cy, radius: 5, fill: '#1e293b', stroke: '#1e293b', strokeWidth: 1 });

  for (let i = 1; i <= 12; i++) {
    const angle = (i * 30 - 90) * (Math.PI / 180);
    const tx = cx + Math.cos(angle) * (r - 22);
    const ty = cy + Math.sin(angle) * (r - 22);
    shapes.push({ id: uid(), type: 'text', x: tx - 10, y: ty - 9, text: String(i), fontSize: 14, fill: '#1e293b', fontStyle: 'bold', width: 20, align: 'center' });
    const mx = cx + Math.cos(angle) * (r - 8);
    const my = cy + Math.sin(angle) * (r - 8);
    shapes.push({ id: uid(), type: 'line', points: [cx + Math.cos(angle) * (r - 14), cy + Math.sin(angle) * (r - 14), mx, my], stroke: '#1e293b', strokeWidth: 2 });
  }

  // Minute ticks
  for (let i = 0; i < 60; i++) {
    if (i % 5 === 0) continue;
    const angle = (i * 6 - 90) * (Math.PI / 180);
    shapes.push({ id: uid(), type: 'line', points: [cx + Math.cos(angle) * (r - 8), cy + Math.sin(angle) * (r - 8), cx + Math.cos(angle) * (r - 3), cy + Math.sin(angle) * (r - 3)], stroke: '#94a3b8', strokeWidth: 1 });
  }

  // Hour hand
  const hAngle = ((hours % 12) * 30 + minutes * 0.5 - 90) * (Math.PI / 180);
  shapes.push({ id: uid(), type: 'line', points: [cx, cy, cx + Math.cos(hAngle) * (r * 0.55), cy + Math.sin(hAngle) * (r * 0.55)], stroke: '#1e293b', strokeWidth: 5, lineCap: 'round' });

  // Minute hand
  const mAngle = (minutes * 6 - 90) * (Math.PI / 180);
  shapes.push({ id: uid(), type: 'line', points: [cx, cy, cx + Math.cos(mAngle) * (r * 0.8), cy + Math.sin(mAngle) * (r * 0.8)], stroke: '#1e293b', strokeWidth: 3, lineCap: 'round' });

  return shapes;
}

function makeLabelledShape({ shape = 'rect', width = 8, height = 5, unit = 'cm' }) {
  const shapes = [];
  const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
  const scale = 40;
  const sw = width * scale, sh = height * scale;

  if (shape === 'rect') {
    const x = cx - sw / 2, y = cy - sh / 2;
    shapes.push({ id: uid(), type: 'rect', x, y, width: sw, height: sh, fill: '#f8fafc', stroke: '#1e293b', strokeWidth: 2 });
    // Width label
    shapes.push({ id: uid(), type: 'arrow', points: [x + 10, y - 30, x + sw - 10, y - 30], stroke: '#6366f1', strokeWidth: 1.5 });
    shapes.push({ id: uid(), type: 'text', x: cx - 30, y: y - 44, text: `${width} ${unit}`, fontSize: 13, fill: '#6366f1', fontStyle: 'bold', width: 60, align: 'center' });
    // Height label
    shapes.push({ id: uid(), type: 'arrow', points: [x - 30, y + 10, x - 30, y + sh - 10], stroke: '#6366f1', strokeWidth: 1.5 });
    shapes.push({ id: uid(), type: 'text', x: x - 70, y: cy - 10, text: `${height} ${unit}`, fontSize: 13, fill: '#6366f1', fontStyle: 'bold', width: 60, align: 'center' });
  } else {
    // Equilateral-ish triangle
    const base = sw;
    const h = sh;
    const bx = cx - base / 2, by = cy + h / 2;
    shapes.push({ id: uid(), type: 'line', points: [bx, by, bx + base, by, cx, by - h, bx, by], stroke: '#1e293b', strokeWidth: 2, closed: true, fill: '#f8fafc' });
    shapes.push({ id: uid(), type: 'text', x: cx - 30, y: by + 12, text: `${width} ${unit}`, fontSize: 13, fill: '#6366f1', fontStyle: 'bold', width: 60, align: 'center' });
    shapes.push({ id: uid(), type: 'text', x: cx + base / 2 + 8, y: cy - 10, text: `${height} ${unit}`, fontSize: 13, fill: '#6366f1', fontStyle: 'bold', width: 60 });
  }

  return shapes;
}

function makePatternSeq({ count = 5, shapeTypes = ['circle', 'rect', 'circle', 'rect', '?'], colours = [] }) {
  const shapes = [];
  const slotW = Math.min(90, (CANVAS_W - 60) / count);
  const startX = (CANVAS_W - count * slotW) / 2;
  const cy = CANVAS_H / 2;
  const sz = slotW * 0.45;

  shapeTypes.slice(0, count).forEach((type, i) => {
    const cx = startX + i * slotW + slotW / 2;
    const fill = colours[i] || (i % 2 === 0 ? '#ede9fe' : '#dcfce7');
    const stroke = colours[i] ? '#1e293b' : '#6366f1';

    if (type === '?') {
      shapes.push({ id: uid(), type: 'rect', x: cx - sz, y: cy - sz, width: sz * 2, height: sz * 2, fill: '#f8fafc', stroke: '#94a3b8', strokeWidth: 2, dash: [6, 4] });
      shapes.push({ id: uid(), type: 'text', x: cx - sz, y: cy - 10, text: '?', fontSize: 22, fill: '#94a3b8', fontStyle: 'bold', width: sz * 2, align: 'center' });
    } else if (type === 'circle') {
      shapes.push({ id: uid(), type: 'circle', x: cx, y: cy, radius: sz, fill, stroke, strokeWidth: 2 });
    } else if (type === 'rect') {
      shapes.push({ id: uid(), type: 'rect', x: cx - sz, y: cy - sz, width: sz * 2, height: sz * 2, fill, stroke, strokeWidth: 2 });
    } else if (type === 'triangle') {
      shapes.push({ id: uid(), type: 'regularPolygon', x: cx, y: cy, sides: 3, radius: sz, fill, stroke, strokeWidth: 2 });
    }
  });

  return shapes;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

let _uidCounter = 0;
function uid() { return `s${Date.now()}-${++_uidCounter}`; }

function snap(v) { return Math.round(v / GRID) * GRID; }

// ─── Shape renderer ──────────────────────────────────────────────────────────

function ShapeNode({ shape, selected, onSelect, onChange, snapEnabled }) {
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    if (selected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [selected]);

  const commonProps = {
    ref: shapeRef,
    onClick: () => onSelect(shape.id),
    onTap: () => onSelect(shape.id),
    draggable: true,
    onDragEnd: e => {
      const x = snapEnabled ? snap(e.target.x()) : e.target.x();
      const y = snapEnabled ? snap(e.target.y()) : e.target.y();
      onChange({ ...shape, x, y });
    },
    onTransformEnd: () => {
      const node = shapeRef.current;
      onChange({
        ...shape,
        x: node.x(), y: node.y(),
        width: node.width() * node.scaleX(),
        height: node.height() * node.scaleY(),
        scaleX: 1, scaleY: 1,
      });
      node.scaleX(1); node.scaleY(1);
    },
  };

  const stroke = shape.stroke || '#1e293b';
  const fill   = shape.fill === 'transparent' ? 'transparent' : (shape.fill || 'transparent');

  let node = null;
  if (shape.type === 'line') {
    node = <Line key={shape.id} {...commonProps} points={shape.points} stroke={stroke} strokeWidth={shape.strokeWidth || 2} lineCap="round" closed={shape.closed} fill={shape.closed ? fill : undefined} dash={shape.dash} />;
  } else if (shape.type === 'arrow') {
    node = <Arrow key={shape.id} {...commonProps} points={shape.points} stroke={stroke} strokeWidth={shape.strokeWidth || 2} fill={stroke} pointerLength={8} pointerWidth={6} />;
  } else if (shape.type === 'rect') {
    node = <Rect key={shape.id} {...commonProps} x={shape.x} y={shape.y} width={shape.width || 100} height={shape.height || 70} fill={fill} stroke={stroke} strokeWidth={shape.strokeWidth || 2} dash={shape.dash} />;
  } else if (shape.type === 'circle') {
    node = <Circle key={shape.id} {...commonProps} x={shape.x} y={shape.y} radius={shape.radius || 40} fill={fill} stroke={stroke} strokeWidth={shape.strokeWidth || 2} />;
  } else if (shape.type === 'triangle' || shape.type === 'regularPolygon') {
    node = <RegularPolygon key={shape.id} {...commonProps} x={shape.x} y={shape.y} sides={shape.sides || 3} radius={shape.radius || 50} fill={fill} stroke={stroke} strokeWidth={shape.strokeWidth || 2} />;
  } else if (shape.type === 'text') {
    node = <Text key={shape.id} {...commonProps} x={shape.x} y={shape.y} text={shape.text || 'Text'} fontSize={shape.fontSize || 14} fill={shape.fill || '#1e293b'} fontStyle={shape.fontStyle || 'normal'} width={shape.width} align={shape.align} />;
  }

  if (!node) return null;

  return (
    <>
      {node}
      {selected && <Transformer ref={trRef} rotateEnabled={true} boundBoxFunc={(old, nw) => ({ ...nw, width: Math.max(10, nw.width), height: Math.max(10, nw.height) })} />}
    </>
  );
}

// ─── Template config panels ──────────────────────────────────────────────────

function NumberLineConfig({ onInsert }) {
  const [cfg, setCfg] = useState({ start: 0, end: 10, step: 1, questionMark: 5, markedPoints: '' });
  return (
    <div className="tpl-cfg">
      <label>Start <input type="number" value={cfg.start} onChange={e => setCfg(p => ({ ...p, start: +e.target.value }))} /></label>
      <label>End <input type="number" value={cfg.end} onChange={e => setCfg(p => ({ ...p, end: +e.target.value }))} /></label>
      <label>Step <input type="number" value={cfg.step} min="0.1" onChange={e => setCfg(p => ({ ...p, step: +e.target.value }))} /></label>
      <label>? at <input type="number" value={cfg.questionMark} onChange={e => setCfg(p => ({ ...p, questionMark: +e.target.value }))} /></label>
      <label>Mark pts (comma-sep) <input value={cfg.markedPoints} onChange={e => setCfg(p => ({ ...p, markedPoints: e.target.value }))} /></label>
      <button onClick={() => onInsert(makeNumberLine({ ...cfg, markedPoints: cfg.markedPoints.split(',').map(Number).filter(n => !isNaN(n)) }))}>Insert</button>
    </div>
  );
}

function CoordGridConfig({ onInsert }) {
  const [cfg, setCfg] = useState({ xMin: -5, xMax: 5, yMin: -5, yMax: 5 });
  return (
    <div className="tpl-cfg">
      <label>X range <input type="number" value={cfg.xMin} onChange={e => setCfg(p => ({ ...p, xMin: +e.target.value }))} /> to <input type="number" value={cfg.xMax} onChange={e => setCfg(p => ({ ...p, xMax: +e.target.value }))} /></label>
      <label>Y range <input type="number" value={cfg.yMin} onChange={e => setCfg(p => ({ ...p, yMin: +e.target.value }))} /> to <input type="number" value={cfg.yMax} onChange={e => setCfg(p => ({ ...p, yMax: +e.target.value }))} /></label>
      <button onClick={() => onInsert(makeCoordGrid(cfg))}>Insert</button>
    </div>
  );
}

function BarChartConfig({ onInsert }) {
  const [cfg, setCfg] = useState({ categories: 'Mon,Tue,Wed,Thu', values: '4,7,3,6', yMax: 10, title: '' });
  return (
    <div className="tpl-cfg">
      <label>Categories <input value={cfg.categories} onChange={e => setCfg(p => ({ ...p, categories: e.target.value }))} /></label>
      <label>Values <input value={cfg.values} onChange={e => setCfg(p => ({ ...p, values: e.target.value }))} /></label>
      <label>Y max <input type="number" value={cfg.yMax} onChange={e => setCfg(p => ({ ...p, yMax: +e.target.value }))} /></label>
      <label>Title <input value={cfg.title} onChange={e => setCfg(p => ({ ...p, title: e.target.value }))} /></label>
      <button onClick={() => onInsert(makeBarChart({ ...cfg, categories: cfg.categories.split(','), values: cfg.values.split(',').map(Number) }))}>Insert</button>
    </div>
  );
}

function ClockConfig({ onInsert }) {
  const [cfg, setCfg] = useState({ hours: 3, minutes: 0 });
  return (
    <div className="tpl-cfg">
      <label>Hours <input type="number" min="1" max="12" value={cfg.hours} onChange={e => setCfg(p => ({ ...p, hours: +e.target.value }))} /></label>
      <label>Minutes <input type="number" min="0" max="59" value={cfg.minutes} onChange={e => setCfg(p => ({ ...p, minutes: +e.target.value }))} /></label>
      <button onClick={() => onInsert(makeClockFace(cfg))}>Insert</button>
    </div>
  );
}

function LabelledShapeConfig({ onInsert }) {
  const [cfg, setCfg] = useState({ shape: 'rect', width: 8, height: 5, unit: 'cm' });
  return (
    <div className="tpl-cfg">
      <label>Shape <select value={cfg.shape} onChange={e => setCfg(p => ({ ...p, shape: e.target.value }))}><option value="rect">Rectangle</option><option value="triangle">Triangle</option></select></label>
      <label>Width <input type="number" value={cfg.width} onChange={e => setCfg(p => ({ ...p, width: +e.target.value }))} /></label>
      <label>Height <input type="number" value={cfg.height} onChange={e => setCfg(p => ({ ...p, height: +e.target.value }))} /></label>
      <label>Unit <input value={cfg.unit} onChange={e => setCfg(p => ({ ...p, unit: e.target.value }))} /></label>
      <button onClick={() => onInsert(makeLabelledShape(cfg))}>Insert</button>
    </div>
  );
}

function PatternSeqConfig({ onInsert }) {
  const [cfg, setCfg] = useState({ shapeTypes: 'circle,rect,circle,rect,?', count: 5 });
  return (
    <div className="tpl-cfg">
      <label>Shapes (circle/rect/triangle/?) <input value={cfg.shapeTypes} onChange={e => setCfg(p => ({ ...p, shapeTypes: e.target.value }))} /></label>
      <button onClick={() => {
        const types = cfg.shapeTypes.split(',').map(s => s.trim());
        onInsert(makePatternSeq({ shapeTypes: types, count: types.length }));
      }}>Insert</button>
    </div>
  );
}

const TEMPLATE_CONFIGS = {
  numberLine: NumberLineConfig,
  coordGrid: CoordGridConfig,
  barChart: BarChartConfig,
  clockFace: ClockConfig,
  labelledShape: LabelledShapeConfig,
  patternSeq: PatternSeqConfig,
};

// ─── Main Editor ─────────────────────────────────────────────────────────────

// ─── AI prompt builder ────────────────────────────────────────────────────────

const SHAPE_SCHEMA = `Canvas: ${CANVAS_W}×${CANVAS_H}px. Origin top-left.

Return ONLY a JSON object — no markdown fences, no text before or after:
{
  "shapes": [
    // one object per element on the canvas
  ]
}

Each shape object must have an "id" (unique string) and "type", plus type-specific fields:

line      : { points:[x1,y1,x2,y2,...], stroke, strokeWidth, closed?, fill?, dash?:[on,off] }
arrow     : { points:[x1,y1,x2,y2], stroke, strokeWidth }
rect      : { x, y, width, height, fill, stroke, strokeWidth, dash?:[on,off] }
circle    : { x, y, radius, fill, stroke, strokeWidth }
triangle  : { x, y, radius, sides:3, fill, stroke, strokeWidth }
regularPolygon : { x, y, sides, radius, fill, stroke, strokeWidth }
text      : { x, y, text, fontSize, fill, fontStyle?:"bold"|"italic"|"normal", width?, align?:"left"|"center"|"right" }

Colour values: use hex strings e.g. "#1e293b". For no fill use "transparent".
Keep strokes clean and exam-appropriate. Use "#1e293b" (near-black) for lines and text.
Use "#6366f1" (indigo) sparingly for highlights or question-mark elements.
Leave at least 30px margin on all sides.`;

function buildAiPrompt(description) {
  return `You are a diagram generator for UK 11+ exam questions (GL, CEM, FSCE formats). The diagrams are used on exam papers for children aged 9–11.

${SHAPE_SCHEMA}

Generate a clear, accurate diagram for the following description:
"${description}"

Rules:
- Use only the shape types listed above.
- Every shape must have a unique "id" string.
- Position shapes so the diagram is well-centred and readable.
- For number lines: draw a horizontal arrow, add tick marks with Line shapes, label with Text shapes.
- For coordinate grids: draw x and y axis arrows, grid lines, tick labels.
- For bar charts: draw axis Lines, Rect bars, Text labels on x-axis and above bars.
- For clock faces: Circle for the clock, Line shapes for hands and tick marks, Text for numbers.
- For labelled shapes: draw the shape, add Arrow shapes for dimension lines, Text for measurements.
- Keep the diagram simple and uncluttered — this is a children's exam.`;
}

function parseAiResponse(raw) {
  const cleaned = raw.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed.shapes || !Array.isArray(parsed.shapes)) throw new Error('Response must have a "shapes" array');
  // Ensure every shape has a unique id
  return parsed.shapes.map((s, i) => ({ ...s, id: s.id || uid() + i }));
}

// ─── Main Editor ─────────────────────────────────────────────────────────────

export default function DiagramEditor({ onSave, onClose, questionId }) {
  const [shapes, setShapes] = useState([]);
  const [tool, setTool] = useState('select');
  const [selected, setSelected] = useState(null);
  const [strokeColour, setStrokeColour] = useState('#1e293b');
  const [fillColour, setFillColour] = useState('transparent');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fontSize, setFontSize] = useState(14);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [activeTpl, setActiveTpl] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [saving, setSaving] = useState(false);
  const [drawing, setDrawing] = useState(null); // { startX, startY }
  const stageRef = useRef();

  // AI natural language state
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiDescription, setAiDescription] = useState('');
  const [aiPromptText, setAiPromptText] = useState('');   // generated prompt to copy
  const [aiResponse, setAiResponse] = useState('');        // pasted response
  const [aiCopied, setAiCopied] = useState(false);
  const [aiError, setAiError] = useState('');

  // Save to undo stack before any mutation
  const push = useCallback(newShapes => {
    setUndoStack(prev => [...prev.slice(-MAX_UNDO), shapes]);
    setShapes(newShapes);
    setSelected(null);
  }, [shapes]);

  const undo = useCallback(() => {
    if (!undoStack.length) return;
    setShapes(undoStack[undoStack.length - 1]);
    setUndoStack(prev => prev.slice(0, -1));
  }, [undoStack]);

  const generateAiPrompt = useCallback(() => {
    if (!aiDescription.trim()) return;
    setAiPromptText(buildAiPrompt(aiDescription.trim()));
    setAiResponse('');
    setAiError('');
  }, [aiDescription]);

  const copyAiPrompt = useCallback(() => {
    navigator.clipboard.writeText(aiPromptText).then(() => {
      setAiCopied(true);
      setTimeout(() => setAiCopied(false), 2500);
    });
  }, [aiPromptText]);

  const applyAiResponse = useCallback(() => {
    setAiError('');
    try {
      const newShapes = parseAiResponse(aiResponse);
      push([...shapes, ...newShapes]);
      setAiResponse('');
      setAiPromptText('');
      setAiDescription('');
      setShowAiPanel(false);
    } catch (err) {
      setAiError('Could not parse response — make sure you pasted valid JSON. ' + err.message);
    }
  }, [aiResponse, shapes, push]);

  useEffect(() => {
    const handler = e => { if ((e.ctrlKey || e.metaKey) && e.key === 'z') undo(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo]);

  const insertTemplate = useCallback(newShapes => {
    push([...shapes, ...newShapes]);
    setActiveTpl(null);
    setTool('select');
  }, [shapes, push]);

  const handleStageMouseDown = useCallback(e => {
    if (tool === 'select') {
      if (e.target === e.target.getStage()) setSelected(null);
      return;
    }

    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const x = snapEnabled ? snap(pos.x) : pos.x;
    const y = snapEnabled ? snap(pos.y) : pos.y;

    if (tool === 'eraser') return;

    if (tool === 'text') {
      const text = window.prompt('Enter text:', 'Label');
      if (!text) return;
      push([...shapes, { id: uid(), type: 'text', x, y, text, fontSize, fill: strokeColour }]);
      return;
    }

    setDrawing({ startX: x, startY: y });
  }, [tool, snapEnabled, shapes, push, strokeColour, fontSize]);

  const handleStageMouseUp = useCallback(e => {
    if (!drawing) return;
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const ex = snapEnabled ? snap(pos.x) : pos.x;
    const ey = snapEnabled ? snap(pos.y) : pos.y;
    const { startX: sx, startY: sy } = drawing;
    setDrawing(null);

    const minSize = 5;
    if (Math.abs(ex - sx) < minSize && Math.abs(ey - sy) < minSize) return;

    let newShape = null;
    if (tool === 'line') {
      newShape = { id: uid(), type: 'line', points: [sx, sy, ex, ey], stroke: strokeColour, strokeWidth };
    } else if (tool === 'arrow') {
      newShape = { id: uid(), type: 'arrow', points: [sx, sy, ex, ey], stroke: strokeColour, strokeWidth };
    } else if (tool === 'rect') {
      newShape = { id: uid(), type: 'rect', x: Math.min(sx, ex), y: Math.min(sy, ey), width: Math.abs(ex - sx), height: Math.abs(ey - sy), fill: fillColour, stroke: strokeColour, strokeWidth };
    } else if (tool === 'circle') {
      const radius = Math.max(Math.abs(ex - sx), Math.abs(ey - sy)) / 2;
      newShape = { id: uid(), type: 'circle', x: (sx + ex) / 2, y: (sy + ey) / 2, radius, fill: fillColour, stroke: strokeColour, strokeWidth };
    } else if (tool === 'triangle') {
      const radius = Math.max(Math.abs(ex - sx), Math.abs(ey - sy)) / 2;
      newShape = { id: uid(), type: 'triangle', x: (sx + ex) / 2, y: (sy + ey) / 2, radius, sides: 3, fill: fillColour, stroke: strokeColour, strokeWidth };
    }

    if (newShape) push([...shapes, newShape]);
  }, [drawing, snapEnabled, tool, shapes, push, strokeColour, fillColour, strokeWidth]);

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    push(shapes.filter(s => s.id !== selected));
    setSelected(null);
  }, [selected, shapes, push]);

  useEffect(() => {
    const handler = e => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && e.target.tagName !== 'INPUT') deleteSelected();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deleteSelected, selected]);

  const updateSelected = useCallback(patch => {
    setShapes(prev => prev.map(s => s.id === selected ? { ...s, ...patch } : s));
  }, [selected]);

  const handleSave = useCallback(async (saveOnly = false) => {
    if (!stageRef.current) return;
    setSaving(true);
    try {
      const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2 });
      const token = localStorage.getItem('token');
      const res = await fetch('/api/diagrams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dataUrl }),
      });
      const { imageUrl } = await res.json();
      if (onSave) await onSave(imageUrl, saveOnly);
    } catch (err) {
      alert('Failed to save diagram: ' + err.message);
    } finally {
      setSaving(false);
    }
  }, [onSave]);

  const selectedShape = shapes.find(s => s.id === selected);
  const ActiveTplConfig = activeTpl ? TEMPLATE_CONFIGS[activeTpl] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginRight: 4 }}>Create Diagram</span>

        {/* Templates */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TEMPLATES.map(t => (
            <button key={t.id} onClick={() => setActiveTpl(activeTpl === t.id ? null : t.id)}
              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: activeTpl === t.id ? '#ede9fe' : '#fff', color: activeTpl === t.id ? '#5b21b6' : '#475569', cursor: 'pointer', fontWeight: 500 }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={() => { setShowAiPanel(p => !p); setActiveTpl(null); }}
          style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: showAiPanel ? '#ede9fe' : '#fff', color: showAiPanel ? '#5b21b6' : '#475569', cursor: 'pointer', fontWeight: 600 }}>
          ✨ AI
        </button>
        <div style={{ width: 1, height: 20, background: '#e2e8f0' }} />
        <label style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={snapEnabled} onChange={e => setSnapEnabled(e.target.checked)} /> Snap
        </label>
        <button onClick={undo} disabled={!undoStack.length} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: undoStack.length ? 'pointer' : 'not-allowed', color: '#64748b' }}>↩ Undo</button>
        <button onClick={() => { if (window.confirm('Clear canvas?')) push([]); }} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#64748b' }}>Clear</button>
        <button onClick={() => handleSave(true)} disabled={saving} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid #6366f1', background: '#fff', color: '#6366f1', cursor: 'pointer', fontWeight: 500 }}>Save to Bank</button>
        <button onClick={() => handleSave(false)} disabled={saving} style={{ fontSize: 12, padding: '5px 16px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
          {saving ? 'Saving…' : 'Save & Assign'}
        </button>
        <button onClick={onClose} style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>✕</button>
      </div>

      {/* ── Template config panel ── */}
      {ActiveTplConfig && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>
          <style>{`.tpl-cfg { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; font-size: 12px; color: #475569; }
            .tpl-cfg label { display: flex; gap: 6px; align-items: center; }
            .tpl-cfg input, .tpl-cfg select { border: 1px solid #e2e8f0; border-radius: 5px; padding: 3px 7px; font-size: 12px; width: 80px; }
            .tpl-cfg button { background: #6366f1; color: #fff; border: none; border-radius: 6px; padding: 5px 14px; font-size: 12px; cursor: pointer; font-weight: 600; }`}
          </style>
          <ActiveTplConfig onInsert={insertTemplate} />
        </div>
      )}

      {/* ── AI natural language panel ── */}
      {showAiPanel && (
        <div style={{ padding: '12px 16px', borderBottom: '2px solid #e0e7ff', background: '#f5f3ff' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5b21b6', marginBottom: 4 }}>
                ✨ Describe your diagram in plain English
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={aiDescription}
                  onChange={e => setAiDescription(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && generateAiPrompt()}
                  placeholder='e.g. "a number line from 0 to 20 with a question mark at 15"'
                  style={{ flex: 1, border: '1px solid #c4b5fd', borderRadius: 7, padding: '6px 10px', fontSize: 12, background: '#fff', color: '#1e293b', outline: 'none' }}
                />
                <button onClick={generateAiPrompt} disabled={!aiDescription.trim()}
                  style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: '#6366f1', color: '#fff', fontSize: 12, fontWeight: 600, cursor: aiDescription.trim() ? 'pointer' : 'not-allowed', opacity: aiDescription.trim() ? 1 : 0.5 }}>
                  Generate prompt
                </button>
              </div>
            </div>

            {aiPromptText && (
              <div style={{ flex: 2, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#5b21b6' }}>Step 1 — Copy and paste into claude.ai</span>
                  <button onClick={copyAiPrompt}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, border: 'none', background: aiCopied ? '#10b981' : '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600, transition: 'background 0.2s' }}>
                    {aiCopied ? '✓ Copied!' : 'Copy prompt'}
                  </button>
                </div>
                <textarea readOnly value={aiPromptText} rows={3}
                  style={{ width: '100%', fontSize: 11, fontFamily: 'monospace', background: '#fff', border: '1px solid #c4b5fd', borderRadius: 6, padding: '6px 8px', resize: 'none', color: '#475569' }} />

                <div style={{ fontSize: 11, fontWeight: 700, color: '#5b21b6', marginTop: 2 }}>Step 2 — Paste Claude's JSON response here</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <textarea
                    value={aiResponse}
                    onChange={e => { setAiResponse(e.target.value); setAiError(''); }}
                    placeholder='Paste the JSON response from claude.ai…'
                    rows={3}
                    style={{ flex: 1, fontSize: 11, fontFamily: 'monospace', background: '#fff', border: '1px solid #c4b5fd', borderRadius: 6, padding: '6px 8px', resize: 'none', color: '#1e293b' }}
                  />
                  <button onClick={applyAiResponse} disabled={!aiResponse.trim()}
                    style={{ alignSelf: 'flex-end', padding: '6px 14px', borderRadius: 7, border: 'none', background: '#10b981', color: '#fff', fontSize: 12, fontWeight: 600, cursor: aiResponse.trim() ? 'pointer' : 'not-allowed', opacity: aiResponse.trim() ? 1 : 0.5 }}>
                    Apply to canvas
                  </button>
                </div>
                {aiError && <div style={{ fontSize: 11, color: '#ef4444', background: '#fee2e2', borderRadius: 5, padding: '4px 8px' }}>{aiError}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* ── Tool palette ── */}
        <div style={{ width: 52, background: '#f8fafc', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0', gap: 4 }}>
          {TOOLS.map(t => (
            <button key={t.id}
              title={t.label}
              onClick={() => { setTool(t.id); if (t.id === 'eraser') deleteSelected(); }}
              style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: tool === t.id ? '#ede9fe' : 'transparent', color: tool === t.id ? '#5b21b6' : '#475569', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {t.icon}
            </button>
          ))}
        </div>

        {/* ── Canvas ── */}
        <div style={{ flex: 1, overflow: 'auto', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: tool === 'select' ? 'default' : 'crosshair' }}>
          <Stage
            ref={stageRef}
            width={CANVAS_W}
            height={CANVAS_H}
            style={{ border: '1px solid #e2e8f0', borderRadius: 4 }}
            onMouseDown={handleStageMouseDown}
            onMouseUp={handleStageMouseUp}
          >
            <Layer>
              {/* Dot grid */}
              {Array.from({ length: Math.floor(CANVAS_H / GRID) + 1 }, (_, row) =>
                Array.from({ length: Math.floor(CANVAS_W / GRID) + 1 }, (_, col) => (
                  <Circle key={`${row}-${col}`} x={col * GRID} y={row * GRID} radius={1} fill="#e2e8f0" listening={false} />
                ))
              )}
            </Layer>
            <Layer>
              {shapes.map(shape => (
                <ShapeNode
                  key={shape.id}
                  shape={shape}
                  selected={selected === shape.id}
                  snapEnabled={snapEnabled}
                  onSelect={id => { if (tool === 'eraser') { push(shapes.filter(s => s.id !== id)); } else { setTool('select'); setSelected(id); } }}
                  onChange={updated => setShapes(prev => prev.map(s => s.id === updated.id ? updated : s))}
                />
              ))}
            </Layer>
          </Stage>
        </div>

        {/* ── Properties panel ── */}
        <div style={{ width: 160, background: '#f8fafc', borderLeft: '1px solid #e2e8f0', padding: 14, display: 'flex', flexDirection: 'column', gap: 14, fontSize: 12, color: '#475569', overflowY: 'auto' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 6 }}>Stroke</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {STROKE_COLOURS.map(c => (
                <div key={c} onClick={() => { setStrokeColour(c); if (selected) updateSelected({ stroke: c }); }}
                  style={{ width: 22, height: 22, borderRadius: 4, background: c, border: strokeColour === c ? '2px solid #6366f1' : '1px solid #e2e8f0', cursor: 'pointer' }} />
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 6 }}>Fill</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {FILL_COLOURS.map(c => (
                <div key={c} onClick={() => { setFillColour(c); if (selected) updateSelected({ fill: c }); }}
                  style={{ width: 22, height: 22, borderRadius: 4, background: c === 'transparent' ? undefined : c, border: fillColour === c ? '2px solid #6366f1' : '1px solid #e2e8f0', cursor: 'pointer',
                    backgroundImage: c === 'transparent' ? 'repeating-linear-gradient(45deg,#e2e8f0 0,#e2e8f0 1px,#fff 0,#fff 50%)'  : undefined, backgroundSize: '6px 6px' }} />
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 6 }}>Stroke width</div>
            <input type="range" min="1" max="8" value={strokeWidth} onChange={e => { setStrokeWidth(+e.target.value); if (selected) updateSelected({ strokeWidth: +e.target.value }); }} style={{ width: '100%' }} />
            <div style={{ textAlign: 'center', fontSize: 11 }}>{strokeWidth}px</div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 6 }}>Font size</div>
            <input type="range" min="8" max="32" value={fontSize} onChange={e => { setFontSize(+e.target.value); if (selected) updateSelected({ fontSize: +e.target.value }); }} style={{ width: '100%' }} />
            <div style={{ textAlign: 'center', fontSize: 11 }}>{fontSize}px</div>
          </div>

          {selectedShape?.type === 'text' && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 6 }}>Text</div>
              <input
                defaultValue={selectedShape.text}
                onBlur={e => updateSelected({ text: e.target.value })}
                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 5, padding: '4px 6px', fontSize: 12 }}
              />
            </div>
          )}

          {selected && (
            <button onClick={deleteSelected} style={{ marginTop: 'auto', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, color: '#ef4444', padding: '5px 0', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
