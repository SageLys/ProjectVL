export type SkillShape =
  | 'circle' | 'triangle' | 'square' | 'diamond' | 'pentagon'
  | 'hexagon' | 'octagon' | 'ring' | 'capsule' | 'verticalHexagon' | 'star8';

export type SkillGlyph =
  | 'pierce' | 'zigzag' | 'split' | 'snow' | 'target'
  | 'impact' | 'ember' | 'crosshair' | 'harvest' | 'barrier' | 'thorn'
  | 'fallback';

export type GeometryCommand =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'line'; x: number; y: number }
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'close' };

const point = (x: number, y: number): GeometryCommand => ({ kind: 'line', x, y });

function polygon(sides: number, radius = 7, rotation = -Math.PI / 2): GeometryCommand[] {
  const commands: GeometryCommand[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = rotation + i * Math.PI * 2 / sides;
    const x = 8 + Math.cos(angle) * radius;
    const y = 8 + Math.sin(angle) * radius;
    commands.push(i === 0 ? { kind: 'move', x, y } : point(x, y));
  }
  commands.push({ kind: 'close' });
  return commands;
}

export function shapeGeometry(shape: SkillShape): GeometryCommand[] {
  switch (shape) {
    case 'circle': return [{ kind: 'circle', x: 8, y: 8, r: 7 }];
    case 'triangle': return polygon(3, 7.4);
    case 'square': return [{ kind: 'move', x: 1.5, y: 1.5 }, point(14.5, 1.5), point(14.5, 14.5), point(1.5, 14.5), { kind: 'close' }];
    case 'diamond': return [{ kind: 'move', x: 8, y: 0.7 }, point(14, 8), point(8, 15.3), point(2, 8), { kind: 'close' }];
    case 'pentagon': return polygon(5, 7.2);
    case 'hexagon': return polygon(6, 7.1);
    case 'octagon': return polygon(8, 7.1);
    case 'ring': return [{ kind: 'circle', x: 8, y: 8, r: 7 }, { kind: 'circle', x: 8, y: 8, r: 5.2 }];
    case 'capsule':
      return [
        { kind: 'move', x: 5, y: 1.5 }, point(11, 1.5), point(13.5, 3), point(14.5, 5),
        point(14.5, 11), point(13.5, 13), point(11, 14.5), point(5, 14.5),
        point(2.5, 13), point(1.5, 11), point(1.5, 5), point(2.5, 3), { kind: 'close' },
      ];
    case 'verticalHexagon':
      return [{ kind: 'move', x: 8, y: 0.6 }, point(14, 4), point(14, 12), point(8, 15.4), point(2, 12), point(2, 4), { kind: 'close' }];
    case 'star8': {
      const commands: GeometryCommand[] = [];
      for (let i = 0; i < 16; i++) {
        const radius = i % 2 === 0 ? 7.3 : 5.2;
        const angle = -Math.PI / 2 + i * Math.PI / 8;
        const x = 8 + Math.cos(angle) * radius;
        const y = 8 + Math.sin(angle) * radius;
        commands.push(i === 0 ? { kind: 'move', x, y } : point(x, y));
      }
      commands.push({ kind: 'close' });
      return commands;
    }
  }
}

const line = (x1: number, y1: number, x2: number, y2: number): GeometryCommand[] => [
  { kind: 'move', x: x1, y: y1 }, point(x2, y2),
];

