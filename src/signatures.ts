import { Random } from './random';
import type { Surface } from './surfaces';
import type { Mechanism } from './track';

export const TRACK_IDS = ['paper-moon', 'cedar-creek', 'bellflower', 'clockmaker', 'aurora',
  'cloud-quilt', 'truck-art', 'fossil-canyon', 'prism-aquarium', 'midnight-record'] as const;
export type TrackId = typeof TRACK_IDS[number];

export const RESERVE_SEEDS: Record<TrackId, string> = {
  'paper-moon': 'postmark-26', 'cedar-creek': 'parcel-19', bellflower: 'nightshift-43',
  clockmaker: 'gearbox-04', aurora: 'nightshift-43', 'cloud-quilt': 'postmark-26',
  'truck-art': 'postmark-26', 'fossil-canyon': 'switchback-71', 'prism-aquarium': 'blue-hour-57',
  'midnight-record': 'switchback-71',
};

export type Signature = {
  name: string; landmark: string; finish: string;
  music: 'workshop' | 'rainbow' | 'crystal' | 'night';
  colors: readonly [sky: string, deck: string, trim: string, accent: string, detail: string];
  deck: Surface; inside: Surface; outside: Surface; finishSurface: Surface;
  shape: 'fork' | 'bowl' | 'sweep' | 'cross';
  turn: number; width: number; length: number;
  approach: readonly Mechanism[];
};

export const SIGNATURES: Record<TrackId, Signature> = {
  'paper-moon': { name: 'Paper Moon Post Office', landmark: 'Envelope fork', finish: 'Sorting tray',
    music: 'night', colors: ['#283047', '#c69763', '#5c413c', '#4e97db', '#f4cd8b'],
    deck: 'cardboard', inside: 'cardboard', outside: 'tape', finishSurface: 'cardboard',
    shape: 'fork', turn: 1.05, width: 5.7, length: 62, approach: ['waves', 'tilt', 'bank'] },
  'cedar-creek': { name: 'Cedar Creek Watermill', landmark: 'Millrace and scoop', finish: 'Mill bridge',
    music: 'workshop', colors: ['#466866', '#c78e58', '#5d4332', '#779c57', '#d5b77c'],
    deck: 'bamboo', inside: 'bamboo', outside: 'wood', finishSurface: 'wood',
    shape: 'fork', turn: 1.03, width: 5.9, length: 66, approach: ['slalom', 'bank', 'waves'] },
  bellflower: { name: 'Bellflower Pottery Garden', landmark: 'Glazed flower bowl', finish: 'Porcelain bell',
    music: 'crystal', colors: ['#74998f', '#cb795d', '#8b483b', '#3e72bc', '#e4ede8'],
    deck: 'clay', inside: 'glaze', outside: 'glaze', finishSurface: 'glaze',
    shape: 'bowl', turn: 2.33, width: 6.6, length: 78, approach: ['slalom', 'waves', 'bank'] },
  clockmaker: { name: 'The Clockmaker’s Brass Band', landmark: 'Brass distributor', finish: 'Piano keys',
    music: 'workshop', colors: ['#463d4a', '#bd9355', '#62383b', '#d5a951', '#d8866d'],
    deck: 'brass', inside: 'brass', outside: 'copper', finishSurface: 'wood',
    shape: 'bowl', turn: 1.93, width: 5.9, length: 68, approach: ['bowl', 'chime', 'waves'] },
  aurora: { name: 'Aurora Ice Harbor', landmark: 'Lantern hairpin', finish: 'Ice arch',
    music: 'crystal', colors: ['#273d64', '#80bacf', '#28445e', '#66dfcb', '#d3e9fb'],
    deck: 'ice', inside: 'ice', outside: 'ice', finishSurface: 'ice',
    shape: 'sweep', turn: 3.05, width: 6.5, length: 78, approach: ['waves', 'tunnel', 'bank'] },
  'cloud-quilt': { name: 'Cloud Quilt Carnival', landmark: 'Fabric drum crossing', finish: 'Rosette ribbon',
    music: 'rainbow', colors: ['#827ba9', '#cb99b0', '#704b75', '#f0a482', '#f0d4b2'],
    deck: 'felt', inside: 'cloth', outside: 'satin', finishSurface: 'satin',
    shape: 'fork', turn: .8, width: 6.1, length: 65, approach: ['bank', 'waves', 'jump'] },
  'truck-art': { name: 'Truck Art Mountain Pass', landmark: 'Peacock hairpin', finish: 'Painted gantry',
    music: 'rainbow', colors: ['#527a85', '#dfc79d', '#22506a', '#ef694d', '#6cce93'],
    deck: 'enamel', inside: 'rubber', outside: 'steel', finishSurface: 'enamel',
    shape: 'sweep', turn: 2.92, width: 6.1, length: 73, approach: ['bank', 'slalom', 'bank'] },
  'fossil-canyon': { name: 'Fossil Canyon Dig', landmark: 'Exposed rib and basin', finish: 'Dinosaur mural',
    music: 'workshop', colors: ['#855f51', '#c4815d', '#7d463f', '#f0d6a2', '#718889'],
    deck: 'sandstone', inside: 'sandstone', outside: 'slate', finishSurface: 'slate',
    shape: 'fork', turn: 1.0, width: 6.1, length: 67, approach: ['waves', 'jump', 'bank'] },
  'prism-aquarium': { name: 'Prism Aquarium', landmark: 'Coral crossover', finish: 'Glass pier',
    music: 'crystal', colors: ['#2a5264', '#73bac8', '#22536a', '#e88caa', '#70ead7'],
    deck: 'acrylic', inside: 'acrylic', outside: 'acrylic', finishSurface: 'acrylic',
    shape: 'cross', turn: 2.1, width: 6.1, length: 77, approach: ['tunnel', 'waves', 'bank'] },
  'midnight-record': { name: 'Midnight Record Club', landmark: 'Vinyl crossover', finish: 'Ivory exit ramp',
    music: 'night', colors: ['#35324e', '#ba8868', '#503440', '#cc826f', '#e1c583'],
    deck: 'wood', inside: 'felt', outside: 'vinyl', finishSurface: 'glaze',
    shape: 'bowl', turn: 2.9, width: 6.7, length: 76, approach: ['waves', 'tilt', 'bank'] },
};

export function signatureFor(seed: string, round: number) {
  const cycle = Math.floor((round - 1) / TRACK_IDS.length);
  const deck = (index: number) => new Random(`${seed}/signature-deck/${index}`).shuffle(TRACK_IDS);
  const order = deck(cycle);
  if (cycle && order[0] === deck(cycle - 1).at(-1)) [order[0], order[1]] = [order[1], order[0]];
  return order[(round - 1) % TRACK_IDS.length];
}
