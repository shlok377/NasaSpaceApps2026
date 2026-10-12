# 07: O(1) Direct Grid Coordinate Picking & Dirty-Flag Block Rendering in VAB

**What to build:**
The Vehicle Assembly Building (VAB) builder UI operates with instantaneous response times even for large complex rockets. Mouse hover and block placement calculate grid coordinates mathematically in $O(1)$ time rather than iterating through scene containers, and placing or removing a part mutates only the modified block containers instead of tearing down and rebuilding the entire rocket scene tree.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Compute grid hover column and row directly via mathematical cell projection: `col = Math.floor((pointer.x - originX) / CELL_SIZE)` and `row = Math.floor((pointer.y - originY) / CELL_SIZE)`.
- [x] Implement dirty-flag partial updates for modified blocks instead of full rocket container rebuilds on every placement/deletion.
- [x] Preserve ghost preview snap feedback, attachment validation badges, and port direction markers.
- [x] VAB interaction remains pixel-accurate and passing in automated diagnostics.
