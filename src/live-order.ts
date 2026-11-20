type Entry = {
  id: number;
  finish: number | null;
  dnf: boolean;
  progress: { distance: number };
};

export class LiveOrder {
  private displayed: number[] = [];
  private challenges = new Map<string, number>();

  reset() {
    this.displayed = [];
    this.challenges.clear();
  }

  update<T extends Entry>(ranked: readonly T[], seconds: number) {
    const running = ranked.filter(racer => racer.finish === null && !racer.dnf);
    const actual = new Map(running.map((racer, index) => [racer.id, { racer, index }]));
    const order = this.displayed.flatMap(id => {
      const entry = actual.get(id);
      return entry ? [entry] : [];
    });
    for (const entry of actual.values()) {
      if (!this.displayed.includes(entry.racer.id)) order.push(entry);
    }

    const since = new Map<string, number>();
    for (let earlier = 0; earlier < order.length; earlier++) {
      for (let later = earlier + 1; later < order.length; later++) {
        const ahead = order[earlier], challenger = order[later];
        if (challenger.index >= ahead.index) continue;
        const key = `${challenger.racer.id}/${ahead.racer.id}`;
        since.set(key, this.challenges.get(key) ?? seconds);
      }
    }
    this.challenges = since;
    for (let i = 1; i < order.length; i++) {
      const challenger = order[i];
      let j = i;
      while (j > 0) {
        const ahead = order[j - 1];
        if (challenger.index >= ahead.index) break;
        const held = seconds - (since.get(`${challenger.racer.id}/${ahead.racer.id}`) ?? seconds);
        const gap = challenger.racer.progress.distance - ahead.racer.progress.distance;
        if (gap < 0.25 && !(held >= 0.24 && gap >= 0.08) && held < 0.6) break;
        order[j] = ahead;
        j--;
      }
      order[j] = challenger;
    }

    const result = [
      ...ranked.filter(racer => racer.finish !== null),
      ...order.map(entry => entry.racer),
      ...ranked.filter(racer => racer.dnf),
    ];
    this.displayed = result.map(racer => racer.id);
    return result;
  }
}
