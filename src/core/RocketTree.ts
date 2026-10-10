import { PART_DEFINITIONS } from './partDefinitions';
import { PartType, PortDirection, RocketNode, RocketTelemetry } from './types';

export interface AvailablePort {
  nodeId: string;
  nodeType: PartType;
  direction: PortDirection;
  gridX: number;
  gridY: number;
  targetGridX: number;
  targetGridY: number;
}

export interface AttachmentValidation {
  valid: boolean;
  reason?: string;
  parentNode?: RocketNode;
  parentPort?: PortDirection;
  childPort?: PortDirection;
  finOrientation?: 'LEFT' | 'RIGHT';
}

export class RocketTree {
  private rootId = 'node_cockpit';
  private nodes: Map<string, RocketNode> = new Map();
  private gridOccupancy: Map<string, string> = new Map(); // "x,y" -> nodeId

  constructor(rootX = 7, rootY = 5) {
    const cockpitDef = PART_DEFINITIONS.COCKPIT;
    const rootNode: RocketNode = {
      id: this.rootId,
      type: 'COCKPIT',
      gridX: rootX,
      gridY: rootY,
      parentId: null,
      parentPort: null,
      childrenIds: [],
      mass: cockpitDef.mass,
      fuel: cockpitDef.fuel,
      thrust: cockpitDef.thrust
    };

    this.nodes.set(this.rootId, rootNode);
    this.gridOccupancy.set(`${rootX},${rootY}`, this.rootId);
  }

  public getRootNode(): RocketNode {
    const root = this.nodes.get(this.rootId);
    if (!root) {
      throw new Error('Root cockpit node missing from RocketTree');
    }
    return root;
  }

  public getNode(id: string): RocketNode | undefined {
    return this.nodes.get(id);
  }

  public getNodeAt(gridX: number, gridY: number): RocketNode | undefined {
    const id = this.gridOccupancy.get(`${gridX},${gridY}`);
    return id ? this.nodes.get(id) : undefined;
  }

  public getAllNodes(): RocketNode[] {
    return Array.from(this.nodes.values());
  }

  public getOppositeDirection(dir: PortDirection): PortDirection {
    switch (dir) {
      case 'NORTH': return 'SOUTH';
      case 'SOUTH': return 'NORTH';
      case 'EAST': return 'WEST';
      case 'WEST': return 'EAST';
    }
  }

  public getTargetCoords(gridX: number, gridY: number, dir: PortDirection): { x: number; y: number } {
    switch (dir) {
      case 'NORTH': return { x: gridX, y: gridY - 1 };
      case 'SOUTH': return { x: gridX, y: gridY + 1 };
      case 'EAST': return { x: gridX + 1, y: gridY };
      case 'WEST': return { x: gridX - 1, y: gridY };
    }
  }

  public getAvailablePorts(): AvailablePort[] {
    const available: AvailablePort[] = [];

    for (const node of this.nodes.values()) {
      const exposedDirections: PortDirection[] = [];

      if (node.type === 'COCKPIT' || node.type === 'FUEL_TANK' || node.type === 'STRUCTURAL') {
        exposedDirections.push('NORTH', 'SOUTH', 'EAST', 'WEST');
      } else if (node.type === 'ENGINE' || node.type === 'NOSE_CONE' || node.type === 'FIN') {
        // Terminal pieces do not expose extra attachment ports
      }

      for (const dir of exposedDirections) {
        // Check if this port is the one connected to the node's parent
        if (node.parentPort && this.getOppositeDirection(node.parentPort) === dir) {
          continue;
        }

        const target = this.getTargetCoords(node.gridX, node.gridY, dir);
        const occupied = this.gridOccupancy.has(`${target.x},${target.y}`);

        if (!occupied) {
          available.push({
            nodeId: node.id,
            nodeType: node.type,
            direction: dir,
            gridX: node.gridX,
            gridY: node.gridY,
            targetGridX: target.x,
            targetGridY: target.y
          });
        }
      }
    }

    return available;
  }

