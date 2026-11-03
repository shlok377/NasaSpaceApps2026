import { describe, it, expect } from 'vitest';
import { RocketTree } from './RocketTree';
import { CONFIG } from '../config';
import { PAYLOADS } from './partDefinitions';

describe('RocketTree', () => {
  it('initializes with immovable Cockpit as root node at Col 7, Row 5', () => {
    const tree = new RocketTree(7, 5);
    const root = tree.getRootNode();

    expect(root).toBeDefined();
    expect(root.type).toBe('COCKPIT');
    expect(root.id).toBe('0');
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
    const result = tree.removeNode('0');

    expect(result.success).toBe(false);
    expect(result.reason).toContain('Cockpit');
    expect(tree.getRootNode()).toBeDefined();
  });
});

describe('RocketTree Attachment Validation', () => {
  it('validates Fuel Tank attachment on all 4 adjacent sides of Cockpit', () => {
    const tree = new RocketTree(7, 5);

    expect(tree.validateAttachment(7, 4, 'FUEL_TANK').valid).toBe(true); // NORTH
    expect(tree.validateAttachment(7, 6, 'FUEL_TANK').valid).toBe(true); // SOUTH
    expect(tree.validateAttachment(8, 5, 'FUEL_TANK').valid).toBe(true); // EAST
    expect(tree.validateAttachment(6, 5, 'FUEL_TANK').valid).toBe(true); // WEST
  });

  it('restricts Engine to only attach below an open South port', () => {
    const tree = new RocketTree(7, 5);

    expect(tree.validateAttachment(7, 6, 'ENGINE').valid).toBe(true); // Below Cockpit
    expect(tree.validateAttachment(7, 4, 'ENGINE').valid).toBe(false); // Above Cockpit (Invalid)
    expect(tree.validateAttachment(6, 5, 'ENGINE').valid).toBe(false); // Side of Cockpit (Invalid)
  });

  it('restricts Nose Cone to only attach above an open North port', () => {
    const tree = new RocketTree(7, 5);

    expect(tree.validateAttachment(7, 4, 'NOSE_CONE').valid).toBe(true); // Above Cockpit
    expect(tree.validateAttachment(7, 6, 'NOSE_CONE').valid).toBe(false); // Below Cockpit (Invalid)
    expect(tree.validateAttachment(8, 5, 'NOSE_CONE').valid).toBe(false); // Side of Cockpit (Invalid)
  });

  it('auto-orients Fin to LEFT or RIGHT flanks and rejects North/South attachments', () => {
    const tree = new RocketTree(7, 5);

    const leftAttach = tree.validateAttachment(6, 5, 'FIN');
    expect(leftAttach.valid).toBe(true);
    expect(leftAttach.finOrientation).toBe('LEFT');

    const rightAttach = tree.validateAttachment(8, 5, 'FIN');
    expect(rightAttach.valid).toBe(true);
    expect(rightAttach.finOrientation).toBe('RIGHT');

    expect(tree.validateAttachment(7, 4, 'FIN').valid).toBe(false); // Top (Invalid)
    expect(tree.validateAttachment(7, 6, 'FIN').valid).toBe(false); // Bottom (Invalid)
  });

  it('rejects attachment to an already occupied cell or floating isolated cell', () => {
    const tree = new RocketTree(7, 5);

    // Occupied cell
    expect(tree.validateAttachment(7, 5, 'FUEL_TANK').valid).toBe(false);
    // Floating cell (not adjacent to any rocket part)
    expect(tree.validateAttachment(1, 1, 'FUEL_TANK').valid).toBe(false);
  });
});

