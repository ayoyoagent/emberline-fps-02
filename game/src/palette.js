// EMBERLINE look plan, in one place. Bright daylight freight yard: pale sky,
// warm sun, red brick, light concrete, rust containers. Six named colours;
// the lighting and the procedural textures make every shade the game needs.
export const PALETTE = {
  canvas: '#9fc4e0', // pale blue sky
  surface: '#c8c2b4', // light concrete
  hairline: '#8a7f6d', // weathered timber / dark concrete
  ink: '#23211d', // near-black trim
  muted: '#6f7d84', // blue-grey steel
  accent: '#f5a623', // ember amber
  ember: '#f5a623',
  ashfall: '#3fb8bf',
  brick: '#a4553f',
  rust: '#8a4a2b',
  leaf: '#7d8f5a',
};

export function shade(name) {
  return PALETTE[name];
}