  public validateAttachment(gridX: number, gridY: number, childType: PartType): AttachmentValidation {
    // 1. Check if cell is already occupied
    if (this.gridOccupancy.has(`${gridX},${gridY}`)) {
      return { valid: false, reason: 'Cell is already occupied' };
    }

    // 2. Find available ports pointing to this cell
    const ports = this.getAvailablePorts().filter(
      p => p.targetGridX === gridX && p.targetGridY === gridY
    );

    if (ports.length === 0) {
      return { valid: false, reason: 'No adjacent open connection socket' };
    }

    // Check each port candidate for directional compatibility
    for (const port of ports) {
      const parent = this.nodes.get(port.nodeId);
      if (!parent) continue;

      const neededChildPort = this.getOppositeDirection(port.direction);

      // Verify child directional rules
      if (childType === 'ENGINE') {
        // Engine must connect via its top (NORTH) port, so parent port must be SOUTH
        if (port.direction === 'SOUTH') {
          return {
            valid: true,
            parentNode: parent,
            parentPort: port.direction,
            childPort: neededChildPort
          };
        }
      } else if (childType === 'NOSE_CONE') {
        // Nose Cone must connect via its bottom (SOUTH) port, so parent port must be NORTH
        if (port.direction === 'NORTH') {
          return {
            valid: true,
            parentNode: parent,
            parentPort: port.direction,
            childPort: neededChildPort
          };
        }
      } else if (childType === 'FIN') {
        // Fin connects either on West (Left Fin) or East (Right Fin)
        if (port.direction === 'WEST') {
          return {
            valid: true,
            parentNode: parent,
            parentPort: port.direction,
            childPort: neededChildPort,
            finOrientation: 'LEFT'
          };
        } else if (port.direction === 'EAST') {
          return {
            valid: true,
            parentNode: parent,
            parentPort: port.direction,
            childPort: neededChildPort,
            finOrientation: 'RIGHT'
          };
        }
      } else {
        // Fuel Tank & Structural blocks can connect to any open socket
        return {
          valid: true,
          parentNode: parent,
          parentPort: port.direction,
          childPort: neededChildPort
        };
      }
    }

    return { valid: false, reason: 'Part orientation incompatible with socket' };
  }

  public attachPart(gridX: number, gridY: number, childType: PartType): { success: boolean; node?: RocketNode; reason?: string } {
    const validation = this.validateAttachment(gridX, gridY, childType);
    if (!validation.valid || !validation.parentNode || !validation.parentPort) {
      return { success: false, reason: validation.reason || 'Invalid attachment' };
    }

    const def = PART_DEFINITIONS[childType];
    const newId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const newNode: RocketNode = {
      id: newId,
      type: childType,
      gridX,
      gridY,
      parentId: validation.parentNode.id,
      parentPort: validation.parentPort,
      childrenIds: [],
      finOrientation: validation.finOrientation,
      mass: def.mass,
      fuel: def.fuel,
      thrust: def.thrust
    };

    // Register node
    this.nodes.set(newId, newNode);
    this.gridOccupancy.set(`${gridX},${gridY}`, newId);
    validation.parentNode.childrenIds.push(newId);

    return { success: true, node: newNode };
  }

  public removeNode(id: string): { success: boolean; reason?: string } {
    if (id === this.rootId) {
      return { success: false, reason: 'Cannot remove Cockpit: the cockpit is the core of the rocket.' };
    }

    const node = this.nodes.get(id);
    if (!node) {
      return { success: false, reason: 'Node not found.' };
    }

    if (node.childrenIds.length > 0) {
      return { success: false, reason: 'Cannot remove block: Remove attached child parts first!' };
    }

    // Detach from parent
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.childrenIds = parent.childrenIds.filter(cId => cId !== id);
      }
    }

    // Remove from occupancy and map
    this.gridOccupancy.delete(`${node.gridX},${node.gridY}`);
    this.nodes.delete(id);

    return { success: true };
  }

  public getTelemetry(): RocketTelemetry {
    const nodes = this.getAllNodes();
    let totalMass = 0;
    let totalThrust = 0;
    let totalFuel = 0;
    let engineCount = 0;
    let fuelTankCount = 0;

    for (const node of nodes) {
      totalMass += node.mass;
      totalThrust += node.thrust;
      totalFuel += node.fuel;
      if (node.type === 'ENGINE') engineCount++;
      if (node.type === 'FUEL_TANK') fuelTankCount++;
    }

    const twr = totalMass > 0 ? Number((totalThrust / totalMass).toFixed(2)) : 0;
    const valid = engineCount >= 1 && fuelTankCount >= 1 && totalThrust >= totalMass;

    return {
      valid,
      partCount: nodes.length,
      totalMass,
      totalThrust,
      totalFuel,
      twr,
      tree: JSON.parse(JSON.stringify(this.getRootNode()))
    };
  }
}
