import { describe, it, expect } from 'vitest';
import { RocketTree } from './RocketTree';

describe('RocketTree', () => {
  it('initializes with immovable Cockpit as root node at Col 7, Row 5', () => {
    const tree = new RocketTree(7, 5);
    const root = tree.getRootNode();

    expect(root).toBeDefined();
    expect(root.type).toBe('COCKPIT');
    expect(root.id).toBe('node_cockpit');
    expect(root.gridX).toBe(7);
    expect(root.gridY).toBe(5);
    expect(root.parentId).toBeNull();
    expect(root.childrenIds).toEqual([]);
  });

  it('exposes 4 open ports on the newly initialized root Cockpit', () => {
    const tree = new RocketTree(7, 5);
    const ports = tree.getAvailablePorts();

    expect(ports).toHaveLength(4);
    const directions = ports.map(p => p.direction).sort();
    expect(directions).toEqual(['EAST', 'NORTH', 'SOUTH', 'WEST']);
  });

  it('provides initial telemetry with Cockpit and valid=false', () => {
    const tree = new RocketTree(7, 5);
    const telemetry = tree.getTelemetry();

    expect(telemetry.partCount).toBe(1);
    expect(telemetry.valid).toBe(false);
    expect(telemetry.totalMass).toBeGreaterThan(0);
    expect(telemetry.totalThrust).toBe(0);
    expect(telemetry.totalFuel).toBe(0);
    expect(telemetry.tree.type).toBe('COCKPIT');
  });

  it('disallows removing the root Cockpit', () => {
    const tree = new RocketTree(7, 5);
    const result = tree.removeNode('node_cockpit');

    expect(result.success).toBe(false);
    expect(result.reason).toContain('Cockpit');
    expect(tree.getRootNode()).toBeDefined();
  });
});
