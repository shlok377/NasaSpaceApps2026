import { describe, it, expect } from 'vitest';
import { RocketTree } from './RocketTree';

describe('RocketTree part removal', () => {
  it('keeps every part after removing one and adding another', () => {
    const tree = new RocketTree(7, 8);
    expect(tree.attachPart(7, 9, 'FUEL_TANK').success).toBe(true);   // id 1
    expect(tree.attachPart(7, 10, 'ENGINE').success).toBe(true);     // id 2
    expect(tree.attachPart(7, 7, 'NOSE_CONE').success).toBe(true);   // id 3

    // Remove the engine (a leaf), then add a fin.
    const engine = tree.getNodeAt(7, 10)!;
    expect(tree.removeNode(engine.id).success).toBe(true);
    const added = tree.attachPart(6, 9, 'FIN');
    expect(added.success).toBe(true);

    // Cockpit, tank, nose cone and the new fin must all exist.
    expect(tree.getAllNodes()).toHaveLength(4);
    expect(tree.getNodeAt(7, 7)?.type).toBe('NOSE_CONE');
    expect(tree.getNodeAt(6, 9)?.type).toBe('FIN');
    const ids = tree.getAllNodes().map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