export function glyphGeometry(glyph: SkillGlyph): GeometryCommand[] {
  switch (glyph) {
    case 'pierce': return line(8, 1.5, 8, 14.5);
    case 'zigzag': return [{ kind: 'move', x: 10, y: 1.5 }, point(5, 7), point(9, 7), point(6, 14.5), point(12, 6), point(8, 6)];
    case 'split': return [...line(8, 8, 8, 3), ...line(8, 8, 3.8, 11.8), ...line(8, 8, 12.2, 11.8)];
    case 'snow': {
      const commands: GeometryCommand[] = [];
      for (let i = 0; i < 3; i++) {
        const angle = i * Math.PI / 3;
        const dx = Math.cos(angle) * 5.4;
        const dy = Math.sin(angle) * 5.4;
        commands.push(...line(8 - dx, 8 - dy, 8 + dx, 8 + dy));
      }
      return commands;
    }
    case 'target': return [{ kind: 'move', x: 4.5, y: 4.5 }, point(11.5, 4.5), point(11.5, 11.5), point(4.5, 11.5), { kind: 'close' }, { kind: 'circle', x: 8, y: 8, r: 1 }];
    case 'impact': return [...line(8, 6.2, 8, 2.3), ...line(8, 9.8, 8, 13.7), ...line(6.2, 8, 2.3, 8), ...line(9.8, 8, 13.7, 8), ...line(8, 2.3, 6.8, 4), ...line(8, 2.3, 9.2, 4), ...line(8, 13.7, 6.8, 12), ...line(8, 13.7, 9.2, 12), ...line(2.3, 8, 4, 6.8), ...line(2.3, 8, 4, 9.2), ...line(13.7, 8, 12, 6.8), ...line(13.7, 8, 12, 9.2)];
    case 'ember': return [{ kind: 'move', x: 8, y: 2.2 }, point(13, 12.8), point(3, 12.8), { kind: 'close' }, { kind: 'move', x: 8, y: 5.7 }, point(10.5, 11), point(5.5, 11), { kind: 'close' }];
    case 'crosshair': return [...line(8, 2, 8, 14), ...line(2, 8, 14, 8), { kind: 'circle', x: 8, y: 8, r: 3 }];
    case 'harvest': return [{ kind: 'circle', x: 4, y: 10.5, r: 1.2 }, { kind: 'circle', x: 8, y: 8.5, r: 1.6 }, { kind: 'circle', x: 12, y: 6, r: 2 }];
    case 'barrier': return [...line(3.5, 6, 12.5, 6), ...line(3.5, 10, 12.5, 10)];
    case 'thorn': return [{ kind: 'move', x: 8, y: 3 }, point(13, 8), point(8, 13), point(3, 8), { kind: 'close' }];
    case 'fallback': return [{ kind: 'move', x: 5.5, y: 5.5 }, point(6.2, 3.8), point(8, 3), point(10, 3.8), point(10.5, 5.5), point(8, 8), point(8, 10), { kind: 'circle', x: 8, y: 13, r: 0.8 }];
  }
}

export function traceGeometryToCanvas(ctx: CanvasRenderingContext2D, geometry: readonly GeometryCommand[], size: number): void {
  const scale = size / 16;
  const offset = -size / 2;
  for (const command of geometry) {
    if (command.kind === 'move') ctx.moveTo(offset + command.x * scale, offset + command.y * scale);
    else if (command.kind === 'line') ctx.lineTo(offset + command.x * scale, offset + command.y * scale);
    else if (command.kind === 'circle') {
      ctx.moveTo(offset + (command.x + command.r) * scale, offset + command.y * scale);
      ctx.arc(offset + command.x * scale, offset + command.y * scale, command.r * scale, 0, Math.PI * 2);
    } else ctx.closePath();
  }
}

const n = (value: number): string => Number(value.toFixed(3)).toString();

export function geometryToSvgPath(geometry: readonly GeometryCommand[]): string {
  return geometry.map(command => {
    if (command.kind === 'move') return `M${n(command.x)} ${n(command.y)}`;
    if (command.kind === 'line') return `L${n(command.x)} ${n(command.y)}`;
    if (command.kind === 'close') return 'Z';
    const left = command.x - command.r;
    const diameter = command.r * 2;
    return `M${n(left)} ${n(command.y)}a${n(command.r)} ${n(command.r)} 0 1 0 ${n(diameter)} 0a${n(command.r)} ${n(command.r)} 0 1 0 ${n(-diameter)} 0`;
  }).join(' ');
}

export function glyphToSvg(shape: SkillShape, glyph: SkillGlyph): string {
  const outline = geometryToSvgPath(shapeGeometry(shape));
  const symbol = geometryToSvgPath(glyphGeometry(glyph));
  return `<path d="${outline}" fill="rgba(5,13,24,.92)" fill-rule="evenodd" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="${symbol}" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>`;
}
