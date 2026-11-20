export class Random {
  private state: number;

  constructor(seed: string) {
    this.state = 2166136261;
    for (let i = 0; i < seed.length; i++) this.state = Math.imul(this.state ^ seed.charCodeAt(i), 16777619);
  }

  next() {
    let n = this.state = (this.state + 0x6d2b79f5) | 0;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  }

  float(min: number, max: number) { return min + this.next() * (max - min); }
  int(min: number, max: number) { return Math.floor(this.float(min, max + 1)); }
  pick<T>(items: readonly T[]): T { return items[this.int(0, items.length - 1)]; }

  shuffle<T>(items: readonly T[]) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
