export interface GridPos {
  x: number;
  y: number;
}

interface HeapNode<T> {
  item: T;
  priority: number;
}

class MinHeap<T> {
  private data: HeapNode<T>[] = [];

  get size(): number {
    return this.data.length;
  }

  push(item: T, priority: number): void {
    this.data.push({ item, priority });
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const end = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = end;
      this.sinkDown(0);
    }
    return top.item;
  }

  private bubbleUp(index: number): void {
    const node = this.data[index];
    while (index > 0) {
      const parentIdx = Math.floor((index - 1) / 2);
      const parent = this.data[parentIdx];
      if (node.priority >= parent.priority) break;
      this.data[index] = parent;
      index = parentIdx;
    }
    this.data[index] = node;
  }

  private sinkDown(index: number): void {
    const length = this.data.length;
    const node = this.data[index];

    while (true) {
      const leftIdx = 2 * index + 1;
      const rightIdx = 2 * index + 2;
      let swapIdx = -1;

      if (leftIdx < length && this.data[leftIdx].priority < node.priority) {
        swapIdx = leftIdx;
      }
      if (
        rightIdx < length &&
        this.data[rightIdx].priority < (swapIdx === -1 ? node.priority : this.data[leftIdx].priority)
      ) {
        swapIdx = rightIdx;
      }
      if (swapIdx === -1) break;

      this.data[index] = this.data[swapIdx];
      index = swapIdx;
    }
    this.data[index] = node;
  }
}

export class AStarPathfinder {
  findPath(
    startPx: GridPos,
    goalPx: GridPos,
    cellSize: number,
    cols: number,
    rows: number,
    isBlocked: (gx: number, gy: number) => boolean
  ): GridPos[] {
    const clampX = (x: number) => Math.max(0, Math.min(cols - 1, x));
    const clampY = (y: number) => Math.max(0, Math.min(rows - 1, y));

    const start: GridPos = {
      x: clampX(Math.floor(startPx.x / cellSize)),
      y: clampY(Math.floor(startPx.y / cellSize)),
    };
    let goal: GridPos = {
      x: clampX(Math.floor(goalPx.x / cellSize)),
      y: clampY(Math.floor(goalPx.y / cellSize)),
    };

    // If goal cell is blocked, snap to nearest walkable neighbor
    if (isBlocked(goal.x, goal.y)) {
      const fallback = this.findNearestWalkable(goal, cols, rows, isBlocked);
      if (!fallback) return [];
      goal = fallback;
    }

    const key = (x: number, y: number) => `${x},${y}`;
    const openSet = new MinHeap<GridPos>();
    const cameFrom = new Map<string, GridPos>();
    const gScore = new Map<string, number>();

    const startKey = key(start.x, start.y);
    gScore.set(startKey, 0);
    openSet.push(start, this.heuristic(start, goal));

    const dirs = [
      { dx: 1, dy: 0, cost: 1 },
      { dx: -1, dy: 0, cost: 1 },
      { dx: 0, dy: 1, cost: 1 },
      { dx: 0, dy: -1, cost: 1 },
      { dx: 1, dy: 1, cost: 1.414 },
      { dx: -1, dy: 1, cost: 1.414 },
      { dx: 1, dy: -1, cost: 1.414 },
      { dx: -1, dy: -1, cost: 1.414 },
    ];

    while (openSet.size > 0) {
      const current = openSet.pop()!;
      if (current.x === goal.x && current.y === goal.y) {
        return this.reconstructPath(cameFrom, current, cellSize);
      }

      const currentKey = key(current.x, current.y);
      const currentG = gScore.get(currentKey) ?? Infinity;

      for (const dir of dirs) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        if (isBlocked(nx, ny)) continue;

        // Prevent cutting diagonally across solid hedge corners
        if (dir.dx !== 0 && dir.dy !== 0) {
          if (isBlocked(current.x + dir.dx, current.y) || isBlocked(current.x, current.y + dir.dy)) {
            continue;
          }
        }

        const neighborKey = key(nx, ny);
        const tentativeG = currentG + dir.cost;

        if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentativeG);
          const fScore = tentativeG + this.heuristic({ x: nx, y: ny }, goal);
          openSet.push({ x: nx, y: ny }, fScore);
        }
      }
    }

    return [];
  }

  private heuristic(a: GridPos, b: GridPos): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private findNearestWalkable(
    origin: GridPos,
    cols: number,
    rows: number,
    isBlocked: (gx: number, gy: number) => boolean
  ): GridPos | null {
    for (let radius = 1; radius <= 4; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = origin.x + dx;
          const ny = origin.y + dy;
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !isBlocked(nx, ny)) {
            return { x: nx, y: ny };
          }
        }
      }
    }
    return null;
  }

  private reconstructPath(
    cameFrom: Map<string, GridPos>,
    current: GridPos,
    cellSize: number
  ): GridPos[] {
    const waypoints: GridPos[] = [];
    let curr: GridPos | undefined = current;

    while (curr) {
      waypoints.unshift({
        x: curr.x * cellSize + cellSize / 2,
        y: curr.y * cellSize + cellSize / 2,
      });
      curr = cameFrom.get(`${curr.x},${curr.y}`);
    }

    // Remove the starting cell so movement begins immediately toward the next step
    if (waypoints.length > 1) waypoints.shift();
    return waypoints;
  }
}