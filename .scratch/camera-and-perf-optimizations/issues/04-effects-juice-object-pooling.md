# 04: Object Pooling for Screen Juice & Floating Popups

**What to build:**
Screen juice effects—including reward notifications, combo announcements, near-miss rings, and stunt score popups—display with snappy responsiveness without triggering frequent DOM or Canvas font re-rasterization and GameObject destruction. Popups recycle from a pre-allocated GameObject pool rather than calling `scene.add.text()` and `destroy()` dynamically.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Create a pool of recyclable `Phaser.GameObjects.Text` objects in `Effects.ts` with a configurable capacity (e.g., 16 items).
- [x] Recycle oldest or inactive popup objects when triggering `popup()`.
- [x] Transition expired popups using `setVisible(false)` rather than calling `.destroy()`.
- [x] Prevent memory leaks and GC spikes during rapid stunt or near-miss chains.