describe('RocketTree Full Lifecycle & Telemetry', () => {
  it('correctly builds a multi-part rocket and fuses ports', () => {
    const tree = new RocketTree(7, 5);

    // Attach Fuel Tank below Cockpit
    const tankRes = tree.attachPart(7, 6, 'FUEL_TANK');
    expect(tankRes.success).toBe(true);
    expect(tankRes.node?.id).toBeDefined();

    // Attach Engine below Fuel Tank
    const engineRes = tree.attachPart(7, 7, 'ENGINE');
    expect(engineRes.success).toBe(true);

    // Attach Nose Cone above Cockpit
    const noseRes = tree.attachPart(7, 4, 'NOSE_CONE');
    expect(noseRes.success).toBe(true);

    // Attach Fins on sides of Fuel Tank
    const leftFinRes = tree.attachPart(6, 6, 'FIN');
    expect(leftFinRes.success).toBe(true);
    expect(leftFinRes.node?.finOrientation).toBe('LEFT');

    const rightFinRes = tree.attachPart(8, 6, 'FIN');
    expect(rightFinRes.success).toBe(true);
    expect(rightFinRes.node?.finOrientation).toBe('RIGHT');

    // Telemetry: 1 Cockpit + 1 Tank + 1 Engine + 1 Cone + 2 Fins = 6 parts
    const telemetry = tree.getTelemetry();
    const p = CONFIG.parts;
    const expectedMass = p.COCKPIT.mass + p.FUEL_TANK.mass + p.ENGINE.mass + p.NOSE_CONE.mass + p.FIN.mass * 2;
    const expectedTwr = Number((p.ENGINE.thrust / expectedMass).toFixed(2));
    expect(telemetry.partCount).toBe(6);
    expect(telemetry.totalFuel).toBe(p.FUEL_TANK.fuelLiters);
    expect(telemetry.totalThrust).toBe(p.ENGINE.thrust);
    expect(telemetry.totalMass).toBe(expectedMass);
    expect(telemetry.twr).toBe(expectedTwr);
    expect(telemetry.valid).toBe(true);
  });

  it('enforces deletion protection on parent nodes until leaf nodes are deleted', () => {
    const tree = new RocketTree(7, 5);

    // Build: Cockpit -> Fuel Tank -> Engine
    const tankRes = tree.attachPart(7, 6, 'FUEL_TANK');
    const engineRes = tree.attachPart(7, 7, 'ENGINE');

    const tankId = tankRes.node!.id;
    const engineId = engineRes.node!.id;

    // Attempting to remove parent Fuel Tank fails
    const failRemoveTank = tree.removeNode(tankId);
    expect(failRemoveTank.success).toBe(false);
    expect(failRemoveTank.reason).toBe('Cannot remove block: Remove attached child parts first!');

    // Removing leaf Engine succeeds
    const removeEngine = tree.removeNode(engineId);
    expect(removeEngine.success).toBe(true);

    // Now removing Fuel Tank succeeds
    const removeTank = tree.removeNode(tankId);
    expect(removeTank.success).toBe(true);

    // Cockpit's south port is now available again
    const availablePorts = tree.getAvailablePorts();
    const southPort = availablePorts.find(p => p.direction === 'SOUTH' && p.nodeId === '0');
    expect(southPort).toBeDefined();
    expect(southPort?.targetGridY).toBe(6);
  });
});

describe('payload mass', () => {
  it('SATELLITE < ROVER < CREW and the root mass follows the payload', () => {
    expect(PAYLOADS.SATELLITE.mass).toBeLessThan(PAYLOADS.ROVER.mass);
    expect(PAYLOADS.ROVER.mass).toBeLessThan(PAYLOADS.CREW.mass);
    const tree = new RocketTree();
    const root = () => tree.getRootNode().mass;
    tree.setPayload('SATELLITE');
    expect(root()).toBe(PAYLOADS.SATELLITE.mass);
    tree.setPayload('CREW');
    expect(root()).toBe(PAYLOADS.CREW.mass);
  });
});

describe('RCS mounting', () => {
  it('bolts only to the left or right of another part', () => {
    const tree = new RocketTree(7, 5);
    expect(tree.attachPart(7, 6, 'RCS').success).toBe(false); // below the cockpit
    expect(tree.attachPart(7, 4, 'RCS').success).toBe(false); // above it
    expect(tree.attachPart(8, 5, 'RCS').success).toBe(true);
    expect(tree.attachPart(6, 5, 'RCS').success).toBe(true);
  });

  it('lets other parts hang on its top, bottom and free side', () => {
    const tree = new RocketTree(7, 5);
    const rcs = tree.attachPart(8, 5, 'RCS').node!;
    const open = tree.getAvailablePorts().filter(p => p.nodeId === rcs.id).map(p => p.direction).sort();
    expect(open).toEqual(['EAST', 'NORTH', 'SOUTH']);
    expect(tree.attachPart(8, 4, 'STRUCTURAL').success).toBe(true);
    expect(tree.attachPart(8, 6, 'FUEL_TANK').success).toBe(true);
    expect(tree.attachPart(9, 5, 'STRUCTURAL').success).toBe(true);
  });
});

describe('RCS separation keys', () => {
  it('defaults to B, accepts free keys and refuses reserved ones', () => {
    const tree = new RocketTree(7, 5);
    const rcs = tree.attachPart(8, 5, 'RCS').node!;
    expect(tree.getSeparationKey(rcs.id)).toBe('B');
    expect(tree.setSeparationKey(rcs.id, 'g').success).toBe(true);
    expect(tree.getSeparationKey(rcs.id)).toBe('G');
    expect(tree.setSeparationKey(rcs.id, 'A').success).toBe(false);
    expect(tree.setSeparationKey(rcs.id, ' ').success).toBe(false);
    expect(tree.getSeparationKey(rcs.id)).toBe('G');
  });

  it('warns while nothing hangs on the shell', () => {
    const tree = new RocketTree(7, 5);
    const rcs = tree.attachPart(8, 5, 'RCS').node!;
    expect(tree.shellWarning(rcs.id)).not.toBeNull();
    tree.attachPart(8, 6, 'FUEL_TANK');
    expect(tree.shellWarning(rcs.id)).toBeNull();
  });
});
